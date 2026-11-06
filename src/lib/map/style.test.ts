import { describe, expect, it } from 'vitest';
import { W, alongLine, placeLabels, plus, visiblePart } from './style';

const view = { w: 400, h: 800 };

describe('étiquettes de carte : évitement des collisions', () => {
	it('place la première position libre et masque ce qui ne tient pas', () => {
		const at = (x: number, y: number) => ({ w: 30, h: 18, points: [{ x, y }] });
		// La 2e étiquette chevauche la 1re ; la 3e est trop près du bord ; la 4e est libre.
		expect(placeLabels([at(100, 100), at(110, 105), at(5, 300), at(200, 300)], view, [])).toEqual([
			0, -1, -1, 0
		]);
	});

	it('essaie les positions suivantes le long de l’objet', () => {
		const first = { w: 30, h: 18, points: [{ x: 100, y: 100 }] };
		const second = {
			w: 30,
			h: 18,
			points: [
				{ x: 100, y: 100 },
				{ x: 180, y: 100 }
			]
		};
		expect(placeLabels([first, second], view, [])).toEqual([0, 1]);
	});

	it('évite les contrôles flottants posés sur la carte', () => {
		const bar = { x: 0, y: 0, w: 400, h: 130 };
		expect(placeLabels([{ w: 30, h: 18, points: [{ x: 200, y: 60 }] }], view, [bar])).toEqual([-1]);
	});
});

describe('géométrie à l’écran', () => {
	it('garde la partie visible d’une ligne', () => {
		const part = visiblePart(
			[
				{ x: -100, y: 400 },
				{ x: 500, y: 400 }
			],
			view
		);
		expect(part).toEqual([
			{ x: 0, y: 400 },
			{ x: 400, y: 400 }
		]);
	});

	it('donne des points aux fractions de la longueur', () => {
		const pts = alongLine(
			[
				{ x: 0, y: 0 },
				{ x: 100, y: 0 },
				{ x: 100, y: 100 }
			],
			[0.25, 0.75]
		);
		expect(pts).toEqual([
			{ x: 50, y: 0 },
			{ x: 100, y: 50 }
		]);
	});

	it('épaisseurs interpolées selon le zoom', () => {
		expect(W(plus([[15, 1]], 1.5))).toEqual(['interpolate', ['linear'], ['zoom'], 15, 2.5]);
	});
});
