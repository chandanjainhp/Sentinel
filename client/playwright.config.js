const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results.json' }], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    console: false,
  },
  projects: [
    { name: 'mobile-375', use: { browserName: 'chromium', viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true } },
    { name: 'tablet-768', use: { browserName: 'chromium', viewport: { width: 768, height: 1024 } } },
    { name: 'desktop-1280', use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: 'PORT=3001 npm run start',
    url: 'http://localhost:3001',
    timeout: 60_000,
    reuseExistingServer: false,
  },
});
