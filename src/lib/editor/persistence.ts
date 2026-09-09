import { Data, Effect } from 'effect';
import type { WritableFileHandle } from './files';

export interface SavedWorkspace {
	version: 1;
	timestamp: number;
	formDrafts?: Record<string, string>;
	emptyGroups?: string[];
	filename: string;
	source: string;
	baseline: string;
	selectedId: string;
	newDraft: boolean;
	handle?: WritableFileHandle;
}
export class PersistenceError extends Data.TaggedError('PersistenceError')<{ message: string }> {}
export interface WorkspaceStorage {
	load: () => Effect.Effect<SavedWorkspace | undefined, PersistenceError>;
	save: (workspace: SavedWorkspace) => Effect.Effect<void, PersistenceError>;
	clear: () => Effect.Effect<void, PersistenceError>;
}
const databaseName = 'everest-workspace';
const storeName = 'session';
function failure(cause: unknown) {
	return new PersistenceError({
		message: cause instanceof Error ? cause.message : 'The browser could not store this workspace.'
	});
}
function openDatabase(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(databaseName, 1);
		let blocked = false;
		request.onupgradeneeded = () => {
			if (!request.result.objectStoreNames.contains(storeName))
				request.result.createObjectStore(storeName);
		};
		request.onsuccess = () => {
			if (blocked) request.result.close();
			else resolve(request.result);
		};
		request.onerror = () =>
			reject(request.error ?? new Error('Workspace storage could not be opened.'));
		request.onblocked = () => {
			blocked = true;
			reject(new Error('Another tab is blocking workspace storage.'));
		};
	});
}
async function transaction<T>(
	mode: IDBTransactionMode,
	operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
	const database = await openDatabase();
	try {
		return await new Promise<T>((resolve, reject) => {
			const tx = database.transaction(storeName, mode);
			let request: IDBRequest<T>;
			try {
				request = operation(tx.objectStore(storeName));
			} catch (cause) {
				tx.abort();
				reject(cause);
				return;
			}
			let result: T;
			request.onsuccess = () => {
				result = request.result;
			};
			tx.oncomplete = () => resolve(result);
			tx.onerror = () =>
				reject(tx.error ?? request.error ?? new Error('Workspace storage failed.'));
			tx.onabort = () =>
				reject(tx.error ?? request.error ?? new Error('Workspace storage was cancelled.'));
		});
	} finally {
		database.close();
	}
}
function validWorkspace(value: unknown): value is SavedWorkspace {
	if (!value || typeof value !== 'object') return false;
	const data = value as Partial<SavedWorkspace>;
	return (
		data.version === 1 &&
		(data.emptyGroups === undefined ||
			(Array.isArray(data.emptyGroups) &&
				data.emptyGroups.every((path) => typeof path === 'string'))) &&
		(data.formDrafts === undefined ||
			(typeof data.formDrafts === 'object' &&
				data.formDrafts !== null &&
				!Array.isArray(data.formDrafts) &&
				Object.values(data.formDrafts).every((value) => typeof value === 'string'))) &&
		typeof data.timestamp === 'number' &&
		Number.isFinite(data.timestamp) &&
		typeof data.filename === 'string' &&
		typeof data.source === 'string' &&
		typeof data.baseline === 'string' &&
		typeof data.selectedId === 'string' &&
		typeof data.newDraft === 'boolean' &&
		data.source.length <= 8_000_000 &&
		data.baseline.length <= 8_000_000
	);
}
/** IndexedDB can retain native file handles. Source recovery also works without those handles. */
export const browserWorkspaceStorage: WorkspaceStorage = {
	load: () =>
		Effect.tryPromise({
			try: async () => {
				if (typeof indexedDB === 'undefined') return undefined;
				const value: unknown = await transaction('readonly', (store) => store.get('active'));
				if (value === undefined) return undefined;
				if (!validWorkspace(value))
					throw new Error(
						'The saved workspace format is invalid. Open a file to start a new session.'
					);
				return value;
			},
			catch: failure
		}),
	save: (workspace) =>
		Effect.tryPromise({
			try: async () => {
				if (typeof indexedDB === 'undefined') return;
				try {
					await transaction('readwrite', (store) => store.put(workspace, 'active'));
				} catch (cause) {
					if (
						workspace.handle &&
						cause instanceof DOMException &&
						cause.name === 'DataCloneError'
					) {
						const withoutHandle = { ...workspace };
						delete withoutHandle.handle;
						await transaction('readwrite', (store) => store.put(withoutHandle, 'active'));
					} else throw cause;
				}
			},
			catch: failure
		}),
	clear: () =>
		Effect.tryPromise({
			try: async () => {
				if (typeof indexedDB === 'undefined') return;
				await transaction('readwrite', (store) => store.delete('active'));
			},
			catch: failure
		})
};
