// Modifier la forme d'un quai existant ou le supprimer (E12, lot 7). Code pur.
//
// Règles de sécurité OSM (architecture § 4.4.4) :
// - le way garde son identifiant : on change sa liste de nœuds, on ne le recrée jamais ;
// - un nœud partagé (autre way, tags propres, relation) peut être déplacé (lot 7c) : c'est le
//   même nœud, les objets qui le partagent suivent ; l'appli le dit avant. Retiré du contour,
//   il quitte seulement ce quai (jamais supprimé) — sauf s'il est sur un bord de quai : refusé ;
// - « redessiner en surface » : les points partagés de l'ancienne ligne sont repris tels quels ;
// - un point répété dans le contour reste verrouillé ;
// - les quais en multipolygone ne sont pas modifiables dans l'appli.

import type { OrigNode, RelationRef, RingNode } from './edits';
import { isPlainPlatform, platformTitle } from './features';
import { OsmData, type OsmWay, type Tags } from './osm';
import { fmtList, t as tr, tk } from '../i18n/t.ts';

/** Message du refus « quai complexe » (multipolygone), dans la langue de l'interface. */
export const complexText = () => tr('shape.complex');
/**
 * Même texte, figé en langue source au chargement du module : gardé pour les tests unitaires
 * (qui posent les messages français avant d'importer). L'appli appelle complexText().
 */
export const COMPLEX = complexText();

/** Motifs de suppression d'un quai, en clair dans la langue de l'interface. */
export const REASONS = {
	get duplicate() {
		return tr('shape.reason.duplicate');
	},
	get gone() {
		return tr('shape.reason.gone');
	}
};

/** Le nœud porte-t-il des tags ? (les tags vides ne comptent pas). */
export const hasTags = (t?: Tags) => !!t && Object.keys(t).length > 0;

/** Nom d'un quai pour les résumés : « Quai A », « Quai B-C », « Quai voies 1-2 ». */
export function platformName(t: Tags = {}) {
	return isPlainPlatform(t)
		? tr('platform.tracks', { refs: t.ref.replaceAll(';', '-') })
		: platformTitle(t);
}

/** Nature et nom lisible d'une relation. */
export function relationRef(id: number, t: Tags = {}): RelationRef {
	const kind =
		t.public_transport === 'stop_area' ? 'stop_area' : t.type === 'route' ? 'route' : 'other';
	return { id, kind, name: t.name ?? t.ref ?? tr('shape.relationNo', { id }) };
}

/** « retiré de la zone d’arrêt Gare d'Ambérieu et de 2 lignes » (vide sans relation). */
export function relationsPhrase(rels: RelationRef[]) {
	if (!rels.length) return '';
	const parts: string[] = [];
	for (const r of rels.filter((r) => r.kind === 'stop_area'))
		parts.push(tr('shape.rel.stopArea', { name: r.name }));
	const routes = rels.filter((r) => r.kind === 'route');
	if (routes.length === 1) parts.push(tr('shape.rel.route', { name: routes[0].name }));
	else if (routes.length) parts.push(tr('shape.rel.routes', { count: routes.length }));
	const other = rels.filter((r) => r.kind === 'other');
	if (other.length === 1) parts.push(tr('shape.rel.other', { name: other[0].name }));
	else if (other.length) parts.push(tr('shape.rel.others', { count: other.length }));
	return tr('shape.rel.removed', { list: fmtList(parts) });
}

export function shapeSummary(
	name: string,
	mode: 'reshape' | 'area',
	before: number,
	after: number,
	/** Objets qui suivent les points déplacés (« gare et bâtiment ajustés aussi »). */
	also = ''
) {
	return mode === 'area'
		? tr('shape.summary.area', { name })
		: tr('shape.summary.reshape', { name, before, after }) + (also ? ` — ${also}` : '');
}

export function deleteSummary(name: string, reason: keyof typeof REASONS, rels: RelationRef[]) {
	const from = relationsPhrase(rels);
	return (
		tr('shape.summary.delete', { name, why: tr(`shape.reasonInline.${reason}`) }) +
		(from ? ` — ${from}` : '')
	);
}

