// Télécharge les données OSM des gares de référence (tests du moteur de quêtes) et mesure
// la réponse de l'API OSM. Lancé à la demande par la CI (workflow « Index des gares »).
//
// Usage : node scripts/fetch-fixtures.mjs [nom de gare…]
// Sans argument : Ambérieu-en-Bugey, Lyon Part-Dieu, une halte, une gare sans quai cartographié,
// et une gare dont les pancartes sont encore à l'ancien format FR:ARRET_*.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const UA = { 'User-Agent': 'railcomplete-fixtures (+https://railcomplete.org)' };
const index = JSON.parse(readFileSync('static/data/stations-fr.json', 'utf8')).s;
const stats = JSON.parse(readFileSync('data/stations-stats.json', 'utf8'));

const byName = (name) => index.find((r) => r[1] === name);
const firstHalt =
	index.find((r) => r[8] === 'H' && r[4] === '01') ?? index.find((r) => r[8] === 'H');

const wanted = process.argv.slice(2).length
	? process.argv.slice(2).map((n) => ({ role: 'manuel', row: byName(n) }))
	: [
			{ role: 'gare moyenne', row: byName('Ambérieu-en-Bugey') },
			{ role: 'grande gare', row: byName('Lyon Part-Dieu') },
			{ role: 'halte', row: firstHalt },
			{ role: 'sans quai', row: byName(stats.withoutPlatformSample[0]) },
			{ role: 'ancien format', row: byName(stats.legacySignSample[0]) }
		];

const slug = (s) =>
	s
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');

mkdirSync('tests/fixtures', { recursive: true });
const report = [];
for (const { role, row } of wanted) {
	if (!row) {
		report.push({ role, erreur: 'gare introuvable dans l’index' });
		continue;
	}
	const [id, name, , commune, dep, , lat, lon, type, bbox] = row;
	const url = `https://api.openstreetmap.org/api/0.6/map.json?bbox=${bbox.join(',')}`;
	const t0 = Date.now();
	const r = await fetch(url, { headers: UA });
	const body = await r.text();
	const ms = Date.now() - t0;
	if (!r.ok) {
		report.push({ role, name, statut: r.status, erreur: body.slice(0, 200) });
		continue;
	}
	const data = JSON.parse(body);
	const count = (type) => data.elements.filter((e) => e.type === type).length;
	const file = `tests/fixtures/${slug(name)}.json`;
	writeFileSync(
		file,
		JSON.stringify({
			station: { id, name, commune, dep, lat, lon, type, bbox },
			fetched: new Date().toISOString(),
			attribution: '© contributeurs OpenStreetMap, ODbL',
			elements: data.elements
		})
	);
	report.push({
		role,
		name,
		fichier: file,
		bbox,
		statut: r.status,
		ms,
		noeuds: count('node'),
		ways: count('way'),
		relations: count('relation'),
		moBruts: +(body.length / 1e6).toFixed(2),
		moGzip: +(gzipSync(body).length / 1e6).toFixed(3),
		encodageServeur: r.headers.get('content-encoding') ?? 'aucun (décompressé par fetch)'
	});
	await new Promise((res) => setTimeout(res, 1000)); // une requête à la fois, avec une pause
}
writeFileSync('tests/fixtures/mesures.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
