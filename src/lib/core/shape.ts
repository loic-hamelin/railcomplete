// Modifier la forme d'un quai existant ou le supprimer (E12, lot 7). Code pur.
//
// Règles de sécurité OSM (architecture § 4.4.4) :
// - le way garde son identifiant : on change sa liste de nœuds, on ne le recrée jamais ;
// - un nœud tagué, partagé avec un autre way ou membre d'une relation est « verrouillé » :
//   il n'est ni déplacé ni retiré ;
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
	after: number
) {
	return mode === 'area'
		? `${name} redessiné en surface`
		: `${name} : forme modifiée (${before} → ${after} points)`;
}

export function deleteSummary(name: string, reason: keyof typeof REASONS, rels: RelationRef[]) {
	const why = reason === 'duplicate' ? 'en double' : 'n’existe plus';
	const from = relationsPhrase(rels);
	return `${name} supprimé (${why})${from ? ` — ${from}` : ''}`;
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
		const others = (data.waysOfNode.get(id) ?? []).some((w) => w !== wayId);
		nodes.push({
			id,
			lon: n.lon,
			lat: n.lat,
			version: n.version,
			locked: hasTags(n.tags) || others || inRelation.has(id) || count.get(id)! > 1
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
 * Contrôle de sécurité d'un nouveau contour, avant enregistrement :
 * aucun nœud verrouillé déplacé ; en « reshape », aucun nœud verrouillé retiré ;
 * en « area » (ligne redessinée), tous les nœuds verrouillés de l'ancienne ligne sont repris.
 */
export function checkLocks(before: OrigNode[], nodes: RingNode[], mode: 'reshape' | 'area') {
	const d = shapeDiff(before, nodes);
	const pos = (n: OrigNode) => before.indexOf(n) + 1;
	if (d.foreign.length) return 'Un point vient d’un autre objet : forme refusée.';
	if (new Set(nodes.map((n) => n.id)).size !== nodes.length)
		return 'Un point apparaît deux fois dans le contour.';
	const movedLocked = d.moved.filter((n) => before.find((o) => o.id === n.id)!.locked);
	if (movedLocked.length) return 'Un point relié à un autre objet a été déplacé : forme refusée.';
	const lost = d.removed.filter((n) => n.locked);
	if (!lost.length) return undefined;
	const list = lost.map(pos);
	const which =
		list.length === 1
			? `Le point ${list[0]}`
			: `Les points ${list.slice(0, -1).join(', ')} et ${list.at(-1)}`;
	return mode === 'area'
		? `${which} de l’ancienne ligne ${list.length > 1 ? 'sont reliés' : 'est relié'} à d’autres objets : ${list.length > 1 ? 'ils doivent' : 'il doit'} faire partie du contour. Touchez ${list.length > 1 ? 'ces points' : 'ce point'} (cadenas) pour ${list.length > 1 ? 'les ajouter' : 'l’ajouter'}, ou utilisez un éditeur comme iD ou JOSM.`
		: `${which} est relié à un autre objet : il ne peut pas être retiré.`;
}
