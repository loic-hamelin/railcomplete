<script lang="ts">
	// Carte du dessin de quai (E11) : la croix reste au centre, la carte glisse dessous.
	// Affiche les voies, les quais existants et le contour en cours ; les sommets se touchent.
	import 'maplibre-gl/dist/maplibre-gl.css';
	import type { LonLat } from '#lib/core/draw.js';
	import { IGN_MAX_ZOOM, IGN_TILE_URL } from '#lib/core/tiles.js';
	import { onMount } from 'svelte';

	let {
		center,
		tracks,
		platforms,
		points,
		selected,
		preview,
		onmove,
		onvertex
	}: {
		center: LonLat;
		tracks: LonLat[][];
		platforms: LonLat[][];
		points: LonLat[];
		selected?: number;
		/** Point qui sera ajouté (après accrochage), affiché sous la croix. */
		preview?: LonLat;
		onmove: (c: LonLat) => void;
		onvertex: (i: number) => void;
	} = $props();

	let container: HTMLDivElement;
	let map: import('maplibre-gl').Map | undefined;
	let lib: typeof import('maplibre-gl') | undefined;
	let vertexMarkers: import('maplibre-gl').Marker[] = [];
	let previewMarker: import('maplibre-gl').Marker | undefined;
	let failed = $state('');

	type GJ = import('maplibre-gl').GeoJSONSourceSpecification['data'];
	const fc = (features: unknown[]) => ({ type: 'FeatureCollection', features }) as unknown as GJ;
	const line = (c: LonLat[]) => ({
		type: 'Feature',
		properties: {},
		geometry: { type: 'LineString', coordinates: c }
	});
	const poly = (c: LonLat[]) => ({
		type: 'Feature',
		properties: {},
		geometry: { type: 'Polygon', coordinates: [[...c, c[0]]] }
	});

	function drawing(): GJ {
		const f: unknown[] = [];
		if (points.length >= 3) f.push(poly(points));
		if (points.length >= 2) f.push(line(points));
		return fc(f);
	}

	function refresh() {
		if (!map?.isStyleLoaded() || !lib) return;
		(map.getSource('trace') as import('maplibre-gl').GeoJSONSource).setData(drawing());
		for (const m of vertexMarkers) m.remove();
		vertexMarkers = points.map((p, i) => {
			const el = document.createElement('button');
			el.type = 'button';
			el.className = `rc-vertex${i === 0 ? ' first' : ''}${i === selected ? ' selected' : ''}`;
			el.textContent = String(i + 1);
			el.setAttribute(
				'aria-label',
				i === 0 && points.length >= 3 ? 'Point 1 : fermer le quai' : `Point ${i + 1} : le déplacer`
			);
			el.addEventListener('click', (e) => {
				e.stopPropagation();
				onvertex(i);
			});
			return new lib!.Marker({ element: el }).setLngLat(p).addTo(map!);
		});
		if (preview) previewMarker?.setLngLat(preview).addTo(map);
		else previewMarker?.remove();
	}

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
				lib = await import('maplibre-gl');
				lib.setWorkerUrl((await import('maplibre-gl/dist/maplibre-gl-worker.mjs?url')).default);
				if (disposed) return;
				map = new lib.Map({
					container,
					center,
					zoom: 18,
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
								tiles: [IGN_TILE_URL],
								tileSize: 256,
								maxzoom: IGN_MAX_ZOOM,
								attribution: 'Photo © IGN – BD ORTHO'
							},
							existant: {
								type: 'geojson',
								data: fc([
									...tracks.map((t) => ({ ...line(t), properties: { k: 'voie' } })),
									...platforms.map((p) => ({ ...poly(p), properties: { k: 'quai' } }))
								]),
								attribution: '© contributeurs OpenStreetMap'
							},
							trace: { type: 'geojson', data: drawing() }
						},
						layers: [
							{ id: 'fond', type: 'background', paint: { 'background-color': '#7D786E' } },
							{ id: 'ign', type: 'raster', source: 'ign' },
							{
								id: 'quai-existant',
								type: 'fill',
								source: 'existant',
								filter: ['==', ['get', 'k'], 'quai'],
								paint: {
									'fill-color': '#00707A',
									'fill-opacity': 0.3,
									'fill-outline-color': '#FFFFFF'
								}
							},
							{
								id: 'voie-halo',
								type: 'line',
								source: 'existant',
								filter: ['==', ['get', 'k'], 'voie'],
								paint: { 'line-color': '#FFFFFF', 'line-width': 5 }
							},
							{
								id: 'voie',
								type: 'line',
								source: 'existant',
								filter: ['==', ['get', 'k'], 'voie'],
								paint: { 'line-color': '#6A3FB5', 'line-width': 2.5 }
							},
							{
								id: 'trace-fill',
								type: 'fill',
								source: 'trace',
								filter: ['==', ['geometry-type'], 'Polygon'],
								paint: { 'fill-color': '#FFD400', 'fill-opacity': 0.25 }
							},
							{
								id: 'trace-halo',
								type: 'line',
								source: 'trace',
								filter: ['==', ['geometry-type'], 'LineString'],
								paint: { 'line-color': '#1A1D21', 'line-width': 5 }
							},
							{
								id: 'trace',
								type: 'line',
								source: 'trace',
								filter: ['==', ['geometry-type'], 'LineString'],
								paint: { 'line-color': '#FFD400', 'line-width': 2.5 }
							}
						]
					}
				});
				const el = document.createElement('div');
				el.className = 'rc-preview';
				previewMarker = new lib.Marker({ element: el });
				const move = () => {
					const c = map!.getCenter();
					onmove([c.lng, c.lat]);
				};
				map.on('moveend', move);
				map.on('load', () => {
					move();
					refresh();
				});
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

	$effect(() => {
		// Redessine quand les points, la sélection ou l'aperçu changent.
		void points.length;
		void points.map((p) => p.join());
		void selected;
		void preview;
		refresh();
	});
</script>

<div class="wrap">
	<div
		class="map"
		bind:this={container}
		role="region"
		aria-label="Photo aérienne, la croix marque le prochain point du quai"
	></div>
	<svg class="reticle" width="80" height="80" viewBox="-40 -40 80 80" aria-hidden="true">
		<circle r="12" fill="none" stroke="#1A1D21" stroke-width="4" />
		<circle r="12" fill="none" stroke="#FFD400" stroke-width="2" />
		<path
			d="M-34 0h-0M-22 0h-14M22 0h14M0 -22v-14M0 22v14"
			stroke="#1A1D21"
			stroke-width="5"
			stroke-linecap="round"
		/>
		<path
			d="M-22 0h-14M22 0h14M0 -22v-14M0 22v14"
			stroke="#FFD400"
			stroke-width="2.5"
			stroke-linecap="round"
		/>
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
	:global(.rc-vertex) {
		width: 28px;
		height: 28px;
		border-radius: 14px;
		border: 2px solid #fff;
		background: #00707a;
		color: #fff;
		font: 700 13px var(--font);
		cursor: pointer;
	}
	:global(.rc-vertex.first) {
		background: #1a1d21;
	}
	:global(.rc-vertex.selected) {
		background: #ffd400;
		color: #1a1d21;
		border-color: #1a1d21;
	}
	:global(.rc-preview) {
		width: 12px;
		height: 12px;
		border-radius: 6px;
		background: #ffd400;
		border: 2px solid #1a1d21;
	}
</style>
