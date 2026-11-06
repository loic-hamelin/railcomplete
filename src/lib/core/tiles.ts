// Tuiles de la photo aérienne IGN (WMTS, matrice PM = Web Mercator) couvrant une gare.
// Code pur : calcul des tuiles et estimation de la taille, pour le téléchargement hors-ligne.

import type { BBox } from './osm';

export const IGN_TILE_URL =
	'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
	'&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/jpeg' +
	'&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';

/** Zoom maximal servi par l'IGN (mesuré au lot 0a) ; au-delà, MapLibre agrandit. */
export const IGN_MAX_ZOOM = 19;
/** Taille moyenne mesurée d'une tuile en gare (12 à 20 ko). */
export const AVG_TILE_BYTES = 16_000;

export const tileUrl = (z: number, x: number, y: number) =>
	IGN_TILE_URL.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));

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
export function tilesForBBox(b: BBox, minZ = 15, maxZ = IGN_MAX_ZOOM) {
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
 * peu de tuiles) et détail serré (emprise + 150 m, zooms 18 et 19, l'essentiel du volume).
 */
export const stationTiles = (b: BBox) => [
	...tilesForBBox(growBBox(b, 800), 15, 17),
	...tilesForBBox(growBBox(b, 150), 18, IGN_MAX_ZOOM)
];
