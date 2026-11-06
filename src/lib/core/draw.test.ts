import { describe, expect, it } from 'vitest';
import { LocalProjection } from './geo';
import { checkShape, snapToEdge, type LonLat } from './draw';
import type { OsmNode, OsmWay } from './osm';

// Repère local en mètres autour de (5 E, 46 N) : x vers l'est, y vers le nord.
const proj = new LocalProjection(5, 46);
const ll = (x: number, y: number): LonLat => proj.unproject({ x, y });
const P = (x: number, y: number) => ll(x, y);

// Voie est-ouest sur y = 0, de x = -200 à x = 200.
const nodes: OsmNode[] = [
	{ type: 'node', id: 1, lon: ll(-200, 0)[0], lat: ll(-200, 0)[1] },
	{ type: 'node', id: 2, lon: ll(200, 0)[0], lat: ll(200, 0)[1] }
];
const track: OsmWay = { type: 'way', id: 10, nodes: [1, 2], tags: { railway: 'rail' } };
const nodeOf = (id: number) => nodes.find((n) => n.id === id);
const trackLine: LonLat[] = [ll(-200, 0), ll(200, 0)];

describe('accrochage parallèle', () => {
	it('ramène un point posé à 3 m de l’axe sur le bord, à 1,5 m, du même côté', () => {
		const s = snapToEdge(P(10, 3), [track], nodeOf)!;
		const q = proj.project(s.point[0], s.point[1]);
		expect(q.x).toBeCloseTo(10, 1);
		expect(q.y).toBeCloseTo(1.5, 1);
		expect(s.fromAxisM).toBeCloseTo(3, 1);
		const below = proj.project(
			...(snapToEdge(P(10, -2), [track], nodeOf)!.point as [number, number])
		);
		expect(below.y).toBeCloseTo(-1.5, 1);
	});
	it('n’accroche pas au-delà de 4 m', () => {
		expect(snapToEdge(P(10, 6), [track], nodeOf)).toBeUndefined();
	});
});

describe('contrôle de la forme', () => {
	const quai = [P(-60, 1.5), P(60, 1.5), P(60, 8.5), P(-60, 8.5)];
	it('accepte un quai de 120 m le long de la voie', () => {
		const c = checkShape(quai, [trackLine], []);
		expect(c.errors).toEqual([]);
		expect(Math.round(c.lengthM)).toBe(120);
		expect(c.sidesM.map(Math.round)).toEqual([120, 7, 120, 7]);
	});
	it('refuse moins de 3 points, un nœud papillon, trop court ou trop long', () => {
		expect(checkShape(quai.slice(0, 2), [], []).errors[0]).toMatch(/3 points/);
		expect(checkShape([P(0, 2), P(50, 9), P(50, 2), P(0, 9)], [], []).errors.join()).toMatch(
			/croisent/
		);
		expect(checkShape([P(0, 2), P(10, 2), P(10, 8)], [], []).errors.join()).toMatch(/trop court/);
		expect(checkShape([P(0, 2), P(900, 2), P(900, 8), P(0, 8)], [], []).errors.join()).toMatch(
			/trop long/
		);
	});
	it('refuse un quai qui croise la voie', () => {
		const c = checkShape([P(-60, -3), P(60, -3), P(60, 8), P(-60, 8)], [trackLine], []);
		expect(c.errors.join()).toMatch(/croise une voie/);
	});
	it('refuse un quai qui chevauche un quai existant', () => {
		const existing = [P(40, 3), P(100, 3), P(100, 6), P(40, 6)];
		expect(checkShape(quai, [trackLine], [existing]).errors.join()).toMatch(/chevauche/);
	});
});
