// Construction de l'index des gares par pays (lot P1), sur un petit extrait de fixture
// (tests/fixtures/rail-mini.geojsonseq) : aucun téléchargement, aucun géocodage.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COUNTRIES } from '../src/lib/core/countries';
import { build, read } from './build-stations.mjs';
import { matrix, problems } from './countries.mjs';

const FIXTURE = 'tests/fixtures/rail-mini.geojsonseq';

type Row = [string, string, string, string, string, string, number, number, 'S' | 'H', number[]];

describe('index des gares : construction', () => {
	it('sélectionne, dédoublonne et décrit les gares (France)', async () => {
		const data = await read(FIXTURE, COUNTRIES.fr);
		const { index, stats } = build(data, {});
		const rows = index as Row[];
		// Métro et train touristique exclus ; la gare en double (way) cède la place au nœud.
		expect(rows.map((r) => r[1])).toEqual(['Gare d’Essai', 'Gare Lointaine', 'Halte du Sud']);
		const gare = rows[0];
		expect(gare.slice(0, 9)).toEqual([
			'n1',
			'Gare d’Essai',
			'gare d essai',
			'Essaiville', // addr:city, faute de géocodage
			'', // subdivision inconnue sans géocodage
			'87000001',
			46,
			5,
			'S'
		]);
		expect(rows[2][8]).toBe('H');
		// Emprise : le quai voisin plus la marge.
		const [w, s, e, n] = gare[9];
		expect(w).toBeLessThan(4.9996);
		expect(e).toBeGreaterThan(5.0004);
		expect(s).toBeLessThan(46);
		expect(n).toBeGreaterThan(46.0003);
		expect(stats.platforms).toBe(1);
		expect(stats.withoutPlatform).toBe(2);
		// Ancienne pancarte selon le schéma du pays : FR:ARRET_* oui, FR:ARRET seul non.
		expect(stats.legacySignStations).toBe(1);
		expect(stats.legacySignSample).toEqual(['Gare d’Essai']);
	});

	it('sans schéma de pancartes, aucune ancienne pancarte n’est comptée', async () => {
		const data = await read(FIXTURE, COUNTRIES.ch);
		expect(data.legacy).toEqual([]);
		expect(build(data, {}).index).toHaveLength(3);
	});

	it('en ligne de commande : fichiers du pays, contrôle de l’emprise', () => {
		const dir = mkdtempSync(join(tmpdir(), 'rc-index-'));
		const out = join(dir, 'stations.json');
		const stats = join(dir, 'stats.json');
		execFileSync(
			'node',
			[
				'scripts/build-stations.mjs',
				FIXTURE,
				'--country',
				'fr',
				'--offline',
				'--out',
				out,
				'--stats',
				stats,
				'--communes',
				join(dir, 'communes.json')
			],
			{ stdio: 'pipe' }
		);
		const json = JSON.parse(readFileSync(out, 'utf8'));
		expect(Object.keys(json)).toEqual(['v', 'attribution', 's']);
		expect(json.s).toHaveLength(3);
		const st = JSON.parse(readFileSync(stats, 'utf8'));
		expect(st.outsideBounds).toBe(1);
		expect(st.outsideBoundsSample).toEqual(['Gare Lointaine']);
	});

	it('refuse un pays inconnu', () => {
		const r = spawnSync('node', ['scripts/build-stations.mjs', FIXTURE, '--country', 'zz'], {
			encoding: 'utf8'
		});
		expect(r.status).toBe(2);
		expect(r.stderr).toMatch(/--country fr\|ch/);
	});
});

describe('pays activés pour la CI', () => {
	it('une entrée de matrice par pays activé (France seule)', () => {
		expect(matrix()).toEqual([
			{
				code: 'fr',
				geofabrik: 'europe/france',
				file: 'static/data/stations-fr.json',
				cache: 'data/communes-cache.json',
				stats: 'data/stations-stats.json'
			}
		]);
		expect(problems()).toEqual([]);
	});
	it('un pays précis sur demande, seulement si son extrait Geofabrik est connu', () => {
		expect(matrix(['fr']).map((c) => c.code)).toEqual(['fr']);
		expect(() => matrix(['ch'])).toThrow(/Geofabrik/);
		expect(() => matrix(['zz'])).toThrow(/inconnu/);
	});
});
