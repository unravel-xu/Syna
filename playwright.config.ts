import { defineConfig } from '@playwright/test';
// Local preview must bypass a user's outbound HTTP proxy.
process.env.NO_PROXY = [process.env.NO_PROXY, '127.0.0.1', 'localhost'].filter(Boolean).join(',');
process.env.no_proxy = process.env.NO_PROXY;
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1, timeout: 90_000,
  reporter: [['list'], ['json', { outputFile: `${process.env.SYNA_TEST_ARTIFACTS ?? '.artifacts/p2-editor'}/browser-results.json` }]],
  use: { baseURL: 'http://127.0.0.1:5173', viewport: { width: 1440, height: 900 }, trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev:ui', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI, timeout: 60_000 }
});
