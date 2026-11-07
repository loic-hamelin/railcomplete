// Lot 7d : suppression d'une pancarte d'arrêt existante, objets souterrains, accrochage à l'écran.
import { describe, expect, it } from 'vitest';
import {
	lostTracks,
	lostTracksMessage,
	metersPerPixel,
	ringTracks,
	snapNear,
	snapToEdge,
	type LonLat,
	type TrackLine
} from './draw';
import { applyEdits, mergeEdit, type Edit, type SignDeleteEdit } from './edits';
import { buildFeatures } from './features';
import { readFileSync } from 'node:fs';
import { OsmData, isUnderground, type OsmElement, type OsmNode, type OsmWay } from './osm';
import { analyzeStation } from './quests';
import { signDeleteSummary, signRemoval } from './sign';
import { elementsToFetch, osmChangeXml, planUpload, proposedComment, signsToCheck } from './upload';

// Voie est-ouest de 3 nœuds (100 m), pancarte insérée au milieu, alignée (écart 0).
const LAT = 45.95,
	LON = 5.35;
const dLon = (m: number) => m / (111_320 * Math.cos((LAT * Math.PI) / 180));
const dLat = (m: number) => m / 111_320;
const SIGN_TAGS = {
	railway: 'signal',
	'railway:signal:direction': 'forward',
	'railway:signal:position': 'right',
	'railway:signal:stop': 'FR:passenger_stop',
	'railway:signal:stop:highspeed': 'FR:TGV',
	'railway:signal:stop:highspeed:form': 'sign',
	check_date: '2026-01-01'
};
const node = (id: number, lonM: number, latM = 0, tags?: Record<string, string>): OsmNode => ({
	type: 'node',
	id,
	version: 2,
	lon: LON + dLon(lonM),
	lat: LAT + dLat(latM),
	...(tags ? { tags } : {})
});
const track = (nodes = [1, 5, 2], id = 10, version = 4): OsmWay => ({
	type: 'way',
	id,
	version,
	nodes,
	tags: { railway: 'rail' }
});
const world = (signLatM = 0, signTags: Record<string, string> = SIGN_TAGS): OsmElement[] => [
	node(1, 0),
	node(2, 100),
	node(5, 50, signLatM, signTags),
	track()
];
const lookup = (els: OsmElement[]) => {
	const m = new Map(els.map((e) => [`${e.type}/${e.id}`, e]));
	return (id: number) => m.get(`node/${id}`) as OsmNode | undefined;
};

describe('signRemoval : retirer le nœud ou seulement ses tags', () => {
	it('nœud aligné, une seule voie, tags de pancarte seuls, aucune relation : retiré', () => {
		const els = world();
		const r = signRemoval(els[2] as OsmNode, [track()], [], lookup(els));
		expect(r.mode).toBe('remove');
		expect(r.way).toBe(10);
		expect(r.wayVersion).toBe(4);
		expect(r.shiftM).toBeLessThan(0.01);
		expect(r.why).toEqual([]);
	});
	it('écart de 0,2 m : retiré ; écart de 0,5 m : tags retirés seulement', () => {
		let els = world(0.2);
		expect(signRemoval(els[2] as OsmNode, [track()], [], lookup(els)).mode).toBe('remove');
		els = world(0.5);
		const r = signRemoval(els[2] as OsmNode, [track()], [], lookup(els));
		expect(r.mode).toBe('untag');
		expect(r.shiftM).toBeCloseTo(0.5, 1);
		expect(r.why.join()).toContain('déplacerait la voie de 0,5 m');
		// Sans autre tag : tout ce qui appartient à la pancarte part (check_date compris)
		expect(r.untag.sort()).toEqual(Object.keys(SIGN_TAGS).sort());
	});
	it('nœud partagé avec une autre voie (aiguillage) : tags retirés seulement', () => {
		const els = world();
		const other: OsmWay = { ...track([5, 2], 11), tags: { railway: 'rail' } };
		const r = signRemoval(els[2] as OsmNode, [track(), other], [], lookup(els));
		expect(r.mode).toBe('untag');
		expect(r.why.join()).toContain('partagé');
	});
	it('tags en plus : nœud gardé, seul le signal est retiré (ref et autres conservés)', () => {
		const els = world(0, { ...SIGN_TAGS, ref: '12', 'railway:switch': 'default' });
		const r = signRemoval(els[2] as OsmNode, [track()], [], lookup(els));
		expect(r.mode).toBe('untag');
		expect(r.extra).toEqual(['railway:switch']);
		expect(r.untag).toContain('railway');
		expect(r.untag).toContain('railway:signal:stop');
		expect(r.untag).not.toContain('ref');
		expect(r.untag).not.toContain('check_date');
		expect(r.untag).not.toContain('railway:switch');
	});
	it('membre d’une relation : tags retirés seulement', () => {
		const els = world();
		const rel = {
			type: 'relation' as const,
			id: 7,
			members: [{ type: 'node' as const, ref: 5, role: 'stop' }]
		};
		const r = signRemoval(els[2] as OsmNode, [track()], [rel], lookup(els));
		expect(r.mode).toBe('untag');
		expect(r.why).toContain('membre d’une relation');
	});
	it('extrémité de la voie ou voisin absent : tags retirés seulement', () => {
		const els = world();
		const r = signRemoval(els[2] as OsmNode, [track([1, 2, 5])], [], lookup(els));
		expect(r.mode).toBe('untag');
		expect(r.why).toContain('extrémité de la voie');
		const missing = signRemoval(els[2] as OsmNode, [track([1, 5, 99])], [], lookup(els));
		expect(missing.mode).toBe('untag');
	});
	it('résumé lisible', () => {
		expect(signDeleteSummary('TGV 2', 'misplaced', 'remove')).toBe(
			'Pancarte « TGV 2 » supprimée (mal placée) — point retiré de la voie'
		);
		expect(signDeleteSummary('TT', 'gone', 'untag')).toBe(
			'Pancarte « TT » supprimée (n’existe plus) — point gardé dans la voie, tags retirés'
		);
	});
});

