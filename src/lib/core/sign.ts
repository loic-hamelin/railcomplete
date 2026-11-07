// Supprimer une pancarte d'arrêt existante (lot 7d). Code pur.
//
// Règles de sécurité OSM (architecture § 4.4.5) :
// - la pancarte est un nœud inséré dans le way de la voie ; la géométrie de la voie ne change
//   jamais (elle sert à OSRD et à OpenRailwayMap) ;
// - le nœud est retiré de la voie puis supprimé seulement s'il est sûr de le faire : une seule
//   voie, aucun autre tag que ceux de la pancarte, dans aucune relation, et son retrait déplace
//   la voie de moins de 0,3 m (nœud quasi aligné avec ses voisins) ;
// - sinon le nœud reste dans la voie et seuls les tags de la pancarte sont retirés ;
// - les voies ne sont jamais supprimables.

import { LocalProjection, dist, projectOnSegment } from './geo';
import type { OsmNode, OsmRelation, OsmWay, Tags } from './osm';

/** Écart maximal (m) de la voie quand on retire le nœud : au-delà, on garde le nœud. */
export const MAX_SHIFT_M = 0.3;

export const SIGN_REASONS = {
	gone: 'N’existe plus',
	duplicate: 'En double',
	misplaced: 'Mal placée'
} as const;
export type SignReason = keyof typeof SIGN_REASONS;

/** Clés propres à une pancarte (liste explicite) : rien d'autre n'est retiré ni toléré. */
const SIGN_KEYS = new Set([
	'railway',
	'ref',
	'note',
	'note:fr',
	'fixme',
	'FIXME',
	'description',
	'source',
	'source:date',
	'check_date',
	'survey:date'
]);
const SIGN_PREFIXES = ['railway:signal:', 'check_date:railway:signal'];

/** La clé fait-elle partie des tags d'une pancarte (`railway=signal`, `railway:signal:*`, …) ? */
export const isSignKey = (k: string, t: Tags = {}) =>
	k === 'railway'
		? t.railway === 'signal'
		: SIGN_KEYS.has(k) || SIGN_PREFIXES.some((p) => k.startsWith(p));

/** Clé qui décrit le signal lui-même (toujours retirée, même si le nœud porte autre chose). */
const signalKey = (k: string, t: Tags) =>
	(k === 'railway' && t.railway === 'signal') || k.startsWith('railway:signal:');

export interface SignRemoval {
	/** « remove » : nœud retiré de la voie puis supprimé ; « untag » : nœud gardé, tags retirés. */
	mode: 'remove' | 'untag';
	/** Voie qui contient la pancarte (la première, si plusieurs). */
	way?: number;
	wayVersion?: number;
	/** Écart (m) de la voie si l'on retirait le nœud (Infinity : extrémité, donnée manquante). */
	shiftM: number;
	/** Pourquoi le nœud est gardé, en clair (vide en « remove »). */
	why: string[];
	/** Tags retirés en « untag » (clés). */
	untag: string[];
	/** Tags qui n'appartiennent pas à la pancarte (le nœud est gardé). */
	extra: string[];
}

/**
 * Écart de la voie si l'on retire le nœud d'indice `i` : distance du nœud au segment
 * (précédent, suivant). Infinity si le nœud est une extrémité (même d'une voie fermée) ou si
 * un voisin manque.
 */
export function removalShift(
	way: OsmWay,
	i: number,
	nodeOf: (id: number) => OsmNode | undefined
): number {
	const n = way.nodes.length;
	// Extrémité (ou nœud absent) : la voie raccourcirait.
	if (n < 3 || i <= 0 || i >= n - 1) return Infinity;
	const p = nodeOf(way.nodes[i]),
		a = nodeOf(way.nodes[i - 1]),
		b = nodeOf(way.nodes[i + 1]);
	if (!p || !a || !b) return Infinity;
	const proj = new LocalProjection(p.lon, p.lat);
	const P = { x: 0, y: 0 };
	const { point } = projectOnSegment(P, proj.project(a.lon, a.lat), proj.project(b.lon, b.lat));
	return dist(P, point);
}

/**
 * Comment supprimer cette pancarte sans risque : `ways` = tous les ways qui contiennent le
 * nœud, `relations` = toutes les relations dont il est membre (données lues sur le serveur).
 */
export function signRemoval(
	node: OsmNode,
	ways: OsmWay[],
	relations: OsmRelation[],
	nodeOf: (id: number) => OsmNode | undefined
): SignRemoval {
	const t = node.tags ?? {};
	const keys = Object.keys(t);
	const extra = keys.filter((k) => !isSignKey(k, t));
	const why: string[] = [];
	const uniq = [...new Map(ways.map((w) => [w.id, w])).values()];
	const way = uniq[0];
	const at = way ? way.nodes.indexOf(node.id) : -1;
	const repeated = !!way && way.nodes.filter((x) => x === node.id).length > 1;
	let shiftM = way ? removalShift(way, at, nodeOf) : 0;
	if (uniq.length > 1) why.push('point partagé avec un autre objet (autre voie, aiguillage…)');
	else if (repeated) why.push('point répété dans la voie');
	if (extra.length) why.push(`porte d’autres informations (${extra.slice(0, 3).join(', ')})`);
	if (relations.length) why.push('membre d’une relation');
	if (way && uniq.length === 1 && shiftM >= MAX_SHIFT_M)
		why.push(
			Number.isFinite(shiftM)
				? `le retirer déplacerait la voie de ${shiftM.toFixed(1).replace('.', ',')} m`
				: 'extrémité de la voie'
		);
	if (!way) shiftM = 0;
	const mode = why.length ? 'untag' : 'remove';
	// Nœud gardé : on retire le signal ; s'il ne porte rien d'autre, aussi ref, note, source…
	const untag = keys.filter((k) => (extra.length ? signalKey(k, t) : isSignKey(k, t)));
	return {
		mode,
		...(way ? { way: way.id, wayVersion: way.version } : {}),
		shiftM,
		why,
		untag: mode === 'untag' ? untag : [],
		extra
	};
}

/** Tags du nœud gardé, sans ceux de la pancarte. */
export function withoutSign(tags: Tags = {}, keys: string[]) {
	const out = { ...tags };
	for (const k of keys) delete out[k];
	return out;
}

/** « Pancarte « TGV 2 » supprimée (n’existe plus) — point retiré de la voie ». */
export function signDeleteSummary(label: string, reason: SignReason, mode: 'remove' | 'untag') {
	const why = SIGN_REASONS[reason].toLowerCase();
	return `Pancarte « ${label} » supprimée (${why}) — ${
		mode === 'remove' ? 'point retiré de la voie' : 'point gardé dans la voie, tags retirés'
	}`;
}

/** Phrase du récapitulatif avant de confirmer. */
export function signRemovalPhrase(r: SignRemoval) {
	if (r.mode === 'remove')
		return r.way === undefined
			? 'Le point de la pancarte sera supprimé.'
			: 'Le point sera retiré de la voie puis supprimé : la forme de la voie ne change pas.';
	return `Le point reste dans la voie (${r.why.join(' ; ')}) : seuls les tags de la pancarte sont retirés. La forme de la voie ne change jamais.`;
}
