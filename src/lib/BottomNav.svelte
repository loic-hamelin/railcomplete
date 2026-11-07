<script lang="ts">
	import { resolve } from '$app/paths';
	import Icon from './Icon.svelte';
	import { loadEdits, mine } from './edits.svelte.js';
	import { t } from './i18n/t.js';
	import { onMount } from 'svelte';
	let { current }: { current: 'gare' | 'contributions' | 'reglages' } = $props();
	onMount(() => {
		loadEdits();
	});
	const n = $derived(mine().length);
</script>

<nav aria-label={t('nav.label')}>
	<a href={resolve('/gares')} aria-current={current === 'gare' ? 'page' : undefined}>
		<Icon name="gare" size={24} />{t('nav.station')}
	</a>
	<a
		href={resolve('/contributions')}
		aria-current={current === 'contributions' ? 'page' : undefined}
	>
		<span class="ico">
			<Icon name="list" size={24} />
			{#if n}<span class="badge">{n}</span>{/if}
		</span>
		{t('nav.contributions')}{#if n}<span class="visually-hidden"
				>{t('nav.pending', { count: n })}</span
			>{/if}
	</a>
	<a href={resolve('/reglages')} aria-current={current === 'reglages' ? 'page' : undefined}>
		<Icon name="settings" size={24} />{t('nav.settings')}
	</a>
</nav>

<style>
	nav {
		position: sticky;
		bottom: 0;
		z-index: 5;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		height: calc(68px + env(safe-area-inset-bottom));
		padding-bottom: env(safe-area-inset-bottom);
		border-top: 1px solid var(--border);
		background: var(--bg);
	}
	a {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		color: var(--text-2);
		font-size: 0.8125rem;
		line-height: 1.2;
		text-decoration: none;
	}
	/* Onglet actif : couleur, graisse et trait de 2 px au-dessus (pas seulement la couleur). */
	a[aria-current='page'] {
		color: var(--primary);
		font-weight: 600;
	}
	a[aria-current='page']::before {
		content: '';
		position: absolute;
		top: -1px;
		left: 50%;
		width: 48px;
		height: 2px;
		margin-left: -24px;
		border-radius: 0 0 2px 2px;
		background: var(--primary);
	}
	.ico {
		position: relative;
		display: flex;
	}
	.badge {
		position: absolute;
		top: -7px;
		left: 14px;
		min-width: 20px;
		height: 20px;
		padding: 0 5px;
		border: 2px solid var(--bg);
		border-radius: 10px;
		background: var(--primary);
		color: var(--on-primary);
		font-size: 0.75rem;
		font-weight: 600;
		line-height: 1;
		font-variant-numeric: tabular-nums;
		display: flex;
		align-items: center;
		justify-content: center;
		box-sizing: content-box;
	}
</style>
