// Préparation de l'envoi vers OpenStreetMap (API 0.6) : rebasage des saisies sur les versions
// à jour, détection des conflits, et fabrication des documents XML (changeset, osmChange).
// Code pur, testé sans réseau.

import type { Edit, NewNodeEdit, NewWayEdit, TagEdit } from './edits';
import type { BBox, OsmElement, OsmNode, OsmRelation, OsmWay, Tags } from './osm';

export interface Plan {
	/** Objets à créer : nœuds d'abord, puis ways (quais dessinés). */
	create: (OsmNode | OsmWay)[];
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
		else if (e.kind === 'way')
			continue; // quai dessiné : rien à relire, tout est nouveau
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

	// Quais dessinés : nœuds puis way fermé, tous nouveaux.
	const newWays: OsmWay[] = [];
	for (const ed of edits.filter((e): e is NewWayEdit => e.kind === 'way')) {
		if (ed.nodes.length < 3) {
			plan.conflicts.push({ id: ed.id, reason: 'Contour du quai incomplet.' });
			continue;
		}
		for (const n of ed.nodes) plan.create.push({ type: 'node', id: n.id, lat: n.lat, lon: n.lon });
		const ids = ed.nodes.map((n) => n.id);
		newWays.push({ type: 'way', id: ed.tempId, nodes: [...ids, ids[0]], tags: ed.tags });
		plan.sent.push(ed.id);
	}
	// Les ways créés viennent après tous les nœuds créés (ordre exigé par l'API).
	plan.create.push(...newWays);

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
		`<osmChange version="0.6" generator="stationcomplete">` +
		(create ? `<create>${create}</create>` : '') +
		(modify ? `<modify>${modify}</modify>` : '') +
		`</osmChange>`
	);
}

/** osmChange de création seule (copie d'une gare vers le serveur de test). */
export function osmCreateXml(changeset: number, elements: OsmElement[]) {
	return `<osmChange version="0.6" generator="stationcomplete"><create>${elements
		.map((e) => elementXml(e, changeset, true))
		.join('')}</create></osmChange>`;
}

/**
 * Copie, avec des identifiants provisoires, des quais, des voies et des pancartes d'une gare
 * (relations exclues). Sert uniquement à préparer une gare d'essai sur le serveur de test.
 * Les voies sont coupées à l'emprise de la gare (+ marge) : le serveur limite le nombre de
 * modifications par heure pour les comptes récents, la copie doit rester petite.
 */
