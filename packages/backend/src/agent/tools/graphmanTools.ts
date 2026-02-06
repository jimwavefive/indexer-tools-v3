import { v4 as uuidv4 } from 'uuid';
import type { AgentTool } from './index.js';
import type { SqliteStore } from '../../db/sqliteStore.js';
import { getGraphmanExecutor } from '../../services/graphman/GraphmanExecutor.js';
import { getChainRpcService } from '../../services/rpc/ChainRpcService.js';

let storeRef: SqliteStore | null = null;
let currentConversationId: string | null = null;
let currentIncidentId: string | null = null;

export function setGraphmanStoreRef(store: SqliteStore): void {
  storeRef = store;
}

export function setGraphmanContext(conversationId: string, incidentId?: string): void {
  currentConversationId = conversationId;
  currentIncidentId = incidentId || null;
}

function getStore(): SqliteStore {
  if (!storeRef) {
    throw new Error('SqliteStore not initialized for graphman tools');
  }
  return storeRef;
}

export const proposeGraphmanRewind: AgentTool = {
  definition: {
    name: 'proposeGraphmanRewind',
    description: `Propose a graphman rewind operation for a failed subgraph deployment. This creates an approval request that the user must approve before execution.

Use this when:
- A subgraph deployment has a fatal error but is synced to chainhead (stale failure)
- The subgraph can be recovered by rewinding to a block before the fatal error

This tool will:
1. Fetch the block hash for the target block number from the chain RPC
2. Create an approval request for the rewind operation
3. Return the proposal details for user review

The actual rewind will only execute after user approval via executeGraphmanRewind.`,
    parameters: {
      type: 'object',
      properties: {
        deploymentHash: {
          type: 'string',
          description: 'The IPFS hash of the subgraph deployment (e.g., "QmXxx...")',
        },
        blockNumber: {
          type: 'number',
          description: 'The block number to rewind to (should be before the fatal error block)',
        },
        chainId: {
          type: 'string',
          description: 'The chain ID (e.g., "1" for Ethereum mainnet, "42161" for Arbitrum)',
        },
        reason: {
          type: 'string',
          description: 'Brief explanation of why this rewind is needed',
        },
      },
      required: ['deploymentHash', 'blockNumber', 'chainId', 'reason'],
    },
  },
  async execute(args: {
    deploymentHash: string;
    blockNumber: number;
    chainId: string;
    reason: string;
  }) {
    const store = getStore();

    if (!currentConversationId) {
      return {
        error: 'No conversation context — this tool can only be used in incident chat',
        approvalRequired: false,
      };
    }

    // Validate deployment hash
    if (!args.deploymentHash || !args.deploymentHash.startsWith('Qm')) {
      return {
        error: 'Invalid deployment hash — must start with "Qm"',
        approvalRequired: false,
      };
    }

    // Create approval request (block hash will be fetched at execution time)
    const approvalId = uuidv4();
    const actionArgs = {
      deploymentHash: args.deploymentHash,
      blockNumber: args.blockNumber,
      blockHash: null as string | null, // deferred to execution
      chainId: args.chainId,
      reason: args.reason,
    };

    store.createApproval({
      id: approvalId,
      conversation_id: currentConversationId,
      incident_id: currentIncidentId || undefined,
      action_type: 'graphman_rewind',
      action_args: actionArgs,
    });

    // Log the proposal
    store.logAgentAction({
      conversation_id: currentConversationId,
      incident_id: currentIncidentId || undefined,
      action_type: 'propose_rewind',
      tool_name: 'proposeGraphmanRewind',
      tool_args: JSON.stringify(actionArgs),
      result: 'pending_approval',
    });

    // Check if in dry-run mode
    const executor = getGraphmanExecutor();
    const isDryRun = executor.isDryRun();

    return {
      approvalRequired: true,
      approvalId,
      proposal: {
        action: 'graphman_rewind',
        deploymentHash: args.deploymentHash,
        blockNumber: args.blockNumber,
        chainId: args.chainId,
        reason: args.reason,
        dryRunMode: isDryRun,
      },
      message: `I've prepared a graphman rewind operation. Please review and approve:\n\n` +
        `- **Deployment**: ${args.deploymentHash}\n` +
        `- **Rewind to block**: ${args.blockNumber}\n` +
        `- **Chain**: ${args.chainId}\n` +
        `- **Reason**: ${args.reason}\n` +
        (isDryRun ? '\n**Note**: Running in DRY RUN mode — command will be logged but not executed.' : '') +
        `\n\nClick "Approve" to execute this rewind.`,
    };
  },
};

