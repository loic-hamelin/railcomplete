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
import type { OsmNode, OsmWay } from './osm';

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
		return { ok: false, lengthM: 0, sidesM: [], errors: ['Placez au moins 3 points.'] };
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
	if (crossing) errors.push('Des côtés du quai se croisent : déplacez ou retirez un point.');
	if (lengthM < MIN_LENGTH_M)
		errors.push(`Quai trop court (${Math.round(lengthM)} m, minimum 20 m).`);
	if (lengthM > MAX_LENGTH_M)
		errors.push(`Quai trop long (${Math.round(lengthM)} m, maximum 800 m).`);

	const local = (line: LonLat[]) => line.map(([lon, lat]) => proj.project(lon, lat));
	const edges = R.map((p, i) => [p, R[(i + 1) % n]] as const);
	const hitsLine = (L: Pt[]) =>
		L.some(
			(p, k) => k + 1 < L.length && edges.some(([a, b]) => segmentsIntersect(a, b, p, L[k + 1]))
		);
	if (tracks.some((t) => hitsLine(local(t)) || local(t).some((p) => pointInPolygon(p, R))))
		errors.push('Le quai croise une voie : le bord doit rester le long de la voie.');
	if (
		platforms.some((pl) => {
			const P = local(pl);
			return (
				hitsLine(P) || P.some((p) => pointInPolygon(p, R)) || R.some((p) => pointInPolygon(p, P))
			);
		})
	)
		errors.push('Le quai chevauche un quai déjà cartographié.');

	return { ok: errors.length === 0, lengthM, sidesM, errors };
}