const signEdit = (over: Partial<SignDeleteEdit> = {}): SignDeleteEdit => ({
	kind: 'signdelete',
	id: 's1',
	station: 'st',
	createdAt: 0,
	target: 'node/5',
	version: 2,
	way: 10,
	wayVersion: 4,
	reason: 'duplicate',
	mode: 'remove',
	untag: [],
	label: 'TGV 1',
	summary: 'Pancarte « TGV 1 » supprimée (en double) — point retiré de la voie',
	...over
});

describe('planUpload : suppression d’une pancarte', () => {
	it('retire le nœud de la voie (modify way) puis le supprime', () => {
		const plan = planUpload([signEdit()], world());
		expect(plan.sent).toEqual(['s1']);
		expect(plan.conflicts).toEqual([]);
		expect(plan.modify).toHaveLength(1);
		expect((plan.modify[0] as OsmWay).nodes).toEqual([1, 2]);
		expect(plan.delete.map((e) => `${e.type}/${e.id}`)).toEqual(['node/5']);
		expect(plan.touched.s1).toEqual(['way/10', 'node/5']);
		const xml = osmChangeXml(99, plan);
		expect(xml).toContain(
			'<modify><way id="10" version="4" changeset="99"><nd ref="1"/><nd ref="2"/>'
		);
		expect(xml).toMatch(/<delete><node id="5" version="2" changeset="99"/);
		expect(xml.indexOf('</modify>')).toBeLessThan(xml.indexOf('<delete>'));
	});
	it('« untag » : seuls les tags de la pancarte partent, la voie n’est pas touchée', () => {
		const els = world(0, { ...SIGN_TAGS, ref: '3', operator: 'SNCF' });
		const plan = planUpload(
			[
				signEdit({
					mode: 'untag',
					untag: Object.keys(SIGN_TAGS).filter((k) => k !== 'check_date')
				})
			],
			els
		);
		expect(plan.modify).toHaveLength(1);
		const n = plan.modify[0] as OsmNode;
		expect(n.type).toBe('node');
		expect(n.tags).toEqual({ check_date: '2026-01-01', ref: '3', operator: 'SNCF' });
		expect(plan.delete).toEqual([]);
		expect(osmChangeXml(1, plan)).not.toContain('<way');
	});
	it('relecture : version du nœud ou de la voie changée → « à revoir »', () => {
		let els = world();
		(els[2] as OsmNode).version = 3;
		expect(planUpload([signEdit()], els).conflicts[0].reason).toContain('modifiée entre-temps');
		els = world();
		(els[3] as OsmWay).version = 5;
		expect(planUpload([signEdit()], els).conflicts[0].reason).toContain('modifiée entre-temps');
		// Nœud déjà supprimé, voie redessinée sans lui
		expect(planUpload([signEdit()], world().slice(0, 2)).conflicts).toHaveLength(1);
		els = world();
		(els[3] as OsmWay).nodes = [1, 2];
		expect(planUpload([signEdit({ wayVersion: undefined })], els).conflicts).toHaveLength(1);
	});
	it('relecture : annoncée « retirée de la voie », mais devenue partagée → « à revoir »', () => {
		const els = [...world(), { ...track([5, 2], 11), version: 1 }];
		const plan = planUpload([signEdit()], els);
		expect(plan.sent).toEqual([]);
		expect(plan.conflicts[0].reason).toContain('reliée à un autre objet');
		const rel: OsmElement = {
			type: 'relation',
			id: 7,
			version: 1,
			members: [{ type: 'node', ref: 5, role: '' }]
		};
		expect(planUpload([signEdit()], [...world(), rel]).conflicts).toHaveLength(1);
		// Annoncée « tags retirés » : toujours possible, même si le nœud est devenu libre
		const keep = planUpload([signEdit({ mode: 'untag', untag: ['railway'] })], [...world(), rel]);
		expect(keep.sent).toEqual(['s1']);
	});
	it('lectures prévues avant l’envoi, et commentaire du changeset', () => {
		expect(elementsToFetch([signEdit()]).nodes).toEqual([5]);
		expect(signsToCheck([signEdit()])).toEqual([{ node: 5, way: 10 }]);
		expect(proposedComment('Ambérieu', [signEdit({ reason: 'gone' })])).toBe(
			'Gare de Ambérieu : pancarte d’arrêt « TGV 1 » supprimée (n’existe plus)'
		);
		expect(proposedComment('X', [signEdit({ mode: 'untag' })])).toContain(
			'(en double, point gardé dans la voie)'
		);
	});
});

