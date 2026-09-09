import { defineConfig, devices } from '@playwright/test';

const basePath = process.env.BASE_PATH ?? '/everest';
const baseURL = `http://127.0.0.1:4173${basePath}/`;
const preview = 'bun run preview --host 127.0.0.1 --port 4173 --strictPort';

export default defineConfig({
	testDir: './tests',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 2 : undefined,
	reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
	use: {
		baseURL,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
		{ name: 'firefox', use: { ...devices['Desktop Firefox'] } }
	],
	webServer: {
		command: process.env.CI ? preview : `bun run build && ${preview}`,
		url: baseURL,
		reuseExistingServer: false,
		timeout: 120_000
	}
});
