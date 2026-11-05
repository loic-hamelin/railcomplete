<script lang="ts">
	import { resolve } from '$app/paths';
	import Icon from './Icon.svelte';
	let { current }: { current: 'gare' | 'contributions' | 'reglages' } = $props();
</script>

<!-- Barre de navigation principale. Contributions et Réglages arrivent aux lots 2 à 4. -->
<nav aria-label="Navigation principale">
	<a href={resolve('/gares')} aria-current={current === 'gare' ? 'page' : undefined}>
		<Icon name="home" size={26} />Gare
	</a>
	<a href={resolve('/a-propos')} aria-current={current === 'reglages' ? 'page' : undefined}>
		<Icon name="gear" size={26} />À propos
	</a>
</nav>

<style>
	nav {
		position: sticky;
		bottom: 0;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
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
</style>
