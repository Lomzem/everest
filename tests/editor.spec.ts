import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { registerMap } from './fixtures';

const source = `// Keep this comment and its spacing.\naddrmap device {\n    reg {\n        field { sw = rw; hw = r; } value[31:0] = 0;\n    } control @0x0;\n};\n`;

async function fallback(page: Page) {
	await page.addInitScript(() => {
		Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true });
	});
}
async function upload(page: Page, text = source) {
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: 'Open .rdl file' }).click();
	await (
		await chooser
	).setFiles({ name: 'synthetic.rdl', mimeType: 'text/plain', buffer: Buffer.from(text) });
}
async function rename(page: Page, name: string) {
	await page.getByLabel('Instance name', { exact: true }).fill(name);
	await page.getByLabel('Instance name', { exact: true }).press('Enter');
	await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}
async function openFixture(page: Page) {
	await fallback(page);
	await page.goto('./');
	await upload(page, registerMap);
	await expect(page.getByRole('heading', { name: 'device', exact: true })).toBeVisible();
}

// All fixture text is synthetic. Tests do not read private reference documents.
test('opens a file, edits, reviews the diff, undoes, redoes and discards', async ({ page }) => {
	await openFixture(page);
	await rename(page, 'renamed_device');
	await page.getByRole('button', { name: 'Changes', exact: true }).click();
	const changes = page.getByRole('complementary', { name: 'Code changes' });
	await expect(changes).toContainText('addrmap renamed_device');
	await expect(changes).toContainText('addrmap device');
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(changes).toContainText('No pending changes');
	await page.getByRole('button', { name: 'Redo', exact: true }).click();
	await expect(changes).toContainText('addrmap renamed_device');
	await changes.getByRole('button', { name: 'Discard changes' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Keep editing' }).click();
	await expect(changes).toContainText('addrmap renamed_device');
	await changes.getByRole('button', { name: 'Discard changes' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Discard and continue' }).click();
	await expect(page.getByRole('heading', { name: 'device', exact: true })).toBeVisible();
	await expect(changes).toContainText('No pending changes');
});

test('fallback download preserves the BOM, comments, CRLF and pending diff', async ({ page }) => {
	await fallback(page);
	await page.goto('./');
	const original = '\uFEFF' + source.replaceAll('\n', '\r\n');
	await upload(page, original);
	await rename(page, 'renamed_device');
	const downloading = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Download RDL', exact: true }).click();
	const download = await downloading;
	expect(download.suggestedFilename()).toBe('synthetic.rdl');
	const actual = await readFile((await download.path())!);
	expect(actual.toString('utf8')).toBe(
		original.replace('addrmap device', 'addrmap renamed_device')
	);
	await page.getByRole('button', { name: 'Changes', exact: true }).click();
	await expect(page.getByRole('complementary', { name: 'Code changes' })).toContainText(
		'addrmap renamed_device'
	);
	await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
});

test('reports include directives and disables visual editing', async ({ page }) => {
	await fallback(page);
	await page.goto('./');
	await upload(page, '`include "missing.rdl"\n' + source);
	await expect(page.getByRole('heading', { name: 'This file needs attention' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Download RDL', exact: true })).toBeDisabled();
	await expect(page.getByLabel('Instance name', { exact: true })).toHaveCount(0);
	await expect(page.locator('main')).toContainText('include');
});

test('does not treat include or Perl text in comments and strings as directives', async ({
	page
}) => {
	await fallback(page);
	await page.goto('./');
	await upload(
		page,
		'// `include "ignored.rdl" <% ignored %>\n' +
			source.replace(
				'addrmap device {',
				'addrmap device {\n    desc = "Text about `include and <% markers.";'
			)
	);
	await expect(page.getByRole('heading', { name: 'device', exact: true })).toBeVisible();
	await expect(page.getByLabel('Instance name', { exact: true })).toBeEnabled();
});

test('creates a boolean UDP declaration and binds its value explicitly', async ({ page }) => {
	await fallback(page);
	await page.goto('./');
	await upload(page);
	await expect(page.getByRole('heading', { name: 'device', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Definitions', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('button', { name: 'Add property declaration' }).click();
	await dialog.getByLabel('Name', { exact: true }).fill('visible_in_report');
	await dialog.getByRole('combobox', { name: 'Type', exact: true }).selectOption('boolean');
	await dialog.getByLabel('Set a default value', { exact: true }).check();
	await dialog.getByRole('combobox', { name: 'Default value', exact: true }).selectOption('true');
	await dialog.getByRole('checkbox', { name: 'field', exact: true }).uncheck();
	await dialog.getByRole('checkbox', { name: 'addrmap', exact: true }).check();
	await dialog.getByRole('button', { name: 'Apply definition' }).click();
	await expect(dialog.getByText('visible_in_report', { exact: true })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('combobox', { name: 'visible_in_report', exact: true })).toHaveCount(
		0
	);
	await page.getByRole('button', { name: 'Add property', exact: true }).click();
	await page
		.getByRole('combobox', { name: 'Property', exact: true })
		.selectOption('visible_in_report');
	await page.getByRole('combobox', { name: 'Value', exact: true }).selectOption('false');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByRole('combobox', { name: 'visible_in_report', exact: true })).toHaveValue(
		'false'
	);
	await page.getByRole('button', { name: 'Changes', exact: true }).click();
	await expect(page.getByRole('complementary', { name: 'Code changes' })).toContainText(
		'visible_in_report = false'
	);
});

interface NativeState {
	source: string;
	writes: number;
	closes: number;
	aborts: number;
	cancel: boolean;
}
declare global {
	interface Window {
		__nativeFile: NativeState;
	}
}
async function native(page: Page, cancel = false) {
	await page.addInitScript(
		({ source, cancel }) => {
			window.__nativeFile = { source, writes: 0, closes: 0, aborts: 0, cancel };
			Object.defineProperty(window, 'showOpenFilePicker', {
				configurable: true,
				value: async () => {
					const state = window.__nativeFile;
					if (state.cancel) throw new DOMException('Cancelled', 'AbortError');
					return [
						{
							name: 'native.rdl',
							getFile: async () => new File([state.source], 'native.rdl'),
							createWritable: async () => {
								let pending = '';
								return {
									write: async (text: string) => {
										pending = text;
										state.writes++;
									},
									close: async () => {
										state.source = pending;
										state.closes++;
									},
									abort: async () => {
										state.aborts++;
									}
								};
							}
						}
					];
				}
			});
		},
		{ source, cancel }
	);
}

test('native save advances the baseline while undo remains available', async ({ page }) => {
	await native(page);
	await page.goto('./');
	await page.getByRole('button', { name: 'Open .rdl file' }).click();
	await expect(page.getByRole('heading', { name: 'device', exact: true })).toBeVisible();
	await rename(page, 'renamed_device');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('status')).toContainText('Saved');
	expect(await page.evaluate(() => window.__nativeFile.closes)).toBe(1);
	expect(await page.evaluate(() => window.__nativeFile.source)).toBe(
		source.replace('addrmap device', 'addrmap renamed_device')
	);
	await page.getByRole('button', { name: 'Changes', exact: true }).click();
	await expect(page.getByRole('complementary', { name: 'Code changes' })).toContainText(
		'No pending changes'
	);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(page.getByRole('complementary', { name: 'Code changes' })).toContainText(
		'addrmap device'
	);
});

test('native save detects external changes and retains local edits', async ({ page }) => {
	await native(page);
	await page.goto('./');
	await page.getByRole('button', { name: 'Open .rdl file' }).click();
	await expect(page.getByRole('heading', { name: 'device', exact: true })).toBeVisible();
	await rename(page, 'renamed_device');
	await page.evaluate(() => {
		window.__nativeFile.source = 'external content';
	});
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('alert')).toContainText('changed outside Everest');
	expect(await page.evaluate(() => window.__nativeFile.writes)).toBe(0);
	await expect(page.getByRole('heading', { name: 'renamed_device', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
	const downloading = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Download RDL', exact: true }).click();
	const downloaded = await readFile((await (await downloading).path())!, 'utf8');
	expect(downloaded).toBe(source.replace('addrmap device', 'addrmap renamed_device'));
	expect(await page.evaluate(() => window.__nativeFile.source)).toBe('external content');
	await page.getByRole('button', { name: 'Changes', exact: true }).click();
	await expect(page.getByRole('complementary', { name: 'Code changes' })).toContainText(
		'addrmap renamed_device'
	);
});

test('cancelled native picker leaves the editor usable', async ({ page }) => {
	await native(page, true);
	await page.goto('./');
	await page.getByRole('button', { name: 'Open .rdl file' }).click();
	await expect(page.getByRole('button', { name: 'Open .rdl file' })).toBeEnabled();
	await expect(page.getByRole('alert')).toHaveCount(0);
	await page.getByRole('button', { name: 'New document' }).click();
	await expect(page.getByRole('heading', { name: 'device', exact: true })).toBeVisible();
});

test('creates enum array defaults with typed controls and edits strings without source quotes', async ({
	page
}) => {
	await openFixture(page);
	await page.getByLabel('name', { exact: true }).fill('Readable name');
	await page.getByLabel('name', { exact: true }).blur();
	await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
	await expect(page.getByLabel('name', { exact: true })).toHaveValue('Readable name');
	await page.getByRole('button', { name: 'Definitions', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('button', { name: 'Add property declaration' }).click();
	await dialog.getByLabel('Name', { exact: true }).fill('available_modes');
	await dialog.getByRole('combobox', { name: 'Type', exact: true }).selectOption('Mode');
	await dialog.getByRole('checkbox', { name: 'Array of values', exact: true }).check();
	await dialog.getByRole('checkbox', { name: 'Set a default value', exact: true }).check();
	await dialog.getByRole('button', { name: 'Add item', exact: true }).click();
	await dialog.getByRole('combobox', { name: 'Item 1', exact: true }).selectOption('Mode::IDLE');
	await dialog.getByRole('button', { name: 'Add item', exact: true }).click();
	await dialog.getByRole('combobox', { name: 'Item 2', exact: true }).selectOption('Mode::SLEEP');
	await dialog.getByRole('button', { name: 'Apply definition', exact: true }).click();
	await expect(dialog.getByText('available_modes', { exact: true })).toBeVisible();
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: 'Changes', exact: true }).click();
	const changes = page.getByRole('complementary', { name: 'Code changes' });
	await expect(changes).toContainText('name = "Readable name"');
	await expect(changes).toContainText("'{Mode::IDLE, Mode::SLEEP}");
});

test('applies nested struct array values with an explicit action', async ({ page }) => {
	await fallback(page);
	await page.goto('./');
	await upload(
		page,
		`struct Settings { longint unsigned values[]; };
 property settings { type = Settings; component = addrmap; };
 addrmap device { settings = Settings'{values: '{1, 2}}; reg { field {sw=rw;hw=r;} value[0:0]; } control; };`
	);
	await expect(page.getByRole('heading', { name: 'device', exact: true })).toBeVisible();
	const group = page.getByRole('group', { name: 'settings', exact: true });
	await group.getByRole('button', { name: 'Add item', exact: true }).click();
	await group.getByLabel('Item 3', { exact: true }).fill('3');
	await page.getByRole('button', { name: 'Apply value', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Apply value', exact: true })).toHaveCount(0);
	await page.getByRole('button', { name: 'Changes', exact: true }).click();
	await expect(page.getByRole('complementary', { name: 'Code changes' })).toContainText(
		"values: '{1, 2, 3}"
	);
});

test('keeps a renamed register selected through undo and redo', async ({ page }) => {
	await openFixture(page);
	const tree = page.getByRole('complementary', { name: 'Components' });
	await tree.getByRole('button', { name: /^control / }).click();
	await rename(page, 'configuration');
	await expect(tree.getByRole('button', { name: /^configuration / })).toHaveAttribute(
		'aria-current',
		'true'
	);
	await expect(page.getByLabel('Register width', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'control', exact: true })).toBeVisible();
	await expect(tree.getByRole('button', { name: /^control / })).toHaveAttribute(
		'aria-current',
		'true'
	);
	await page.getByRole('button', { name: 'Redo', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'configuration', exact: true })).toBeVisible();
	await expect(tree.getByRole('button', { name: /^configuration / })).toHaveAttribute(
		'aria-current',
		'true'
	);
});