/** Ce à quoi un way voisin correspond, pour expliquer un point partagé. */
// Les libellés renvoyés (« toit », « gare »…) sont des identifiants, enregistrés tels quels
// dans les saisies (OrigNode.ways, .tag, .links) depuis le lot 7 : on les traduit à l'affichage
// (objectName et ses variantes), ce qui garde lisibles les saisies déjà sur les téléphones.
export function wayLabel(t: Tags = {}) {
	if (t.railway === 'platform_edge') return 'bord du quai';
	if (t.building === 'roof' || t['building:part'] === 'roof' || t.roof) return 'toit';
	if (t.indoor) return 'espace intérieur';
	if (t.highway === 'steps') return 'escalier';
	if (['footway', 'path', 'pedestrian', 'corridor', 'cycleway'].includes(t.highway ?? ''))
		return 'chemin piéton';
	if (t.highway === 'elevator') return 'ascenseur';
	if (t.highway) return 'route';
	if (t.public_transport === 'station' || t.railway === 'station') return 'gare';
	if (t.building) return 'bâtiment';
	if (t.railway === 'platform' || t.public_transport === 'platform') return 'autre quai';
	if (t.railway) return 'voie ou installation ferroviaire';
	if (t.barrier) return 'clôture ou mur';
	if (t.landuse || t.amenity || t.area || t.leisure) return 'zone';
	return 'autre objet';
}

/** Ce qu'est un nœud qui porte des tags (« ascenseur », « entrée »…), vide si inconnu. */
export function nodeWhat(t: Tags = {}) {
	return t.highway === 'elevator'
		? 'ascenseur'
		: t.entrance || t.door
			? 'entrée'
			: t.highway === 'bus_stop'
				? 'arrêt de bus'
				: t.barrier
					? 'barrière'
					: t.railway
						? 'élément ferroviaire'
						: '';
}

/** « point avec des informations (ascenseur) » : un nœud qui porte lui-même des tags. */
export function nodeTagsLabel(t: Tags = {}) {
	const what = nodeWhat(t);
	return `point avec des informations${what ? ` (${what})` : ''}`;
}

/** Le nœud est-il relié à d'autres objets ? (saisies du lot 7c et plus anciennes) */
export const isLinked = (n: OrigNode) => n.locked || !!n.edge || !!n.shared;

const INFO = 'point avec des informations';

/** Identifiant de libellé (enregistré dans les saisies) → clé de message « obj.<clé> ». */
const OBJECTS: Record<string, string> = {
	'bord du quai': 'platformEdge',
	toit: 'roof',
	'espace intérieur': 'indoor',
	escalier: 'steps',
	'chemin piéton': 'footway',
	ascenseur: 'elevator',
	route: 'road',
	gare: 'station',
	bâtiment: 'building',
	'autre quai': 'otherPlatform',
	'voie ou installation ferroviaire': 'railway',
	'clôture ou mur': 'barrierLine',
	zone: 'area',
	'autre objet': 'other',
	entrée: 'entrance',
	'arrêt de bus': 'busStop',
	barrière: 'barrier',
	'élément ferroviaire': 'railwayNode',
	[INFO]: 'info'
};

type Form = 'name' | 'a' | 'of' | 'the' | 'g';
/**
 * Forme d'un objet dans la langue de l'interface : nom seul (« toit »), avec article
 * (« le toit », « une entrée »), complément (« du toit », « d’une entrée »), défini (« l’entrée »)
 * et genre grammatical (« m », « f », « n ») pour les accords. Libellé inconnu : tel quel.
 */
function form(label: string, f: Form) {
	const k = OBJECTS[label];
	if (!k) return f === 'g' ? 'm' : label;
	return tk(`obj.${k}.${f}`);
}
/** Nom d'un objet dans la langue de l'interface (« toit », « roof », « Dach »). */
export const objectName = (label: string) => form(label, 'name');
/** « la gare », « le toit », « un bâtiment », « une entrée ». */
export const withArticle = (label: string) => form(label, 'a');
const ofLabel = (label: string) => form(label, 'of');
const theLabel = (label: string) => form(label, 'the');
/** Genre commun d'une liste d'objets : celui de tous, sinon masculin (accord du français). */
const genderOf = (labels: string[]) => {
	const g = labels.map((l) => form(l, 'g'));
	return g.every((x) => x === g[0]) ? g[0] : 'm';
};

