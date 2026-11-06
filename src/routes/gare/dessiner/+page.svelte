<script lang="ts">
	// E11 — Dessiner un quai absent d'OpenStreetMap (polygone libre, lot 5).
	// Les points proches d'une voie sont ramenés sur une ligne parallèle à 1,5 m de son axe.
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Icon from '#lib/Icon.svelte';
	import { checkShape, snapToEdge, type LonLat } from '#lib/core/draw.js';
	import { newEditId } from '#lib/core/edits.js';
	import { isPlatform, isRail, type OsmNode, type OsmWay } from '#lib/core/osm.js';
	import { current, openStation } from '#lib/current.svelte.js';
	import { editsOf, loadEdits, nextTempId, pending, saveEdit } from '#lib/edits.svelte.js';
	import DrawMap from '#lib/map/DrawMap.svelte';
	import { stationView } from '#lib/view.js';
	import { onMount, untrack } from 'svelte';

	let mounted = $state(false);
	onMount(() => {
		mounted = true;
		loadEdits();
	});
	const id = $derived(mounted ? (page.url.searchParams.get('id') ?? '') : '');
	$effect(() => {
		const gare = id;
		if (gare) untrack(() => openStation(gare));
	});

	const st = $derived(current.value);
	const ready = $derived(st.status === 'ready' && st.station.id === id ? st : undefined);
	const view = $derived(
		ready && pending.loaded ? stationView(ready.station, ready.elements, editsOf(id)) : undefined
	);
	const nodes = $derived(
		new Map(
			(view?.elements ?? [])
				.filter((e): e is OsmNode => e.type === 'node')
				.map((n) => [n.id, n] as [number, OsmNode])
		)
	);
	const coords = (w: OsmWay) =>
		w.nodes
			.map((i) => nodes.get(i))
			.filter((n): n is OsmNode => !!n)
			.map((n) => [n.lon, n.lat] as LonLat);
	const railWays = $derived(
		(view?.elements ?? []).filter((e): e is OsmWay => e.type === 'way' && isRail(e.tags))
	);
	const trackLines = $derived(railWays.map(coords));
	const platformRings = $derived(
		(view?.elements ?? [])
			.filter((e): e is OsmWay => e.type === 'way' && isPlatform(e.tags))
			.map(coords)
	);

	let points = $state<LonLat[]>([]);
	let selected = $state<number | undefined>();
	let centerNow = $state<LonLat | undefined>();
	let errors = $state<string[]>([]);
	let saving = $state(false);
	let mapRef = $state<{ nudge: (dx: number, dy: number) => void; zoom: (d: number) => void }>();

	const snap = $derived(
		centerNow ? snapToEdge(centerNow, railWays, (i) => nodes.get(i)) : undefined
	);
	const preview = $derived(centerNow ? (snap?.point ?? centerNow) : undefined);
	const check = $derived(checkShape(points, trackLines, platformRings));
	const m = (v: number) => `${Math.round(v)} m`;

	function add() {
		if (!preview) return;
		errors = [];
		if (selected !== undefined) {
			points[selected] = preview;
			selected = undefined;
		} else points = [...points, preview];
	}
	function undo() {
		errors = [];
		selected = undefined;
		points = points.slice(0, -1);
	}
	function vertex(i: number) {
		if (i === 0 && points.length >= 3 && selected === undefined) return close();
		selected = selected === i ? undefined : i;
	}

	async function close() {
		if (!check.ok) {
			errors = check.errors;
			return;
		}
		saving = true;
		try {
			const tempId = nextTempId();
			await saveEdit({
				kind: 'way',
				id: newEditId(),
				station: id,
				createdAt: Date.now(),
				tempId,
				nodes: points.map(([lon, lat]) => ({ id: nextTempId(), lon, lat })),
				tags: { railway: 'platform', public_transport: 'platform', train: 'yes', area: 'yes' },
				summary: `Quai dessiné (${m(check.lengthM)})`
			});
			// Ensuite : ses numéros, si l'on est sur place (sinon il reste « sans numéro »).
			await goto(resolve(`/gare/saisie?id=${encodeURIComponent(id)}&osm=way/${tempId}`));
		} catch {
			errors = ["L'enregistrement sur ce téléphone a échoué. Réessayez."];
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>Dessiner un quai — stationcomplete</title></svelte:head>

<div class="screen">
	<header>
		<div class="row">
			<a
				class="icon-btn"
				href={resolve(`/gare?id=${encodeURIComponent(id)}`)}
				aria-label="Annuler le dessin"><span aria-hidden="true">✕</span></a
			>
			<h1>Dessiner un quai</h1>
			<span class="count">{points.length} point{points.length > 1 ? 's' : ''}</span>
		</div>
		<p>
			{#if selected !== undefined}
				Placez la croix au nouvel emplacement du <strong>point {selected + 1}</strong>.
			{:else if points.length < 3}
				Faites le tour du quai, coin après coin, en restant sur son bord.
			{:else}
				Continuez, ou touchez le <strong>point 1</strong> pour fermer le quai.
			{/if}
		</p>
	</header>

	<!-- data-center : centre visé, lu par les tests pour attendre la fin d'un déplacement. -->
	<div class="mapbox" data-center={centerNow?.map((v) => v.toFixed(7)).join(',')}>
		{#if view && ready}
			<DrawMap
				bind:this={mapRef}
				center={[ready.station.lon, ready.station.lat]}
				tracks={trackLines}
				platforms={platformRings}
				{points}
				{selected}
				{preview}
				onmove={(c) => (centerNow = c)}
				onvertex={vertex}
			/>
			<div class="zoom">
				<button type="button" aria-label="Zoomer" onclick={() => mapRef?.zoom(1)}>+</button>
				<button type="button" aria-label="Dézoomer" onclick={() => mapRef?.zoom(-1)}>−</button>
			</div>
		{:else}
			<p class="status" role="status">Chargement…</p>
		{/if}
	</div>

	<section class="panel">
		<div class="info" class:ok={!!snap} role="status" aria-live="polite">
			<Icon name={snap ? 'verif' : 'locate'} size={22} />
			<span>
				{#if snap}<strong>Accroché au bord de la voie</strong> (à 1,5 m de son axe){:else}Point
					libre (aucune voie à moins de 4 m){/if}
				{#if points.length >= 2}
					· longueur {m(check.lengthM)}{/if}
			</span>
		</div>
		{#if errors.length}
			<ul class="errors" role="alert">
				{#each errors as e (e)}<li>{e}</li>{/each}
			</ul>
		{/if}

		<div class="pad" role="group" aria-label="Déplacer la croix de 20 cm">
			<button
				type="button"
				aria-label="Déplacer la croix vers la gauche"
				onclick={() => mapRef?.nudge(-1, 0)}>◀</button
			>
			<button
				type="button"
				aria-label="Déplacer la croix vers le haut"
				onclick={() => mapRef?.nudge(0, -1)}>▲</button
			>
			<span class="step">20 cm</span>
			<button
				type="button"
				aria-label="Déplacer la croix vers le bas"
				onclick={() => mapRef?.nudge(0, 1)}>▼</button
			>
			<button
				type="button"
				aria-label="Déplacer la croix vers la droite"
				onclick={() => mapRef?.nudge(1, 0)}>▶</button
			>
		</div>

		<div class="two">
			<button class="btn btn-secondary" type="button" disabled={!points.length} onclick={undo}>
				Annuler le point
			</button>
			<button class="btn" type="button" disabled={!preview} onclick={add}>
				{selected !== undefined ? `Déplacer le point ${selected + 1} ici` : 'Ajouter un point'}
			</button>
		</div>
		<button class="btn close" type="button" disabled={points.length < 3 || saving} onclick={close}>
			Fermer le quai
		</button>
	</section>
</div>

<style>
	.screen {
		height: 100dvh;
		display: flex;
		flex-direction: column;
	}
	header {
		padding: 8px 16px 8px 4px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	h1 {
		margin: 0;
		flex-grow: 1;
		font-size: 1.25rem;
	}
	.count {
		font-weight: 700;
		color: var(--text-2);
	}
	header p {
		margin: 0 0 0 16px;
		color: var(--text-2);
	}
	.icon-btn {
		width: 48px;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text);
		text-decoration: none;
		font-size: 1.25rem;
	}
	.mapbox {
		position: relative;
		flex: 1 1 auto;
		min-height: 240px;
	}
	.status {
		padding: 16px;
	}
	.zoom {
		position: absolute;
		right: 12px;
		top: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.zoom button {
		width: 48px;
		height: 48px;
		border: 0;
		border-radius: 12px;
		background: var(--bg);
		color: var(--text);
		font: 700 1.5rem system-ui;
		box-shadow: 0 1px 4px rgb(0 0 0 / 0.3);
		cursor: pointer;
	}
	.panel {
		padding: 8px 16px calc(12px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.info {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 12px;
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text-2);
		font-size: 0.9375rem;
	}
	.info span {
		color: var(--text);
	}
	.info.ok {
		color: var(--ok);
	}
	.errors {
		margin: 0;
		padding: 10px 12px 10px 2em;
		border-radius: var(--radius);
		border: 2px solid var(--danger);
		color: var(--danger);
		font-weight: 700;
	}
	.pad {
		align-self: center;
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.pad button {
		width: 48px;
		height: 44px;
		border: 2px solid var(--border);
		border-radius: 12px;
		background: var(--bg);
		color: var(--text);
		cursor: pointer;
	}
	.step {
		width: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.75rem;
		color: var(--text-2);
	}
	.two {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}
	.two .btn,
	.close {
		min-height: 48px;
		font-size: 1rem;
	}
	.btn:disabled {
		opacity: 0.5;
		cursor: default;
	}
</style>
