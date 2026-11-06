import { describe, expect, it } from 'vitest';
import { lonLatToTile, stationTiles, tilesForBBox, tileUrl } from './tiles';

describe('tuiles IGN', () => {
	it('calcule la tuile Web Mercator d’un point (Ambérieu, zoom 19)', () => {
		// Référence : formule « slippy map » d'OpenStreetMap (asinh), calculée indépendamment.
		expect(lonLatToTile(5.359, 45.9572, 19)).toEqual({ x: 269948, y: 186611 });
	});
	it('couvre une emprise à tous les zooms demandés', () => {
		const t = tilesForBBox([5.339, 45.952, 5.345, 45.955], 18, 19);
		expect(new Set(t.map((x) => x.z))).toEqual(new Set([18, 19]));
		expect(t.length).toBeGreaterThan(10);
	});
	it('reste raisonnable pour une gare moyenne (< 400 tuiles, < 7 Mo)', () => {
		const t = stationTiles([5.3393, 45.9529, 5.3442, 45.9548]);
		expect(t.length).toBeLessThan(400);
		expect(t.length * 16_000).toBeLessThan(7_000_000);
	});
	it('fabrique l’URL WMTS', () => {
		expect(tileUrl(19, 1, 2)).toContain('TILEMATRIX=19&TILEROW=2&TILECOL=1');
	});
});