export function copyForTest(
	elements: OsmElement[],
	bbox?: BBox,
	opts: { marginM?: number; rails?: Set<number>; toleranceM?: number } = {}
): OsmElement[] {
	const marginM = opts.marginM ?? 30;
	const nodes = new Map<number, OsmNode>();
	for (const e of elements) if (e.type === 'node') nodes.set(e.id, e as OsmNode);
	let inside: (n: OsmNode) => boolean = () => true;
	if (bbox) {
		const dLat = marginM / 111_320;
		const dLon = marginM / (111_320 * Math.cos((((bbox[1] + bbox[3]) / 2) * Math.PI) / 180));
		inside = (n) =>
			n.lon >= bbox[0] - dLon &&
			n.lon <= bbox[2] + dLon &&
			n.lat >= bbox[1] - dLat &&
			n.lat <= bbox[3] + dLat;
	}
	// Morceaux de voie à garder : suites de nœuds consécutifs dans l'emprise (≥ 2 nœuds).
	const pieces: { nodes: number[]; tags?: Tags }[] = [];
	for (const e of elements) {
		if (e.type !== 'way') continue;
		const w = e as OsmWay;
		const t = w.tags ?? {};
		if (t.railway === 'platform' || t.public_transport === 'platform') {
			if (w.nodes.some((id) => nodes.has(id) && inside(nodes.get(id)!)))
				pieces.push({ nodes: w.nodes.filter((id) => nodes.has(id)), tags: t });
		} else if (t.railway === 'rail' && (!opts.rails || opts.rails.has(w.id))) {
			let run: number[] = [];
			const flush = () => {
				if (run.length >= 2) pieces.push({ nodes: run, tags: t });
				run = [];
			};
			for (const id of w.nodes) {
				const n = nodes.get(id);
				if (n && inside(n)) run.push(id);
				else flush();
			}
			flush();
		}
	}
	// Quais décrits par une relation (multipolygone) : on recopie le contour extérieur comme un
	// quai simple, avec les tags de la relation.
	const waysById = new Map(
		elements.filter((e): e is OsmWay => e.type === 'way').map((w) => [w.id, w])
	);
	for (const e of elements) {
		if (e.type !== 'relation') continue;
		const r = e as OsmRelation;
		const t = r.tags ?? {};
		if (t.railway !== 'platform' && t.public_transport !== 'platform') continue;
		for (const m of r.members) {
			const w = m.type === 'way' && m.role !== 'inner' ? waysById.get(m.ref) : undefined;
			if (w && w.nodes.some((id) => nodes.has(id) && inside(nodes.get(id)!)))
				pieces.push({
					nodes: w.nodes.filter((id) => nodes.has(id)),
					tags: {
						...(w.tags ?? {}),
						...Object.fromEntries(Object.entries(t).filter(([k]) => k !== 'type'))
					}
				});
		}
	}
	// Simplification du tracé (Douglas-Peucker) : on garde les extrémités et les nœuds avec tags.
	const tol = opts.toleranceM ?? 0.5;
	const lat0 = bbox ? (bbox[1] + bbox[3]) / 2 : 46;
	const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180),
		ky = 111_320;
	const simplify = (ids: number[]): number[] => {
		if (ids.length <= 2 || tol <= 0) return ids;
		const P = ids.map((id) => nodes.get(id)!);
		const keep = new Set<number>([0, ids.length - 1]);
		P.forEach((n, i) => n.tags && Object.keys(n.tags).length && keep.add(i));
		const anchors = [...keep].sort((a, b) => a - b);
		const dp = (a: number, b: number) => {
			const ax = P[a].lon * kx,
				ay = P[a].lat * ky,
				bx = P[b].lon * kx,
				by = P[b].lat * ky;
			const L = Math.hypot(bx - ax, by - ay) || 1;
			let worst = -1,
				wd = tol;
			for (let i = a + 1; i < b; i++) {
				const d = Math.abs((bx - ax) * (ay - P[i].lat * ky) - (ax - P[i].lon * kx) * (by - ay)) / L;
				if (d > wd) [wd, worst] = [d, i];
			}
			if (worst > 0) {
				keep.add(worst);
				dp(a, worst);
				dp(worst, b);
			}
		};
		for (let i = 0; i + 1 < anchors.length; i++) dp(anchors[i], anchors[i + 1]);
		return ids.filter((_, i) => keep.has(i));
	};
	for (const p of pieces) if (p.tags?.railway === 'rail') p.nodes = simplify(p.nodes);
	const ids = new Map<number, number>();
	let next = -1;
	const out: OsmElement[] = [];
	for (const p of pieces)
		for (const id of p.nodes)
			if (!ids.has(id)) {
				ids.set(id, next--);
				const n = nodes.get(id)!;
				out.push({ type: 'node', id: ids.get(id)!, lat: n.lat, lon: n.lon, tags: n.tags });
			}
	for (const p of pieces)
		if (p.nodes.length >= 2)
			out.push({ type: 'way', id: next--, nodes: p.nodes.map((id) => ids.get(id)!), tags: p.tags });
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
		created_by: `stationcomplete ${o.version}`,
		comment: o.comment.trim().slice(0, 255),
		hashtags: '#stationcomplete',
		locale: o.locale ?? 'fr'
	};
	if (o.survey) t.source = 'survey';
	if (o.imagery) t.imagery_used = 'BDOrtho IGN';
	return t;
}
