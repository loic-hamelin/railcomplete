<script lang="ts">
	// Carte du dessin de quai (E11) et de la modification d'un quai (E12) : la croix reste au
	// centre, la carte glisse dessous. Affiche les voies, les quais existants et le contour en
	// cours ; les sommets se touchent. En E12 : contour toujours fermé, sommets partagés avec
	// d'autres objets (rond à point central), sommets fixes (carrés, rares), repères « + » au
	// milieu des côtés, ancienne ligne en pointillés.
	// Vue : celle de l'écran précédent si elle est fournie (zoom de l'utilisateur conservé),
	// sinon cadrée sur le quai. Sélectionner un point ne change jamais le zoom.
	import 'maplibre-gl/dist/maplibre-gl.css';
	import type { LonLat } from '#lib/core/draw.js';
	import { IGN_MAX_ZOOM, IGN_TILE_URL } from '#lib/core/tiles.js';
	import Reticle from './Reticle.svelte';
	import {
		IGN_ATTRIBUTION,
		MAP,
		OSM_ATTRIBUTION,
		QUAI_W,
		VOIE_W,
		W,
		avoidBoxes,
		plus
	} from './style.js';
	import { onMount } from 'svelte';

	let {
		center,
		tracks,
		platforms,
		points,
		selected,
		preview,
		snapped = false,
		closed = false,
		locked = [],
		shared = [],
		vertexLabel,
		midpoints = false,
		guide,
		anchors = [],
		bounds,
		view,
		onmove,
		onvertex,
		onmidpoint,
		onanchor
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
		/** E12 : le contour est toujours fermé (pas de côté en cours vers la croix). */
		closed?: boolean;
		/** Sommets fixes (point répété, point relié en « redessiner en surface ») : carrés. */
		locked?: boolean[];
		/** Sommets partagés avec d'autres objets : déplaçables (ils suivent), style distinct. */
		shared?: boolean[];
		vertexLabel?: (i: number) => string;
		/** Repères « + » au milieu des côtés (insérer un point). */
		midpoints?: boolean;
		/** Ancienne forme, en pointillés (repère pour « redessiner en surface »). */
		guide?: LonLat[];
		/** Points de l'ancienne forme qu'on peut reprendre dans le contour (verrouillés). */
		anchors?: { at: LonLat; label: string }[];
		/** Vue initiale : emprise à montrer entièrement (sans `view`, ou si elle est hors écran). */
		bounds?: [LonLat, LonLat];
		/** Vue initiale reprise de l'écran précédent (centre et zoom exacts). */
		view?: { center: LonLat; zoom: number };
		/** Fin de chaque déplacement : centre (sous la croix) et zoom. */
		onmove: (c: LonLat, zoom: number) => void;
		onvertex: (i: number) => void;
		onmidpoint?: (i: number) => void;
		onanchor?: (i: number) => void;
	} = $props();

	/** Longueur minimale d'un côté à l'écran pour y afficher un repère « + » (px). */
	const MID_MIN_PX = 48;
	let container: HTMLDivElement;
	let map: import('maplibre-gl').Map | undefined;
	let lib: typeof import('maplibre-gl') | undefined;
	let vertexMarkers: import('maplibre-gl').Marker[] = [];
	let extraMarkers: import('maplibre-gl').Marker[] = [];
	let lengthMarkers: import('maplibre-gl').Marker[] = [];
	let previewMarker: import('maplibre-gl').Marker | undefined;
	let observer: ResizeObserver | undefined;
	let markerSig = '';
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
		!closed && points.length && preview && selected === undefined
			? [points[points.length - 1], preview]
			: undefined;

	function drawing(): GJ {
		const f: unknown[] = [];
		if (guide && guide.length >= 2) f.push({ ...line(guide), properties: { guide: true } });
		if (points.length >= 3) f.push(poly(points));
		if (points.length >= 2)
			f.push(line(closed && points.length >= 3 ? [...points, points[0]] : points));
		const n = nextSide();
		if (n) f.push({ ...line(n), properties: { next: true } });
		return fc(f);
	}

	function refresh() {
		// (Pas isStyleLoaded : il vaut false tant qu'une source se recharge, et le rafraîchissement
		// serait perdu.)
		if (!map || !lib || !map.getSource('trace')) return;
		(map.getSource('trace') as import('maplibre-gl').GeoJSONSource).setData(drawing());
		// Cibles sans recouvrement (WCAG 2.5.8) : chaque repère prend la place libre autour de
		// lui (carré de 44 px au plus) ; un sommet trop serré (< 24 px) reste visible mais n'est
		// pas touchable à ce zoom : on zoome, ou on le prend à la croix (« Prendre ce point »).
		const placed: { x: number; y: number; r: number }[] = [];
		// Les menus flottants (data-map-avoid) recouvrent la carte : pas de cible dessous.
		const boxes = avoidBoxes(container);
		const claim = (p: LonLat, max: number) => {
			const q = map!.project(p);
			let r = max;
			for (const b of boxes)
				r = Math.min(r, Math.max(b.x - q.x, q.x - b.x - b.w, b.y - q.y, q.y - b.y - b.h));
			for (const o of placed)
				r = Math.min(r, Math.max(Math.abs(q.x - o.x), Math.abs(q.y - o.y)) - o.r);
			r = Math.floor(r);
			if (r < 12) return 0;
			placed.push({ x: q.x, y: q.y, r });
			return r;
		};
		const order = points.map((_, i) => i);
		if (selected !== undefined)
			order.sort((a, b) => Number(b === selected) - Number(a === selected));
		const room = new Map(order.map((i) => [i, claim(points[i], 22)]));
		const anchorRoom = anchors.map((a) => claim(a.at, 22));
		const mids: { i: number; at: LonLat; r: number }[] = [];
		if (midpoints && points.length >= 2) {
			const sides = closed && points.length >= 3 ? points.length : points.length - 1;
			for (let i = 0; i < sides; i++) {
				const a = points[i],
					b = points[(i + 1) % points.length];
				// Repère seulement sur un côté assez long à l'écran (sinon les cibles se recouvrent ;
				// « Ajouter un point ici » à la croix reste toujours possible).
				const pa = map.project(a),
					pb = map.project(b);
				if (Math.hypot(pa.x - pb.x, pa.y - pb.y) < MID_MIN_PX) continue;
				const at: LonLat = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
				const r = claim(at, 22);
				if (r) mids.push({ i, at, r });
			}
		}
		// Rien n'a changé pour les repères : on garde les éléments (pas de recréation pendant
		// qu'on les touche).
		const sig = JSON.stringify([
			points,
			selected,
			locked,
			shared,
			closed,
			[...room],
			anchors,
			anchorRoom,
			mids,
			points.map((_, i) => vertexLabel?.(i))
		]);
		if (sig !== markerSig) {
			markerSig = sig;
			for (const m of vertexMarkers) m.remove();
			vertexMarkers = points.map((p, i) => {
				const r = room.get(i)!;
				const el = document.createElement(r ? 'button' : 'div');
				el.dataset.point = String(i + 1);
				const closing = !closed && i === 0 && points.length >= 3;
				el.className = `rc-vertex${i === 0 && !closed ? ' first' : ''}${i === selected ? ' selected' : ''}${closing ? ' closing' : ''}${locked[i] ? ' locked' : shared[i] ? ' shared' : ''}${r ? '' : ' crowded'}`;
				const dot = document.createElement('span');
				dot.textContent = String(i + 1);
				el.append(dot);
				if (!r) {
					el.setAttribute('aria-hidden', 'true');
					return new lib!.Marker({ element: el }).setLngLat(p).addTo(map!);
				}
				(el as HTMLButtonElement).type = 'button';
				el.style.width = el.style.height = `${2 * r}px`;
				el.setAttribute(
					'aria-label',
					vertexLabel
						? vertexLabel(i)
						: closing
							? 'Point 1 : fermer le quai'
							: `Point ${i + 1} : le déplacer`
				);
				if (i === selected) el.setAttribute('aria-pressed', 'true');
				el.addEventListener('click', (e) => {
					e.stopPropagation();
					onvertex(i);
				});
				return new lib!.Marker({ element: el }).setLngLat(p).addTo(map!);
			});
			// E12 : points reprenables de l'ancienne ligne, repères « + » au milieu des côtés.
			for (const m of extraMarkers) m.remove();
			extraMarkers = [];
			anchors.forEach((a, i) => {
				const r = anchorRoom[i];
				if (!r) return;
				const el = document.createElement('button');
				el.type = 'button';
				el.className = 'rc-vertex locked anchor';
				el.style.width = el.style.height = `${2 * r}px`;
				el.setAttribute('aria-label', a.label);
				el.append(document.createElement('span'));
				el.addEventListener('click', (e) => {
					e.stopPropagation();
					onanchor?.(i);
				});
				extraMarkers.push(new lib!.Marker({ element: el }).setLngLat(a.at).addTo(map!));
			});
			for (const { i, at, r } of mids) {
				const el = document.createElement('button');
				el.type = 'button';
				el.className = 'rc-mid';
				el.style.width = el.style.height = `${2 * r}px`;
				el.setAttribute(
					'aria-label',
					`Ajouter un point entre ${i + 1} et ${((i + 1) % points.length) + 1}`
				);
				el.append(document.createElement('span'));
				el.addEventListener('click', (e) => {
					e.stopPropagation();
					onmidpoint?.(i);
				});
				extraMarkers.push(new lib.Marker({ element: el }).setLngLat(at).addTo(map));
			}
		}
		if (preview) previewMarker?.setLngLat(preview).addTo(map);
		else previewMarker?.remove();
		// Longueur des côtés (répétée en texte dans le panneau, d'où aria-hidden).
		for (const m of lengthMarkers) m.remove();
		// E12 (contour fermé) : seulement les deux côtés du point sélectionné, pour rester lisible.
		const all: [LonLat, LonLat][] = points.slice(1).map((p, i) => [points[i], p]);
		const sides: [LonLat, LonLat][] = !closed
			? all
			: selected === undefined || points.length < 3
				? []
				: [
						[points[(selected - 1 + points.length) % points.length], points[selected]],
						[points[selected], points[(selected + 1) % points.length]]
					];
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
	/** Position à l'écran (px) d'un point, par rapport à la croix (centre de la carte). */
	export function fromCross(p: LonLat): { x: number; y: number } | undefined {
		if (!map) return undefined;
		const a = map.project(p),
			c = map.project(map.getCenter());
		return { x: a.x - c.x, y: a.y - c.y };
	}
	/**
	 * Place la croix sur ce point (sélection d'un sommet en E12) en faisant glisser la carte,
	 * sans jamais changer le zoom ; rien si le point est déjà sous la croix. Glissement court,
	 * immédiat si l'utilisateur a demandé moins d'animations.
	 */
	export function centerOn(p: LonLat) {
		if (!map) return;
		const d = fromCross(p);
		if (d && Math.hypot(d.x, d.y) < 1) return;
		const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
		map.easeTo({ center: p, zoom: map.getZoom(), duration: still ? 0 : 200 });
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
					center: view?.center ?? center,
					zoom: view?.zoom ?? 18,
					...(bounds && !view ? { bounds, fitBoundsOptions: { padding: 72, maxZoom: 20 } } : {}),
					maxZoom: 22,
					minZoom: 15,
					pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
					attributionControl: { compact: true },
					dragRotate: false,
					pitchWithRotate: false,
					touchPitch: false,
					// Toucher deux sommets coup sur coup ne doit pas zoomer (le zoom reste celui
					// de l'utilisateur : boutons +/− ou pincement).
					doubleClickZoom: false,
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
							// Ancienne forme (E12, redessiner en surface) : pointillés clairs sur liseré.
							{
								id: 'guide-casing',
								type: 'line',
								source: 'trace',
								filter: ['has', 'guide'],
								paint: { 'line-color': MAP.casing, 'line-opacity': 0.6, 'line-width': 3.5 }
							},
							{
								id: 'guide',
								type: 'line',
								source: 'trace',
								filter: ['has', 'guide'],
								paint: { 'line-color': MAP.quai, 'line-width': 2, 'line-dasharray': [2, 2] }
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
								filter: [
									'all',
									['==', ['geometry-type'], 'LineString'],
									['!', ['has', 'next']],
									['!', ['has', 'guide']]
								],
								layout: round,
								paint: { 'line-color': MAP.casing, 'line-opacity': 0.6, 'line-width': 3.5 }
							},
							{
								id: 'trace',
								type: 'line',
								source: 'trace',
								filter: [
									'all',
									['==', ['geometry-type'], 'LineString'],
									['!', ['has', 'next']],
									['!', ['has', 'guide']]
								],
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
				// Vue reprise de l'écran précédent, mais quai entièrement hors écran : on le cadre.
				if (view && bounds) {
					const b = map.getBounds();
					const [[w, s], [e, n]] = bounds;
					if (e < b.getWest() || w > b.getEast() || n < b.getSouth() || s > b.getNorth())
						map.fitBounds(bounds, { padding: 72, maxZoom: 20, duration: 0 });
				}
				const el = document.createElement('div');
				el.className = 'rc-preview';
				previewMarker = new lib.Marker({ element: el });
				const move = () => {
					const c = map!.getCenter();
					onmove([c.lng, c.lat], map!.getZoom());
				};
				map.on('moveend', move);
				// Les cibles (taille, repères « + ») dépendent des distances à l'écran.
				map.on('zoomend', refresh);
				map.on('load', () => {
					move();
					refresh();
					// Un menu flottant change de taille (pavé ouvert, message) : cibles recalculées.
					const scope = container.closest('[data-map-scope]');
					if (scope && 'ResizeObserver' in window) {
						let raf = 0;
						observer = new ResizeObserver(() => {
							cancelAnimationFrame(raf);
							raf = requestAnimationFrame(refresh);
						});
						for (const el of scope.querySelectorAll('[data-map-avoid]')) observer.observe(el);
					}
				});
			} catch (e) {
				failed = 'La carte ne peut pas s’afficher sur cet appareil (WebGL indisponible).';
				console.warn('[stationcomplete] carte :', e);
			}
		})();
		return () => {
			disposed = true;
			observer?.disconnect();
			map?.remove();
		};
	});

	$effect(() => {
		// Redessine quand les points, la sélection ou l'aperçu changent.
		void points.length;
		void points.map((p) => p.join());
		void selected;
		void preview;
		void locked.join();
		void shared.join();
		void anchors.length;
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
		/* Contexte d'empilement propre : les repères MapLibre (z-index internes) restent sous
		   les menus flottants de la page, quel que soit leur z-index. */
		isolation: isolate;
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
		z-index: 1; /* au-dessus des repères « + » quand les cibles se recouvrent */
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
	/* Sommet fixe (point répété, point relié en « redessiner en surface ») : carré sombre. */
	:global(.rc-vertex.locked > span) {
		width: 11px;
		height: 11px;
		border-radius: 1px;
		background: #1f1b17;
		box-shadow: 0 0 0 1.5px #fff;
	}
	:global(.rc-vertex.locked.selected > span) {
		box-shadow:
			0 0 0 1.5px #fff,
			0 0 0 4px #fff700;
	}
	/* Sommet trop serré pour être touché à ce zoom : visible, sans cible. */
	:global(.rc-vertex.crowded) {
		pointer-events: none;
	}
	/* Sommet partagé avec d'autres objets (gare, toit, bord du quai…) : rond blanc à point
	   central sombre, discret ; déplaçable, les objets qui le partagent suivent. */
	:global(.rc-vertex.shared > span) {
		width: 11px;
		height: 11px;
		background: radial-gradient(circle, #14110e 0 2px, #fff 2.5px);
	}
	:global(.rc-vertex.shared.selected > span) {
		width: 14px;
		height: 14px;
		background: radial-gradient(circle, #14110e 0 2.5px, #fff700 3px);
	}
	/* Point reprenable de l'ancienne ligne : carré clair en pointillés. */
	:global(.rc-vertex.anchor > span) {
		background: rgb(31 27 23 / 0.5);
		box-shadow: none;
		outline: 1.5px dashed #fff;
	}
	/* Milieu d'un côté : petit « + » blanc, cible de 44 px. */
	:global(.rc-mid) {
		z-index: 0;
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
	:global(.rc-mid > span) {
		position: relative;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: rgb(31 27 23 / 0.75);
		box-shadow: 0 0 0 1px #fff;
	}
	:global(.rc-mid > span::before),
	:global(.rc-mid > span::after) {
		content: '';
		position: absolute;
		left: 3px;
		top: 6.25px;
		width: 8px;
		height: 1.5px;
		background: #fff;
	}
	:global(.rc-mid > span::after) {
		transform: rotate(90deg);
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
