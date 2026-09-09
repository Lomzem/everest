import { compile, applyEdit } from '$lib/rdl';
import type { Compilation, EditCommand } from '$lib/rdl/types';

let current: Compilation | undefined;

self.onmessage = (event: MessageEvent<{ id: number; source: string; command?: EditCommand }>) => {
	try {
		const { source, command } = event.data;
		if (!current || current.source !== source) current = compile(source);
		const compilation = command ? compile(applyEdit(current, command)) : current;
		current = compilation;
		self.postMessage({ id: event.data.id, compilation });
	} catch (cause) {
		self.postMessage({
			id: event.data.id,
			error: cause instanceof Error ? cause.message : 'Compilation failed.'
		});
	}
};
