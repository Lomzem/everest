import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBlankDocument } from '$lib/rdl/model';
import { readPersistedEditorSession, writePersistedEditorSession } from './session-persistence';

describe('editor session persistence', () => {
	beforeEach(() => {
		Object.defineProperty(globalThis, 'window', {
			configurable: true,
			value: {
				localStorage: localStorageMock(),
			},
		});
	});

	it('round-trips a valid persisted session', () => {
		writePersistedEditorSession({
			appView: 'editor',
			document: createBlankDocument(),
			currentPath: '/tmp/top.rdl',
			dirty: true,
			selection: {
				selectedKind: 'folder',
				selectedRegisterId: '',
				selectedGroupPath: '',
				selectedFieldId: '',
			},
			undoStack: [],
			redoStack: [],
		});

		expect(readPersistedEditorSession()).toMatchObject({
			appView: 'editor',
			currentPath: '/tmp/top.rdl',
			dirty: true,
			document: {
				addrmapName: 'untitled_addrmap',
			},
		});
	});

	it('clears malformed persisted JSON', () => {
		window.localStorage.setItem('everest.editorSession', '{');

		expect(readPersistedEditorSession()).toBeUndefined();
		expect(window.localStorage.removeItem).toHaveBeenCalledWith('everest.editorSession');
	});

	it('strips legacy source metadata from persisted sessions', () => {
		window.localStorage.setItem(
			'everest.editorSession',
			JSON.stringify({
				version: 1,
				savedAt: Date.now(),
				appView: 'editor',
				document: {
					...createBlankDocument(),
					source: {
						rootPath: '/tmp/top.rdl',
						text: 'addrmap top {};',
						readOnly: true,
						readOnlyReason: 'legacy source metadata',
					},
				},
				currentPath: '/tmp/top.rdl',
				dirty: false,
				selection: {
					selectedKind: 'folder',
					selectedRegisterId: '',
					selectedGroupPath: '',
					selectedFieldId: '',
				},
				undoStack: [],
				redoStack: [],
			}),
		);

		const session = readPersistedEditorSession();

		expect(session?.document.addrmapName).toBe('untitled_addrmap');
		expect(Object.hasOwn(session?.document ?? {}, 'source')).toBe(false);
	});

	it('clears unsupported session versions', () => {
		window.localStorage.setItem(
			'everest.editorSession',
			JSON.stringify({
				version: 999,
				savedAt: Date.now(),
			}),
		);

		expect(readPersistedEditorSession()).toBeUndefined();
		expect(window.localStorage.removeItem).toHaveBeenCalledWith('everest.editorSession');
	});
});

function localStorageMock() {
	const values = new Map<string, string>();
	return {
		getItem: vi.fn((key: string) => values.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => {
			values.set(key, value);
		}),
		removeItem: vi.fn((key: string) => {
			values.delete(key);
		}),
	};
}
