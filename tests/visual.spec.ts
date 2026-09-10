import { expect, test } from '@playwright/test';
import { registerMap } from './fixtures';

test('uses the reference dark theme, resizable sidebar and shadcn settings controls', async ({
	page,
	browserName
}) => {
	await page.setViewportSize({ width: 1600, height: 1000 });
	await page.addInitScript(() =>
		Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true })
	);
	await page.goto('./');
	await expect(page.locator('html')).toHaveClass(/dark/);
	const palette = await page.evaluate(() => {
		const canvas = document.createElement('canvas');
		canvas.width = 1;
		canvas.height = 1;
		const context = canvas.getContext('2d')!;
		return ['background', 'card', 'primary', 'border', 'sidebar'].map((name) => {
			context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--' + name);
			context.fillRect(0, 0, 1, 1);
			return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
		});
	});
	expect(palette).toEqual([
		[34, 29, 39],
		[44, 38, 50],
		[163, 0, 76],
		[59, 50, 55],
		[24, 17, 23]
	]);
	await page.screenshot({ path: `/tmp/everest-restored-${browserName}-welcome.png` });
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: 'Open RDL', exact: true }).click();
	await (
		await chooser
	).setFiles({ name: 'synthetic.rdl', mimeType: 'text/plain', buffer: Buffer.from(registerMap) });
	const search = page.getByRole('combobox', { name: 'Search registers' });
	await search.fill('control');
	await search.press('Enter');
	await expect(page.getByLabel('Register identifier', { exact: true })).toHaveValue('control');
	const handle = page.locator('[data-slot="resizable-handle"]');
	const before = (await handle.boundingBox())!;
	await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
	await page.mouse.down();
	await page.mouse.move(before.x + 140, before.y + before.height / 2, { steps: 10 });
	await page.mouse.up();
	expect((await handle.boundingBox())!.x).toBeGreaterThan(before.x + 80);
	await page.screenshot({ path: `/tmp/everest-restored-${browserName}-editor.png` });
	await page.getByRole('button', { name: 'Settings', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	const theme = dialog.getByRole('radiogroup', { name: 'Theme', exact: true });
	await theme.getByRole('radio', { name: 'Light', exact: true }).click();
	await expect(page.locator('html')).not.toHaveClass(/dark/);
	await theme.getByRole('radio', { name: 'Dark', exact: true }).click();
	await expect(page.locator('html')).toHaveClass(/dark/);
	await dialog.getByRole('switch', { name: 'Show reserved gaps', exact: true }).click();
	await page.screenshot({ path: `/tmp/everest-restored-${browserName}-settings.png` });
	await page.keyboard.press('Escape');
	await page.getByRole('menuitem', { name: 'File', exact: true }).focus();
	await page.keyboard.press('ArrowDown');
	await expect(page.getByRole('menu')).toBeVisible();
	await page.keyboard.press('Escape');
});
