<script lang="ts">
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { editor } from '$lib/state/editor.svelte';
</script>

<AlertDialog.Root
	bind:open={
		() => Boolean(editor.pendingDestructiveAction),
		(nextOpen) => {
			if (!nextOpen) editor.cancelPendingDestructiveAction();
		}
	}
>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title class="text-base">Discard unsaved changes?</AlertDialog.Title>
			<AlertDialog.Description class="text-base">
				The current RDL has unsaved changes. Continuing will discard those changes.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel class="text-base" onclick={() => editor.cancelPendingDestructiveAction()}>
				Cancel
			</AlertDialog.Cancel>
			<AlertDialog.Action
				variant="destructive"
				class="text-base"
				onclick={() => void editor.confirmPendingDestructiveAction()}
			>
				Discard changes
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
