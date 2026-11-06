// Préparation de l'envoi vers OpenStreetMap (API 0.6) : rebasage des saisies sur les versions
// à jour, détection des conflits, et fabrication des documents XML (changeset, osmChange).
// Code pur, testé sans réseau.

import type { Edit, NewNodeEdit, TagEdit } from './edits';
import type { OsmElement, OsmNode, OsmRelation, OsmWay, Tags } from './osm';

export interface Plan {
	create: OsmNode[];
	modify: OsmElement[];
	/** Saisies qui partent dans ce changeset. */
	sent: string[];
	/** Saisies écartées, avec la raison (affichée « à revoir »). */
	conflicts: { id: string; reason: string }[];
}

const key = (e: { type: string; id: number }) => `${e.type}/${e.id}`;

/** Identifiants des objets à relire sur le serveur juste avant l'envoi. */
export function elementsToFetch(edits: Edit[]) {
	const nodes = new Set<number>(),
		ways = new Set<number>(),
		relations = new Set<number>();
	for (const e of edits) {
		if (e.kind === 'node') ways.add(e.way);
		else {
			const [type, id] = e.target.split('/');
			(type === 'node' ? nodes : type === 'way' ? ways : relations).add(Number(id));
		}
	}
	return { nodes: [...nodes], ways: [...ways], relations: [...relations] };
}

/**
 * Applique les saisies aux versions à jour lues sur le serveur.
 * Une saisie est écartée si l'objet a disparu, ou si quelqu'un a changé entre-temps un tag
 * qu'elle modifie (on ne réécrit jamais le travail d'un autre sans relecture humaine).
 */
export function planUpload(edits: Edit[], fresh: OsmElement[]): Plan {
	const byKey = new Map(fresh.map((e) => [key(e), structuredClone(e)]));
	const modified = new Set<string>();
	const plan: Plan = { create: [], modify: [], sent: [], conflicts: [] };

	for (const ed of edits.filter((e): e is TagEdit => e.kind === 'tags')) {
		const el = byKey.get(ed.target);
		if (!el) {
			plan.conflicts.push({ id: ed.id, reason: 'Objet supprimé entre-temps sur OpenStreetMap.' });
			continue;
		}
		const tags: Tags = { ...(el.tags ?? {}) };
		let clash = '';
		if (ed.version !== undefined && el.version !== ed.version)
			for (const [k, v] of Object.entries(ed.tags)) {
				const now = tags[k] ?? null;
				const before = ed.base ? (ed.base[k] ?? null) : now;
				if (now !== before && now !== (v || null)) clash = k;
			}
		if (clash) {
			plan.conflicts.push({
				id: ed.id,
				reason: `Modifié par quelqu’un d’autre entre-temps (${clash}).`
			});
			continue;
		}
		for (const [k, v] of Object.entries(ed.tags)) {
			if (v === null || v === '') delete tags[k];
			else tags[k] = v;
		}
		el.tags = tags;
		modified.add(ed.target);
		plan.sent.push(ed.id);
	}

	for (const ed of edits.filter((e): e is NewNodeEdit => e.kind === 'node')) {
		const w = byKey.get(`way/${ed.way}`) as OsmWay | undefined;
		if (!w) {
			plan.conflicts.push({ id: ed.id, reason: 'La voie a été supprimée entre-temps.' });
			continue;
		}
		// Retrouve la place par le nœud voisin ; à défaut, par l'indice si la voie n'a pas bougé.
		let at = ed.afterNode !== undefined ? w.nodes.indexOf(ed.afterNode) : -1;
		if (at < 0 && (ed.wayVersion === undefined || ed.wayVersion === w.version)) at = ed.after;
		if (at < 0 || at >= w.nodes.length - 1) {
			plan.conflicts.push({ id: ed.id, reason: 'La voie a été redessinée entre-temps.' });
			continue;
		}
		w.nodes = [...w.nodes.slice(0, at + 1), ed.tempId, ...w.nodes.slice(at + 1)];
		plan.create.push({ type: 'node', id: ed.tempId, lat: ed.lat, lon: ed.lon, tags: ed.tags });
		modified.add(key(w));
		plan.sent.push(ed.id);
	}

	plan.modify = [...modified].map((k) => byKey.get(k)!);
	return plan;
}

// ---------- XML ----------

const esc = (v: string | number) =>
	String(v)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/\n/g, '&#10;');

const tagsXml = (t: Tags = {}) =>
	Object.entries(t)
		.map(([k, v]) => `<tag k="${esc(k)}" v="${esc(v)}"/>`)
		.join('');

export function changesetXml(tags: Tags) {
	return `<osm><changeset>${tagsXml(tags)}</changeset></osm>`;
}

