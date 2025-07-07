import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    coverage: {
      reporter: ['text', 'html', 'json-summary'],
      exclude: [
        'node_modules/',
        'test/',
        '__tests__/',
        '*.config.js',
        'client.js',
        'server-unified.js'
      ],
      thresholds: {
        global: {
          branches: 70,
          functions: 70,
          lines: 70,
          statements: 70
        }
      }
    },
    setupFiles: ['./test/setup.js']
  }
});