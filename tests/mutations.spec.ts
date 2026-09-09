import { expect, test } from '@playwright/test';

test('commits the focused register name before adding a field', async ({ page }) => {
	await page.goto('./');
	await page.getByRole('button', { name: 'New RDL', exact: true }).click();
	await page.getByRole('button', { name: 'Add Register', exact: true }).first().click();
	await page
		.getByRole('dialog')
		.getByLabel('Register display name', { exact: true })
		.fill('Control');
	await page.getByRole('button', { name: 'Create Register', exact: true }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await page.getByLabel('Register display name', { exact: true }).fill('New Control');
	await page.getByRole('button', { name: 'Add Field', exact: true }).click();
	await expect(page.getByLabel('Register identifier', { exact: true })).toHaveValue('new_control');
	await expect(page.locator('[data-field-card]')).toHaveCount(1);
	await page.getByLabel('Field display name', { exact: true }).fill('Device Mode');
	await page.getByRole('button', { name: 'Add Enum', exact: true }).click();
	await expect(page.getByLabel('Field identifier', { exact: true })).toHaveValue('device_mode');
	await expect(page.locator('[data-enum-value-row]')).toHaveCount(1);
});

test('commits encoding input before adding or removing an encoding', async ({ page }) => {
	await page.addInitScript(() =>
		Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true })
	);
	await page.goto('./');
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: 'Open RDL', exact: true }).click();
	await (
		await chooser
	).setFiles({
		name: 'encodings.rdl',
		mimeType: 'text/plain',
		buffer: Buffer.from(
			'addrmap device { reg { regwidth = 8; enum mode_e { OFF=0; ON=1; }; field { sw=rw; hw=rw; encode=mode_e; reset=mode_e::OFF; } mode[7:0]; } control @0; };'
		)
	});
	await page.getByRole('combobox', { name: 'Search registers' }).fill('control');
	await page.getByRole('combobox', { name: 'Search registers' }).press('Enter');
	await page.locator('[data-field-card] button[aria-expanded]').click();
	await page.getByLabel('Encoding 1 description', { exact: true }).fill('Disabled mode');
	await page.getByRole('button', { name: 'Add Encoding', exact: true }).click();
	await expect(page.locator('[data-enum-value-row]')).toHaveCount(3);
	await expect(page.getByLabel('Encoding 1 description', { exact: true })).toHaveValue(
		'Disabled mode'
	);
	await page.getByLabel('Encoding 2 description', { exact: true }).fill('Enabled mode');
	await page.getByRole('button', { name: 'Remove encoding VALUE_2', exact: true }).click();
	await expect(page.locator('[data-enum-value-row]')).toHaveCount(2);
	await expect(page.getByLabel('Encoding 2 description', { exact: true })).toHaveValue(
		'Enabled mode'
	);
});
