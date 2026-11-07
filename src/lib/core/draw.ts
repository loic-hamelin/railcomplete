// Dessin d'un quai (E11, lot 5) : accrochage parallèle à la voie et contrôles de la forme.
// Code pur, en coordonnées locales (mètres) autour de la gare.

import {
	LocalProjection,
	dist,
	pointInPolygon,
	projectOnSegment,
	segmentsIntersect,
	sub,
	type Pt
} from './geo';
import { fmtDistance, fmtList, t as tr } from '../i18n/t.ts';
import type { OsmNode, OsmWay } from './osm';
import { THRESHOLDS, platformTracks, trackGapM } from './quests';

/** Recul du bord du quai par rapport à l'axe de la voie (m). */
export const EDGE_OFFSET_M = 1.5;
/** Distance d'accrochage : un point posé à moins de 4 m de l'axe est ramené sur le bord. */
export const SNAP_M = 4;
export const MIN_LENGTH_M = 20;
export const MAX_LENGTH_M = 800;

export type LonLat = [number, number];

export interface EdgeSnap {
	point: LonLat;
	/** Voie le long de laquelle le point a été accroché. */
	way: number;
	/** Distance du point visé à l'axe de la voie (m). */
	fromAxisM: number;
}

/**
 * Ramène un point sur la ligne parallèle à la voie la plus proche, à 1,5 m de son axe,
 * du côté où se trouve le point. Rien si aucune voie n'est à moins de 4 m.
 */
export function snapToEdge(
	p: LonLat,
	tracks: OsmWay[],
	nodeOf: (id: number) => OsmNode | undefined,
	offset = EDGE_OFFSET_M,
	max = SNAP_M
): EdgeSnap | undefined {
	const proj = new LocalProjection(p[0], p[1]);
	const P: Pt = { x: 0, y: 0 };
	let best: (EdgeSnap & { d: number }) | undefined;
	for (const w of tracks)
		for (let i = 0; i + 1 < w.nodes.length; i++) {
			const a = nodeOf(w.nodes[i]),
				b = nodeOf(w.nodes[i + 1]);
			if (!a || !b) continue;
			const A = proj.project(a.lon, a.lat),
				B = proj.project(b.lon, b.lat);
			const { point } = projectOnSegment(P, A, B);
			const d = dist(P, point);
			if (d > max || (best && d >= best.d)) continue;
			// Normale unitaire du segment, orientée vers le point visé.
			const u = sub(B, A);
			const L = Math.hypot(u.x, u.y) || 1;
			let n = { x: -u.y / L, y: u.x / L };
			const side = (P.x - point.x) * n.x + (P.y - point.y) * n.y;
			if (side < 0) n = { x: -n.x, y: -n.y };
			const q = { x: point.x + n.x * offset, y: point.y + n.y * offset };
			best = { point: proj.unproject(q), way: w.id, fromAxisM: d, d };
		}
	if (!best) return undefined;
	const { d: _d, ...snap } = best;
	void _d;
	return snap;
}

/** Seuil d'accrochage à l'écran (lot 7d) : le point accroché doit être à moins de 12 px. */
export const SNAP_PX = 12;

/**
 * Mètres par pixel CSS d'une carte MapLibre (monde de 512 px au zoom 0) au zoom et à la
 * latitude donnés : 0,10 m à z20 et 46° N, 0,42 m à z18.
 */
