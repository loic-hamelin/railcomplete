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
import { platformTitle } from './features';
import { OsmData, type OsmWay, type Tags } from './osm';

export const COMPLEX = 'Quai complexe : à modifier avec un éditeur comme iD ou JOSM.';

export const REASONS = {
	duplicate: 'En double avec un autre quai',
	gone: 'N’existe plus'
} as const;

/** Le nœud porte-t-il des tags ? (les tags vides ne comptent pas). */
export const hasTags = (t?: Tags) => !!t && Object.keys(t).length > 0;

/** Nom d'un quai pour les résumés : « Quai A », « Quai B-C », « Quai voies 1-2 ». */
export function platformName(t: Tags = {}) {
	const title = platformTitle(t);
	return title === 'Quai' && t.ref ? `Quai voies ${t.ref.replaceAll(';', '-')}` : title;
}

/** Nature et nom lisible d'une relation. */
export function relationRef(id: number, t: Tags = {}): RelationRef {
	const kind =
		t.public_transport === 'stop_area' ? 'stop_area' : t.type === 'route' ? 'route' : 'other';
	return { id, kind, name: t.name ?? t.ref ?? `n° ${id}` };
}

/** « retiré de la zone d’arrêt Gare d'Ambérieu et de 2 lignes » (vide sans relation). */
export function relationsPhrase(rels: RelationRef[]) {
	if (!rels.length) return '';
	const parts: string[] = [];
	for (const r of rels.filter((r) => r.kind === 'stop_area'))
		parts.push(`de la zone d’arrêt ${r.name}`);
	const routes = rels.filter((r) => r.kind === 'route');
	if (routes.length === 1) parts.push(`de la ligne ${routes[0].name}`);
	else if (routes.length) parts.push(`de ${routes.length} lignes`);
	const other = rels.filter((r) => r.kind === 'other');
	if (other.length === 1) parts.push(`de la relation ${other[0].name}`);
	else if (other.length) parts.push(`de ${other.length} autres relations`);
	const last = parts.pop()!;
	return `retiré ${parts.length ? `${parts.join(', ')} et ${last}` : last}`;
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
		? `${name} redessiné en surface`
		: `${name} : forme modifiée (${before} → ${after} points)${also ? ` — ${also}` : ''}`;
}

export function deleteSummary(name: string, reason: keyof typeof REASONS, rels: RelationRef[]) {
	const why = reason === 'duplicate' ? 'en double' : 'n’existe plus';
	const from = relationsPhrase(rels);
	return `${name} supprimé (${why})${from ? ` — ${from}` : ''}`;
}

/** Ce à quoi un way voisin correspond, en clair, pour expliquer un point verrouillé. */
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
const FEM = new Set([
	'gare',
	'route',
	'zone',
	'voie ou installation ferroviaire',
	'entrée',
	'barrière',
	'clôture ou mur'
]);
const fem = (labels: string[]) => labels.every((l) => FEM.has(l) && l !== 'clôture ou mur');
/** Accord : « ajusté », « ajustée », « ajustés », « ajustées ». */
const agree = (labels: string[], word: string) =>
	`${word}${fem(labels) ? 'e' : ''}${labels.length > 1 ? 's' : ''}`;

/** « l’ascenseur », « la barrière », « le toit ». */
const theLabel = (label: string) =>
	/^[aeéèiouh]/i.test(label) ? `l’${label}` : `${FEM.has(label) ? 'la' : 'le'} ${label}`;

/** « la gare », « le toit », « un bâtiment », « une entrée ». */
export function withArticle(label: string) {
	if (label === 'gare') return 'la gare';
	if (label === 'toit' || label === 'bord du quai') return `le ${label}`;
	if (label === 'clôture ou mur') return 'une clôture ou un mur';
	return `${FEM.has(label) ? 'une' : 'un'} ${label}`;
}

