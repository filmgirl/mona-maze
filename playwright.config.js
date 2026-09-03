import { defineConfig } from '@playwright/test';

const port = process.env.CABINET_PORT ?? '4261';
export default defineConfig({
  testDir: './tests/cabinet',
  testMatch: 'compatibility.spec.js',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: 'chromium',
    viewport: { width: 1280, height: 900 },
    reducedMotion: 'reduce',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run cabinet:serve',
    url: `http://127.0.0.1:${port}/__cabinet_health`,
    reuseExistingServer: false,
  },
});
