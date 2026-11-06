// Lot 7 : modifier la forme d'un quai existant, le redessiner en surface, le supprimer.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkShape, type LonLat } from './draw';
import {
	applyEdits,
	mergeEdit,
	type DeleteEdit,
	type Edit,
	type OrigNode,
	type ShapeEdit
} from './edits';
import { LocalProjection } from './geo';
import { OsmData, isPlatform, isRail, type OsmElement, type OsmNode, type OsmWay } from './osm';
import {
	COMPLEX,
	checkLocks,
	deleteSummary,
	platformShape,
	relationsPhrase,
	shapeDiff,
	shapeSummary
} from './shape';
import { osmChangeXml, parseDiffResult, planUpload, proposedComment, usageToCheck } from './upload';

// Repère local en mètres autour de (5 E, 46 N).
const proj = new LocalProjection(5, 46);
const ll = (x: number, y: number) => proj.unproject({ x, y });
const node = (id: number, x: number, y: number, extra: Partial<OsmNode> = {}): OsmNode => {
	const [lon, lat] = ll(x, y);
	return { type: 'node', id, lon, lat, version: 1, ...extra };
};
const PLATFORM = { railway: 'platform', public_transport: 'platform', train: 'yes', ref: 'A' };

// Quai 100 : rectangle 1-2-3-4 de 80 m × 6 m ; le nœud 4 est partagé avec un chemin (way 300).
const base = (): OsmElement[] => [
	node(1, 0, 2),
	node(2, 80, 2),
	node(3, 80, 8),
	node(4, 0, 8),
	node(9, -20, 8),
	{ type: 'way', id: 100, version: 5, nodes: [1, 2, 3, 4, 1], tags: { ...PLATFORM } },
	{ type: 'way', id: 300, version: 2, nodes: [9, 4], tags: { highway: 'footway' } }
];

const orig = (els: OsmElement[], wayId = 100): OrigNode[] =>
	platformShape(new OsmData(els), wayId)!.nodes;

const shape = (els: OsmElement[], nodes: ShapeEdit['nodes'], over: Partial<ShapeEdit> = {}) =>
	({
		kind: 'shape',
		id: 's1',
		station: 's',
		createdAt: 0,
		target: 'way/100',
		version: 5,
		mode: 'reshape',
		before: orig(els),
		nodes,
		name: 'Quai A',
		shapeSummary: 'Quai A : forme modifiée',
		summary: 'Quai A : forme modifiée',
		...over
	}) as ShapeEdit;

const at = (id: number, x: number, y: number) => {
	const [lon, lat] = ll(x, y);
	return { id, lon, lat };
};
const keep = (els: OsmElement[], id: number) => {
	const n = els.find((e) => e.type === 'node' && e.id === id) as OsmNode;
	return { id, lon: n.lon, lat: n.lat };
};

describe('verrouillage des nœuds', () => {
	it('verrouille un nœud partagé, tagué ou membre d’une relation', () => {
		const els = base();
		(els[1] as OsmNode).tags = { entrance: 'yes' };
		els.push({
			type: 'relation',
			id: 500,
			version: 1,
			members: [{ type: 'node', ref: 3, role: '' }],
			tags: { type: 'site' }
		});
		expect(orig(els).map((n) => [n.id, n.locked])).toEqual([
			[1, false],
			[2, true],
			[3, true],
			[4, true]
		]);
	});

	it('refuse un quai en multipolygone et une relation qui deviendrait vide', () => {
		const els = base();
		els.push({
			type: 'relation',
			id: 600,
			members: [{ type: 'way', ref: 100, role: 'outer' }],
			tags: { type: 'multipolygon' }
		});
		const s = platformShape(new OsmData(els), 100)!;
		expect(s.refused).toBe(COMPLEX);
		expect(s.deleteRefused).toMatch(/seul membre/);
	});

	it('contrôle les nœuds verrouillés d’un nouveau contour', () => {
		const els = base();
		const before = orig(els);
		const moved4 = [keep(els, 1), keep(els, 2), keep(els, 3), at(4, 0, 9)];
		expect(checkLocks(before, moved4, 'reshape')).toMatch(/déplacé/);
		expect(checkLocks(before, [keep(els, 1), keep(els, 2), keep(els, 3)], 'reshape')).toMatch(
			/Le point 4 est relié/
		);
		expect(checkLocks(before, [at(-1, 0, 0), keep(els, 2), keep(els, 3)], 'area')).toMatch(
			/doit faire partie du contour/
		);
		expect(
			checkLocks(
				before,
				[keep(els, 1), at(-1, 40, 1.5), keep(els, 2), keep(els, 3), keep(els, 4)],
				'reshape'
			)
		).toBeUndefined();
	});
});

