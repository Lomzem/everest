import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { registerMap } from './fixtures';

const source = `// Keep this comment and its spacing.\naddrmap device {\n    reg {\n        field { sw = rw; hw = r; } value[31:0] = 0;\n    } control @0x0;\n};\n`;
async function fallback(page: Page) {
	await page.addInitScript(() => {
		Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true });
		Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true });
	});
}
async function menu(page: Page, section: string, item: string) {
	const trigger = page.getByRole('menuitem', { name: section, exact: true });
	await trigger.focus();
	if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.press('ArrowDown');
	await page.getByRole('menuitem', { name: new RegExp('^' + item + '(?:\\s*Ctrl.*)?$') }).click();
}
async function upload(page: Page, text = source) {
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: 'Open RDL', exact: true }).click();
	await (
		await chooser
	).setFiles({ name: 'synthetic.rdl', mimeType: 'text/plain', buffer: Buffer.from(text) });
}
async function selectRegister(page: Page, id = 'control') {
	const search = page.getByRole('combobox', { name: 'Search registers' });
	await search.fill(id);
	await search.press('Enter');
	await expect(page.getByLabel('Register identifier', { exact: true })).toHaveValue(id);
}
async function rename(page: Page, name: string) {
	const input = page.getByLabel('Register identifier', { exact: true });
	await input.fill(name);
	await input.press('Enter');
	await expect(input).toHaveValue(name);
}
async function openFixture(page: Page, text = registerMap) {
	await fallback(page);
	await page.goto('./');
	await upload(page, text);
	await selectRegister(page);
}