describe('saisies locales', () => {
	it('la suppression remplace les tags saisis sur la pancarte ; des tags ensuite sont refusés', () => {
		const tags: Edit = {
			kind: 'tags',
			id: 't1',
			station: 'st',
			createdAt: 0,
			target: 'node/5',
			tags: { ref: '2' },
			summary: 'Pancarte'
		};
		expect(mergeEdit([tags], signEdit()).drop).toEqual(['t1']);
		expect(() => mergeEdit([signEdit()], { ...tags, id: 't2' })).toThrow(/marquée à supprimer/);
	});
	it('applyEdits : la pancarte disparaît de la vue (nœud retiré ou tags retirés)', () => {
		const out = applyEdits(world(), [signEdit()]);
		expect(out.find((e) => e.type === 'node' && e.id === 5)).toBeUndefined();
		expect((out.find((e) => e.type === 'way') as OsmWay).nodes).toEqual([1, 2]);
		const kept = applyEdits(world(), [signEdit({ mode: 'untag', untag: ['railway'] })]);
		expect((kept.find((e) => e.id === 5) as OsmNode).tags?.railway).toBeUndefined();
	});
});

describe('objets souterrains', () => {
	it('isUnderground : tunnel, couche, location, niveau (premier de la liste)', () => {
		expect(isUnderground({ tunnel: 'yes' })).toBe(true);
		expect(isUnderground({ tunnel: 'building_passage' })).toBe(true);
		expect(isUnderground({ tunnel: 'culvert' })).toBe(false);
		expect(isUnderground({ layer: '-1' })).toBe(true);
		expect(isUnderground({ layer: '1' })).toBe(false);
		expect(isUnderground({ covered: 'yes', layer: '-2' })).toBe(true);
		expect(isUnderground({ covered: 'yes' })).toBe(false);
		expect(isUnderground({ location: 'underground' })).toBe(true);
		expect(isUnderground({ level: '-1' })).toBe(true);
		expect(isUnderground({ level: '-1;0' })).toBe(true);
		expect(isUnderground({ level: '0;-1' })).toBe(false);
		expect(isUnderground({ level: '0' })).toBe(false);
		expect(isUnderground({})).toBe(false);
	});
	it('buildFeatures : indicateur « under » sur les quais et les voies', () => {
		const bbox: [number, number, number, number] = [
			LON - dLon(50),
			LAT - dLat(50),
			LON + dLon(150),
			LAT + dLat(50)
		];
		const ring = [21, 22, 23, 24, 21];
		const els: OsmElement[] = [
			node(1, 0),
			node(2, 100),
			{ ...track([1, 2]), tags: { railway: 'rail', tunnel: 'yes', layer: '-1' } },
			node(21, 10, 3),
			node(22, 90, 3),
			node(23, 90, 8),
			node(24, 10, 8),
			{
				type: 'way',
				id: 30,
				nodes: ring,
				tags: { railway: 'platform', public_transport: 'platform', level: '-1', ref: '1' }
			}
		];
		const fc = buildFeatures(els, analyzeStation(els, bbox), bbox);
		const quai = fc.features.find((f) => f.properties.kind === 'quai')!;
		const voie = fc.features.find((f) => f.properties.kind === 'voie')!;
		expect(quai.properties.under).toBe(true);
		expect(voie.properties.under).toBe(true);
		const flat = els.map((e) =>
			e.type === 'way' ? { ...e, tags: { ...e.tags, level: '0', tunnel: 'no', layer: '0' } } : e
		);
		const fc2 = buildFeatures(flat, analyzeStation(flat, bbox), bbox);
		expect(fc2.features.some((f) => f.properties.under)).toBe(false);
	});
});

