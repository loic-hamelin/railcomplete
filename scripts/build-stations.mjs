// Construit l'index des gares françaises (static/data/stations-fr.json) à partir d'un export
// GeoJSON (séquence) de l'extrait OSM filtré par osmium. Lancé chaque semaine par la CI.
//
// Usage : node scripts/build-stations.mjs rail-fr.geojsonseq [--communes data/communes-cache.json]
//
// Pour chaque gare : identifiant OSM, nom, nom normalisé, commune, département, UIC, position,
// type (S = gare, H = halte) et emprise serrée (quais + marge) à demander à l'API OSM.

import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname } from 'node:path';

const input = process.argv[2];
const communesPath = argValue('--communes') ?? 'data/communes-cache.json';
const outPath = argValue('--out') ?? 'static/data/stations-fr.json';
const statsPath = argValue('--stats') ?? 'data/stations-stats.json';
const offline = process.argv.includes('--offline'); // pas de géocodage (tests)

function argValue(name) {
	const i = process.argv.indexOf(name);
	return i > 0 ? process.argv[i + 1] : undefined;
}

// ---------- Géométrie simple (degrés ↔ mètres) ----------
const M_PER_DEG_LAT = 111_320;
const mPerDegLon = (lat) => M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
const distM = (a, b) =>
	Math.hypot((a[0] - b[0]) * mPerDegLon((a[1] + b[1]) / 2), (a[1] - b[1]) * M_PER_DEG_LAT);

function coordsOf(geom) {
	switch (geom.type) {
		case 'Point':
			return [geom.coordinates];
		case 'LineString':
		case 'MultiPoint':
			return geom.coordinates;
		case 'Polygon':
		case 'MultiLineString':
			return geom.coordinates.flat();
		case 'MultiPolygon':
			return geom.coordinates.flat(2);
		default:
			return [];
	}
}
function bboxOf(points) {
	let w = Infinity,
		s = Infinity,
		e = -Infinity,
		n = -Infinity;
	for (const [x, y] of points) {
		if (x < w) w = x;
		if (x > e) e = x;
		if (y < s) s = y;
		if (y > n) n = y;
	}
	return [w, s, e, n];
}
const center = (b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
function expand(b, m) {
	const lat = (b[1] + b[3]) / 2;
	const dLon = m / mPerDegLon(lat);
	const dLat = m / M_PER_DEG_LAT;
	return [b[0] - dLon, b[1] - dLat, b[2] + dLon, b[3] + dLat];
}
const union = (a, b) => [
	Math.min(a[0], b[0]),
	Math.min(a[1], b[1]),
	Math.max(a[2], b[2]),
	Math.max(a[3], b[3])
];
const r4 = (x) => Math.round(x * 1e4) / 1e4;
const r5 = (x) => Math.round(x * 1e5) / 1e5;

export function normalize(name) {
	return name
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[''`’]/g, ' ')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

// ---------- Règles de sélection ----------
const EXCLUDED_STATION = new Set(['subway', 'light_rail', 'monorail', 'funicular', 'tram']);
export function isRailStation(t) {
	if (t.railway !== 'station' && t.railway !== 'halt') return false;
	if (!t.name) return false;
	if (EXCLUDED_STATION.has(t.station)) return false;
	if (t.usage === 'tourism' || t.tourism === 'yes') return false;
	if (t.train === 'no') return false;
	return true;
}
export function isTrainPlatform(t) {
	if (t.railway === 'platform') return true;
	if (t.public_transport === 'platform' && (t.train === 'yes' || t.railway === 'platform'))
		return true;
	return false;
}
const isLegacyStopSign = (t) =>
	t.railway === 'signal' && /^FR:ARRET/.test(t['railway:signal:stop'] ?? '');

// Rayon de rattachement d'un quai à une gare, marge de l'emprise, emprise sans quai.
const PLATFORM_RADIUS_M = 400;
const MARGIN_M = 60;
const NO_PLATFORM_HALF_M = 200;

// ---------- Lecture ----------
async function read(file) {
	const stations = [];
	const platforms = [];
	const legacy = [];
	const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
	for await (let line of rl) {
		line = line.replace(String.fromCharCode(0x1e), '').trim(); // séparateur RFC 8142
		if (!line) continue;
		const f = JSON.parse(line);
		const t = f.properties ?? {};
		const pts = coordsOf(f.geometry ?? {});
		if (!pts.length) continue;
		const id = f.id ?? t['@id'] ?? '';
		if (isRailStation(t)) {
			const b = bboxOf(pts);
			stations.push({ id: String(id), t, pos: f.geometry.type === 'Point' ? pts[0] : center(b) });
		} else if (isTrainPlatform(t)) {
			platforms.push({ bbox: bboxOf(pts), c: center(bboxOf(pts)) });
		} else if (isLegacyStopSign(t)) {
			legacy.push(pts[0]);
		}
	}
	return { stations, platforms, legacy };
}

// Grille de 0,01° pour trouver rapidement les objets proches.
function grid(items, key) {
	const g = new Map();
	for (const it of items) {
		const [x, y] = key(it);
		const k = `${Math.floor(x * 100)}:${Math.floor(y * 100)}`;
		if (!g.has(k)) g.set(k, []);
		g.get(k).push(it);
	}
	return (p) => {
		const out = [];
		const cx = Math.floor(p[0] * 100),
			cy = Math.floor(p[1] * 100);
		for (let dx = -1; dx <= 1; dx++)
			for (let dy = -1; dy <= 1; dy++) out.push(...(g.get(`${cx + dx}:${cy + dy}`) ?? []));
		return out;
	};
}

// Dédoublonnage : même nom normalisé à moins de 300 m → on garde le nœud railway=station.
function dedupe(stations) {
	const near = grid(stations, (s) => s.pos);
	const drop = new Set();
	for (const s of stations) {
		if (drop.has(s)) continue;
		for (const o of near(s.pos)) {
			if (o === s || drop.has(o)) continue;
			if (normalize(o.t.name) === normalize(s.t.name) && distM(o.pos, s.pos) < 300) {
				const score = (x) => (x.id.startsWith('n') ? 2 : 0) + (x.t.railway === 'station' ? 1 : 0);
				drop.add(score(o) > score(s) ? s : o);
				if (drop.has(s)) break;
			}
		}
	}
	return stations.filter((s) => !drop.has(s));
}

// ---------- Communes (géocodage inverse, mis en cache dans le dépôt) ----------
async function communes(stations) {
	const cache = existsSync(communesPath) ? JSON.parse(readFileSync(communesPath, 'utf8')) : {};
	const todo = stations.filter((s) => !cache[s.id]);
	if (!offline && todo.length) {
		console.log(`Géocodage de ${todo.length} gares nouvelles…`);
		const ua = { 'User-Agent': 'stationcomplete-stations (+https://stationcomplete.org)' };
		for (let i = 0; i < todo.length; i += 5) {
			await Promise.all(
				todo.slice(i, i + 5).map(async (s) => {
					try {
						const url = `https://geo.api.gouv.fr/communes?lat=${s.pos[1]}&lon=${s.pos[0]}&fields=nom,codeDepartement&format=json`;
						const r = await fetch(url, { headers: ua });
						const j = r.ok ? await r.json() : [];
						if (j[0]) cache[s.id] = [j[0].nom, j[0].codeDepartement];
					} catch {
						/* on réessaiera la semaine prochaine */
					}
				})
			);
			await new Promise((res) => setTimeout(res, 150)); // reste loin de la limite de 50 req/s
		}
		mkdirSync(dirname(communesPath), { recursive: true });
		writeFileSync(communesPath, JSON.stringify(cache, null, 0));
	}
	return cache;
}

