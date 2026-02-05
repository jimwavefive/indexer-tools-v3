import { spawn } from 'node:child_process';

export interface RewindResult {
  success: boolean;
  command: string;
  output?: string;
  error?: string;
  dryRun: boolean;
}

/**
 * Executes graphman commands via Docker exec into the graph-node container.
 */
export class GraphmanExecutor {
  private containerName: string;
  private dryRun: boolean;

  constructor(options?: { containerName?: string; dryRun?: boolean }) {
    this.containerName = options?.containerName || process.env.GRAPHMAN_CONTAINER_NAME || 'index-node-mgmt-0';
    this.dryRun = options?.dryRun ?? (process.env.AGENT_EXECUTION_MODE !== 'production');
  }

  /**
   * Execute a graphman rewind command for a specific deployment.
   *
   * @param deploymentHash - The IPFS hash of the subgraph deployment
   * @param blockNumber - The block number to rewind to
   * @param blockHash - The block hash at the target block number
   * @returns The result of the rewind operation
   */
  async rewind(deploymentHash: string, blockNumber: number, blockHash: string): Promise<RewindResult> {
    // Validate inputs
    if (!deploymentHash || !deploymentHash.startsWith('Qm')) {
      return {
        success: false,
        command: '',
        error: 'Invalid deployment hash — must start with "Qm"',
        dryRun: this.dryRun,
      };
    }

    if (!blockHash || !blockHash.startsWith('0x')) {
      return {
        success: false,
        command: '',
        error: 'Invalid block hash — must start with "0x"',
        dryRun: this.dryRun,
      };
    }

    if (blockNumber < 0) {
      return {
        success: false,
        command: '',
        error: 'Block number must be non-negative',
        dryRun: this.dryRun,
      };
    }

    const command = `graphman rewind ${deploymentHash} ${blockNumber} ${blockHash}`;

    if (this.dryRun) {
      console.log(`[GraphmanExecutor] DRY RUN: Would execute: docker exec ${this.containerName} ${command}`);
      return {
        success: true,
        command,
        output: `[DRY RUN] Command would be executed: ${command}`,
        dryRun: true,
      };
    }

    try {
      const result = await this.dockerExec(command);
      return {
        success: true,
        command,
        output: result,
        dryRun: false,
      };
    } catch (err: any) {
      return {
        success: false,
        command,
        error: err.message || 'Unknown error executing graphman rewind',
        dryRun: false,
      };
    }
  }

  /**
   * Execute a command inside the graph-node container.
   */
  private dockerExec(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = ['exec', this.containerName, 'sh', '-c', command];

      console.log(`[GraphmanExecutor] Executing: docker ${args.join(' ')}`);

      const child = spawn('docker', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 120000, // 2 minute timeout
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (err) => {
        reject(new Error(`Failed to spawn docker exec: ${err.message}`));
      });

      child.on('close', (code) => {
        if (code === 0) {
          console.log(`[GraphmanExecutor] Command succeeded: ${stdout.trim()}`);
          resolve(stdout.trim());
        } else {
          const errorMsg = stderr.trim() || stdout.trim() || `Exit code: ${code}`;
          console.error(`[GraphmanExecutor] Command failed: ${errorMsg}`);
          reject(new Error(errorMsg));
        }
      });
    });
  }

  /**
   * Check if the graph-node container is accessible.
   */
  async checkConnection(): Promise<{ connected: boolean; containerName: string; error?: string }> {
    if (this.dryRun) {
      return {
        connected: true,
        containerName: this.containerName,
        error: '[DRY RUN] Skipping connection check',
      };
    }

    try {
      const result = await this.dockerExec('graphman --version');
      return {
        connected: true,
        containerName: this.containerName,
      };
    } catch (err: any) {
      return {
        connected: false,
        containerName: this.containerName,
        error: err.message,
      };
    }
  }

  /**
   * Get the current execution mode.
   */
  isDryRun(): boolean {
    return this.dryRun;
  }
}

// Singleton instance
let instance: GraphmanExecutor | null = null;

export function getGraphmanExecutor(): GraphmanExecutor {
  if (!instance) {
    instance = new GraphmanExecutor();

    // Log the execution mode on first access
    const mode = instance.isDryRun() ? 'DRY RUN' : 'PRODUCTION';
    console.log(`[GraphmanExecutor] Running in ${mode} mode (AGENT_EXECUTION_MODE=${process.env.AGENT_EXECUTION_MODE || 'not set'})`);
  }
  return instance;
}

/**
 * Reset the singleton instance (useful for testing).
 */
export function resetGraphmanExecutor(): void {
  instance = null;
}
