/**
 * ChainRpcService provides generic chain RPC queries.
 *
 * Configuration via environment variables:
 * - Individual chains: CHAIN_RPC_<index>_ID and CHAIN_RPC_<index>_URL pairs
 *   Example: CHAIN_RPC_0_ID=1, CHAIN_RPC_0_URL=https://eth-mainnet.example.com
 * - Or ERPC_BASE_URL for eRPC-style URL construction: {ERPC_BASE_URL}/{chainId}
 */

interface ChainConfig {
  chainId: string;
  rpcUrl: string;
}

interface Block {
  number: string; // hex
  hash: string;
  timestamp: string; // hex
}

interface RpcResponse<T> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

export class ChainRpcService {
  private chains: Map<string, ChainConfig> = new Map();
  private erpcBaseUrl?: string;

  constructor() {
    this.loadConfig();
  }

  private loadConfig(): void {
    // Check for ERPC_BASE_URL (fallback for all chains)
    this.erpcBaseUrl = process.env.ERPC_BASE_URL;

    // Load individual chain configs: CHAIN_RPC_<n>_ID and CHAIN_RPC_<n>_URL
    for (let i = 0; i < 100; i++) {
      const chainId = process.env[`CHAIN_RPC_${i}_ID`];
      const rpcUrl = process.env[`CHAIN_RPC_${i}_URL`];

      if (chainId && rpcUrl) {
        this.chains.set(chainId, { chainId, rpcUrl });
        console.log(`ChainRpcService: configured chain ${chainId} -> ${rpcUrl}`);
      } else if (chainId || rpcUrl) {
        console.warn(`ChainRpcService: incomplete config for index ${i} (need both ID and URL)`);
      } else {
        // No more configs
        break;
      }
    }

    if (this.chains.size === 0 && !this.erpcBaseUrl) {
      console.warn('ChainRpcService: no chain RPC configuration found');
    } else if (this.erpcBaseUrl) {
      console.log(`ChainRpcService: using ERPC base URL ${this.erpcBaseUrl}`);
    }
  }

  /**
   * Get the RPC URL for a chain.
   * First checks explicit chain config, then falls back to ERPC_BASE_URL.
   */
  getRpcUrl(chainId: string): string | null {
    const config = this.chains.get(chainId);
    if (config) {
      return config.rpcUrl;
    }

    if (this.erpcBaseUrl) {
      return `${this.erpcBaseUrl}/${chainId}`;
    }

    return null;
  }

  /**
   * Get a block by number.
   * @param chainId Chain ID (e.g., "1" for Ethereum mainnet)
   * @param blockNumber Block number (decimal or hex string with 0x prefix)
   * @returns Block data or null if not found
   */
  async getBlockByNumber(chainId: string, blockNumber: string | number): Promise<Block | null> {
    const rpcUrl = this.getRpcUrl(chainId);
    if (!rpcUrl) {
      throw new Error(`No RPC URL configured for chain ${chainId}`);
    }

    // Convert to hex if needed
    const blockHex = typeof blockNumber === 'number'
      ? `0x${blockNumber.toString(16)}`
      : blockNumber.startsWith('0x')
        ? blockNumber
        : `0x${parseInt(blockNumber, 10).toString(16)}`;

    const response = await this.rpcCall<Block | null>(rpcUrl, 'eth_getBlockByNumber', [blockHex, false]);
    return response;
  }

  /**
   * Get the latest block.
   * @param chainId Chain ID
   * @returns Latest block data
   */
  async getLatestBlock(chainId: string): Promise<Block | null> {
    const rpcUrl = this.getRpcUrl(chainId);
    if (!rpcUrl) {
      throw new Error(`No RPC URL configured for chain ${chainId}`);
    }

    return this.rpcCall<Block | null>(rpcUrl, 'eth_getBlockByNumber', ['latest', false]);
  }

  /**
   * Get the current block number.
   * @param chainId Chain ID
   * @returns Block number as decimal string
   */
  async getBlockNumber(chainId: string): Promise<string> {
    const rpcUrl = this.getRpcUrl(chainId);
    if (!rpcUrl) {
      throw new Error(`No RPC URL configured for chain ${chainId}`);
    }

    const result = await this.rpcCall<string>(rpcUrl, 'eth_blockNumber', []);
    // Convert hex to decimal
    return parseInt(result, 16).toString();
  }

  /**
   * Get the chain ID from the RPC endpoint.
   * Useful for verifying endpoint configuration.
   */
  async verifyChainId(chainId: string): Promise<boolean> {
    const rpcUrl = this.getRpcUrl(chainId);
    if (!rpcUrl) {
      return false;
    }

    try {
      const result = await this.rpcCall<string>(rpcUrl, 'eth_chainId', []);
      const actualChainId = parseInt(result, 16).toString();
      return actualChainId === chainId;
    } catch {
      return false;
    }
  }

  private async rpcCall<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`RPC request failed (${response.status}): ${await response.text()}`);
    }

    const json = await response.json() as RpcResponse<T>;

    if (json.error) {
      throw new Error(`RPC error: ${json.error.message} (code: ${json.error.code})`);
    }

    return json.result as T;
  }

  /**
   * Get configured chain IDs.
   */
  getConfiguredChains(): string[] {
    return Array.from(this.chains.keys());
  }

  /**
   * Check if a chain is configured (either explicitly or via ERPC fallback).
   */
  isChainConfigured(chainId: string): boolean {
    return this.chains.has(chainId) || !!this.erpcBaseUrl;
  }
}

// Singleton instance
let instance: ChainRpcService | null = null;

export function getChainRpcService(): ChainRpcService {
  if (!instance) {
    instance = new ChainRpcService();
  }
  return instance;
}
