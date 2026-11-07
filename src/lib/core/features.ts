// Conversion de l'analyse d'une gare en objets cartographiques (GeoJSON) pour la carte E5.
// Code pur : aucune dépendance à MapLibre ni au navigateur.

import { LocalProjection, projectOnSegment, type Pt } from './geo';
import {
	OsmData,
	isPlatform,
	isUnderground,
	type BBox,
	type OsmElement,
	type OsmNode,
	type OsmWay
} from './osm';
import { countryConfig } from './countries';
import type { QuestId, StationAnalysis } from './quests';

/** État d'un objet sur la carte : renseigné, manquant (quête « à faire ») ou en alerte. */
export type Status = 'ok' | 'missing' | 'alert';

export interface FeatureProps {
	kind: 'quai' | 'voie' | 'pancarte';
	/** Identifiant OSM « way/123 ». */
	osm: string;
	status: Status;
	/** Texte court affiché sur la carte (« A », « 2 », « TGV »…), ou « ? ». */
	label: string;
	/** Titre et détail pour la fiche en bas d'écran. */
	title: string;
	detail: string;
	quests: string;
	/** Modifié sur ce téléphone, pas encore envoyé. */
	edited?: boolean;
	/** Objet souterrain (tunnel, couche ou niveau négatif) : pointillés estompés (lot 7d). */
	under?: boolean;
	/**
	 * Voie qui ne longe aucun quai cartographié (lot 7d) : dessinée plus discrète, sans quête ;
	 * étiquette seulement si elle porte un numéro (`label` vide sinon).
	 */
	away?: boolean;
}

type Geometry =
	| { type: 'Point'; coordinates: [number, number] }
	| { type: 'LineString'; coordinates: [number, number][] }
	| { type: 'Polygon'; coordinates: [number, number][][] };

export interface Feature {
	type: 'Feature';
	id: number;
	geometry: Geometry;
	properties: FeatureProps;
	/** Position conseillée de la pastille [lon, lat], si elle diffère du centre de l'objet. */
	anchor?: [number, number];
}

const LETTERS = /^[A-Za-z]{1,3}(;[A-Za-z]{1,3})*$/;

/** « Quai A » si le quai porte une lettre ou un nom, « Quai » + voies sinon. */
export function platformTitle(t: Record<string, string>) {
	if (t.local_ref) return `Quai ${t.local_ref}`;
	if (!t.ref) return 'Quai sans numéro';
	return LETTERS.test(t.ref) ? `Quai ${t.ref.replaceAll(';', '-')}` : 'Quai';
}

export interface FeatureCollection {
	type: 'FeatureCollection';
	features: Feature[];
}

const ALERT: QuestId[] = ['Q7', 'Q3'];

