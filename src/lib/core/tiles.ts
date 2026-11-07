// Tuiles de la photo aérienne d'un pays (Web Mercator) couvrant une gare.
// Code pur : calcul des tuiles et estimation de la taille, pour le téléchargement hors-ligne.
// Le fournisseur (URL, zoom maximal, poids moyen) vient de la configuration du pays.

import { imageryOf, type Imagery } from './countries';
import type { BBox } from './osm';

/** URL d'une tuile ; sans photo précisée, celle du pays par défaut. */
export const tileUrl = (z: number, x: number, y: number, imagery: Imagery = imageryOf()) =>
	imagery.tileUrl.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));

export function lonLatToTile(lon: number, lat: number, z: number) {
	const n = 2 ** z;
	const r = (lat * Math.PI) / 180;
	return {
		x: Math.floor(((lon + 180) / 360) * n),
		y: Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)
	};
}

/** Agrandit une emprise de `m` mètres de chaque côté. */
export function growBBox(b: BBox, m: number): BBox {
	const dLat = m / 111_320;
	const dLon = m / (111_320 * Math.cos((((b[1] + b[3]) / 2) * Math.PI) / 180));
	return [b[0] - dLon, b[1] - dLat, b[2] + dLon, b[3] + dLat];
}

/** Toutes les tuiles couvrant l'emprise, du zoom `minZ` au zoom `maxZ`. */
export function tilesForBBox(b: BBox, minZ: number, maxZ: number) {
	const out: { z: number; x: number; y: number }[] = [];
	for (let z = minZ; z <= maxZ; z++) {
		const a = lonLatToTile(b[0], b[3], z); // coin nord-ouest
		const c = lonLatToTile(b[2], b[1], z); // coin sud-est
		for (let x = a.x; x <= c.x; x++) for (let y = a.y; y <= c.y; y++) out.push({ z, x, y });
	}
	return out;
}

/**
 * Tuiles à télécharger pour une gare : vue d'ensemble large (emprise + 800 m, zooms 15 à 17,
 * peu de tuiles) et détail serré (emprise + 150 m, zooms 18 au zoom maximal du fournisseur,
 * l'essentiel du volume).
 */
export const stationTiles = (b: BBox, imagery: Imagery = imageryOf()) => [
	...tilesForBBox(growBBox(b, 800), 15, 17),
	...tilesForBBox(growBBox(b, 150), 18, imagery.maxZoom)
];
