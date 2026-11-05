// Index des gares (static/data/stations-fr.json) : chargement, recherche et « autour de moi ».

import { asset } from '$app/paths';
import type { BBox } from './core/osm.js';

export interface Station {
	id: string;
	name: string;
	norm: string;
	commune: string;
	dep: string;
	uic: string;
	lat: number;
	lon: number;
	halt: boolean;
	bbox: BBox;
}

type Row = [string, string, string, string, string, string, number, number, 'S' | 'H', BBox];

let loading: Promise<{ version: string; stations: Station[] }> | undefined;

export function loadStations() {
	loading ??= fetch(asset('data/stations-fr.json'))
		.then((r) => {
			if (!r.ok) throw new Error(`Index des gares indisponible (${r.status})`);
			return r.json() as Promise<{ v: string; s: Row[] }>;
		})
		.then(({ v, s }) => ({
			version: v,
			stations: s.map(([id, name, norm, commune, dep, uic, lat, lon, type, bbox]) => ({
				id,
				name,
				norm,
				commune,
				dep,
				uic,
				lat,
				lon,
				halt: type === 'H',
				bbox
			}))
		}))
		.catch((e) => {
			loading = undefined; // nouvel essai au prochain appel
			throw e;
		});
	return loading;
}

export function normalize(s: string) {
	return s
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[''`’]/g, ' ')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

/** Recherche sur le nom, la commune et le code UIC. Les débuts de mots passent en premier. */
export function search(stations: Station[], query: string, limit = 30): Station[] {
	const q = normalize(query);
	if (q.length < 2) return [];
	const scored: [number, Station][] = [];
	for (const s of stations) {
		const hay = `${s.norm} ${normalize(s.commune)}`;
		let score = -1;
		if (s.norm === q) score = 0;
		else if (s.norm.startsWith(q)) score = 1;
		else if (hay.includes(' ' + q)) score = 2;
		else if (hay.includes(q)) score = 3;
		else if (s.uic && s.uic.startsWith(q)) score = 4;
		if (score >= 0) scored.push([score * 1000 + s.norm.length, s]);
	}
	return scored
		.sort((a, b) => a[0] - b[0])
		.slice(0, limit)
		.map(([, s]) => s);
}

/** Distance en mètres (formule de haversine). */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number) {
	const R = 6_371_008.8,
		r = Math.PI / 180;
	const dLat = (lat2 - lat1) * r,
		dLon = (lon2 - lon1) * r;
	const a =
		Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(a));
}

export function nearby(stations: Station[], lat: number, lon: number, limit = 10) {
	return stations
		.map((s) => ({ s, d: distanceM(lat, lon, s.lat, s.lon) }))
		.sort((a, b) => a.d - b.d)
		.slice(0, limit);
}

export function formatDistance(m: number) {
	return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
}

/** L'utilisateur est « sur place » si sa position (précision ≤ 100 m) tombe dans l'emprise. */
export function isOnSite(s: Station, lat: number, lon: number, accuracyM: number) {
	if (accuracyM > 100) return false;
	const [w, so, e, n] = s.bbox;
	return lon >= w && lon <= e && lat >= so && lat <= n;
}
