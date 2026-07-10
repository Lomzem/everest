<script lang="ts">
	import { onMount } from 'svelte';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { ui } from '$lib/state/ui.svelte';

	let { children } = $props();

	onMount(() => {
		ui.initializeAppearance();
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}