describe('accrochage limité à 12 px à l’écran', () => {
	it('metersPerPixel : MapLibre (512 px au zoom 0), selon le zoom et la latitude', () => {
		expect(metersPerPixel(0, 0)).toBeCloseTo(78_271.517, 2);
		expect(metersPerPixel(20, 0)).toBeCloseTo(0.0746, 4);
		expect(metersPerPixel(20, 60)).toBeCloseTo(0.0373, 4);
		expect(metersPerPixel(18, 46)).toBeCloseTo(4 * metersPerPixel(20, 46), 10);
	});
	it('snapNear : accroché seulement si le point accroché est à moins de 12 px de la croix', () => {
		const els = world();
		const nodeOf = lookup(els);
		// Croix à 3,5 m au nord de l'axe : bord à 1,5 m → 2 m d'écart.
		const p: LonLat = [LON + dLon(30), LAT + dLat(3.5)];
		expect(snapToEdge(p, [track()], nodeOf)).toBeDefined(); // ancienne règle : 4 m
		// z18 à 46° : 12 px ≈ 5 m → accroché ; z21 : 12 px ≈ 0,3 m → pas accroché
		expect(snapNear(p, [track()], nodeOf, 18)?.point[1]).toBeCloseTo(LAT + dLat(1.5), 7);
		expect(snapNear(p, [track()], nodeOf, 21)).toBeUndefined();
		// Croix à 1,6 m de l'axe (10 cm du bord) : accroché même zoomé
		expect(snapNear([LON + dLon(30), LAT + dLat(1.6)], [track()], nodeOf, 21)).toBeDefined();
		// Au-delà de 4 m de l'axe : jamais, quel que soit le zoom
		expect(snapNear([LON + dLon(30), LAT + dLat(4.5)], [track()], nodeOf, 15)).toBeUndefined();
	});
	it('snapNear : entre deux voies, le bord le plus proche de la croix', () => {
		const els: OsmElement[] = [
			...world(),
			node(31, 0, 5),
			node(32, 100, 5),
			{ ...track([31, 32], 12) }
		];
		const nodeOf = lookup(els);
		// Croix à 3,4 m de la voie sud (bord à 1,9 m), 1,6 m de la voie nord (bord à 0,1 m)
		const s = snapNear(
			[LON + dLon(30), LAT + dLat(3.4)],
			[track(), track([31, 32], 12)],
			nodeOf,
			20
		);
		expect(s?.way).toBe(12);
	});
});

