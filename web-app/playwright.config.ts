import { defineConfig } from "@playwright/test";

const webHost = process.env.SERVICETRACE_WEB_HOST ?? "127.0.0.1";
const webPort = Number(process.env.SERVICETRACE_WEB_PORT ?? "4173");
const baseURL = `http://${webHost}:${webPort}`;

export default defineConfig({
  testDir: "./tests",
  testMatch: /.*\.e2e\.ts/,
  timeout: 30_000,
  fullyParallel: false,
  use: {
    baseURL,
    browserName: "chromium",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `"${process.execPath}" ./node_modules/vite/bin/vite.js --host ${webHost} --port ${webPort}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
