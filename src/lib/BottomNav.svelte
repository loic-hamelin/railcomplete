<script lang="ts">
	import { resolve } from '$app/paths';
	import Icon from './Icon.svelte';
	import { loadEdits, pending } from './edits.svelte.js';
	import { onMount } from 'svelte';
	let { current }: { current: 'gare' | 'contributions' | 'reglages' } = $props();
	onMount(() => {
		loadEdits();
	});
	const n = $derived(pending.list.length);
</script>

<nav aria-label="Navigation principale">
	<a href={resolve('/gares')} aria-current={current === 'gare' ? 'page' : undefined}>
		<Icon name="home" size={26} />Gare
	</a>
	<a
		href={resolve('/contributions')}
		aria-current={current === 'contributions' ? 'page' : undefined}
	>
		<span class="ico">
			<Icon name="list" size={26} />
			{#if n}<span class="badge">{n}</span>{/if}
		</span>
		Contributions{#if n}<span class="visually-hidden">, {n} en attente</span>{/if}
	</a>
	<a href={resolve('/reglages')} aria-current={current === 'reglages' ? 'page' : undefined}>
		<Icon name="gear" size={26} />Réglages
	</a>
</nav>

<style>
	nav {
		position: sticky;
		bottom: 0;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		height: calc(72px + env(safe-area-inset-bottom));
		padding-bottom: env(safe-area-inset-bottom);
		border-top: 1px solid var(--border);
		background: var(--bg);
	}
	a {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		color: var(--text-2);
		font-size: 0.8125rem;
		text-decoration: none;
	}
	a[aria-current='page'] {
		color: var(--primary);
		font-weight: 700;
	}
	.ico {
		position: relative;
		display: flex;
	}
	.badge {
		position: absolute;
		top: -6px;
		left: 18px;
		min-width: 22px;
		height: 22px;
		padding: 0 5px;
		border-radius: 11px;
		background: var(--pancarte);
		color: #fff;
		font-size: 0.8125rem;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: center;
	}
</style>