export const executeGraphmanRewind: AgentTool = {
  definition: {
    name: 'executeGraphmanRewind',
    description: `Execute a previously approved graphman rewind operation. This tool should only be called after the user has approved the operation via proposeGraphmanRewind.

The approval ID must be provided to verify that the user has consented to the operation.`,
    parameters: {
      type: 'object',
      properties: {
        approvalId: {
          type: 'string',
          description: 'The approval ID returned from proposeGraphmanRewind after user approval',
        },
      },
      required: ['approvalId'],
    },
  },
  async execute(args: { approvalId: string }) {
    const store = getStore();

    // Verify approval exists and is approved
    const approval = store.getApproval(args.approvalId);

    if (!approval) {
      return {
        success: false,
        error: 'Approval not found',
      };
    }

    if (approval.status !== 'approved') {
      return {
        success: false,
        error: `Approval is ${approval.status}, not approved. Cannot execute.`,
      };
    }

    if (approval.action_type !== 'graphman_rewind') {
      return {
        success: false,
        error: `Invalid approval type: ${approval.action_type}`,
      };
    }

    const actionArgs = approval.action_args as {
      deploymentHash: string;
      blockNumber: number;
      blockHash: string | null;
      chainId: string;
      reason: string;
    };

    // Fetch block hash now if it was deferred from proposal time
    let blockHash = actionArgs.blockHash;
    if (!blockHash) {
      const rpcService = getChainRpcService();
      try {
        const block = await rpcService.getBlockByNumber(actionArgs.chainId, actionArgs.blockNumber);
        if (!block) {
          return {
            success: false,
            error: `Block ${actionArgs.blockNumber} not found on chain ${actionArgs.chainId}`,
          };
        }
        blockHash = block.hash;
      } catch (err: any) {
        return {
          success: false,
          error: `Failed to fetch block hash: ${err.message}`,
        };
      }
    }

    // Execute the rewind
    const executor = getGraphmanExecutor();
    const result = await executor.rewind(
      actionArgs.deploymentHash,
      actionArgs.blockNumber,
      blockHash,
    );

    // Update approval status
    store.markApprovalExecuted(args.approvalId, JSON.stringify(result));

    // Log the execution
    store.logAgentAction({
      conversation_id: approval.conversation_id,
      incident_id: approval.incident_id || undefined,
      action_type: 'execute_rewind',
      tool_name: 'executeGraphmanRewind',
      tool_args: JSON.stringify(actionArgs),
      result: result.success ? 'success' : 'failed',
    });

    if (result.success) {
      return {
        success: true,
        command: result.command,
        output: result.output,
        dryRun: result.dryRun,
        message: result.dryRun
          ? `[DRY RUN] The rewind command was simulated but not executed:\n\`\`\`\n${result.command}\n\`\`\``
          : `Rewind executed successfully:\n\`\`\`\n${result.command}\n\`\`\`\n\nOutput:\n\`\`\`\n${result.output}\n\`\`\``,
      };
    } else {
      return {
        success: false,
        command: result.command,
        error: result.error,
        dryRun: result.dryRun,
        message: `Rewind failed:\n\`\`\`\n${result.error}\n\`\`\``,
      };
    }
  },
};

export const graphmanTools: AgentTool[] = [proposeGraphmanRewind, executeGraphmanRewind];