// ---------- Construction ----------
export function build({ stations, platforms, legacy }, cache = {}) {
	const kept = dedupe(stations);
	const nearPlatforms = grid(platforms, (p) => p.c);
	const nearLegacy = grid(legacy, (p) => p);
	let withoutPlatform = [];
	let legacyStations = [];
	const rows = kept.map((s) => {
		const ps = nearPlatforms(s.pos).filter((p) => distM(p.c, s.pos) <= PLATFORM_RADIUS_M);
		let box;
		if (ps.length) {
			box = ps.reduce((b, p) => union(b, p.bbox), [s.pos[0], s.pos[1], s.pos[0], s.pos[1]]);
			box = expand(box, MARGIN_M);
		} else {
			box = expand([s.pos[0], s.pos[1], s.pos[0], s.pos[1]], NO_PLATFORM_HALF_M);
			withoutPlatform.push(s.t.name);
		}
		if (nearLegacy(s.pos).some((p) => distM(p, s.pos) <= PLATFORM_RADIUS_M))
			legacyStations.push(s.t.name);
		const [commune, dep] = cache[s.id] ?? [s.t['addr:city'] ?? '', ''];
		return [
			s.id,
			s.t.name,
			normalize(s.t.name),
			commune,
			dep,
			s.t.uic_ref ?? '',
			r5(s.pos[1]),
			r5(s.pos[0]),
			s.t.railway === 'halt' ? 'H' : 'S',
			box.map(r4)
		];
	});
	rows.sort((a, b) => a[2].localeCompare(b[2]));
	const areas = rows.map(
		(r) => ((r[9][2] - r[9][0]) * mPerDegLon(r[6]) * (r[9][3] - r[9][1]) * M_PER_DEG_LAT) / 1e6
	);
	return {
		index: rows,
		stats: {
			stations: rows.length,
			platforms: platforms.length,
			withoutPlatform: withoutPlatform.length,
			withoutPlatformSample: withoutPlatform.slice(0, 20),
			legacySignStations: legacyStations.length,
			legacySignSample: legacyStations.slice(0, 20),
			empriseKm2: {
				median: +areas.sort((a, b) => a - b)[Math.floor(areas.length / 2)]?.toFixed(3),
				max: +Math.max(0, ...areas).toFixed(3)
			}
		}
	};
}

async function main() {
	if (!input) {
		console.error('Usage : node scripts/build-stations.mjs rail-fr.geojsonseq');
		process.exit(2);
	}
	const data = await read(input);
	const cache = await communes(dedupe(data.stations));
	const { index, stats } = build(data, cache);
	const version = new Date().toISOString().slice(0, 10);
	mkdirSync(dirname(outPath), { recursive: true });
	writeFileSync(
		outPath,
		JSON.stringify({ v: version, attribution: '© contributeurs OpenStreetMap, ODbL', s: index })
	);
	mkdirSync(dirname(statsPath), { recursive: true });
	writeFileSync(statsPath, JSON.stringify({ v: version, ...stats }, null, 2) + '\n');
	console.log(JSON.stringify(stats, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