describe('application locale (carte)', () => {
	it('montre la nouvelle forme du quai, même identifiant, tags fusionnés', () => {
		const els = base();
		const ed = shape(
			els,
			[at(1, 0, 1.5), at(-1, 40, 1.5), keep(els, 2), keep(els, 3), keep(els, 4)],
			{
				tags: { ref: 'A;B' }
			}
		);
		const out = new OsmData(applyEdits(els, [ed]));
		expect(out.ways.get(100)!.nodes).toEqual([1, -1, 2, 3, 4, 1]);
		expect(out.ways.get(100)!.tags?.ref).toBe('A;B');
		expect(out.nodes.get(1)!.lat).toBeCloseTo(ll(0, 1.5)[1], 9);
		expect(out.nodes.get(-1)).toBeDefined();
		// L'original n'est pas modifié
		expect((els[5] as OsmWay).nodes).toEqual([1, 2, 3, 4, 1]);
	});

	it('fait disparaître un quai supprimé, et le retire de sa zone d’arrêt', () => {
		const els = base();
		els.push({
			type: 'relation',
			id: 700,
			members: [
				{ type: 'way', ref: 100, role: 'platform' },
				{ type: 'node', ref: 9, role: 'stop' }
			],
			tags: { public_transport: 'stop_area', name: 'Gare X' }
		});
		const del = { kind: 'delete', target: 'way/100' } as unknown as DeleteEdit;
		const out = new OsmData(applyEdits(els, [del]));
		expect(out.ways.has(100)).toBe(false);
		expect(out.relations.get(700)!.members).toHaveLength(1);
	});
});

describe('fusion des saisies sur un même quai', () => {
	const els = base();
	const tags: Edit = {
		kind: 'tags',
		id: 't1',
		station: 's',
		createdAt: 0,
		target: 'way/100',
		version: 5,
		tags: { ref: '1;2' },
		base: { ref: 'A' },
		summary: 'Quai : voies 1, 2'
	};
	const sh = shape(els, [at(1, 0, 1.5), keep(els, 2), keep(els, 3), keep(els, 4)], {
		shapeSummary: 'Quai A : forme modifiée (4 → 4 points)',
		summary: 'Quai A : forme modifiée (4 → 4 points)'
	});

	it('une forme absorbe les tags déjà saisis sur le quai', () => {
		const m = mergeEdit([tags], sh);
		expect(m.drop).toEqual(['t1']);
		expect(m.edit).toMatchObject({
			kind: 'shape',
			tags: { ref: '1;2' },
			summary: 'Quai A : forme modifiée (4 → 4 points) ; Quai : voies 1, 2'
		});
	});

	it('des tags saisis après la forme rejoignent la même saisie', () => {
		const m = mergeEdit([sh], tags);
		expect(m.edit?.kind).toBe('shape');
		expect(m.edit?.id).toBe('s1');
		expect((m.edit as ShapeEdit).tags).toEqual({ ref: '1;2' });
	});

	it('une suppression retire les autres saisies du quai ; des tags après elle sont refusés', () => {
		const d = { kind: 'delete', id: 'd1', target: 'way/100' } as unknown as Edit;
		expect(mergeEdit([tags, sh], d).drop).toEqual(['t1', 's1']);
		expect(() => mergeEdit([d], tags)).toThrow(/supprimer/);
	});
});

