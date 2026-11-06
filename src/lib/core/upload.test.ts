import { describe, expect, it } from 'vitest';
import type { Edit } from './edits';
import type { OsmElement } from './osm';
import {
	changesetTags,
	changesetXml,
	conflictTarget,
	elementsToFetch,
	osmChangeXml,
	parseDiffResult,
	planUpload
} from './upload';

const way = (
	version: number,
	nodes: number[],
	tags: Record<string, string> = { railway: 'rail' }
) => ({ type: 'way', id: 10, version, nodes, tags }) as OsmElement;

const tagEdit = (over: Partial<Edit> = {}): Edit =>
	({
		kind: 'tags',
		id: 't1',
		station: 's',
		createdAt: 0,
		target: 'way/10',
		version: 3,
		base: { 'railway:track_ref': null },
		tags: { 'railway:track_ref': '2' },
		summary: 'Voie 2',
		...over
	}) as Edit;

const nodeEdit: Edit = {
	kind: 'node',
	id: 'n1',
	station: 's',
	createdAt: 0,
	tempId: -1,
	lon: 5.1,
	lat: 46.1,
	way: 10,
	wayVersion: 3,
	after: 1,
	afterNode: 2,
	tags: { railway: 'signal', 'railway:signal:stop': 'FR:passenger_stop' },
	summary: 'TT'
};

describe('planUpload', () => {
	it('applique les tags sur la version à jour', () => {
		const p = planUpload([tagEdit()], [way(3, [1, 2, 3])]);
		expect(p.sent).toEqual(['t1']);
		expect(p.modify[0].tags?.['railway:track_ref']).toBe('2');
	});

	it('accepte une version plus récente si nos tags n’ont pas bougé', () => {
		const p = planUpload([tagEdit()], [way(5, [1, 2, 3], { railway: 'rail', maxspeed: '60' })]);
		expect(p.conflicts).toEqual([]);
		expect(p.modify[0].tags).toMatchObject({ maxspeed: '60', 'railway:track_ref': '2' });
	});

	it('écarte la saisie si quelqu’un a changé le même tag entre-temps', () => {
		const p = planUpload(
			[tagEdit()],
			[way(4, [1, 2, 3], { railway: 'rail', 'railway:track_ref': '3' })]
		);
		expect(p.sent).toEqual([]);
		expect(p.conflicts[0].reason).toMatch(/quelqu’un d’autre/);
	});

	it('insère la pancarte après son nœud voisin, même si la voie a changé', () => {
		const p = planUpload([nodeEdit], [way(4, [1, 7, 2, 3])]);
		expect(p.create).toHaveLength(1);
		expect((p.modify[0] as { nodes: number[] }).nodes).toEqual([1, 7, 2, -1, 3]);
	});

	it('écarte la pancarte si le nœud voisin a disparu', () => {
		const p = planUpload([nodeEdit], [way(4, [1, 3])]);
		expect(p.conflicts[0].reason).toMatch(/redessinée/);
	});

	it('cumule tag et pancarte sur la même voie en une seule modification', () => {
		const p = planUpload([tagEdit(), nodeEdit], [way(3, [1, 2, 3])]);
		expect(p.modify).toHaveLength(1);
		expect(p.sent.sort()).toEqual(['n1', 't1']);
	});
});

describe('XML', () => {
	it('osmChange : création avant modification, versions, échappement', () => {
		const p = planUpload(
			[tagEdit({ tags: { note: 'a "b" & <c>' } as never, base: {} })],
			[way(3, [1, 2])]
		);
		const xml = osmChangeXml(42, { create: [], modify: p.modify });
		expect(xml).toContain('<way id="10" version="3" changeset="42">');
		expect(xml).toContain('<nd ref="1"/><nd ref="2"/>');
		expect(xml).toContain('v="a &quot;b&quot; &amp; &lt;c&gt;"');
		const withNode = osmChangeXml(42, planUpload([nodeEdit], [way(3, [1, 2, 3])]));
		expect(withNode.indexOf('<create>')).toBeLessThan(withNode.indexOf('<modify>'));
		expect(withNode).toContain('<node id="-1" changeset="42" lat="46.1000000" lon="5.1000000">');
	});

	it('changeset : tags de la gare', () => {
		const t = changesetTags({ comment: 'Gare X', version: '0.3', survey: true, imagery: true });
		expect(changesetXml(t)).toContain('<tag k="created_by" v="railcomplete 0.3"/>');
		expect(t).toMatchObject({
			source: 'survey',
			imagery_used: 'BDOrtho IGN',
			hashtags: '#railcomplete'
		});
	});

	it('diffResult et message de conflit', () => {
		const d = parseDiffResult(
			'<diffResult><node old_id="-1" new_id="99" new_version="1"/><way old_id="10" new_id="10" new_version="4"/></diffResult>'
		);
		expect(d.get('node/-1')).toEqual({ newId: 99, version: 1 });
		expect(conflictTarget('Version mismatch: Provided 3, server had: 4 of Way 10')).toBe('way/10');
	});

	it('liste des objets à relire', () => {
		expect(elementsToFetch([tagEdit(), nodeEdit])).toEqual({
			nodes: [],
			ways: [10],
			relations: []
		});
	});
});
