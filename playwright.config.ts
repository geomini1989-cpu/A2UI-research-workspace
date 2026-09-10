import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e', fullyParallel: false, workers: 1, retries: 0,
  timeout: 30000, use: { baseURL: 'http://127.0.0.1:3201', channel: process.env.PLAYWRIGHT_CHANNEL || undefined, trace: 'retain-on-failure' },
  webServer: [
    { command: 'node scripts/fixture-llm.mjs', url: 'http://127.0.0.1:3202/health', reuseExistingServer: false },
    { command: 'npm start', url: 'http://127.0.0.1:3201/api/health', reuseExistingServer: false,
      env: { NODE_ENV: 'test', PORT: '3201', HOST: '127.0.0.1', DATA_DIR: '.data/e2e', DEEPSEEK_BASE_URL: 'http://127.0.0.1:3202', DEEPSEEK_API_KEY: 'acceptance-fixture', RESEARCH_PROVIDER: 'demo', APP_ACCESS_KEY: 'acceptance', SESSION_SECRET: 'acceptance-session-secret', PUBLIC_ORIGIN: 'http://127.0.0.1:3201', MARKET_AGENT_BASE_URL: 'http://127.0.0.1:3299', MAX_DAILY_RUNS: '500' },
    },
  ],
})