describe('envoi d’une forme modifiée', () => {
	it('déplace, ajoute et supprime des nœuds libres ; garde le nœud partagé', () => {
		const els = base();
		// 1 déplacé, -1 ajouté, 2 retiré (orphelin → supprimé), 4 (partagé) inchangé
		const ed = shape(els, [at(1, 0, 1.5), at(-1, 40, 1.5), keep(els, 3), keep(els, 4)]);
		expect(shapeDiff(ed.before, ed.nodes).removed.map((n) => n.id)).toEqual([2]);
		const plan = planUpload([ed], els);
		expect(plan.conflicts).toEqual([]);
		expect(plan.create.map((e) => e.id)).toEqual([-1]);
		expect(plan.modify.map((e) => `${e.type}/${e.id}`).sort()).toEqual(['node/1', 'way/100']);
		expect(plan.delete.map((e) => `${e.type}/${e.id}`)).toEqual(['node/2']);
		const xml = osmChangeXml(42, plan);
		expect(xml).toMatch(/<create><node id="-1" changeset="42"/);
		expect(xml).toContain(
			'<way id="100" version="5" changeset="42"><nd ref="1"/><nd ref="-1"/><nd ref="3"/><nd ref="4"/><nd ref="1"/>'
		);
		expect(xml).toContain(
			`<node id="1" version="1" changeset="42" lat="${ll(0, 1.5)[1].toFixed(7)}"`
		);
		expect(xml).toMatch(/<delete><node id="2" version="1" changeset="42"/);
		expect(xml.indexOf('<create>')).toBeLessThan(xml.indexOf('<modify>'));
		expect(xml.indexOf('<modify>')).toBeLessThan(xml.indexOf('<delete>'));
		expect(plan.touched.s1).toEqual(['way/100', 'node/1', 'node/2']);
	});

	it('un nœud retiré déjà relié à la saisie est seulement retiré du way', () => {
		const els = base();
		const ed = shape(els, [keep(els, 1), keep(els, 2), keep(els, 3), at(-1, 0, 6)]);
		const plan = planUpload([ed], els);
		expect(plan.conflicts).toEqual([]);
		expect(plan.delete).toEqual([]);
		expect((plan.modify.find((e) => e.id === 100) as OsmWay).nodes).toEqual([1, 2, 3, -1, 1]);
	});

	it('remplace une ligne par une surface : même way, fermé, area=yes, autres tags gardés', () => {
		const els: OsmElement[] = [
			node(1, 0, 3),
			node(2, 40, 3, { tags: { highway: 'elevator' } }),
			node(3, 80, 3),
			{ type: 'way', id: 100, version: 5, nodes: [1, 2, 3], tags: { ...PLATFORM, name: 'Quai 1' } }
		];
		const ed = shape(
			els,
			[at(-1, 0, 2), keep(els, 2), at(-2, 80, 2), at(-3, 80, 8), at(-4, 0, 8)],
			{
				mode: 'area'
			}
		);
		expect(checkLocks(ed.before, ed.nodes, 'area')).toBeUndefined();
		const plan = planUpload([ed], els);
		expect(plan.conflicts).toEqual([]);
		const w = plan.modify.find((e) => e.type === 'way') as OsmWay;
		expect(w.id).toBe(100);
		expect(w.nodes).toEqual([-1, 2, -2, -3, -4, -1]);
		expect(w.tags).toMatchObject({ ...PLATFORM, name: 'Quai 1', area: 'yes' });
		expect(plan.delete.map((e) => e.id).sort()).toEqual([1, 3]);
		expect(osmChangeXml(1, plan)).toContain('<tag k="area" v="yes"/>');
	});

	it('fusionne tags et forme dans une seule modification du way', () => {
		const els = base();
		const ed = shape(els, [at(1, 0, 1.5), keep(els, 2), keep(els, 3), keep(els, 4)], {
			tags: { ref: '1;2', check_date: '2026-11-06' }
		});
		const plan = planUpload([ed], els);
		const ways = plan.modify.filter((e) => e.type === 'way');
		expect(ways).toHaveLength(1);
		expect(ways[0].tags).toMatchObject({ ref: '1;2', check_date: '2026-11-06', train: 'yes' });
	});

	it('à revoir si la version du quai a changé', () => {
		const els = base();
		(els[5] as OsmWay).version = 6;
		const plan = planUpload(
			[shape(els, [at(1, 0, 1.5), keep(els, 2), keep(els, 3), keep(els, 4)])],
			els
		);
		expect(plan.sent).toEqual([]);
		expect(plan.conflicts[0].reason).toMatch(/modifié entre-temps/);
	});

	it('à revoir si un nœud déplacé est devenu partagé ou a changé de version', () => {
		const els = base();
		const ed = shape(els, [at(1, 0, 1.5), keep(els, 2), keep(els, 3), keep(els, 4)]);
		const shared = [...els, { type: 'way', id: 301, nodes: [9, 1], tags: { highway: 'footway' } }];
		expect(planUpload([ed], shared as OsmElement[]).conflicts[0].reason).toMatch(/relié/);
		const bumped = base();
		(bumped[0] as OsmNode).version = 2;
		expect(planUpload([ed], bumped).conflicts).toHaveLength(1);
		// Nœud absent des données relues : on ne décide pas à l'aveugle
		expect(
			planUpload(
				[ed],
				base().filter((e) => e.id !== 1 || e.type !== 'node')
			).sent
		).toEqual([]);
	});

	it('à revoir si un nœud retiré est devenu tagué', () => {
		const els = base();
		const ed = shape(els, [keep(els, 1), keep(els, 3), keep(els, 4)]);
		(els[1] as OsmNode).tags = { barrier: 'gate' };
		expect(planUpload([ed], els).conflicts).toHaveLength(1);
	});

	it('refuse un quai devenu multipolygone', () => {
		const els = base();
		const ed = shape(els, [at(1, 0, 1.5), keep(els, 2), keep(els, 3), keep(els, 4)]);
		els.push({
			type: 'relation',
			id: 600,
			members: [{ type: 'way', ref: 100, role: 'outer' }],
			tags: { type: 'multipolygon' }
		});
		expect(planUpload([ed], els).conflicts[0].reason).toBe(COMPLEX);
	});
});