/** Liste lisible dans la langue de l'interface : « toit, bâtiment et chemin piéton ». */
export const listFr = (items: string[]) => fmtList(items);

/** Lien d'un point avec d'autres objets (OrigNode.links), en clair. */
export function linkName(link: string) {
	if (link === 'membre d’une relation') return tr('shape.link.relation');
	if (link === 'point répété dans le contour') return tr('shape.link.repeated');
	const m = /^point avec des informations \((.+)\)$/.exec(link);
	if (m) return tr('shape.link.infoWhat', { what: objectName(m[1]) });
	return objectName(link);
}

/**
 * Bandeau d'ouverture de E12 quand une part notable des points est partagée (lot 7c) :
 * « 22 points sur 24 sont partagés avec d'autres objets (gare, bâtiment…) : ils suivront vos
 * modifications. » Les points qui portent des tags sont toujours signalés.
 */
export function shareNotice(nodes: OrigNode[]) {
	const out: string[] = [];
	const shared = nodes.filter((n) => n.ways?.length);
	if (shared.length && (shared.length >= 3 || shared.length / nodes.length >= 0.25)) {
		const freq = new Map<string, number>();
		for (const n of shared) for (const l of n.ways!) freq.set(l, (freq.get(l) ?? 0) + 1);
		const top = [...freq].sort((a, b) => b[1] - a[1]).map(([l]) => l);
		const objects = `${top.slice(0, 2).map(objectName).join(', ')}${top.length > 2 ? '…' : ''}`;
		out.push(tr('shape.notice.shared', { count: shared.length, total: nodes.length, objects }));
	}
	const tagged = nodes.filter((n) => n.tag);
	if (tagged.length) {
		const which = tagged.map((n) => nodes.indexOf(n) + 1);
		const what = [...new Set(tagged.map((n) => n.tag!))];
		out.push(
			tagged.length === 1
				? what[0] === INFO
					? tr('shape.notice.taggedInfo', { point: which[0] })
					: tr('shape.notice.tagged', {
							point: which[0],
							a: withArticle(what[0]),
							the: theLabel(what[0])
						})
				: tr('shape.notice.taggedMany', {
						points: fmtList(which.map(String)),
						what: fmtList(what.filter((w) => w !== INFO).map(objectName)) || tr('shape.tags')
					})
		);
	}
	return out.join(' ');
}

/** Information sous le point sélectionné : ce qui suivra son déplacement, ce que fait un retrait. */
export function pointInfo(o: OrigNode | undefined) {
	if (!o) return { move: '', remove: '' };
	const parts: string[] = [];
	const ways = o.ways ?? (o.edge ? ['bord du quai'] : []);
	const list = fmtList(ways.map(withArticle));
	if (ways.length)
		parts.push(tr('shape.point.alsoOf', { list, count: ways.length, g: genderOf(ways) }));
	if (o.tag)
		parts.push(
			o.tag === INFO
				? tr('shape.point.info')
				: tr('shape.point.is', { a: withArticle(o.tag), g: form(o.tag, 'g') })
		);
	const remove = o.edge
		? tr('shape.point.removeEdge')
		: ways.length
			? tr('shape.point.removeWays', { list })
			: o.tag || o.shared
				? tr('shape.point.removeMap')
				: '';
	return { move: parts.join(' '), remove };
}

/** Libellé accessible d'un sommet partagé : « aussi un point de la gare et du toit ». */
export function sharedLabel(o: OrigNode) {
	const ways = o.ways ?? (o.edge ? ['bord du quai'] : []);
	const parts: string[] = [];
	if (o.tag) parts.push(o.tag === INFO ? tr('shape.shared.info') : withArticle(o.tag));
	if (ways.length) parts.push(tr('shape.shared.alsoOf', { list: fmtList(ways.map(ofLabel)) }));
	if (!parts.length)
		parts.push(
			o.links?.length
				? tr('shape.shared.linked', { list: fmtList(o.links.map(linkName)) })
				: tr('shape.shared.plain')
		);
	return parts.join(', ');
}

