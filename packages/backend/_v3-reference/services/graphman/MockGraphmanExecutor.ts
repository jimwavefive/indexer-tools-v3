import type { RewindResult } from './GraphmanExecutor.js';

/**
 * MockGraphmanExecutor for testing environments without Docker.
 * Returns mock success responses and logs what would be executed.
 */
export class MockGraphmanExecutor {
  constructor() {
    console.log('[MockGraphmanExecutor] Initialized (for testing without Docker)');
  }

  async rewind(deploymentHash: string, blockNumber: number, blockHash: string): Promise<RewindResult> {
    const command = `graphman rewind ${deploymentHash} ${blockNumber} ${blockHash}`;

    console.log(`[MockGraphmanExecutor] MOCK EXECUTION: ${command}`);

    // Simulate some delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Return mock success
    return {
      success: true,
      command,
      output: `[MOCK] Successfully rewound deployment ${deploymentHash} to block ${blockNumber}`,
      dryRun: true,
    };
  }

  async checkConnection(): Promise<{ connected: boolean; containerName: string; error?: string }> {
    return {
      connected: true,
      containerName: 'mock-container',
      error: '[MOCK] Running in mock mode',
    };
  }

  isDryRun(): boolean {
    return true;
  }
}
