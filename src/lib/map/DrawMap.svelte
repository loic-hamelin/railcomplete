<script lang="ts">
	// Carte du dessin de quai (E11) : la croix reste au centre, la carte glisse dessous.
	// Affiche les voies, les quais existants et le contour en cours ; les sommets se touchent.
	import 'maplibre-gl/dist/maplibre-gl.css';
	import type { LonLat } from '#lib/core/draw.js';
	import { IGN_MAX_ZOOM, IGN_TILE_URL } from '#lib/core/tiles.js';
	import Reticle from './Reticle.svelte';
	import { IGN_ATTRIBUTION, MAP, OSM_ATTRIBUTION, QUAI_W, VOIE_W, W, plus } from './style.js';
	import { onMount } from 'svelte';

	let {
		center,
		tracks,
		platforms,
		points,
		selected,
		preview,
		snapped = false,
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
		/** Le point visé est accroché au bord d'une voie (croix jaune). */
		snapped?: boolean;
		onmove: (c: LonLat) => void;
		onvertex: (i: number) => void;
	} = $props();

	let container: HTMLDivElement;
	let map: import('maplibre-gl').Map | undefined;
	let lib: typeof import('maplibre-gl') | undefined;
	let vertexMarkers: import('maplibre-gl').Marker[] = [];
	let lengthMarkers: import('maplibre-gl').Marker[] = [];
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

	/** Longueur approchée d'un côté (m), pour les étiquettes de la carte. */
	const meters = (a: LonLat, b: LonLat) => {
		const k = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
		return Math.hypot((b[0] - a[0]) * k, b[1] - a[1]) * 111_320;
	};
	/** Côté en cours : du dernier point vers la croix (tirets). */
	const nextSide = (): [LonLat, LonLat] | undefined =>
		points.length && preview && selected === undefined
			? [points[points.length - 1], preview]
			: undefined;

	function drawing(): GJ {
		const f: unknown[] = [];
		if (points.length >= 3) f.push(poly(points));
		if (points.length >= 2) f.push(line(points));
		const n = nextSide();
		if (n) f.push({ ...line(n), properties: { next: true } });
		return fc(f);
	}

	function refresh() {
		if (!map?.isStyleLoaded() || !lib) return;
		(map.getSource('trace') as import('maplibre-gl').GeoJSONSource).setData(drawing());
		for (const m of vertexMarkers) m.remove();
		vertexMarkers = points.map((p, i) => {
			const el = document.createElement('button');
			el.type = 'button';
			const closing = i === 0 && points.length >= 3;
			el.className = `rc-vertex${i === 0 ? ' first' : ''}${i === selected ? ' selected' : ''}${closing ? ' closing' : ''}`;
			const dot = document.createElement('span');
			dot.textContent = String(i + 1);
			el.append(dot);
			el.setAttribute(
				'aria-label',
				closing ? 'Point 1 : fermer le quai' : `Point ${i + 1} : le déplacer`
			);
			el.addEventListener('click', (e) => {
				e.stopPropagation();
				onvertex(i);
			});
			return new lib!.Marker({ element: el }).setLngLat(p).addTo(map!);
		});
		if (preview) previewMarker?.setLngLat(preview).addTo(map);
		else previewMarker?.remove();
		// Longueur des côtés (répétée en texte dans le panneau, d'où aria-hidden).
		for (const m of lengthMarkers) m.remove();
		const sides: [LonLat, LonLat][] = points.slice(1).map((p, i) => [points[i], p]);
		const n = nextSide();
		if (n) sides.push(n);
		lengthMarkers = sides
			.filter(([a, b]) => meters(a, b) >= 3)
			.map(([a, b]) => {
				const el = document.createElement('div');
				el.className = 'rc-len';
				el.setAttribute('aria-hidden', 'true');
				el.textContent = `${Math.round(meters(a, b))} m`;
				return new lib!.Marker({ element: el, offset: [0, 16] })
					.setLngLat([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])
					.addTo(map!);
			});
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
				const round = { 'line-join': 'round', 'line-cap': 'round' } as const;
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
								attribution: IGN_ATTRIBUTION
							},
							existant: {
								type: 'geojson',
								data: fc([
									...tracks.map((t) => ({ ...line(t), properties: { k: 'voie' } })),
									...platforms.map((p) => ({ ...poly(p), properties: { k: 'quai' } }))
								]),
								attribution: OSM_ATTRIBUTION
							},
							trace: { type: 'geojson', data: drawing() }
						},
						layers: [
							{ id: 'fond', type: 'background', paint: { 'background-color': MAP.ground } },
							{ id: 'ign', type: 'raster', source: 'ign' },
							// Quais voisins : style normal (contour clair sur liseré, remplissage léger).
							{
								id: 'quai-existant',
								type: 'fill',
								source: 'existant',
								filter: ['==', ['get', 'k'], 'quai'],
								paint: { 'fill-color': MAP.quai, 'fill-opacity': 0.1 }
							},
							{
								id: 'quai-casing',
								type: 'line',
								source: 'existant',
								filter: ['==', ['get', 'k'], 'quai'],
								layout: round,
								paint: {
									'line-color': MAP.casing,
									'line-opacity': 0.7,
									'line-width': W(plus(QUAI_W, 1.5))
								}
							},
							{
								id: 'quai-line',
								type: 'line',
								source: 'existant',
								filter: ['==', ['get', 'k'], 'quai'],
								layout: round,
								paint: { 'line-color': MAP.quai, 'line-width': W(QUAI_W) }
							},
							{
								id: 'voie-casing',
								type: 'line',
								source: 'existant',
								filter: ['==', ['get', 'k'], 'voie'],
								layout: round,
								paint: {
									'line-color': MAP.casing,
									'line-opacity': 0.7,
									'line-width': W(plus(VOIE_W, 1.5))
								}
							},
							{
								id: 'voie',
								type: 'line',
								source: 'existant',
								filter: ['==', ['get', 'k'], 'voie'],
								layout: round,
								paint: { 'line-color': MAP.voie, 'line-width': W(VOIE_W) }
							},
							// Polygone en cours : jaune 2 px sur liseré, remplissage 12 %.
							{
								id: 'trace-fill',
								type: 'fill',
								source: 'trace',
								filter: ['==', ['geometry-type'], 'Polygon'],
								paint: { 'fill-color': MAP.sel, 'fill-opacity': 0.12 }
							},
							{
								id: 'trace-casing',
								type: 'line',
								source: 'trace',
								filter: ['all', ['==', ['geometry-type'], 'LineString'], ['!', ['has', 'next']]],
								layout: round,
								paint: { 'line-color': MAP.casing, 'line-opacity': 0.6, 'line-width': 3.5 }
							},
							{
								id: 'trace',
								type: 'line',
								source: 'trace',
								filter: ['all', ['==', ['geometry-type'], 'LineString'], ['!', ['has', 'next']]],
								layout: round,
								paint: { 'line-color': MAP.sel, 'line-width': 2 }
							},
							// Côté en cours, vers la croix : tirets 4/3.
							{
								id: 'trace-next-casing',
								type: 'line',
								source: 'trace',
								filter: ['has', 'next'],
								paint: { 'line-color': MAP.casing, 'line-opacity': 0.6, 'line-width': 3 }
							},
							{
								id: 'trace-next',
								type: 'line',
								source: 'trace',
								filter: ['has', 'next'],
								paint: { 'line-color': MAP.sel, 'line-width': 1.5, 'line-dasharray': [4, 3] }
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
	<Reticle {snapped} />
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
		background: #8c877c;
	}
	.failed {
		position: absolute;
		inset: 40% 16px auto;
		padding: 14px;
		border-radius: var(--radius-lg);
		background: var(--bg);
	}
	/* Sommets : cercle blanc cerclé, le premier plus grand (le toucher ferme le quai, anneau jaune
	   dès 3 points), dans un bouton de 44 px. Le numéro reste dans le libellé accessible. */
	:global(.rc-vertex) {
		width: 44px;
		height: 44px;
		padding: 0;
		border: 0;
		background: none;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}
	:global(.rc-vertex > span) {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: #fff;
		box-shadow: 0 0 0 1.5px #14110e;
		font-size: 0;
		color: transparent;
		overflow: hidden;
	}
	:global(.rc-vertex.first > span) {
		width: 12px;
		height: 12px;
	}
	:global(.rc-vertex.closing > span) {
		box-shadow:
			0 0 0 1.5px #14110e,
			0 0 0 4px #fff700,
			0 0 0 5.5px #14110e;
	}
	:global(.rc-vertex.selected > span) {
		width: 14px;
		height: 14px;
		background: #fff700;
	}
	:global(.rc-preview) {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #fff700;
		border: 1.5px solid #14110e;
	}
	:global(.rc-len) {
		height: 18px;
		padding: 0 5px;
		border-radius: 2px;
		background: rgb(31 27 23 / 0.86);
		box-shadow: 0 0 0 0.75px rgb(255 255 255 / 0.55);
		color: #fff;
		font: 600 11px/18px var(--font);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		pointer-events: none;
	}
</style>
