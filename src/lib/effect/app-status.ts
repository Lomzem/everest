import { Effect } from 'effect';
import { isTauriRuntime } from '$lib/tauri';

export type RuntimeTarget = 'browser' | 'tauri';

export interface AppStatus {
	readonly name: string;
	readonly runtime: RuntimeTarget;
	readonly ready: boolean;
}

const detectRuntime = Effect.sync((): RuntimeTarget => {
	return isTauriRuntime() ? 'tauri' : 'browser';
});

export const getAppStatus = Effect.map(detectRuntime, (runtime): AppStatus => {
	return {
		name: 'Everest',
		runtime,
		ready: true,
	};
});