test('edits a register and keeps selection through menu undo and redo', async ({ page }) => {
	await openFixture(page);
	await rename(page, 'configuration');
	await menu(page, 'Edit', 'Undo');
	await expect(page.getByLabel('Register identifier', { exact: true })).toHaveValue('control');
	await menu(page, 'Edit', 'Redo');
	await expect(page.getByLabel('Register identifier', { exact: true })).toHaveValue(
		'configuration'
	);
	await expect(page.getByRole('button', { name: 'Changes', exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Definitions', exact: true })).toHaveCount(0);
});
test('download retains BOM, comments, CRLF and unsaved state', async ({ page }) => {
	const original = '\uFEFF' + source.replaceAll('\n', '\r\n');
	await openFixture(page, original);
	await rename(page, 'configuration');
	const downloading = page.waitForEvent('download');
	await menu(page, 'File', 'Save');
	const download = await downloading;
	expect(download.suggestedFilename()).toBe('synthetic.rdl');
	expect(await readFile((await download.path())!, 'utf8')).toBe(
		original.replace('control @', 'configuration @')
	);
	await expect(page).toHaveTitle(/^\*/);
});
test('reports external includes only when present and blocks save', async ({ page }) => {
	await fallback(page);
	await page.goto('./');
	await upload(page, '`include "missing.rdl"\n' + source);
	await expect(page.getByRole('dialog')).toContainText('include');
	await expect(page.getByLabel('Register identifier', { exact: true })).toHaveCount(0);
});
test('ignores preprocessing markers in comments and preserves UDP values', async ({ page }) => {
	const text =
		'// `include "ignored.rdl" <% ignored %>\nproperty note { type = string; component = reg; };\n' +
		source.replace('reg {', 'reg { note = "Text about `include and <% markers.";');
	await openFixture(page, text);
	await rename(page, 'configuration');
	const downloading = page.waitForEvent('download');
	await menu(page, 'File', 'Save');
	expect(await readFile((await (await downloading).path())!, 'utf8')).toBe(
		text.replace('control @', 'configuration @')
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

test('native save writes back and keeps undo available', async ({ page }) => {
	await native(page);
	await page.goto('./');
	await page.getByRole('button', { name: 'Open RDL', exact: true }).click();
	await selectRegister(page);
	await rename(page, 'configuration');
	await menu(page, 'File', 'Save');
	await expect.poll(() => page.evaluate(() => window.__nativeFile.closes)).toBe(1);
	expect(await page.evaluate(() => window.__nativeFile.source)).toBe(
		source.replace('control @', 'configuration @')
	);
	await expect(page).not.toHaveTitle(/^\*/);
	await menu(page, 'Edit', 'Undo');
	await expect(page.getByLabel('Register identifier', { exact: true })).toHaveValue('control');
	await expect(page).toHaveTitle(/^\*/);
});
test('external changes block write and Save As can download local edits', async ({ page }) => {
	await native(page);
	await page.addInitScript(() =>
		Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
	);
	await page.goto('./');
	await page.getByRole('button', { name: 'Open RDL', exact: true }).click();
	await selectRegister(page);
	await rename(page, 'configuration');
	await page.evaluate(() => {
		window.__nativeFile.source = 'external content';
	});
	await menu(page, 'File', 'Save');
	await expect(page.getByRole('alert')).toContainText('changed outside Everest');
	expect(await page.evaluate(() => window.__nativeFile.writes)).toBe(0);
	const downloading = page.waitForEvent('download');
	await page.getByRole('dialog').getByRole('button', { name: 'Save As...', exact: true }).click();
	expect(await readFile((await (await downloading).path())!, 'utf8')).toBe(
		source.replace('control @', 'configuration @')
	);
	expect(await page.evaluate(() => window.__nativeFile.source)).toBe('external content');
});
test('cancelled picker leaves welcome usable', async ({ page }) => {
	await native(page, true);
	await page.goto('./');
	await page.getByRole('button', { name: 'Open RDL', exact: true }).click();
	await expect(page.getByRole('alert')).toHaveCount(0);
	await page.getByRole('button', { name: 'New RDL', exact: true }).click();
	await expect(page.getByRole('combobox', { name: 'Search registers' })).toBeVisible();
});
test('Quit guards unsaved changes and returns to welcome after discard', async ({ page }) => {
	await openFixture(page);
	await rename(page, 'configuration');
	await menu(page, 'File', 'Quit');
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(page.getByLabel('Register identifier', { exact: true })).toHaveValue(
		'configuration'
	);
	await menu(page, 'File', 'Quit');
	await dialog.getByRole('button', { name: 'Discard changes', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Open RDL', exact: true })).toBeVisible();
});

test('Ctrl+S includes focused input and invalid input blocks the download', async ({ page }) => {
	await openFixture(page);
	const display = page.getByLabel('Register display name', { exact: true });
	await display.fill('Focused draft');
	const downloading = page.waitForEvent('download');
	await display.press('Control+s');
	expect(await readFile((await (await downloading).path())!, 'utf8')).toContain(
		'name = "Focused draft"'
	);
	const id = page.getByLabel('Register identifier', { exact: true });
	await id.fill('not a valid identifier');
	await id.press('Control+s');
	await expect(id).toHaveAttribute('aria-invalid', 'true');
	await id.press('Escape');
	await expect(id).toHaveValue('control');
});
test('recovers unsaved work after reload with an explicit choice', async ({ page }) => {
	await openFixture(page);
	await rename(page, 'recovered_control');
	await expect
		.poll(() =>
			page.evaluate(
				async () =>
					new Promise<boolean>((resolve, reject) => {
						const request = indexedDB.open('everest-workspace', 1);
						request.onerror = () => reject(request.error);
						request.onsuccess = () => {
							const db = request.result;
							const tx = db.transaction('session', 'readonly');
							const read = tx.objectStore('session').get('active');
							read.onsuccess = () => {
								resolve(Boolean(read.result?.source.includes('recovered_control')));
								db.close();
							};
							read.onerror = () => reject(read.error);
						};
					})
			)
		)
		.toBe(true);
	page.on('dialog', (dialog) => dialog.accept());
	await page.reload();
	const recovery = page.getByRole('dialog');
	await expect(recovery).toContainText('Resume unsaved work?');
	await recovery.getByRole('button', { name: 'Resume', exact: true }).click();
	await expect(page.getByLabel('Register identifier', { exact: true })).toHaveValue(
		'recovered_control'
	);
	await expect(page).toHaveTitle(/^\*/);
});
test('creates an empty register then adds a field and an encoding', async ({ page }) => {
	await fallback(page);
	await page.goto('./');
	await page.getByRole('button', { name: 'New RDL', exact: true }).click();
	await page.getByRole('button', { name: 'Add Register', exact: true }).first().click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Register display name', { exact: true }).fill('Control register');
	await expect(dialog.getByLabel('ID, register identifier', { exact: true })).toHaveValue(
		'control_register'
	);
	await dialog.getByRole('button', { name: 'Create Register', exact: true }).click();
	await expect(page.getByLabel('Register identifier', { exact: true })).toHaveValue(
		'control_register'
	);
	await expect(page.locator('[data-field-card]')).toHaveCount(0);
	await page.getByRole('button', { name: 'Add Field', exact: true }).click();
	await expect(page.locator('[data-field-card]')).toHaveCount(1);
	await page.getByRole('button', { name: 'Add Enum', exact: true }).click();
	await expect(page.locator('[data-enum-value-row]')).toHaveCount(1);
});

test('restores unfinished input without changing the saved source', async ({ page }) => {
	await openFixture(page);
	await page.getByLabel('Register display name', { exact: true }).fill('Unfinished input');
	await expect
		.poll(() =>
			page.evaluate(
				async () =>
					new Promise<boolean>((resolve, reject) => {
						const request = indexedDB.open('everest-workspace', 1);
						request.onerror = () => reject(request.error);
						request.onsuccess = () => {
							const db = request.result;
							const read = db
								.transaction('session', 'readonly')
								.objectStore('session')
								.get('active');
							read.onsuccess = () => {
								resolve(Object.values(read.result?.formDrafts ?? {}).includes('Unfinished input'));
								db.close();
							};
							read.onerror = () => reject(read.error);
						};
					})
			)
		)
		.toBe(true);
	page.on('dialog', (dialog) => dialog.accept());
	await page.reload();
	const recovery = page.getByRole('dialog');
	await expect(recovery).toContainText('Resume unsaved work?');
	await recovery.getByRole('button', { name: 'Resume', exact: true }).click();
	await expect(page.getByLabel('Register display name', { exact: true })).toHaveValue(
		'Unfinished input'
	);
	const downloading = page.waitForEvent('download');
	await menu(page, 'File', 'Save');
	expect(await readFile((await (await downloading).path())!, 'utf8')).toContain('Unfinished input');
});

test('Save on a new document uses the native Save As picker', async ({ page }) => {
	await native(page);
	await page.addInitScript(() => {
		Object.defineProperty(window, 'showSaveFilePicker', {
			configurable: true,
			value: async () => {
				const picker = (
					window as unknown as Window & { showOpenFilePicker: () => Promise<unknown[]> }
				).showOpenFilePicker;
				return (await picker())[0];
			}
		});
	});
	await page.goto('./');
	await page.getByRole('button', { name: 'New RDL', exact: true }).click();
	await menu(page, 'File', 'Save');
	await expect.poll(() => page.evaluate(() => window.__nativeFile.closes)).toBe(1);
	expect(await page.evaluate(() => window.__nativeFile.source)).toContain(
		'addrmap untitled_addrmap'
	);
	await expect(page).toHaveTitle('native.rdl');
});