export function metersPerPixel(zoom: number, lat: number) {
	return (40_075_016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
}

/**
 * Accrochage au bord de voie limité à l'écran (lot 7d) : comme snapToEdge (axe à moins de
 * 4 m), mais seulement si le point accroché est à moins de `px` pixels du point visé au zoom
 * courant. En zoomant, on n'est plus happé loin de la croix. Parmi les voies possibles, le
 * point accroché le plus proche du point visé.
 */
export function snapNear(
	p: LonLat,
	tracks: OsmWay[],
	nodeOf: (id: number) => OsmNode | undefined,
	zoom: number,
	px = SNAP_PX
): EdgeSnap | undefined {
	const maxM = px * metersPerPixel(zoom, p[1]);
	const proj = new LocalProjection(p[0], p[1]);
	let best: { s: EdgeSnap; d: number } | undefined;
	for (const w of tracks) {
		const s = snapToEdge(p, [w], nodeOf);
		if (!s) continue;
		const q = proj.project(s.point[0], s.point[1]);
		const d = Math.hypot(q.x, q.y);
		if (d <= maxM && (!best || d < best.d)) best = { s, d };
	}
	return best?.s;
}

export interface ShapeCheck {
	ok: boolean;
	/** Plus grande dimension du quai (m). */
	lengthM: number;
	/** Longueur de chaque côté (m), le dernier refermant la forme. */
	sidesM: number[];
	errors: string[];
}

/**
 * Contrôle un contour de quai (sans répéter le premier point) :
 * au moins 3 points, pas de côtés qui se croisent, longueur 20–800 m,
 * ne croise aucune voie et ne chevauche aucun quai existant.
 */
export function checkShape(ring: LonLat[], tracks: LonLat[][], platforms: LonLat[][]): ShapeCheck {
	const errors: string[] = [];
	if (ring.length < 3)
		return { ok: false, lengthM: 0, sidesM: [], errors: [tr('draw.check.points')] };
	const proj = new LocalProjection(ring[0][0], ring[0][1]);
	const R = ring.map(([lon, lat]) => proj.project(lon, lat));
	const n = R.length;
	const sidesM = R.map((p, i) => dist(p, R[(i + 1) % n]));
	let lengthM = 0;
	for (let i = 0; i < n; i++)
		for (let j = i + 1; j < n; j++) lengthM = Math.max(lengthM, dist(R[i], R[j]));

	// Côtés qui se croisent (on ignore les côtés voisins, qui partagent un sommet).
	let crossing = false;
	for (let i = 0; i < n && !crossing; i++)
		for (let j = i + 2; j < n; j++) {
			if (i === 0 && j === n - 1) continue;
			if (segmentsIntersect(R[i], R[(i + 1) % n], R[j], R[(j + 1) % n])) {
				crossing = true;
				break;
			}
		}
	if (crossing) errors.push(tr('draw.check.crossing'));
	if (lengthM < MIN_LENGTH_M)
		errors.push(tr('draw.check.short', { length: fmtDistance(lengthM), min: fmtDistance(20) }));
	if (lengthM > MAX_LENGTH_M)
		errors.push(tr('draw.check.long', { length: fmtDistance(lengthM), max: fmtDistance(800) }));

	const local = (line: LonLat[]) => line.map(([lon, lat]) => proj.project(lon, lat));
	const edges = R.map((p, i) => [p, R[(i + 1) % n]] as const);
	const hitsLine = (L: Pt[]) =>
		L.some(
			(p, k) => k + 1 < L.length && edges.some(([a, b]) => segmentsIntersect(a, b, p, L[k + 1]))
		);
	if (tracks.some((t) => hitsLine(local(t)) || local(t).some((p) => pointInPolygon(p, R))))
		errors.push(tr('draw.check.track'));
	if (
		platforms.some((pl) => {
			const P = local(pl);
			return (
				hitsLine(P) || P.some((p) => pointInPolygon(p, R)) || R.some((p) => pointInPolygon(p, P))
			);
		})
	)
		errors.push(tr('draw.check.overlap'));

	return { ok: errors.length === 0, lengthM, sidesM, errors };
}

// ---------- Voies longées par le quai (lot 7d) ----------

/** Voie, en coordonnées [lon, lat], pour le contrôle de l'adjacence. */
export interface TrackLine {
	id: number;
	ref?: string;
	coords: LonLat[];
}

/**
 * Voies que longe un contour de quai (même règle que les quêtes, `platformTracks`) : fermé
 * (`closed`, bord à 6 m au plus) ou tracé en ligne (axe à 12 m au plus).
 */
export function ringTracks(ring: LonLat[], closed: boolean, tracks: TrackLine[]): Set<number> {
	if (ring.length < 2) return new Set();
	const proj = new LocalProjection(ring[0][0], ring[0][1]);
	const P = (c: LonLat[]) => c.map(([lon, lat]) => proj.project(lon, lat));
	const contour = closed ? [[...P(ring), P([ring[0]])[0]]] : [P(ring)];
	const { tracks: side } = platformTracks(
		contour,
		closed,
		tracks.map((t) => ({ id: t.id, pts: P(t.coords), trackRef: t.ref }))
	);
	return new Set(side.map((t) => t.way));
}

/**
 * Voies longées avant (`before`) et plus par le nouveau contour fermé `after`, avec l'écart
 * (m) entre la voie et le nouveau bord. Sert à l'avertissement de E11/E12 (non bloquant).
 */
export function lostTracks(before: Iterable<number>, after: LonLat[], tracks: TrackLine[]) {
	const now = ringTracks(after, true, tracks);
	const byId = new Map(tracks.map((t) => [t.id, t]));
	const out: { way: number; ref?: string; gapM: number }[] = [];
	if (after.length < 3) return out;
	const proj = new LocalProjection(after[0][0], after[0][1]);
	const P = (c: LonLat[]) => c.map(([lon, lat]) => proj.project(lon, lat));
	const ring = P([...after, after[0]]);
	for (const id of new Set(before)) {
		const t = byId.get(id);
		if (!t || now.has(id)) continue;
		out.push({ way: id, ref: t.ref, gapM: trackGapM([ring], P(t.coords)) });
	}
	return out;
}

/**
 * « Le quai ne longe plus la voie 2 (bord à 9 m). Vérifiez la forme : … ». Si le bord reste
 * proche (6 m au plus), c'est l'orientation qui a changé : « bord plus parallèle à la voie ».
 */
export function lostTracksMessage(lost: { ref?: string; gapM: number }[]) {
	if (!lost.length) return '';
	const one = (l: { ref?: string; gapM: number }) =>
		tr('draw.lost.track', {
			track: l.ref ? tr('draw.lost.theTrack', { ref: l.ref }) : tr('draw.lost.aTrack'),
			gap:
				l.gapM > THRESHOLDS.polygonEdgeDistM
					? tr('draw.lost.gap', { gap: fmtDistance(l.gapM) })
					: tr('draw.lost.notParallel')
		});
	return tr('draw.lost.message', { list: fmtList(lost.map(one)) });
}
