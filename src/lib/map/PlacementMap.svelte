<script lang="ts">
	// Carte de placement fin (E6) : la croix reste au centre, la carte glisse dessous.
	// À chaque arrêt du déplacement, le point visé est accroché à l'axe de la voie la plus proche.
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { snapToTracks, type Snap } from '#lib/core/edits.js';
	import type { OsmElement, OsmNode, OsmWay } from '#lib/core/osm.js';
	import { onMount } from 'svelte';

	let {
		center,
		tracks,
		elements,
		onsnap
	}: {
		center: [number, number];
		tracks: OsmWay[];
		elements: OsmElement[];
		onsnap: (s: Snap | undefined) => void;
	} = $props();

	const IGN_TILES =
		'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
		'&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/jpeg' +
		'&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';

	let container: HTMLDivElement;
	let map: import('maplibre-gl').Map | undefined;
	let snapMarker: import('maplibre-gl').Marker | undefined;
	let failed = $state('');

	const nodes = $derived(
		new Map(elements.filter((e): e is OsmNode => e.type === 'node').map((n) => [n.id, n]))
	);

	function geojson() {
		const line = (w: OsmWay) =>
			w.nodes
				.map((id) => nodes.get(id))
				.filter((n): n is OsmNode => !!n)
				.map((n) => [n.lon, n.lat]);
		const signs = elements.filter(
			(e): e is OsmNode =>
				e.type === 'node' && e.tags?.railway === 'signal' && !!e.tags['railway:signal:stop']
		);
		return {
			type: 'FeatureCollection',
			features: [
				...tracks.map((w) => ({
					type: 'Feature',
					properties: { kind: 'voie' },
					geometry: { type: 'LineString', coordinates: line(w) }
				})),
				...signs.map((n) => ({
					type: 'Feature',
					properties: { kind: 'pancarte' },
					geometry: { type: 'Point', coordinates: [n.lon, n.lat] }
				}))
			]
		} as unknown as import('maplibre-gl').GeoJSONSourceSpecification['data'];
	}

	function update() {
		if (!map) return;
		const c = map.getCenter();
		const s = snapToTracks(c.lng, c.lat, tracks, (id) => nodes.get(id), 3);
		if (s) snapMarker?.setLngLat([s.lon, s.lat]).addTo(map);
		else snapMarker?.remove();
		onsnap(s);
	}

	/** Déplace la croix de `m` mètres (la carte glisse en sens inverse). */
	export function nudge(dx: number, dy: number, m = 0.2) {
		if (!map) return;
		const lat = map.getCenter().lat;
		const mpp = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** map.getZoom();
		map.panBy([(dx * m) / mpp, (dy * m) / mpp], { duration: 0 });
	}
	export function zoom(d: number) {
		map?.zoomTo(map.getZoom() + d, { duration: 0 });
	}

	onMount(() => {
		let disposed = false;
		(async () => {
			try {
				const lib = await import('maplibre-gl');
				lib.setWorkerUrl((await import('maplibre-gl/dist/maplibre-gl-worker.mjs?url')).default);
				if (disposed) return;
				map = new lib.Map({
					container,
					center,
					zoom: 19,
					maxZoom: 22,
					minZoom: 15,
					pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
					attributionControl: { compact: true },
					dragRotate: false,
					pitchWithRotate: false,
					touchPitch: false,
					fadeDuration: 0,
					style: {
						version: 8,
						sources: {
							ign: {
								type: 'raster',
								tiles: [IGN_TILES],
								tileSize: 256,
								maxzoom: 19,
								attribution: 'Photo © IGN – BD ORTHO'
							},
							objets: {
								type: 'geojson',
								data: geojson(),
								attribution: '© contributeurs OpenStreetMap'
							}
						},
						layers: [
							{ id: 'fond', type: 'background', paint: { 'background-color': '#7D786E' } },
							{ id: 'ign', type: 'raster', source: 'ign' },
							{
								id: 'voie-halo',
								type: 'line',
								source: 'objets',
								filter: ['==', ['get', 'kind'], 'voie'],
								paint: { 'line-color': '#FFFFFF', 'line-width': 9 }
							},
							{
								id: 'voie',
								type: 'line',
								source: 'objets',
								filter: ['==', ['get', 'kind'], 'voie'],
								paint: { 'line-color': '#6A3FB5', 'line-width': 5 }
							},
							{
								id: 'pancarte',
								type: 'circle',
								source: 'objets',
								filter: ['==', ['get', 'kind'], 'pancarte'],
								paint: {
									'circle-radius': 7,
									'circle-color': '#A34A00',
									'circle-stroke-color': '#FFFFFF',
									'circle-stroke-width': 2
								}
							}
						]
					}
				});
				const el = document.createElement('div');
				el.className = 'rc-snap';
				snapMarker = new lib.Marker({ element: el });
				map.on('moveend', update);
				map.on('load', update);
			} catch (e) {
				failed = 'La carte ne peut pas s’afficher sur cet appareil (WebGL indisponible).';
				console.warn('[stationcomplete] carte :', e);
			}
		})();
		return () => {
			disposed = true;
			map?.remove();
		};
	});
</script>

<div class="wrap">
	<div
		class="map"
		bind:this={container}
		role="region"
		aria-label="Photo aérienne, la croix marque l’emplacement visé"
	></div>
	<svg class="reticle" width="96" height="96" viewBox="-48 -48 96 96" aria-hidden="true">
		<circle r="16" fill="none" stroke="#1A1D21" stroke-width="5" />
		<circle r="16" fill="none" stroke="#FFD400" stroke-width="2.5" />
		<path
			d="M-44 0h-0M-28 0h-16M28 0h16M0 -28v-16M0 28v16"
			stroke="#1A1D21"
			stroke-width="6"
			stroke-linecap="round"
		/>
		<path
			d="M-28 0h-16M28 0h16M0 -28v-16M0 28v16"
			stroke="#FFD400"
			stroke-width="3"
			stroke-linecap="round"
		/>
		<circle r="3" fill="#FFD400" stroke="#1A1D21" stroke-width="1.5" />
	</svg>
	{#if failed}<p class="failed" role="alert">{failed}</p>{/if}
</div>

<style>
	.wrap {
		position: relative;
		height: 100%;
	}
	.map {
		position: absolute;
		inset: 0;
		background: #7d786e;
	}
	.reticle {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		pointer-events: none;
	}
	.failed {
		position: absolute;
		inset: 40% 16px auto;
		padding: 14px;
		border-radius: 14px;
		background: var(--bg);
	}
	:global(.rc-snap) {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: #ffd400;
		border: 3px solid #1a1d21;
	}
</style>
