import { expect, test } from '@playwright/test';
import { registerMap } from './fixtures';

test('editor remains usable in light and dark themes, dialogs and a narrow viewport', async ({
	page,
	browserName
}) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.addInitScript(() => {
		Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true });
	});
	await page.goto('./');
	await page.screenshot({ path: `/tmp/everest-review-${browserName}-empty.png` });
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: 'Open .rdl file' }).click();
	await (
		await chooser
	).setFiles({ name: 'synthetic.rdl', mimeType: 'text/plain', buffer: Buffer.from(registerMap) });
	await expect(page.getByRole('heading', { name: 'device', exact: true })).toBeVisible();
	await page
		.getByRole('complementary', { name: 'Components' })
		.getByRole('button', { name: /^control / })
		.click();
	await expect(page.getByRole('heading', { name: 'control', exact: true })).toBeVisible();
	await page.getByLabel('Instance name', { exact: true }).focus();
	await page.screenshot({ path: `/tmp/everest-review-${browserName}-light.png` });
	await page.getByRole('button', { name: 'Use dark theme' }).click();
	await expect(page.locator('html')).toHaveClass(/dark/);
	await page.screenshot({ path: `/tmp/everest-review-${browserName}-dark.png` });
	await page.getByLabel('Register width', { exact: true }).fill('3');
	await page.getByLabel('Register width', { exact: true }).press('Enter');
	await expect(page.getByLabel('Register width', { exact: true })).toHaveAttribute(
		'aria-invalid',
		'true'
	);
	await page.screenshot({ path: `/tmp/everest-review-${browserName}-invalid.png` });
	await page.getByLabel('Register width', { exact: true }).press('Escape');
	await page.getByRole('button', { name: 'Delete control', exact: true }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	await expect(
		page.getByRole('dialog').getByRole('button', { name: 'Delete component' })
	).toBeVisible();
	await page.screenshot({ path: `/tmp/everest-review-${browserName}-dialog.png` });
	await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(page.getByRole('button', { name: 'Explorer', exact: true })).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
	await page.getByRole('button', { name: 'Explorer', exact: true }).click();
	await expect(page.getByRole('complementary', { name: 'Components' })).toBeVisible();
	await page
		.getByRole('complementary', { name: 'Components' })
		.getByRole('button', { name: /^status / })
		.click();
	await expect(page.getByRole('heading', { name: 'status', exact: true })).toBeVisible();
	await page.screenshot({ path: `/tmp/everest-review-${browserName}-mobile.png` });
});