/** Liste lisible : « toit, bâtiment et chemin piéton ». */
export const listFr = (items: string[]) =>
	items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} et ${items.at(-1)}`;

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
		const why = ` (${top.slice(0, 2).join(', ')}${top.length > 2 ? '…' : ''})`;
		const many = shared.length > 1;
		out.push(
			`${shared.length} point${many ? 's' : ''} sur ${nodes.length} ${many ? 'sont partagés' : 'est partagé'} avec d’autres objets${why} : ${many ? 'ils suivront' : 'il suivra'} vos modifications.`
		);
	}
	const tagged = nodes.filter((n) => n.tag);
	if (tagged.length) {
		const which = tagged.map((n) => nodes.indexOf(n) + 1);
		const what = [...new Set(tagged.map((n) => n.tag!))];
		out.push(
			tagged.length === 1
				? `Le point ${which[0]} est ${what[0] === INFO ? 'un point avec des informations' : withArticle(what[0])} : le déplacer ${what[0] === INFO ? 'déplace l’objet qu’il décrit' : `déplace ${theLabel(what[0])}`}.`
				: `Les points ${listFr(which.map(String))} portent des informations (${listFr(what.filter((w) => w !== INFO)) || 'tags'}) : les déplacer déplace ces objets.`
		);
	}
	return out.join(' ');
}

/** Information sous le point sélectionné : ce qui suivra son déplacement, ce que fait un retrait. */
export function pointInfo(o: OrigNode | undefined) {
	if (!o) return { move: '', remove: '' };
	const parts: string[] = [];
	const ways = o.ways ?? (o.edge ? ['bord du quai'] : []);
	if (ways.length) {
		const one = ways.length === 1;
		const f = fem(ways);
		parts.push(
			`Ce point est aussi un point de : ${listFr(ways.map(withArticle))} — ${one ? (f ? 'elle suivra' : 'il suivra') : f ? 'elles suivront' : 'ils suivront'} le déplacement.`
		);
	}
	if (o.tag)
		parts.push(
			o.tag === INFO
				? 'Ce point porte des informations : il sera déplacé avec elles.'
				: `Ce point est ${withArticle(o.tag)} : ${FEM.has(o.tag) ? 'elle sera déplacée' : 'il sera déplacé'}.`
		);
	const remove = o.edge
		? 'Il ne peut pas être retiré du contour : le bord du quai en a besoin.'
		: ways.length
			? `Retiré, il reste dans ${listFr(ways.map(withArticle))} ; seul le quai change.`
			: o.tag || o.shared
				? 'Retiré, il reste sur la carte ; seul le quai change.'
				: '';
	return { move: parts.join(' '), remove };
}

/** « de la gare », « du toit », « d’un bâtiment ». */
const ofLabel = (label: string) => {
	const a = withArticle(label);
	return a.startsWith('le ') ? `du ${a.slice(3)}` : a.startsWith('un') ? `d’${a}` : `de ${a}`;
};

/** Libellé accessible d'un sommet partagé : « aussi un point de la gare et du toit ». */
export function sharedLabel(o: OrigNode) {
	const ways = o.ways ?? (o.edge ? ['bord du quai'] : []);
	const parts: string[] = [];
	if (o.tag) parts.push(o.tag === INFO ? 'porte des informations' : withArticle(o.tag));
	if (ways.length) parts.push(`aussi un point ${listFr(ways.map(ofLabel))}`);
	if (!parts.length) parts.push(o.links?.length ? `relié à ${listFr(o.links)}` : 'partagé');
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
	if (f.ways.length) parts.push(`${listFr(f.ways)} ${agree(f.ways, 'ajusté')} aussi`);
	const tags = f.tags.map((t) => (t === INFO ? 'point avec des informations' : t));
	if (tags.length) parts.push(`${listFr(tags)} ${agree(f.tags, 'déplacé')}`);
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
		out.refused = COMPLEX;
	const empty = parents.find((r) => r.members.every((m) => m.type === 'way' && m.ref === wayId));
	if (empty)
		out.deleteRefused = `Ce quai est le seul membre de la relation ${relationRef(empty.id, empty.tags).name} : à supprimer avec un éditeur comme iD ou JOSM.`;
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
	const which = (list: number[]) =>
		list.length === 1
			? `Le point ${list[0]}`
			: `Les points ${list.slice(0, -1).join(', ')} et ${list.at(-1)}`;
	if (d.foreign.length) return 'Un point vient d’un autre objet : forme refusée.';
	if (new Set(nodes.map((n) => n.id)).size !== nodes.length)
		return 'Un point apparaît deux fois dans le contour.';
	const movedFixed = d.moved.filter((n) =>
		isFixed(
			before.find((o) => o.id === n.id)!,
			mode
		)
	);
	if (movedFixed.length)
		return mode === 'area'
			? 'Un point relié à un autre objet a été déplacé : forme refusée.'
			: 'Un point répété dans le contour a été déplacé : forme refusée.';
	const lost = d.removed.filter((n) => isFixed(n, mode) || n.edge);
	if (!lost.length) return undefined;
	const list = lost.map(pos);
	const many = list.length > 1;
	if (mode === 'area')
		return `${which(list)} de l’ancienne ligne ${many ? 'sont reliés' : 'est relié'} à d’autres objets : ${many ? 'ils doivent' : 'il doit'} faire partie du contour. Touchez ${many ? 'ces points' : 'ce point'} (carrés) pour ${many ? 'les ajouter' : 'l’ajouter'}, ou utilisez un éditeur comme iD ou JOSM.`;
	if (lost.every((n) => n.edge))
		return `${which(list)} ${many ? 'sont aussi des points' : 'est aussi un point'} du bord du quai : ${many ? 'les' : 'le'} retirer du contour ${many ? 'les' : 'le'} laisserait dans le bord. Déplacez-${many ? 'les' : 'le'} plutôt, ou utilisez JOSM ou iD.`;
	return `${which(list)} ${many ? 'apparaissent' : 'apparaît'} plusieurs fois dans le contour : ${many ? 'ils ne peuvent' : 'il ne peut'} pas être retiré${many ? 's' : ''}.`;
}