describe('envoi d’une suppression', () => {
	const stopArea = (): OsmElement => ({
		type: 'relation',
		id: 700,
		version: 3,
		members: [
			{ type: 'node', ref: 9, role: 'stop' },
			{ type: 'way', ref: 100, role: 'platform' }
		],
		tags: { type: 'public_transport', public_transport: 'stop_area', name: 'Gare X' }
	});
	const del = (els: OsmElement[]): DeleteEdit => {
		const s = platformShape(new OsmData(els), 100)!;
		return {
			kind: 'delete',
			id: 'd1',
			station: 's',
			createdAt: 0,
			target: 'way/100',
			version: 5,
			reason: 'duplicate',
			before: s.nodes,
			relations: s.relations,
			name: 'Quai A',
			summary: deleteSummary('Quai A', 'duplicate', s.relations)
		};
	};

	it('supprime le way et ses nœuds orphelins, et le retire de la zone d’arrêt', () => {
		const els = [...base(), stopArea()];
		const ed = del(els);
		expect(ed.summary).toBe('Quai A supprimé (en double) — retiré de la zone d’arrêt Gare X');
		const plan = planUpload([ed], els);
		expect(plan.conflicts).toEqual([]);
		expect(plan.modify.map((e) => `${e.type}/${e.id}`)).toEqual(['relation/700']);
		expect(plan.delete.map((e) => `${e.type}/${e.id}`)).toEqual([
			'way/100',
			'node/1',
			'node/2',
			'node/3'
		]);
		const xml = osmChangeXml(7, plan);
		expect(xml).toContain(
			'<modify><relation id="700" version="3" changeset="7"><member type="node" ref="9" role="stop"/>'
		);
		expect(xml).not.toMatch(/<member type="way" ref="100"/);
		expect(xml).toMatch(/<delete><way id="100" version="5" changeset="7">.*<node id="1" /);
		expect(xml).not.toMatch(/<node id="4"/); // partagé avec le chemin : conservé
		expect(proposedComment('Gare X', [ed])).toBe(
			'Gare de Gare X : Quai A supprimé (en double avec un autre quai)'
		);
	});

	it('refuse si la relation deviendrait vide, ou si le quai est un multipolygone', () => {
		const lone: OsmElement = {
			type: 'relation',
			id: 701,
			version: 1,
			members: [{ type: 'way', ref: 100, role: '' }],
			tags: { type: 'public_transport', public_transport: 'stop_area', name: 'Seul' }
		};
		const ed = del(base());
		expect(planUpload([ed], [...base(), lone]).conflicts[0].reason).toMatch(/Seul ne contiendrait/);
		const mp: OsmElement = {
			type: 'relation',
			id: 702,
			members: [
				{ type: 'way', ref: 100, role: 'outer' },
				{ type: 'way', ref: 300, role: 'inner' }
			],
			tags: { type: 'multipolygon' }
		};
		expect(planUpload([ed], [...base(), mp]).conflicts[0].reason).toBe(COMPLEX);
	});

	it('à revoir si un nœud libre est devenu partagé entre-temps', () => {
		const els = base();
		const ed = del(els);
		const fresh = [...els, { type: 'way', id: 302, nodes: [9, 2], tags: { highway: 'footway' } }];
		const plan = planUpload([ed], fresh as OsmElement[]);
		expect(plan.sent).toEqual([]);
		expect(plan.conflicts[0].reason).toMatch(/relié à un autre objet/);
	});

	it('résume les relations en clair', () => {
		expect(
			relationsPhrase([
				{ id: 1, kind: 'stop_area', name: 'Gare d’Ambérieu' },
				{ id: 2, kind: 'route', name: 'K13' },
				{ id: 3, kind: 'route', name: 'K1+' }
			])
		).toBe('retiré de la zone d’arrêt Gare d’Ambérieu et de 2 lignes');
		expect(shapeSummary('Quai B-C', 'reshape', 4, 6)).toBe(
			'Quai B-C : forme modifiée (4 → 6 points)'
		);
		expect(shapeSummary('Quai A', 'area', 3, 5)).toBe('Quai A redessiné en surface');
	});

	it('emprise de relecture : nœuds d’origine + 10 m', () => {
		const ed = del(base());
		const [u] = usageToCheck([ed]);
		expect(u.nodes).toEqual([1, 2, 3, 4]);
		expect(u.bbox[0]).toBeLessThan(ll(0, 0)[0]);
		expect(u.bbox[3]).toBeGreaterThan(ll(0, 8)[1]);
	});
});

