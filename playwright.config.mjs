import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.browser.spec.mjs',
  workers: 1,
  timeout: 30000,
  reporter: 'list',
  use: {
    channel: 'chrome',
    headless: true,
    locale: 'zh-CN',
    baseURL: process.env.DSH_TEST_URL ?? 'http://127.0.0.1:3091/',
    viewport: { width: 1440, height: 960 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
