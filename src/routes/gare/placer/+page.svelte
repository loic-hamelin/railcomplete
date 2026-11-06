<script lang="ts">
	// E6 — Placement fin d'une pancarte d'arrêt sur l'axe de la voie (rapport tags § 3.5).
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Icon from '#lib/Icon.svelte';
	import type { Snap } from '#lib/core/edits.js';
	import { isRail, isStopSign, type OsmNode, type OsmWay } from '#lib/core/osm.js';
	import { current, openStation } from '#lib/current.svelte.js';
	import { editsOf, loadEdits, pending } from '#lib/edits.svelte.js';
	import PlacementMap from '#lib/map/PlacementMap.svelte';
	import { distanceM } from '#lib/stations.js';
	import { stationView } from '#lib/view.js';
	import { onMount, untrack } from 'svelte';

	let mounted = $state(false);
	onMount(() => {
		mounted = true;
		loadEdits();
	});
	const q = $derived(mounted ? page.url.searchParams : new URLSearchParams());
	const id = $derived(q.get('id') ?? '');
	$effect(() => {
		const gare = id;
		if (gare) untrack(() => openStation(gare));
	});

	const st = $derived(current.value);
	const ready = $derived(st.status === 'ready' && st.station.id === id ? st : undefined);
	const view = $derived(
		ready && pending.loaded ? stationView(ready.station, ready.elements, editsOf(id)) : undefined
	);
	// Voies candidates : toutes les voies ferrées chargées pour la gare.
	const tracks = $derived(
		(view?.elements ?? []).filter((e): e is OsmWay => e.type === 'way' && isRail(e.tags))
	);
	// Départ : la voie choisie sur la carte, sinon le centre de la gare.
	const start = $derived.by((): [number, number] | undefined => {
		if (!ready) return undefined;
		const lon = Number(q.get('lon')),
			lat = Number(q.get('lat'));
		if (lon && lat) return [lon, lat];
		return [ready.station.lon, ready.station.lat];
	});

	let snap = $state<Snap | undefined>();
	let near = $state<OsmNode | undefined>();
	let mapRef = $state<{ nudge: (dx: number, dy: number) => void; zoom: (d: number) => void }>();

	function validate() {
		if (!snap || !view) return;
		// Une pancarte existe déjà à moins de 10 m sur la même voie ? On propose de la modifier.
		const w = view.elements.find((e) => e.type === 'way' && e.id === snap!.way) as OsmWay;
		const existing = view.elements.find(
			(e): e is OsmNode =>
				e.type === 'node' &&
				isStopSign(e.tags) &&
				w.nodes.includes(e.id) &&
				distanceM(e.lat, e.lon, snap!.lat, snap!.lon) < 10
		);
		if (existing && !near) {
			near = existing;
			return;
		}
		go();
	}
	function go() {
		if (!snap) return;
		const p = new URLSearchParams({
			id,
			way: String(snap.way),
			after: String(snap.after),
			lon: snap.lon.toFixed(7),
			lat: snap.lat.toFixed(7),
			bearing: snap.bearing.toFixed(0)
		});
		goto(resolve(`/gare/saisie?${p}`));
	}
</script>

<svelte:head><title>Placer une pancarte — stationcomplete</title></svelte:head>

<div class="screen">
	<header>
		<div class="row">
			<a
				class="icon-btn"
				href={resolve(`/gare/carte?id=${encodeURIComponent(id)}`)}
				aria-label="Annuler"><span aria-hidden="true">✕</span></a
			>
			<h1>Placer la pancarte</h1>
		</div>
		<p>
			Placez la croix <strong>sur la voie</strong>, au niveau du panneau. Faites glisser la carte.
		</p>
	</header>

	<div class="mapbox">
		{#if view && start}
			<PlacementMap
				bind:this={mapRef}
				center={start}
				{tracks}
				elements={view.elements}
				onsnap={(s) => ((snap = s), (near = undefined))}
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
		<div class="snap" class:ok={!!snap} role="status" aria-live="polite">
			<Icon name={snap ? 'verif' : 'alerte'} size={24} />
			{#if snap}
				<span
					><strong>Accrochée à la voie</strong> · écart {snap.distM.toFixed(1).replace('.', ',')} m</span
				>
			{:else}
				<span>Rapprochez la croix d’une voie (moins de 3 m).</span>
			{/if}
		</div>

		{#if near}
			<div class="near" role="alert">
				<p>Une pancarte existe déjà à moins de 10 m sur cette voie.</p>
				<div class="two">
					<a
						class="btn btn-secondary"
						href={resolve(`/gare/saisie?id=${encodeURIComponent(id)}&osm=node/${near.id}`)}
						>Modifier celle-ci</a
					>
					<button class="btn" type="button" onclick={go}>C’est une autre</button>
				</div>
			</div>
		{/if}

		<div class="pad" role="group" aria-label="Déplacer la croix de 20 cm">
			<span></span>
			<button
				type="button"
				aria-label="Déplacer la croix vers le haut"
				onclick={() => mapRef?.nudge(0, -1)}>▲</button
			>
			<span></span>
			<button
				type="button"
				aria-label="Déplacer la croix vers la gauche"
				onclick={() => mapRef?.nudge(-1, 0)}>◀</button
			>
			<span class="step">20 cm</span>
			<button
				type="button"
				aria-label="Déplacer la croix vers la droite"
				onclick={() => mapRef?.nudge(1, 0)}>▶</button
			>
			<span></span>
			<button
				type="button"
				aria-label="Déplacer la croix vers le bas"
				onclick={() => mapRef?.nudge(0, 1)}>▼</button
			>
			<span></span>
		</div>

		{#if !near}
			<button class="btn" type="button" disabled={!snap} onclick={validate}
				>Valider la position</button
			>
		{/if}
	</section>
</div>

<style>
	.screen {
		height: 100dvh;
		display: flex;
		flex-direction: column;
	}
	header {
		padding: 8px 16px 10px 4px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	header p {
		margin: 0 0 0 16px;
		color: var(--text-2);
	}
	h1 {
		margin: 0;
		font-size: 1.25rem;
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
		min-height: 260px;
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
		padding: 12px 20px calc(16px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.snap {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 14px;
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--missing);
	}
	.snap span {
		color: var(--text);
	}
	.snap.ok {
		color: var(--ok);
	}
	.near {
		padding: 12px;
		border-radius: var(--radius);
		border: 2px solid var(--pancarte);
	}
	.near p {
		margin: 0 0 10px;
	}
	.two {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}
	.pad {
		align-self: center;
		display: grid;
		grid-template-columns: repeat(3, 56px);
		gap: 4px;
	}
	.pad button {
		height: 48px;
		border: 2px solid var(--border);
		border-radius: 12px;
		background: var(--bg);
		color: var(--text);
		font-size: 1rem;
		cursor: pointer;
	}
	.step {
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.75rem;
		color: var(--text-2);
	}
	.btn:disabled {
		opacity: 0.5;
		cursor: default;
	}
</style>
