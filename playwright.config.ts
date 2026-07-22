import { defineConfig } from '@playwright/test';

export default defineConfig({
    expect: {
        timeout: 30_000,
    },
    fullyParallel: false,
    outputDir: 'test-results/playwright',
    reporter: [
        ['list'],
        ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ],
    retries: 0,
    testDir: './e2e/specs',
    timeout: 120_000,
    use: {
        screenshot: 'off',
        trace: 'off',
        video: 'off',
    },
    workers: 1,
});