/** Objets qui suivent les points déplacés d'un nouveau contour : ways voisins, points tagués. */
export function followers(before: OrigNode[], nodes: RingNode[]) {
	const orig = new Map(before.map((n) => [n.id, n]));
	const moved = shapeDiff(before, nodes).moved.map((n) => orig.get(n.id)!);
	return {
		ways: [...new Set(moved.flatMap((o) => o.ways ?? (o.edge ? ['bord du quai'] : [])))],
		tags: [...new Set(moved.flatMap((o) => (o.tag ? [o.tag] : [])))]
	};
}

/** « gare et bâtiment ajustés aussi, ascenseur déplacé » (vide si rien ne suit). */
export function followersPhrase(f: { ways: string[]; tags: string[] }) {
	const parts: string[] = [];
	if (f.ways.length)
		parts.push(
			tr('shape.followers.ways', {
				list: fmtList(f.ways.map(objectName)),
				count: f.ways.length,
				g: genderOf(f.ways)
			})
		);
	if (f.tags.length)
		parts.push(
			tr('shape.followers.tags', {
				list: fmtList(f.tags.map(objectName)),
				count: f.tags.length,
				g: genderOf(f.tags)
			})
		);
	return parts.join(', ');
}

/** Ce qu'on peut faire d'un quai (way) : contour, nœuds verrouillés, relations, refus. */
export interface PlatformShape {
	way: OsmWay;
	closed: boolean;
	/** Nœuds dans l'ordre, sans répéter le premier d'un contour fermé. */
	nodes: OrigNode[];
	relations: RelationRef[];
	/** Toute modification de forme et la suppression sont refusées (multipolygone). */
	refused?: string;
	/** La suppression seule est refusée (une relation deviendrait vide). */
	deleteRefused?: string;
}

/** Voies ferrées dont un point partagé avec un quai reste verrouillé. */
const TRACKS = new Set(['rail', 'light_rail', 'narrow_gauge', 'subway', 'tram', 'funicular']);

export function platformShape(data: OsmData, wayId: number): PlatformShape | undefined {
	const way = data.ways.get(wayId);
	if (!way || way.nodes.length < 2) return undefined;
	const closed = way.nodes.length > 3 && way.nodes[0] === way.nodes.at(-1);
	const ids = closed ? way.nodes.slice(0, -1) : way.nodes;
	const rels = [...data.relations.values()];
	const inRelation = new Set<number>();
	for (const r of rels) for (const m of r.members) if (m.type === 'node') inRelation.add(m.ref);
	const count = new Map<number, number>();
	for (const id of ids) count.set(id, (count.get(id) ?? 0) + 1);
	const nodes: OrigNode[] = [];
	for (const id of ids) {
		const n = data.nodes.get(id);
		if (!n) return undefined; // donnée incomplète : on ne touche à rien
		const others = [...new Set(data.waysOfNode.get(id) ?? [])]
			.filter((w) => w !== wayId)
			.map((w) => data.ways.get(w));
		const ways = [...new Set(others.map((w) => (w ? wayLabel(w.tags) : 'autre objet')))];
		const tag = hasTags(n.tags) ? nodeWhat(n.tags) || INFO : undefined;
		const links: string[] = [];
		if (tag) links.push(nodeTagsLabel(n.tags));
		links.push(...ways);
		if (inRelation.has(id)) links.push('membre d’une relation');
		const repeated = count.get(id)! > 1;
		if (repeated) links.push('point répété dans le contour');
		// Point d'une voie ferrée : jamais déplacé (la géométrie des voies sert à OSRD et à
		// OpenRailwayMap ; elle se corrige avec un éditeur complet).
		const onTrack = others.some((w) => TRACKS.has(w?.tags?.railway ?? ''));
		const uniq = [...new Set(links)];
		// Partagé : déplaçable (les objets qui le partagent suivent). Bord de quai : pas retirable.
		const edge = others.some((w) => w?.tags?.railway === 'platform_edge');
		const shared = !!(others.length || tag || inRelation.has(id));
		nodes.push({
			id,
			lon: n.lon,
			lat: n.lat,
			version: n.version,
			locked: repeated || onTrack,
			...(shared ? { shared } : {}),
			...(edge ? { edge } : {}),
			...(uniq.length ? { links: uniq } : {}),
			...(ways.length ? { ways } : {}),
			...(tag ? { tag } : {})
		});
	}
	const parents = rels.filter((r) => r.members.some((m) => m.type === 'way' && m.ref === wayId));
	const out: PlatformShape = {
		way,
		closed,
		nodes,
		relations: parents.map((r) => relationRef(r.id, r.tags))
	};
	if (way.tags?.type === 'multipolygon' || parents.some((r) => r.tags?.type === 'multipolygon'))
		out.refused = complexText();
	const empty = parents.find((r) => r.members.every((m) => m.type === 'way' && m.ref === wayId));
	if (empty)
		out.deleteRefused = tr('shape.deleteRefused', {
			name: relationRef(empty.id, empty.tags).name
		});
	return out;
}

