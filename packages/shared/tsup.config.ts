import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/graphql/index.ts',
    'src/graphql/queries.ts',
    'src/graphql/client.ts',
    'src/math/wei.ts',
    'src/math/calc.ts',
    'src/math/format.ts',
    'src/types/allocation.ts',
    'src/types/subgraph.ts',
    'src/types/chain.ts',
    'src/types/notification.ts',
    'src/config/chains.ts',
  ],
  format: ['esm'],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
});
