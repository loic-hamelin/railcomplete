// Lecture des données d'une gare par l'API OSM (décision D4 : API OSM seule).
// GET /api/0.6/map.json sur l'emprise, découpée en 2 × 2 si elle est grande, 2 requêtes au plus en parallèle.

import type { BBox, OsmElement } from './core/osm.js';
import { srv } from './osmserver.svelte.js';
import { t } from './i18n/t.js';

/** Racine de l'API du serveur choisi (vraie carte ou serveur de test). */
export const osmApi = () => `${srv().api}/api/0.6`;
const SPLIT_ABOVE_KM2 = 0.25;
const MAX_PARALLEL = 2;

function areaKm2([w, s, e, n]: BBox) {
	const k = 111.32;
	return (e - w) * k * Math.cos((((s + n) / 2) * Math.PI) / 180) * ((n - s) * k);
}

function split(b: BBox): BBox[] {
	if (areaKm2(b) <= SPLIT_ABOVE_KM2) return [b];
	const [w, s, e, n] = b;
	const mx = (w + e) / 2,
		my = (s + n) / 2;
	return [
		[w, s, mx, my],
		[mx, s, e, my],
		[w, my, mx, n],
		[mx, my, e, n]
	];
}

export class OsmApiError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
	}
}

async function fetchBox(b: BBox, signal?: AbortSignal): Promise<OsmElement[]> {
	const url = `${osmApi()}/map.json?bbox=${b.map((x) => x.toFixed(5)).join(',')}`;
	const r = await fetch(url, { signal, headers: { Accept: 'application/json' } });
	if (r.status === 400) {
		// Trop de nœuds dans la boîte : on la redécoupe.
		const [w, s, e, n] = b;
		const mx = (w + e) / 2,
			my = (s + n) / 2;
		const parts: BBox[] = [
			[w, s, mx, my],
			[mx, s, e, my],
			[w, my, mx, n],
			[mx, my, e, n]
		];
		return (await Promise.all(parts.map((p) => fetchBox(p, signal)))).flat();
	}
	if (r.status === 509 || r.status === 429) throw new OsmApiError(r.status, t('error.osmBusy'));
	if (!r.ok) throw new OsmApiError(r.status, t('error.osmServer', { status: r.status }));
	return (await r.json()).elements as OsmElement[];
}

/** Charge tous les éléments OSM de l'emprise, sans doublon. */
export async function fetchStationData(bbox: BBox, signal?: AbortSignal): Promise<OsmElement[]> {
	const boxes = split(bbox);
	const results: OsmElement[][] = [];
	for (let i = 0; i < boxes.length; i += MAX_PARALLEL)
		results.push(
			...(await Promise.all(boxes.slice(i, i + MAX_PARALLEL).map((b) => fetchBox(b, signal))))
		);
	const seen = new Map<string, OsmElement>();
	for (const e of results.flat()) seen.set(`${e.type}/${e.id}`, e);
	return [...seen.values()];
}
