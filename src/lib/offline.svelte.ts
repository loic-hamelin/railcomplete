// Lot 4 — Hors-ligne : téléchargement d'une gare (données OSM + photos aériennes du pays de la
// gare) et liste des gares téléchargées. (File d'envoi et état du réseau : queue.svelte.ts.)

import { deleteCachedStation, readPref, writePref } from './cache.js';
import { imageryOf, recordCountry, type CountryCode } from './core/countries.js';
import { stationCacheKey } from './core/storage.js';
import { stationTiles, tileUrl } from './core/tiles.js';
import { current, openStation } from './current.svelte.js';
import { server } from './osmserver.svelte.js';
import type { Station } from './stations.js';

const TILES = 'rc-tiles';

export interface Download {
	id: string;
	name: string;
	at: number;
	tiles: number;
	bytes: number;
	/** Pays de la gare (photos). Absent dans les téléchargements d'avant le lot P1 : France. */
	country?: CountryCode;
}

const regKey = () => `offline:${server.id}`;
export const downloads = $state<{ list: Download[] }>({ list: readPref<Download[]>(regKey(), []) });
const save = () => writePref(regKey(), $state.snapshot(downloads.list));
export const reloadDownloads = () => (downloads.list = readPref<Download[]>(regKey(), []));
export const isDownloaded = (id: string) => downloads.list.some((d) => d.id === id);

/** Taille estimée avant téléchargement (photos ; les données OSM sont déjà sur le téléphone). */
export const estimate = (s: Station) => {
	const imagery = imageryOf(s.country);
	const n = stationTiles(s.bbox, imagery).length;
	return { tiles: n, bytes: n * imagery.avgTileBytes };
};

export const progress = $state<{ station?: string; done: number; total: number; error?: string }>({
	done: 0,
	total: 0
});

export async function downloadStation(s: Station) {
	if (progress.station) return;
	const imagery = imageryOf(s.country);
	const tiles = stationTiles(s.bbox, imagery);
	progress.station = s.id;
	progress.done = 0;
	progress.total = tiles.length;
	progress.error = undefined;
	try {
		// Demande au navigateur de ne pas effacer ces données en cas de manque de place.
		await navigator.storage?.persist?.().catch(() => false);
		// 1. Données OSM à jour (rangées dans IndexedDB par openStation).
		await openStation(s.id, { force: true });
		if (current.value.status === 'error') throw new Error(current.value.message);
		// 2. Photos aériennes, quelques-unes à la fois (services gratuits : on reste raisonnable).
		const cache = await caches.open(TILES);
		let bytes = 0,
			failed = 0,
			i = 0;
		const worker = async () => {
			while (i < tiles.length) {
				const t = tiles[i++];
				const url = tileUrl(t.z, t.x, t.y, imagery);
				try {
					let r = await cache.match(url);
					if (!r) {
						const res = await fetch(url, { mode: 'cors' });
						// 404 au-delà de la couverture : normal, on passe.
						if (res.ok) {
							await cache.put(url, res.clone());
							r = res;
						}
					}
					if (r) bytes += (await r.clone().blob()).size;
				} catch {
					failed++;
				}
				progress.done++;
			}
		};
		await Promise.all(Array.from({ length: imagery.maxParallel }, worker));
		if (failed > tiles.length / 4)
			throw new Error('Trop de photos n’ont pas pu être téléchargées.');
		downloads.list = [
			...downloads.list.filter((d) => d.id !== s.id),
			{ id: s.id, name: s.name, at: Date.now(), tiles: tiles.length, bytes, country: s.country }
		];
		save();
	} catch (e) {
		progress.error = (e as Error).message || 'Téléchargement interrompu.';
	} finally {
		progress.station = undefined;
	}
}

export async function removeDownload(d: Download, bbox?: Station['bbox']) {
	if (bbox && 'caches' in globalThis) {
		const cache = await caches.open(TILES);
		// Les rares tuiles communes à deux gares voisines seront retéléchargées au besoin.
		const imagery = imageryOf(recordCountry(d));
		for (const t of stationTiles(bbox, imagery))
			await cache.delete(tileUrl(t.z, t.x, t.y, imagery));
	}
	await deleteCachedStation(stationCacheKey(server.id, d.id));
	downloads.list = downloads.list.filter((x) => x.id !== d.id);
	save();
}
