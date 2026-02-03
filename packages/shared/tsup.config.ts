import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/graphql/index.ts',
    'src/graphql/allocations.ts',
    'src/graphql/subgraphs.ts',
    'src/graphql/network.ts',
    'src/math/commonCalcs.ts',
    'src/math/web3Utils.ts',
    'src/types/allocation.ts',
    'src/types/subgraph.ts',
    'src/types/chain.ts',
    'src/config/chains.ts',
  ],
  format: ['esm'],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
});
