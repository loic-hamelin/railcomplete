<script lang="ts">
	// Carte d'une gare sur la photo aérienne IGN (MapLibre). Lecture seule au lot 1.
	// Sobriété : MapLibre est chargé à la demande, rendu uniquement quand la vue change,
	// densité de pixels limitée à 2, aucune animation.
	import 'maplibre-gl/dist/maplibre-gl.css';
	import type { FeatureCollection, FeatureProps } from '#lib/core/features.js';
	import type { BBox } from '#lib/core/osm.js';
	import { onMount } from 'svelte';

	type Kind = FeatureProps['kind'];
	let {
		bbox,
		data,
		visible,
		focus,
		selected,
		onselect
	}: {
		bbox: BBox;
		data: FeatureCollection;
		visible: Record<Kind, boolean>;
		focus?: string;
		selected?: string;
		onselect: (p: FeatureProps | undefined) => void;
	} = $props();

	const IGN_TILES =
		'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
		'&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/jpeg' +
		'&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';

	let container: HTMLDivElement;
	let failed = $state('');
	let map: import('maplibre-gl').Map | undefined;
	let markers: { kind: Kind; marker: import('maplibre-gl').Marker }[] = [];
	let me: import('maplibre-gl').Marker | undefined;
	let lib: typeof import('maplibre-gl') | undefined;

	const COLORS = {
		quai: '#00707A',
		voie: '#6A3FB5',
		pancarte: '#A34A00',
		missing: '#FFD400',
		alert: '#B3261E'
	};

	function bounds(f: FeatureCollection['features'][number]) {
		const g = f.geometry;
		const pts =
			g.type === 'Point'
				? [g.coordinates]
				: g.type === 'LineString'
					? g.coordinates
					: g.coordinates[0];
		const xs = pts.map((p) => p[0]),
			ys = pts.map((p) => p[1]);
		return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as BBox;
	}

	function anchorOf(f: FeatureCollection['features'][number]): [number, number] {
		const g = f.geometry;
		if (g.type === 'Point') return g.coordinates;
		const pts = g.type === 'LineString' ? g.coordinates : g.coordinates[0];
		if (g.type === 'LineString') return pts[Math.floor(pts.length / 2)];
		const b = bounds(f);
		return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
	}

	function addMarkers() {
		if (!map || !lib) return;
		for (const m of markers) m.marker.remove();
		markers = [];
		for (const f of data.features) {
			const p = f.properties;
			const el = document.createElement('button');
			el.type = 'button';
			el.className = `rc-badge ${p.kind} ${p.status}${p.edited ? ' edited' : ''}`;
			el.textContent = p.status === 'alert' && p.label !== '?' ? `${p.label} !` : p.label;
			el.setAttribute('aria-label', `${p.title}. ${p.detail}`);
			el.addEventListener('click', (e) => {
				e.stopPropagation();
				onselect(p);
			});
			const marker = new lib.Marker({ element: el }).setLngLat(f.anchor ?? anchorOf(f)).addTo(map);
			markers.push({ kind: p.kind, marker });
		}
		applyVisibility();
	}

	function applyVisibility() {
		if (!map?.isStyleLoaded()) return;
		const layers: Record<Kind, string[]> = {
			quai: ['quai-fill', 'quai-halo', 'quai-line'],
			voie: ['voie-halo', 'voie-line'],
			pancarte: ['pancarte']
		};
		for (const k of Object.keys(layers) as Kind[])
			for (const id of layers[k])
				map.setLayoutProperty(id, 'visibility', visible[k] ? 'visible' : 'none');
		for (const m of markers) m.marker.getElement().style.display = visible[m.kind] ? '' : 'none';
	}

	export function locate() {
		if (!('geolocation' in navigator) || !map || !lib) return;
		navigator.geolocation.getCurrentPosition(
			(p) => {
				if (!map || !lib) return;
				const ll: [number, number] = [p.coords.longitude, p.coords.latitude];
				if (!me) {
					const el = document.createElement('div');
					el.className = 'rc-me';
					el.setAttribute('aria-label', 'Ma position');
					me = new lib.Marker({ element: el });
				}
				me.setLngLat(ll).addTo(map);
				map.jumpTo({ center: ll });
			},
			() => {},
			{ enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 }
		);
	}

	onMount(() => {
		let disposed = false;
		(async () => {
			try {
				lib = await import('maplibre-gl');
				const workerUrl = (await import('maplibre-gl/dist/maplibre-gl-worker.mjs?url')).default;
				lib.setWorkerUrl(workerUrl);
				if (disposed) return;
				map = new lib.Map({
					container,
					bounds: bbox,
					fitBoundsOptions: { padding: 40 },
					maxZoom: 21,
					minZoom: 12,
					pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
					attributionControl: { compact: true },
					dragRotate: false,
					pitchWithRotate: false,
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
							gare: {
								type: 'geojson',
								data: data as unknown as import('maplibre-gl').GeoJSONSourceSpecification['data'],
								attribution: '© contributeurs OpenStreetMap'
							}
						},
						layers: [
							{ id: 'fond', type: 'background', paint: { 'background-color': '#7D786E' } },
							{ id: 'ign', type: 'raster', source: 'ign' },
							{
								id: 'selection',
								type: 'line',
								source: 'gare',
								filter: ['==', ['get', 'osm'], ''],
								layout: { 'line-cap': 'round', 'line-join': 'round' },
								paint: { 'line-color': '#FFD400', 'line-width': 18, 'line-opacity': 0.95 }
							},
							{
								id: 'quai-fill',
								type: 'fill',
								source: 'gare',
								filter: [
									'all',
									['==', ['get', 'kind'], 'quai'],
									['==', ['geometry-type'], 'Polygon']
								],
								paint: { 'fill-color': COLORS.quai, 'fill-opacity': 0.25 }
							},
							{
								id: 'quai-halo',
								type: 'line',
								source: 'gare',
								filter: ['==', ['get', 'kind'], 'quai'],
								paint: { 'line-color': '#FFFFFF', 'line-width': 6 }
							},
							{
								id: 'quai-line',
								type: 'line',
								source: 'gare',
								filter: ['==', ['get', 'kind'], 'quai'],
								paint: {
									'line-color': ['match', ['get', 'status'], 'alert', COLORS.alert, COLORS.quai],
									'line-width': 3
								}
							},
							{
								id: 'voie-halo',
								type: 'line',
								source: 'gare',
								filter: ['==', ['get', 'kind'], 'voie'],
								layout: { 'line-cap': 'round' },
								paint: { 'line-color': '#FFFFFF', 'line-width': 8 }
							},
							{
								id: 'voie-line',
								type: 'line',
								source: 'gare',
								filter: ['==', ['get', 'kind'], 'voie'],
								paint: {
									'line-color': [
										'match',
										['get', 'status'],
										'alert',
										COLORS.alert,
										'missing',
										'#1A1D21',
										COLORS.voie
									],
									'line-width': 4,
									'line-dasharray': [
										'case',
										['==', ['get', 'status'], 'missing'],
										['literal', [2, 1.5]],
										['literal', [1, 0]]
									]
								}
							},
							{
								id: 'pancarte',
								type: 'circle',
								source: 'gare',
								filter: ['==', ['get', 'kind'], 'pancarte'],
								paint: {
									'circle-radius': 6,
									'circle-color': COLORS.pancarte,
									'circle-stroke-color': '#FFFFFF',
									'circle-stroke-width': 2
								}
							}
						]
					}
				});
				map.on('error', (e) => console.warn('[stationcomplete] carte :', e.error?.message));
				// Au-dessous du zoom 17, seules les pastilles « à faire » ou « en alerte » restent affichées.
				const density = () => container.classList.toggle('rc-far', (map?.getZoom() ?? 20) < 17);
				map.on('zoomend', density);
				map.on('load', () => {
					addMarkers();
					const f = focus ? data.features.find((x) => x.properties.osm === focus) : undefined;
					if (f) {
						map!.jumpTo({ center: f.anchor ?? anchorOf(f), zoom: 18.5 });
						onselect(f.properties);
					} else map!.fitBounds(bbox, { padding: 32, maxZoom: 19, duration: 0 });
					density();
				});
				map.on('click', () => onselect(undefined));
			} catch (e) {
				failed =
					'La carte ne peut pas s’afficher sur cet appareil (WebGL indisponible). Utilisez la liste.';
				console.warn('[stationcomplete] carte :', e);
			}
		})();
		return () => {
			disposed = true;
			map?.remove();
		};
	});

	$effect(() => {
		// Met en évidence l'objet sélectionné (trait jaune large sous les autres couches).
		const osm = selected ?? '';
		if (map?.isStyleLoaded()) map.setFilter('selection', ['==', ['get', 'osm'], osm]);
	});

	$effect(() => {
		// Réagit aux filtres Quais / Voies / Pancartes.
		void visible.quai;
		void visible.voie;
		void visible.pancarte;
		applyVisibility();
	});
