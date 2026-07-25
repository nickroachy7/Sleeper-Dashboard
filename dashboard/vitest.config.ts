import { defineConfig } from 'vitest/config';

// Node-environment unit tests for the data layer's pure logic (no DOM, no
// network). These guard the invariants that quietly break the app when they
// drift: the value curve shared between the seed and the engine, PostgREST
// pagination, position gating, and pick-asset id parsing.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  },
});
