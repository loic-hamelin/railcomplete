<script lang="ts">
	// Micro-déplacement de la croix par pas de 20 cm (E6, E11). On place d'habitude la croix en
	// faisant glisser la carte ; ces flèches sont l'alternative sans glisser (WCAG 2.2, 2.5.7) :
	// repliées derrière un petit bouton, elles s'ouvrent dans un pavé flottant sur la carte.
	import Icon from '#lib/Icon.svelte';
	import { t } from '#lib/i18n/t.js';

	let { onnudge }: { onnudge: (dx: number, dy: number) => void } = $props();
	let open = $state(false);
	const id = $props.id();
</script>

<!-- Le pavé s'ouvre à gauche du bouton, aligné sur son bas : il ne descend jamais plus bas que
     le bouton, donc jamais sous le panneau d'actions, même sur un petit écran. -->
<div class="np">
	<button
		class="toggle float"
		type="button"
		aria-expanded={open}
		aria-controls={id}
		aria-label={t('mapA11y.nudge')}
		title={t('mapA11y.nudge')}
		onclick={() => (open = !open)}
	>
		<Icon name={open ? 'close' : 'nudge'} size={20} />
	</button>

	{#if open}
		<div class="pad float" {id} role="group" aria-label={t('mapA11y.nudgePad')}>
			<button class="u" type="button" aria-label={t('mapA11y.up')} onclick={() => onnudge(0, -1)}
				><Icon name="arrow-u" size={20} /></button
			>
			<button class="l" type="button" aria-label={t('mapA11y.left')} onclick={() => onnudge(-1, 0)}
				><Icon name="arrow-l" size={20} /></button
			>
			<span class="step" aria-hidden="true">20 cm</span>
			<button class="r" type="button" aria-label={t('mapA11y.right')} onclick={() => onnudge(1, 0)}
				><Icon name="arrow-r" size={20} /></button
			>
			<button class="d" type="button" aria-label={t('mapA11y.down')} onclick={() => onnudge(0, 1)}
				><Icon name="arrow-d" size={20} /></button
			>
		</div>
	{/if}
</div>

<style>
	.np {
		position: relative;
	}
	.toggle {
		width: 44px;
		height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		cursor: pointer;
	}
	.toggle[aria-expanded='true'] {
		color: var(--primary);
	}
	.pad {
		position: absolute;
		right: calc(100% + 8px);
		bottom: 0;
		display: grid;
		grid-template-columns: repeat(3, 44px);
		grid-template-rows: repeat(3, 44px);
		grid-template-areas: '. u .' 'l s r' '. d .';
		padding: 2px;
	}
	.pad button {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: 0;
		border-radius: var(--radius);
		background: transparent;
		color: var(--text);
		cursor: pointer;
	}
	.pad button:active {
		background: var(--surface-2);
	}
	.u {
		grid-area: u;
	}
	.l {
		grid-area: l;
	}
	.r {
		grid-area: r;
	}
	.d {
		grid-area: d;
	}
	.step {
		grid-area: s;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.8125rem;
		line-height: 1;
		color: var(--text-2);
		font-variant-numeric: tabular-nums;
	}
</style>