function elementXml(e: OsmElement, changeset: number, create: boolean) {
	const v = create ? '' : ` version="${e.version}"`;
	const head = `id="${e.id}"${v} changeset="${changeset}"`;
	if (e.type === 'node') {
		const n = e as OsmNode;
		return `<node ${head} lat="${n.lat.toFixed(7)}" lon="${n.lon.toFixed(7)}">${tagsXml(n.tags)}</node>`;
	}
	if (e.type === 'way') {
		const w = e as OsmWay;
		return `<way ${head}>${w.nodes.map((r) => `<nd ref="${r}"/>`).join('')}${tagsXml(w.tags)}</way>`;
	}
	const r = e as OsmRelation;
	const members = r.members
		.map((m) => `<member type="${m.type}" ref="${m.ref}" role="${esc(m.role)}"/>`)
		.join('');
	return `<relation ${head}>${members}${tagsXml(r.tags)}</relation>`;
}

export function osmChangeXml(changeset: number, plan: Pick<Plan, 'create' | 'modify'>) {
	const create = plan.create.map((e) => elementXml(e, changeset, true)).join('');
	const modify = plan.modify.map((e) => elementXml(e, changeset, false)).join('');
	return (
		`<osmChange version="0.6" generator="railcomplete">` +
		(create ? `<create>${create}</create>` : '') +
		(modify ? `<modify>${modify}</modify>` : '') +
		`</osmChange>`
	);
}

/** osmChange de création seule (copie d'une gare vers le serveur de test). */
export function osmCreateXml(changeset: number, elements: OsmElement[]) {
	return `<osmChange version="0.6" generator="railcomplete"><create>${elements
		.map((e) => elementXml(e, changeset, true))
		.join('')}</create></osmChange>`;
}

/**
 * Copie, avec des identifiants provisoires, des quais, des voies et des pancartes d'une gare
 * (relations exclues). Sert uniquement à préparer une gare d'essai sur le serveur de test.
 */
export function copyForTest(elements: OsmElement[]): OsmElement[] {
	const nodes = new Map<number, OsmNode>();
	for (const e of elements) if (e.type === 'node') nodes.set(e.id, e as OsmNode);
	const ways = elements.filter(
		(e): e is OsmWay =>
			e.type === 'way' &&
			(e.tags?.railway === 'rail' ||
				e.tags?.railway === 'platform' ||
				e.tags?.public_transport === 'platform')
	);
	const ids = new Map<number, number>();
	let next = -1;
	const out: OsmElement[] = [];
	for (const w of ways)
		for (const id of w.nodes)
			if (!ids.has(id) && nodes.has(id)) {
				ids.set(id, next--);
				const n = nodes.get(id)!;
				out.push({ type: 'node', id: ids.get(id)!, lat: n.lat, lon: n.lon, tags: n.tags });
			}
	for (const w of ways) {
		const nd = w.nodes.filter((id) => ids.has(id)).map((id) => ids.get(id)!);
		if (nd.length >= 2) out.push({ type: 'way', id: next--, nodes: nd, tags: w.tags });
	}
	return out;
}

/** Correspondance des identifiants provisoires → définitifs, d'après la réponse <diffResult>. */
export function parseDiffResult(xml: string) {
	const out = new Map<string, { newId: number; version: number }>();
	for (const m of xml.matchAll(
		/<(node|way|relation)\s+old_id="(-?\d+)"\s+new_id="(\d+)"\s+new_version="(\d+)"/g
	))
		out.set(`${m[1]}/${m[2]}`, { newId: Number(m[3]), version: Number(m[4]) });
	return out;
}

/**
 * Objet en cause dans une erreur 409/412 de l'API (« … of Way 123 », « Node 5 is still used… »).
 * Renvoie « way/123 » ou undefined.
 */
export function conflictTarget(message: string) {
	const m = message.match(/\b(Node|Way|Relation)\s+(-?\d+)/i);
	return m ? `${m[1].toLowerCase()}/${m[2]}` : undefined;
}

/** Tags du changeset d'une gare (rapport tags § 6 : un changeset par gare). */
export function changesetTags(o: {
	comment: string;
	version: string;
	survey: boolean;
	imagery: boolean;
	locale?: string;
}): Tags {
	const t: Tags = {
		created_by: `railcomplete ${o.version}`,
		comment: o.comment.trim().slice(0, 255),
		hashtags: '#railcomplete',
		locale: o.locale ?? 'fr'
	};
	if (o.survey) t.source = 'survey';
	if (o.imagery) t.imagery_used = 'BDOrtho IGN';
	return t;
}