</script>

<div
	class="map"
	bind:this={container}
	role="region"
	aria-label="Carte de la gare sur la photo aérienne"
>
	{#if failed}<p class="failed" role="alert">{failed}</p>{/if}
</div>

<style>
	.map {
		position: absolute;
		inset: 0;
		background: #7d786e;
	}
	.failed {
		position: absolute;
		inset: 40% 16px auto;
		padding: 16px;
		border-radius: 14px;
		background: var(--bg);
		color: var(--text);
	}
	:global(.rc-badge) {
		min-width: 30px;
		height: 30px;
		padding: 0 6px;
		border: 3px solid #fff;
		border-radius: 15px;
		font: 700 15px var(--font);
		color: #fff;
		cursor: pointer;
		box-shadow: 0 1px 3px rgb(0 0 0 / 0.4);
	}
	:global(.rc-badge.quai) {
		border-radius: 6px;
		background: #00707a;
	}
	:global(.rc-badge.voie) {
		background: #6a3fb5;
	}
	:global(.rc-badge.pancarte) {
		border-radius: 4px;
		border-color: #a34a00;
		background: #fff;
		color: #1a1d21;
		font-size: 13px;
	}
	:global(.rc-badge.missing) {
		background: #ffd400;
		border-color: #1a1d21;
		color: #1a1d21;
	}
	:global(.rc-badge.alert) {
		background: #b3261e;
		border-color: #fff;
		color: #fff;
	}
	:global(.rc-badge.edited) {
		outline: 3px dashed #0b4f9c;
		outline-offset: 2px;
	}
	:global(.rc-far .rc-badge.ok:not(.edited)) {
		display: none;
	}
	:global(.rc-me) {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: #0b4f9c;
		border: 3px solid #fff;
		box-shadow: 0 0 0 6px rgb(11 79 156 / 0.25);
	}
</style>
