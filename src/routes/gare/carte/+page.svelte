<script lang="ts">
	// E5 — Carte de la gare (lecture seule au lot 1).
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Icon from '#lib/Icon.svelte';
	import { buildFeatures, type FeatureProps } from '#lib/core/features.js';
	import { current, openStation } from '#lib/current.svelte.js';
	import StationMap from '#lib/map/StationMap.svelte';
	import { onMount, untrack } from 'svelte';

	let mounted = $state(false);
	onMount(() => (mounted = true));
	const id = $derived(mounted ? (page.url.searchParams.get('id') ?? '') : '');
	const focus = $derived(mounted ? (page.url.searchParams.get('focus') ?? undefined) : undefined);
	$effect(() => {
		// Ne dépend que de l'identifiant : openStation lit et modifie l'état partagé.
		const gare = id;
		if (gare) untrack(() => openStation(gare));
	});

	const st = $derived(current.value);
	const ready = $derived(st.status === 'ready' ? st : undefined);
	const data = $derived(
		ready ? buildFeatures(ready.elements, ready.analysis, ready.station.bbox) : undefined
	);
	const visible = $state({ quai: true, voie: true, pancarte: true });
	let selected = $state<FeatureProps | undefined>();
	let mapRef = $state<{ locate: () => void }>();

	const QUEST_TEXT: Record<string, string> = {
		Q1: 'Numéro du quai à relever',
		Q2: 'Numéro de la voie à relever',
		Q3: 'Numéros du quai et des voies à vérifier',
		Q4: 'Pancartes d’arrêt à relever le long de ce quai',
		Q5: 'Pancarte à compléter',
		Q6: 'À vérifier (aucune date de vérification récente)',
		Q7: 'Numéro de voie en double ou incohérent'
	};
	const filters = [
		{ k: 'quai', label: 'Quais' },
		{ k: 'voie', label: 'Voies' },
		{ k: 'pancarte', label: 'Pancartes' }
	] as const;
</script>

<svelte:head><title>Carte — {ready?.station.name ?? 'Gare'} — railcomplete</title></svelte:head>

<div class="screen">
	{#if ready && data}
		<StationMap
			bind:this={mapRef}
			bbox={ready.station.bbox}
			{data}
			{visible}
			{focus}
			selected={selected?.osm}
			onselect={(p) => (selected = p)}
		/>
	{/if}

	<div class="top">
		<div class="bar">
			<a
				class="icon-btn"
				href={resolve(`/gare?id=${encodeURIComponent(id)}`)}
				aria-label="Retour au tableau de bord"
			>
				<Icon name="back" />
			</a>
			<h1>{ready?.station.name ?? 'Carte'}</h1>
		</div>
		<div class="filters" role="group" aria-label="Objets affichés">
			{#each filters as f (f.k)}
				<button
					type="button"
					class="chip {f.k}"
					aria-pressed={visible[f.k]}
					onclick={() => (visible[f.k] = !visible[f.k])}
				>
					{visible[f.k] ? '✓ ' : ''}{f.label}
				</button>
			{/each}
		</div>
	</div>

	{#if st.status === 'loading' || !mounted}
		<p class="status" role="status">Chargement de la gare…</p>
	{:else if st.status === 'error'}
		<p class="status error" role="alert">{st.message}</p>
	{/if}

	{#if ready}
		<button class="locate" type="button" aria-label="Me localiser" onclick={() => mapRef?.locate()}>
			<Icon name="locate" />
		</button>
	{/if}

	{#if selected}
		<section class="sheet" aria-live="polite" aria-label="Objet sélectionné">
			<div class="sheet-head">
				<span class="dot {selected.kind}"><Icon name={selected.kind} size={22} /></span>
				<div>
					<h2>{selected.title}</h2>
					<p>{selected.detail}</p>
				</div>
				<button
					class="icon-btn"
					type="button"
					aria-label="Fermer"
					onclick={() => (selected = undefined)}
				>
					✕
				</button>
			</div>
			{#if selected.quests}
				<ul>
					{#each selected.quests.split(',') as q (q)}<li>{QUEST_TEXT[q] ?? q}</li>{/each}
				</ul>
			{/if}
			<p class="soon">La saisie depuis l’appli arrive bientôt.</p>
			<a class="osm" href={`https://www.openstreetmap.org/${selected.osm}`} rel="external">
				Voir sur OpenStreetMap
			</a>
		</section>
	{/if}
</div>

<style>
	.screen {
		position: relative;
		height: 100dvh;
		overflow: hidden;
		background: #7d786e;
	}
	.top {
		position: absolute;
		inset: 0 0 auto;
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		pointer-events: none;
	}
	.top > * {
		pointer-events: auto;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 12px 4px 4px;
		border-radius: 16px;
		background: var(--bg);
		box-shadow: 0 2px 8px rgb(0 0 0 / 0.25);
	}
	h1 {
		margin: 0;
		font-size: 1.125rem;
	}
	.icon-btn {
		width: 48px;
		height: 48px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 0;
		background: transparent;
		color: var(--text);
		font-size: 1.25rem;
		cursor: pointer;
	}
	.filters {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		align-self: flex-start;
	}
	.chip {
		min-height: 44px;
		padding: 0 14px;
		border: 2px solid #fff;
		border-radius: 22px;
		font: 700 0.9375rem var(--font);
		color: #fff;
		box-shadow: 0 1px 4px rgb(0 0 0 / 0.3);
		cursor: pointer;
	}
	.chip.quai {
		background: #00707a;
	}
	.chip.voie {
		background: #6a3fb5;
	}
	.chip.pancarte {
		background: #a34a00;
	}
	.chip[aria-pressed='false'] {
		background: #fff;
		color: #1a1d21;
	}
	.status {
		position: absolute;
		inset: 45% 16px auto;
		margin: 0;
		padding: 14px;
		border-radius: 14px;
		background: var(--bg);
		text-align: center;
	}
	.status.error {
		border: 2px solid var(--danger);
	}
	.locate {
		position: absolute;
		left: 16px;
		bottom: calc(24px + env(safe-area-inset-bottom));
		width: 52px;
		height: 52px;
		border: 0;
		border-radius: 26px;
		background: var(--bg);
		color: var(--primary);
		box-shadow: 0 2px 8px rgb(0 0 0 / 0.3);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}
	.sheet {
		position: absolute;
		inset: auto 0 0;
		padding: 14px 20px calc(20px + env(safe-area-inset-bottom));
		border-radius: 20px 20px 0 0;
		background: var(--bg);
		box-shadow: 0 -2px 12px rgb(0 0 0 / 0.25);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.sheet-head {
		display: flex;
		align-items: flex-start;
		gap: 12px;
	}
	.sheet-head > div {
		flex-grow: 1;
	}
	.dot {
		color: var(--quai);
		padding-top: 4px;
	}
	.dot.voie {
		color: var(--voie);
	}
	.dot.pancarte {
		color: var(--pancarte);
	}
	h2 {
		margin: 0;
		font-size: 1.125rem;
	}
	.sheet p {
		margin: 0;
		color: var(--text-2);
	}
	ul {
		margin: 0;
		padding-left: 1.2em;
	}
	.soon {
		font-size: 0.9375rem;
	}
	.osm {
		font-weight: 700;
		min-height: 44px;
		display: flex;
		align-items: center;
	}
</style>
