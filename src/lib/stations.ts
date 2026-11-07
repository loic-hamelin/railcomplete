// Index des gares par pays (static/data/stations-<cc>.json) : chargement, recherche et
// « autour de moi ». Une gare appartient au pays de l'index d'où elle vient.

import { asset } from '$app/paths';
import { countryConfig, enabledCountries, type CountryCode } from './core/countries.js';
import type { BBox } from './core/osm.js';

export interface Station {
	/** Identifiant OSM (« n123 ») : unique dans le monde, il ne porte pas le pays. */
	id: string;
	name: string;
	norm: string;
	commune: string;
	/** Subdivision (département, canton…) : voir `subdivision` dans la configuration du pays. */
	admin: string;
	uic: string;
	lat: number;
	lon: number;
	halt: boolean;
	bbox: BBox;
	/** Pays de l'index d'où vient la gare. */
	country: CountryCode;
}

type Row = [string, string, string, string, string, string, number, number, 'S' | 'H', BBox];

export interface StationIndex {
	version: string;
	stations: Station[];
}

const loading = new Map<CountryCode, Promise<StationIndex>>();

/** Index des gares d'un pays (chargé une fois, nouvel essai après une erreur). */
export function loadStations(code: CountryCode): Promise<StationIndex> {
	let p = loading.get(code);
	if (!p) {
		const country = countryConfig(code);
		// Fichier publié par la CI pour chaque pays activé (vérifié par countries.test.ts).
		p = fetch(asset(country.index.file as Parameters<typeof asset>[0]))
			.then((r) => {
				if (!r.ok) throw new Error(`Index des gares indisponible (${r.status})`);
				return r.json() as Promise<{ v: string; s: Row[] }>;
			})
			.then(({ v, s }) => ({
				version: v,
				stations: s.map(([id, name, norm, commune, admin, uic, lat, lon, type, bbox]) => ({
					id,
					name,
					norm,
					commune,
					admin,
					uic,
					lat,
					lon,
					halt: type === 'H',
					bbox,
					country: country.code
				}))
			}))
			.catch((e) => {
				loading.delete(code); // nouvel essai au prochain appel
				throw e;
			});
		loading.set(code, p);
	}
	return p;
}

/**
 * Gares de tous les pays activés (gares récentes, téléchargées, contributions) ; le pays
 * donné en premier. Une gare frontalière n'est que dans un index (découpage par pays en CI).
 */
export async function loadAllStations(first?: CountryCode): Promise<Station[]> {
	const lists = await Promise.all(countryOrder(first).map((c) => loadStations(c)));
	return lists.flatMap((l) => l.stations);
}

/**
 * Gare d'après son identifiant : dans l'index du pays donné d'abord, puis dans ceux des autres
 * pays activés (chargés seulement si besoin).
 */
export async function findStation(id: string, first?: CountryCode) {
	for (const code of countryOrder(first)) {
		const s = (await loadStations(code)).stations.find((x) => x.id === id);
		if (s) return s;
	}
	return undefined;
}

const countryOrder = (first?: CountryCode) =>
	enabledCountries()
		.map((c) => c.code)
		.sort((a, b) => Number(b === first) - Number(a === first));

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