/** Deux positions identiques au centimètre près (précision de l'osmChange : 7 décimales). */
export const samePlace = (a: { lon: number; lat: number }, b: { lon: number; lat: number }) =>
	a.lon.toFixed(7) === b.lon.toFixed(7) && a.lat.toFixed(7) === b.lat.toFixed(7);

/** Différences entre le contour d'origine et le nouveau. */
export function shapeDiff(before: OrigNode[], nodes: RingNode[]) {
	const orig = new Map(before.map((n) => [n.id, n]));
	const kept = new Set(nodes.map((n) => n.id));
	return {
		moved: nodes.filter((n) => orig.has(n.id) && !samePlace(n, orig.get(n.id)!)),
		added: nodes.filter((n) => n.id < 0),
		removed: before.filter((n) => !kept.has(n.id)),
		/** Nœuds existants qui ne viennent pas de ce quai (jamais produit par l'appli). */
		foreign: nodes.filter((n) => n.id > 0 && !orig.has(n.id))
	};
}

/**
 * Point qui ne bouge pas : répété dans le contour, ou point relié de l'ancienne ligne en
 * « redessiner en surface » (il doit être repris tel quel).
 */
export const isFixed = (n: OrigNode, mode: 'reshape' | 'area') =>
	n.locked || (mode === 'area' && isLinked(n));

/**
 * Contrôle de sécurité d'un nouveau contour, avant enregistrement :
 * aucun point fixe déplacé ; aucun point d'un bord de quai retiré ; en « area » (ligne
 * redessinée), tous les points reliés de l'ancienne ligne sont repris tels quels.
 * Un point partagé avec un autre objet peut être déplacé (lot 7c) ou retiré du quai.
 */
export function checkLocks(before: OrigNode[], nodes: RingNode[], mode: 'reshape' | 'area') {
	const d = shapeDiff(before, nodes);
	const pos = (n: OrigNode) => before.indexOf(n) + 1;
	if (d.foreign.length) return tr('shape.lock.foreign');
	if (new Set(nodes.map((n) => n.id)).size !== nodes.length) return tr('shape.lock.twice');
	const movedFixed = d.moved.filter((n) =>
		isFixed(
			before.find((o) => o.id === n.id)!,
			mode
		)
	);
	if (movedFixed.length)
		return mode === 'area' ? tr('shape.lock.movedLinked') : tr('shape.lock.movedRepeated');
	const lost = d.removed.filter((n) => isFixed(n, mode) || n.edge);
	if (!lost.length) return undefined;
	const list = lost.map(pos);
	const p = { count: list.length, points: fmtList(list.map(String)) };
	if (mode === 'area') return tr('shape.lock.areaLinked', p);
	if (lost.every((n) => n.edge)) return tr('shape.lock.edge', p);
	return tr('shape.lock.repeated', p);
}