describe('parseDiffResult avec suppressions', () => {
	it('distingue créés, modifiés et supprimés', () => {
		const d = parseDiffResult(
			'<diffResult version="0.6"><node old_id="-1" new_id="900" new_version="1"/><way old_id="100" new_id="100" new_version="6"/><node old_id="2"/><relation old_id="700" new_id="700" new_version="4"/></diffResult>'
		);
		expect(d.get('node/-1')).toEqual({ newId: 900, version: 1, deleted: false });
		expect(d.get('way/100')).toEqual({ newId: 100, version: 6, deleted: false });
		expect(d.get('node/2')).toEqual({ newId: undefined, version: undefined, deleted: true });
		expect(d.get('relation/700')?.version).toBe(4);
	});
});

describe('Ambérieu-en-Bugey (données réelles)', () => {
	const els = JSON.parse(readFileSync('tests/fixtures/amberieu-en-bugey.json', 'utf8'))
		.elements as OsmElement[];
	const data = new OsmData(els);

	it('quai A : contour accepté, nœuds reliés au bâtiment verrouillés, 3 relations', () => {
		const s = platformShape(data, 1357219270)!;
		expect(s.closed).toBe(true);
		expect(s.nodes).toHaveLength(26);
		expect(s.nodes.filter((n) => !n.locked).map((n) => s.nodes.indexOf(n) + 1)).toEqual([
			1, 2, 3, 4, 5, 6, 21, 23, 24, 25, 26
		]);
		expect(s.relations.map((r) => r.kind).sort()).toEqual(['route', 'route', 'stop_area']);
		expect(s.refused).toBeUndefined();
		const rails = [...data.ways.values()].filter((w) => isRail(w.tags)).map((w) => data.coords(w));
		const others = [...data.ways.values()]
			.filter((w) => isPlatform(w.tags) && w.id !== 1357219270)
			.map((w) => data.coords(w));
		expect(
			checkShape(
				s.nodes.map((n) => [n.lon, n.lat] as LonLat),
				rails,
				others
			).errors
		).toEqual([]);
	});

	it('quai D-E-F (multipolygone) : refusé', () => {
		expect(platformShape(data, 1429001835)!.refused).toBe(COMPLEX);
	});
});