export function buildFeatures(
	elements: OsmElement[],
	a: StationAnalysis,
	bbox: BBox
): FeatureCollection {
	const data = new OsmData(elements);
	const coords = (w: OsmWay) => data.coords(w);
	// Pancartes : schéma du pays de la gare, le même que celui de l'analyse.
	const signs = countryConfig(a.country).stopSigns;
	// Même projection locale que l'analyse (centre de l'emprise).
	const proj = new LocalProjection((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2);

	// Pastille d'une voie : au bout du quai qu'elle longe (côté gauche → début, côté droit → fin),
	// pour que les pastilles des voies parallèles ne s'empilent pas au milieu de la gare.
	const trackAnchor = new Map<number, [number, number]>();
	for (const p of a.platforms)
		for (const t of p.tracks) {
			if (trackAnchor.has(t.way)) continue;
			const w = data.ways.get(t.way);
			if (!w) continue;
			const s = t.side === 'left' ? p.axis.min + 8 : p.axis.max - 8;
			const target: Pt = {
				x: p.axis.center.x + p.axis.u.x * s,
				y: p.axis.center.y + p.axis.u.y * s
			};
			const line = coords(w).map(([lon, lat]) => proj.project(lon, lat));
			let best: Pt | undefined,
				bestD = Infinity;
			for (let i = 0; i + 1 < line.length; i++) {
				const { point } = projectOnSegment(target, line[i], line[i + 1]);
				const d = Math.hypot(point.x - target.x, point.y - target.y);
				if (d < bestD) [bestD, best] = [d, point];
			}
			if (best) trackAnchor.set(t.way, proj.unproject(best));
		}

	// Quêtes par objet (cible ou quai concerné).
	const questsOf = new Map<string, QuestId[]>();
	for (const q of a.quests)
		for (const r of [q.target, q.platform])
			if (r) {
				const k = `${r.type}/${r.id}`;
				questsOf.set(k, [...new Set([...(questsOf.get(k) ?? []), q.id])]);
			}
	const statusOf = (k: string, done: boolean): Status => {
		const qs = questsOf.get(k) ?? [];
		if (qs.some((q) => ALERT.includes(q))) return 'alert';
		return done ? 'ok' : 'missing';
	};

	const features: Feature[] = [];
	let fid = 1;

	// Quais
	for (const p of a.platforms) {
		const k = `${p.ref.type}/${p.ref.id}`;
		let geometry: Geometry | undefined;
		let under = isUnderground(p.tags);
		if (p.ref.type === 'way') {
			const w = data.ways.get(p.ref.id);
			if (!w) continue;
			const c = coords(w);
			geometry =
				w.nodes[0] === w.nodes.at(-1) && c.length > 3
					? { type: 'Polygon', coordinates: [c] }
					: { type: 'LineString', coordinates: c };
		} else {
			const r = data.relations.get(p.ref.id);
			const outer = r?.members
				.filter((m) => m.type === 'way' && m.role !== 'inner')
				.map((m) => data.ways.get(m.ref))
				.filter((w): w is OsmWay => !!w && isPlatform(r?.tags));
			const first = outer?.[0];
			if (!first) continue;
			geometry = { type: 'Polygon', coordinates: [coords(first)] };
			under ||= isUnderground(first.tags);
		}
		const t = p.tags;
		const label = t.local_ref ?? (t.ref ? t.ref.replaceAll(';', '-') : '?');
		const lettered = !t.local_ref && LETTERS.test(t.ref ?? '');
		features.push({
			type: 'Feature',
			id: fid++,
			geometry,
			properties: {
				kind: 'quai',
				osm: k,
				status: statusOf(k, !!t.ref),
				label,
				title: platformTitle(t),
				detail: lettered
					? `${Math.round(p.lengthM)} m · lettre dans « ref » : les numéros de voies sont attendus`
					: t.ref
						? `Voies ${t.ref.replaceAll(';', ' et ')} · ${Math.round(p.lengthM)} m`
						: `${Math.round(p.lengthM)} m · numéros des voies à relever sur place`,
				quests: (questsOf.get(k) ?? []).join(','),
				...(under ? { under } : {})
			}
		});
	}

	// Voies le long des quais
	for (const tr of a.tracks) {
		const w = data.ways.get(tr.way);
		if (!w) continue;
		const k = `way/${w.id}`;
		const ref = w.tags?.['railway:track_ref'];
		features.push({
			type: 'Feature',
			id: fid++,
			anchor: trackAnchor.get(w.id),
			geometry: { type: 'LineString', coordinates: coords(w) },
			properties: {
				kind: 'voie',
				osm: k,
				status: statusOf(k, !!ref),
				label: ref ?? '?',
				title: ref ? `Voie ${ref}` : 'Voie sans numéro',
				detail: ref ? 'Numéro de voie renseigné' : 'Numéro affiché en gare à relever sur place',
				quests: (questsOf.get(k) ?? []).join(','),
				...(isUnderground(w.tags) ? { under: true } : {})
			}
		});
	}

	// Autres voies de la gare (lot 7d) : rien ne disparaît de la carte quand un quai change de
	// forme ; elles ne comptent pas dans les jauges et n'ont pas de quête.
	for (const id of a.otherTracks ?? []) {
		const w = data.ways.get(id);
		if (!w) continue;
		const ref = w.tags?.['railway:track_ref'];
		features.push({
			type: 'Feature',
			id: fid++,
			geometry: { type: 'LineString', coordinates: coords(w) },
			properties: {
				kind: 'voie',
				osm: `way/${w.id}`,
				status: 'ok',
				label: ref ?? '',
				title: ref ? `Voie ${ref}` : 'Voie sans numéro',
				detail: 'Ne longe aucun quai cartographié',
				quests: '',
				away: true,
				...(isUnderground(w.tags) ? { under: true } : {})
			}
		});
	}

	// Pancartes d'arrêt
	// (Sans schéma, l'analyse ne contient aucune pancarte.)
	for (const n of a.stopSigns as OsmNode[]) {
		const k = `node/${n.id}`;
		const legacy = !!signs?.isLegacy(n.tags);
		const label = signs?.label(n.tags) ?? '';
		features.push({
			type: 'Feature',
			id: fid++,
			geometry: { type: 'Point', coordinates: [n.lon, n.lat] },
			properties: {
				kind: 'pancarte',
				osm: k,
				status: statusOf(k, !legacy && !!n.tags?.['railway:signal:direction']),
				label,
				title: `Pancarte « ${label} »`,
				detail: legacy
					? 'Ancien format de tags, à confirmer sur place'
					: n.tags?.['railway:signal:direction']
						? 'Sens renseigné'
						: 'Sens des trains à relever sur place',
				quests: (questsOf.get(k) ?? []).join(',')
			}
		});
	}

	return { type: 'FeatureCollection', features };
}
