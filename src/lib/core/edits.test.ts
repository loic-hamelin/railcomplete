import { describe, expect, it } from 'vitest';
import {
	applyEdits,
	bearingName,
	checkSign,
	cleanTrackRef,
	joinRefs,
	signSummary,
	signTags,
	snapToTracks,
	type Edit
} from './edits';
import type { OsmElement, OsmNode, OsmWay } from './osm';

const n = (id: number, lon: number, lat: number, tags?: Record<string, string>): OsmNode => ({
	type: 'node',
	id,
	lon,
	lat,
	tags
});
// Voie est-ouest de 100 m environ à la latitude 46°
const way: OsmWay = { type: 'way', id: 10, nodes: [1, 2, 3], tags: { railway: 'rail' } };
const elements: OsmElement[] = [n(1, 5.0, 46.0), n(2, 5.0006, 46.0), n(3, 5.0013, 46.0), way];

describe('applyEdits', () => {
	it('change et retire des tags sans toucher à l’original', () => {
		const ed: Edit = {
			kind: 'tags',
			id: 'a',
			station: 's',
			createdAt: 0,
			target: 'way/10',
			tags: { 'railway:track_ref': '3', railway: 'rail', note: null },
			summary: 'Voie 3'
		};
		const out = applyEdits(elements, [ed]);
		expect((out.find((e) => e.id === 10) as OsmWay).tags?.['railway:track_ref']).toBe('3');
		expect(way.tags?.['railway:track_ref']).toBeUndefined();
	});

	it('insère une pancarte dans le way, après le bon nœud', () => {
		const ed: Edit = {
			kind: 'node',
			id: 'b',
			station: 's',
			createdAt: 0,
			tempId: -1,
			lon: 5.0003,
			lat: 46.0,
			way: 10,
			after: 0,
			tags: { railway: 'signal' },
			summary: 'TT'
		};
		const out = applyEdits(elements, [ed]);
		expect((out.find((e) => e.id === 10) as OsmWay).nodes).toEqual([1, -1, 2, 3]);
		expect(out.find((e) => e.id === -1)?.type).toBe('node');
	});
});

describe('snapToTracks', () => {
	const nodeOf = (id: number) => elements.find((e) => e.type === 'node' && e.id === id) as OsmNode;
	it('accroche un point à 2 m de la voie et donne le cap', () => {
		const s = snapToTracks(5.0009, 46.000018, [way], nodeOf);
		expect(s?.way).toBe(10);
		expect(s?.after).toBe(1);
		expect(s!.distM).toBeGreaterThan(1.5);
		expect(s!.distM).toBeLessThan(2.5);
		expect(Math.round(s!.bearing)).toBe(90);
		expect(bearingName(s!.bearing)).toBe('est');
	});
	it('n’accroche pas au-delà de 3 m', () => {
		expect(snapToTracks(5.0009, 46.0001, [way], nodeOf)).toBeUndefined();
	});
});

describe('numéros', () => {
	it('nettoie les numéros de voie', () => {
		expect(cleanTrackRef(' Voie 3 ')).toBe('3');
		expect(cleanTrackRef('V1bis')).toBe('1bis');
		expect(joinRefs(['2', 'Voie 1', '2', '10'])).toBe('1;2;10');
	});
});

describe('pancartes (schéma FR:passenger_stop)', () => {
	const base = { direction: 'forward', position: 'right' } as const;
	it('6 V', () => {
		const t = signTags({ ...base, type: 'nV', number: '6' });
		expect(t).toMatchObject({
			railway: 'signal',
			'railway:signal:stop': 'FR:passenger_stop',
			'railway:signal:stop:conventional': 'FR:vehicle_number',
			'railway:signal:stop:conventional:form': 'sign',
			'railway:signal:stop:conventional:for': 'vehicles',
			'railway:signal:stop:conventional:number': '6',
			'railway:signal:direction': 'forward',
			'railway:signal:position': 'right'
		});
		expect(signSummary({ ...base, type: 'nV', number: '6' })).toBe('6 V');
	});
	it('TGV 2D avec rebroussement', () => {
		const t = signTags({
			...base,
			type: 'TGV',
			unit: 'multiple_unit',
			duplex: true,
			reversal: true
		});
		expect(t['railway:signal:stop:highspeed']).toBe('FR:TGV');
		expect(t['railway:signal:stop:highspeed:for']).toBe('multiple_unit');
		expect(t['railway:signal:stop:highspeed:type']).toBe('duplex');
		expect(t['railway:signal:stop:highspeed:reversal']).toBe('yes');
	});
	it('TGV 1-2 : pas de clé for', () => {
		const t = signTags({ ...base, type: 'TGV' });
		expect(t['railway:signal:stop:highspeed:for']).toBeUndefined();
		expect(signSummary({ ...base, type: 'TGV' })).toBe('TGV 1-2');
	});
	it('contrôles de saisie', () => {
		expect(checkSign({ type: 'nV', number: '' })).toMatch(/nombre de véhicules/);
		expect(checkSign({ type: 'TT' })).toMatch(/sens/);
		expect(checkSign({ type: 'TT', direction: 'forward', position: 'left' })).toBeUndefined();
	});
});
