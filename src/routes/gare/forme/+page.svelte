<script lang="ts">
	// E12 — Modifier la forme d'un quai existant, ou redessiner en surface un quai tracé en
	// ligne (lot 7). Même carte que E11 : croix fixe, carte qui glisse, pavé de flèches.
	// Le way garde son identifiant ; les points reliés à d'autres objets ne bougent jamais.
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Icon from '#lib/Icon.svelte';
	import { checkShape, snapToEdge, type LonLat } from '#lib/core/draw.js';
	import { newEditId, type RingNode, type ShapeEdit } from '#lib/core/edits.js';
	import { OsmData, isPlatform, isRail, type OsmNode, type OsmWay } from '#lib/core/osm.js';
	import {
		checkLocks,
		platformName,
		platformShape,
		samePlace,
		shapeSummary
	} from '#lib/core/shape.js';
	import { current, openStation } from '#lib/current.svelte.js';
	import { editsOf, loadEdits, nextTempId, pending, saveEdit } from '#lib/edits.svelte.js';
	import DrawMap from '#lib/map/DrawMap.svelte';
	import NudgePad from '#lib/map/NudgePad.svelte';
	import { srv } from '#lib/osmserver.svelte.js';
	import { stationView } from '#lib/view.js';
	import { onMount, untrack } from 'svelte';

	let mounted = $state(false);
	onMount(() => {
		mounted = true;
		loadEdits();
	});
	const id = $derived(mounted ? (page.url.searchParams.get('id') ?? '') : '');
	const osm = $derived(mounted ? (page.url.searchParams.get('osm') ?? '') : '');
	const wayId = $derived(/^way\/\d+$/.test(osm) ? Number(osm.slice(4)) : undefined);
	$effect(() => {
		const gare = id;
		if (gare) untrack(() => openStation(gare));
	});

	const st = $derived(current.value);
	const ready = $derived(st.status === 'ready' && st.station.id === id ? st : undefined);
	const view = $derived(
		ready && pending.loaded ? stationView(ready.station, ready.elements, editsOf(id)) : undefined
	);
	// Quai tel qu'il est sur OpenStreetMap (données lues) : nœuds d'origine et verrous.
	const info = $derived(
		ready && wayId !== undefined ? platformShape(new OsmData(ready.elements), wayId) : undefined
	);
	const isQuai = $derived(!!info && isPlatform(info.way.tags));
	// Saisie de forme déjà en attente sur ce quai (on la reprend), sauf si elle est « à revoir ».
	const previous = $derived(
		pending.loaded
			? (editsOf(id).find((e) => e.kind === 'shape' && e.target === osm && !e.conflict) as
					ShapeEdit | undefined)
			: undefined
	);
	const mode = $derived<'reshape' | 'area'>(
		previous?.mode ?? (info && !info.closed ? 'area' : 'reshape')
	);
	const name = $derived(platformName(info?.way.tags));
	const back = $derived(resolve(`/gare/carte?id=${encodeURIComponent(id)}&focus=${osm}`));

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
	// Le quai lui-même est exclu du contrôle de chevauchement.
	const platformRings = $derived(
		(view?.elements ?? [])
			.filter((e): e is OsmWay => e.type === 'way' && isPlatform(e.tags) && e.id !== wayId)
			.map(coords)
	);

	// ---------- Contour en cours ----------
	let pts = $state<RingNode[]>([]);
	let history = $state<RingNode[][]>([]);
	let selected = $state<number | undefined>();
	let centerNow = $state<LonLat | undefined>();
	let errors = $state<string[]>([]);
	let said = $state('');
	let saving = $state(false);
	let mapRef = $state<{
		nudge: (dx: number, dy: number) => void;
		zoom: (d: number) => void;
		centerOn: (p: LonLat) => void;
	}>();

	let initFor = '';
	$effect(() => {
		// Point de départ, une seule fois : saisie en attente, sinon contour actuel (vide pour
		// une ligne à redessiner en surface).
		if (!info || !pending.loaded || initFor === osm) return;
		initFor = osm;
		untrack(() => {
			pts = previous
				? previous.nodes.map((n) => ({ ...n }))
				: info.closed
					? info.nodes.map(({ id, lon, lat }) => ({ id, lon, lat }))
					: [];
		});
	});

	const orig = $derived(new Map((info?.nodes ?? []).map((n) => [n.id, n])));
	const locked = $derived(pts.map((p) => !!orig.get(p.id)?.locked));
	const ring = $derived(pts.map((p) => [p.lon, p.lat] as LonLat));
	const snap = $derived(
		centerNow ? snapToEdge(centerNow, railWays, (i) => nodes.get(i)) : undefined
	);
	const preview = $derived(centerNow ? (snap?.point ?? centerNow) : undefined);
	const check = $derived(checkShape(ring, trackLines, platformRings));
	const bounds = $derived.by((): [LonLat, LonLat] | undefined => {
		if (!info?.nodes.length) return undefined;
		const lons = info.nodes.map((n) => n.lon),
			lats = info.nodes.map((n) => n.lat);
		return [
			[Math.min(...lons), Math.min(...lats)],
			[Math.max(...lons), Math.max(...lats)]
		];
	});
	// Redessiner en surface : points reliés de l'ancienne ligne, à reprendre dans le contour.
	const anchorNodes = $derived(
		mode === 'area'
			? (info?.nodes ?? []).filter((n) => n.locked && !pts.some((p) => p.id === n.id))
			: []
	);
	const anchors = $derived(
		anchorNodes.map((n) => ({
			at: [n.lon, n.lat] as LonLat,
			label: `Point relié ${info!.nodes.indexOf(n) + 1} de l’ancienne ligne : l’ajouter au contour`
		}))
	);
	const guide = $derived(
		mode === 'area' && info ? info.nodes.map((n) => [n.lon, n.lat] as LonLat) : undefined
	);
	const sel = $derived(selected !== undefined ? pts[selected] : undefined);
	const selLocked = $derived(selected !== undefined && locked[selected]);
	const m = (v: number) => `${Math.round(v)} m`;

	function commit(next: RingNode[], message: string) {
		history = [...history, $state.snapshot(pts) as RingNode[]];
		pts = next;
		errors = [];
		said = message;
	}
	const snapped = (p: LonLat) => snapToEdge(p, railWays, (i) => nodes.get(i))?.point ?? p;

	function vertex(i: number) {
		errors = [];
		if (selected === i) {
			selected = undefined;
			said = `Point ${i + 1} désélectionné.`;
			return;
		}
		selected = i;
		mapRef?.centerOn([pts[i].lon, pts[i].lat]);
		said = locked[i]
			? `Point ${i + 1} : relié à un autre objet, il reste en place.`
			: `Point ${i + 1} sélectionné : il est sous la croix.`;
	}
	function midpoint(i: number) {
		const a = pts[i],
			b = pts[(i + 1) % pts.length];
		const [lon, lat] = snapped([(a.lon + b.lon) / 2, (a.lat + b.lat) / 2]);
		const next = [...pts];
		next.splice(i + 1, 0, { id: nextTempId(), lon, lat });
		commit(next, `Point ${i + 2} ajouté entre ${i + 1} et ${((i + 1) % pts.length) + 1}.`);
		selected = i + 1;
		mapRef?.centerOn([lon, lat]);
	}
	function moveHere() {
		if (selected === undefined || !preview || selLocked) return;
		const i = selected;
		const next = [...pts];
		next[i] = { ...next[i], lon: preview[0], lat: preview[1] };
		commit(next, `Point ${i + 1} déplacé${snap ? ', accroché au bord de la voie' : ''}.`);
		selected = undefined;
	}
	function removePoint() {
		if (selected === undefined || selLocked || pts.length <= 3) return;
		const i = selected;
		commit(
			pts.filter((_, k) => k !== i),
			`Point ${i + 1} retiré.`
		);
		selected = undefined;
	}
	function addPoint() {
		if (!preview) return;
		commit(
			[...pts, { id: nextTempId(), lon: preview[0], lat: preview[1] }],
			`Point ${pts.length + 1} ajouté.`
		);
	}
	function anchor(i: number) {
		const n = anchorNodes[i];
		if (!n) return;
		commit(
			[...pts, { id: n.id, lon: n.lon, lat: n.lat }],
			`Point relié repris : point ${pts.length + 1} du contour.`
		);
	}
	function undo() {
		const prev = history.at(-1);
		if (!prev) return;
		history = history.slice(0, -1);
		pts = prev;
		selected = undefined;
		errors = [];
		said = 'Dernière action annulée.';
	}

	async function finish() {
		if (!info) return;
		const unchanged =
			mode === 'reshape' &&
			pts.length === info.nodes.length &&
			pts.every((p, i) => p.id === info.nodes[i].id && samePlace(p, info.nodes[i]));
		if (unchanged && !previous) {
			errors = ['Aucun changement : déplacez, ajoutez ou retirez un point.'];
			return;
		}
		const lockError = checkLocks(info.nodes, pts, mode);
		const all = [...(lockError ? [lockError] : []), ...(check.ok ? [] : check.errors)];
		if (all.length) {
			errors = all;
			said = all.join(' ');
			return;
		}
		saving = true;
		try {
			const summary = shapeSummary(name, mode, info.nodes.length, pts.length);
			await saveEdit({
				kind: 'shape',
				id: newEditId(),
				station: id,
				createdAt: Date.now(),
				target: `way/${info.way.id}`,
				version: info.way.version,
				mode,
				before: info.nodes,
				nodes: $state.snapshot(pts) as RingNode[],
				name,
				shapeSummary: summary,
				summary
			});
			await goto(back);
		} catch {
			errors = ["L'enregistrement sur ce téléphone a échoué. Réessayez."];
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head
	><title>{mode === 'area' ? 'Redessiner en surface' : 'Modifier la forme'} — stationcomplete</title
	></svelte:head
>

<div class="screen">
	<!-- data-center : centre visé, lu par les tests pour attendre la fin d'un déplacement. -->
	<div class="mapbox" data-center={centerNow?.map((v) => v.toFixed(7)).join(',')}>
		{#if view && ready && info && isQuai && !info.refused}
			<DrawMap
				bind:this={mapRef}
				center={[ready.station.lon, ready.station.lat]}
				{bounds}
				tracks={trackLines}
				platforms={platformRings}
				points={ring}
				{selected}
				{preview}
				snapped={!!snap}
				closed
				{locked}
				vertexLabel={(i) =>
					locked[i]
						? `Point ${i + 1} : relié à un autre objet, non modifiable`
						: `Point ${i + 1} : le sélectionner`}
				midpoints={mode === 'reshape' || pts.length >= 3}
				{guide}
				{anchors}
				onmove={(c) => (centerNow = c)}
				onvertex={vertex}
				onmidpoint={midpoint}
				onanchor={anchor}
			/>
		{/if}
	</div>

	{#if !ready || !pending.loaded}
		<p class="status float" role="status">Chargement…</p>
	{:else if !info || !isQuai}
		<div class="status float" role="alert">
			<p>Ce quai n’a pas été trouvé dans les données de la gare.</p>
			<a class="btn-quiet" href={back}>Retour à la carte</a>
		</div>
	{:else if info.refused}
		<div class="status float" role="alert">
			<p>{info.refused}</p>
			<a class="btn-quiet" href={`${srv().web}/${osm}`} rel="external"
				>Voir sur OpenStreetMap<Icon name="ext" size={16} /></a
			>
			<a class="btn-quiet" href={back}>Retour à la carte</a>
		</div>
	{/if}

	<div class="stack">
		<header class="top float">
			<div class="row">
				<a class="icon-btn" href={back} aria-label="Quitter sans enregistrer"
					><Icon name="close" size={22} /></a
				>
				<h1>{mode === 'area' ? 'Redessiner en surface' : 'Modifier la forme'}</h1>
				<span class="count">{pts.length} point{pts.length > 1 ? 's' : ''}</span>
			</div>
			{#if info && !info.refused}
				<p>
					<strong>{name}</strong> ·
					{#if sel && selLocked}
						Le point {selected! + 1} est relié à un autre objet : il reste en place. Ajoutez des points
						autour de lui.
					{:else if sel}
						Faites glisser la carte jusqu’au nouvel emplacement du <strong
							>point {selected! + 1}</strong
						>.
					{:else if mode === 'area'}
						Faites le tour du quai, coin après coin ; l’ancienne ligne est en pointillés.
						{#if anchorNodes.length}Touchez ses points carrés pour les reprendre.{/if}
					{:else}
						Touchez un point pour le sélectionner, ou un « + » pour en ajouter un. Les points carrés
						sont reliés à d’autres objets.
					{/if}
				</p>
			{/if}
		</header>
		{#if view && info && !info.refused}
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

	{#if view && info && isQuai && !info.refused}
		<section class="panel float" aria-label="Forme du quai">
			<div class="info" class:ok={!!snap} role="status">
				<Icon name={snap ? 'check' : 'locate'} size={20} />
				<span>
					{#if snap}<strong>Croix accrochée au bord de la voie</strong> (1,5 m de l’axe){:else}Croix
						libre (aucune voie à moins de 4 m){/if}
					{#if pts.length >= 2}
						· longueur {m(check.lengthM)}{/if}
				</span>
			</div>
			<p class="visually-hidden" aria-live="polite">{said}</p>
			{#if errors.length}
				<ul class="errors banner err" role="alert">
					{#each errors as e (e)}<li>{e}</li>{/each}
				</ul>
			{/if}

			<div class="two">
				{#if sel}
					<button
						class="btn btn-secondary"
						type="button"
						disabled={selLocked || pts.length <= 3}
						onclick={removePoint}><Icon name="trash" size={20} />Retirer ce point</button
					>
					<button class="btn" type="button" disabled={selLocked || !preview} onclick={moveHere}
						>Déplacer le point ici</button
					>
				{:else}
					<button
						class="btn btn-secondary"
						type="button"
						disabled={!history.length}
						aria-label="Annuler la dernière action"
						onclick={undo}><Icon name="undo" size={20} />Annuler</button
					>
					{#if mode === 'area'}
						<button class="btn" type="button" disabled={!preview} onclick={addPoint}
							>Ajouter un point</button
						>
					{:else}
						<button class="btn" type="button" disabled={saving} onclick={finish}>Terminer</button>
					{/if}
				{/if}
			</div>
			{#if sel || mode === 'area'}
				<div class="foot">
					{#if sel}
						<button
							class="btn-quiet"
							type="button"
							disabled={!history.length}
							aria-label="Annuler la dernière action"
							onclick={undo}><Icon name="undo" size={18} />Annuler</button
						>
					{/if}
					<button
						class="btn-quiet"
						type="button"
						disabled={saving || pts.length < 3}
						onclick={finish}>Terminer</button
					>
				</div>
			{/if}
		</section>
	{/if}
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
	.status p {
		margin: 0 0 4px;
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
	.foot {
		display: flex;
		justify-content: center;
		gap: 8px;
	}
</style>
