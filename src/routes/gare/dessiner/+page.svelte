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
	import NudgePad from '#lib/map/NudgePad.svelte';
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

<!-- Carte plein écran ; en-tête, contrôles et actions flottent au-dessus (décision 6). -->
<div class="screen">
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
				snapped={!!snap}
				onmove={(c) => (centerNow = c)}
				onvertex={vertex}
			/>
		{:else}
			<p class="status float" role="status">Chargement…</p>
		{/if}
	</div>

	<div class="stack">
		<header class="top float">
			<div class="row">
				<a
					class="icon-btn"
					href={resolve(`/gare?id=${encodeURIComponent(id)}`)}
					aria-label="Annuler le dessin"><Icon name="close" size={22} /></a
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
					Continuez, ou touchez le <strong>point 1</strong> (le plus gros) pour fermer le quai.
				{/if}
			</p>
		</header>
		{#if view && ready}
			<div class="tools">
				<div class="zoom float">
					<button type="button" aria-label="Zoomer" onclick={() => mapRef?.zoom(1)}
						><Icon name="plus" size={20} /></button
					>
					<button type="button" aria-label="Dézoomer" onclick={() => mapRef?.zoom(-1)}
						><Icon name="minus" size={20} /></button
					>
				</div>
				<NudgePad onnudge={(dx, dy) => mapRef?.nudge(dx, dy)} />
			</div>
		{/if}
	</div>

	<section class="panel float" aria-label="Tracé du quai">
		<div class="info" class:ok={!!snap} role="status" aria-live="polite">
			<Icon name={snap ? 'check' : 'locate'} size={20} />
			<span>
				{#if snap}<strong>Accroché au bord de la voie</strong> (à 1,5 m de son axe){:else}Point
					libre (aucune voie à moins de 4 m){/if}
				{#if points.length >= 2}
					· longueur {m(check.lengthM)}{/if}
			</span>
		</div>
		{#if errors.length}
			<ul class="errors banner err" role="alert">
				{#each errors as e (e)}<li>{e}</li>{/each}
			</ul>
		{/if}

		<div class="two">
			<button class="btn btn-secondary" type="button" disabled={!points.length} onclick={undo}>
				<Icon name="undo" size={20} />Annuler le point
			</button>
			<button class="btn" type="button" disabled={!preview} onclick={add}>
				{selected !== undefined ? `Déplacer le point ${selected + 1} ici` : 'Ajouter un point'}
			</button>
		</div>
		<button
			class="btn-quiet close"
			type="button"
			disabled={points.length < 3 || saving}
			onclick={close}
		>
			Fermer le quai
		</button>
	</section>
</div>

<style>
	.screen {
		position: relative;
		height: 100dvh;
		overflow: hidden;
		background: #8c877c;
	}
	.mapbox {
		position: absolute;
		inset: 0;
	}
	.status {
		position: absolute;
		inset: 45% 16px auto;
		margin: 0;
		padding: 12px;
		text-align: center;
	}
	.stack {
		position: absolute;
		top: calc(8px + env(safe-area-inset-top));
		left: calc(8px + env(safe-area-inset-left));
		right: calc(8px + env(safe-area-inset-right));
		display: flex;
		flex-direction: column;
		gap: 8px;
		pointer-events: none;
	}
	.stack > * {
		pointer-events: auto;
	}
	.top {
		padding: 2px 12px 8px 2px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 2px;
	}
	h1 {
		flex-grow: 1;
		margin: 0;
		font-size: 1.0625rem;
		line-height: 1.4;
	}
	.count {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text-2);
		font-variant-numeric: tabular-nums;
	}
	.top p {
		margin: 0 0 0 12px;
		font-size: 0.875rem;
		line-height: 1.43;
		color: var(--text-2);
	}
	.top p strong {
		color: var(--text);
	}
	.tools {
		align-self: flex-end;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 8px;
	}
	.zoom {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.zoom button {
		width: 44px;
		height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--text);
		cursor: pointer;
	}
	.zoom button + button {
		border-top: 1px solid var(--overlay-line);
	}
	.panel {
		position: absolute;
		left: calc(8px + env(safe-area-inset-left));
		right: calc(8px + env(safe-area-inset-right));
		bottom: calc(24px + env(safe-area-inset-bottom)); /* au-dessus de l'attribution */
		max-width: 560px;
		margin: 0 auto;
		padding: 8px 8px 2px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.info {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 6px;
		font-size: 0.9375rem;
		color: var(--text-2);
	}
	.info span {
		color: var(--text);
	}
	.info.ok {
		color: var(--ok);
	}
	.errors {
		display: block;
		padding-left: 2em;
	}
	.two {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}
	.two .btn {
		padding: 0 10px;
	}
	.close {
		align-self: center;
	}
</style>