describe('voies longées par le quai, avant et après une modification de forme', () => {
	// Voie est-ouest de 200 m ; quai de 100 m × 6 m dont le bord sud est à 2 m de l'axe.
	const ll = (x: number, y: number): LonLat => [LON + dLon(x), LAT + dLat(y)];
	const voie: TrackLine = { id: 10, ref: '2', coords: [ll(-50, 0), ll(150, 0)] };
	const loin: TrackLine = { id: 11, coords: [ll(-50, 40), ll(150, 40)] };
	const quai = (south: number): LonLat[] => [
		ll(0, south),
		ll(100, south),
		ll(100, south + 6),
		ll(0, south + 6)
	];
	it('ringTracks : même règle que les quêtes (bord à 6 m au plus, recouvrement)', () => {
		expect([...ringTracks(quai(2), true, [voie, loin])]).toEqual([10]);
		expect(ringTracks(quai(9), true, [voie]).size).toBe(0);
		// Quai tracé en ligne : axe à 12 m au plus
		expect(ringTracks([ll(0, 10), ll(100, 10)], false, [voie]).size).toBe(1);
	});
	it('lostTracks : voie longée avant, plus après, avec l’écart du nouveau bord', () => {
		const before = ringTracks(quai(2), true, [voie, loin]);
		expect(lostTracks(before, quai(3), [voie, loin])).toEqual([]);
		// Un coin tiré loin de la voie : le côté sud n'est plus parallèle à moins de 6 m
		const pulled = [ll(0, 9), ll(100, 9), ll(100, 15), ll(0, 15)];
		const lost = lostTracks(before, pulled, [voie, loin]);
		expect(lost).toHaveLength(1);
		expect(lost[0].way).toBe(10);
		expect(lost[0].gapM).toBeCloseTo(9, 0);
		expect(lostTracksMessage(lost)).toBe(
			'Le quai ne longe plus la voie 2 (bord à 9 m). Vérifiez la forme : le bord du quai doit suivre la voie.'
		);
		expect(lostTracksMessage([{ gapM: 7.4 }, { ref: '3', gapM: 12 }])).toContain(
			'une voie sans numéro (bord à 7 m) et la voie 3 (bord à 12 m)'
		);
		// Bord encore proche : c'est l'orientation du quai qui a changé
		expect(lostTracksMessage([{ ref: '9', gapM: 1.6 }])).toContain(
			'la voie 9 (bord plus parallèle à la voie)'
		);
	});
	it('lostTracks : quai court dont un coin est tiré loin (l’axe tourne de plus de 20°)', () => {
		const short = [ll(0, 1.6), ll(40, 1.6), ll(40, 5.6), ll(0, 5.6)];
		expect([...ringTracks(short, true, [voie])]).toEqual([10]);
		const pulled = [ll(0, 1.6), ll(40, 1.6), ll(40, 40), ll(0, 5.6)];
		const lost = lostTracks([10], pulled, [voie]);
		expect(lost.map((l) => l.way)).toEqual([10]);
		expect(lost[0].gapM).toBeCloseTo(1.6, 1);
	});
	it('quai A d’Ambérieu : un point déplacé de 12 m ne fait perdre aucune voie (pas de fausse alerte)', () => {
		const f = JSON.parse(readFileSync('tests/fixtures/amberieu-en-bugey.json', 'utf8'));
		const d = new OsmData(f.elements as OsmElement[]);
		const lines = [...d.ways.values()]
			.filter((w) => w.tags?.railway === 'rail')
			.map((w) => ({ id: w.id, ref: w.tags?.['railway:track_ref'], coords: d.coords(w) }));
		const ring = d.coords(d.ways.get(1357219270)!).slice(0, -1);
		const before = ringTracks(ring, true, lines);
		expect(before.size).toBe(3); // voies 1, 2 et 13Mag
		for (let i = 0; i < ring.length; i++)
			for (const dy of [12, -12]) {
				const moved = ring.map((p, j): LonLat => (j === i ? [p[0], p[1] + dLat(dy)] : p));
				expect(lostTracks(before, moved, lines)).toEqual([]);
			}
	});
	it('buildFeatures : une voie qui ne longe aucun quai reste dessinée, discrète, sans quête', () => {
		const bbox: [number, number, number, number] = [
			LON - dLon(60),
			LAT - dLat(60),
			LON + dLon(160),
			LAT + dLat(60)
		];
		const els: OsmElement[] = [
			node(1, -50),
			node(2, 150),
			{ ...track([1, 2]), tags: { railway: 'rail', 'railway:track_ref': '2' } },
			node(21, 0, 9),
			node(22, 100, 9),
			node(23, 100, 15),
			node(24, 0, 15),
			{
				type: 'way',
				id: 30,
				nodes: [21, 22, 23, 24, 21],
				tags: { railway: 'platform', public_transport: 'platform', ref: '2' }
			}
		];
		const a = analyzeStation(els, bbox);
		expect(a.tracks).toEqual([]); // le compteur « Voies » ne la compte pas
		expect(a.otherTracks).toEqual([10]);
		const voieF = buildFeatures(els, a, bbox).features.find((f) => f.properties.kind === 'voie')!;
		expect(voieF.properties).toMatchObject({
			away: true,
			label: '2',
			title: 'Voie 2',
			detail: 'Ne longe aucun quai cartographié',
			quests: '',
			status: 'ok'
		});
	});
});
