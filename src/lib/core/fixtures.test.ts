// Analyse des 5 gares de référence (réponses réelles de l'API OSM, tests/fixtures).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildFeatures } from './features';
import type { BBox, OsmElement } from './osm';
import { analyzeStation } from './quests';

const mesures = JSON.parse(readFileSync('tests/fixtures/mesures.json', 'utf8')) as {
	name: string;
	fichier: string;
	bbox: BBox;
}[];

function load(name: string) {
	const m = mesures.find((x) => x.name === name)!;
	const raw = JSON.parse(readFileSync(m.fichier, 'utf8'));
	const elements = (raw.elements ?? raw) as OsmElement[];
	const a = analyzeStation(elements, m.bbox, new Date('2026-11-05'));
	return { a, f: buildFeatures(elements, a, m.bbox) };
}

describe('gares de référence', () => {
	for (const m of mesures)
		it(`analyse ${m.name} sans erreur`, () => {
			const { a, f } = load(m.name);
			console.log(
				m.name,
				JSON.stringify({
					quais: a.platforms.length,
					voies: a.tracks.length,
					pancartes: a.stopSigns.length,
					completude: a.completeness,
					quetes: a.quests.reduce<Record<string, number>>(
						(s, q) => ((s[q.id] = (s[q.id] ?? 0) + 1), s),
						{}
					),
					objets: f.features.length
				})
			);
			expect(f.features.length).toBe(a.platforms.length + a.tracks.length + a.stopSigns.length);
		});
});
