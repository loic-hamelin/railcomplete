// Lot 4 — Hors-ligne : téléchargement d'une gare (données OSM + photos aériennes IGN),
// liste des gares téléchargées, et file d'envoi qui part toute seule au retour du réseau.

import { deleteCachedStation, readPref, writePref } from './cache.js';
import { AVG_TILE_BYTES, stationTiles, tileUrl } from './core/tiles.js';
import { current, openStation } from './current.svelte.js';
import { server } from './osmserver.svelte.js';
import { sendStation, type SendResult } from './send.svelte.js';
import type { Station } from './stations.js';

const TILES = 'rc-tiles';

export interface Download {
	id: string;
	name: string;
	at: number;
	tiles: number;
	bytes: number;
}

const regKey = () => `offline:${server.id}`;
export const downloads = $state<{ list: Download[] }>({ list: readPref<Download[]>(regKey(), []) });
const save = () => writePref(regKey(), $state.snapshot(downloads.list));
export const reloadDownloads = () => (downloads.list = readPref<Download[]>(regKey(), []));
export const isDownloaded = (id: string) => downloads.list.some((d) => d.id === id);

/** Taille estimée avant téléchargement (photos ; les données OSM sont déjà sur le téléphone). */
export const estimate = (s: Station) => {
	const n = stationTiles(s.bbox).length;
	return { tiles: n, bytes: n * AVG_TILE_BYTES };
};

export const progress = $state<{ station?: string; done: number; total: number; error?: string }>({
	done: 0,
	total: 0
});

export async function downloadStation(s: Station) {
	if (progress.station) return;
	const tiles = stationTiles(s.bbox);
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
		// 2. Photos aériennes, 4 à la fois (service gratuit de l'IGN : on reste raisonnable).
		const cache = await caches.open(TILES);
		let bytes = 0,
			failed = 0,
			i = 0;
		const worker = async () => {
			while (i < tiles.length) {
				const t = tiles[i++];
				const url = tileUrl(t.z, t.x, t.y);
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
		await Promise.all([worker(), worker(), worker(), worker()]);
		if (failed > tiles.length / 4)
			throw new Error('Trop de photos n’ont pas pu être téléchargées.');
		downloads.list = [
			...downloads.list.filter((d) => d.id !== s.id),
			{ id: s.id, name: s.name, at: Date.now(), tiles: tiles.length, bytes }
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
		for (const t of stationTiles(bbox)) await cache.delete(tileUrl(t.z, t.x, t.y));
	}
	await deleteCachedStation(server.id === 'prod' ? d.id : `${server.id}:${d.id}`);
	downloads.list = downloads.list.filter((x) => x.id !== d.id);
	save();
}

// ---------------- File d'envoi ----------------
// L'utilisateur a relu et validé l'envoi d'une gare sans réseau : on l'envoie au retour du réseau.

interface Queued {
	station: string;
	name: string;
	comment: string;
	at: number;
}
const queueKey = () => `queue:${server.id}`;
export const queue = $state<{ list: Queued[]; last?: SendResult & { name: string } }>({
	list: readPref<Queued[]>(queueKey(), [])
});
const saveQueue = () => writePref(queueKey(), $state.snapshot(queue.list));
export const isQueued = (id: string) => queue.list.some((q) => q.station === id);

export function enqueue(station: string, name: string, comment: string) {
	queue.list = [
		...queue.list.filter((q) => q.station !== station),
		{ station, name, comment, at: Date.now() }
	];
	saveQueue();
}
export function dequeue(station: string) {
	queue.list = queue.list.filter((q) => q.station !== station);
	saveQueue();
}

let flushing = false;
/** Envoie les gares en attente, une à une. Appelé au démarrage et au retour du réseau. */
export async function flushQueue() {
	if (flushing || !navigator.onLine || !queue.list.length) return;
	flushing = true;
	try {
		for (const q of [...queue.list]) {
			const r = await sendStation(q.station, q.name, q.comment);
			// Erreur temporaire (réseau, limite) : la gare reste en file pour le prochain retour.
			if (r.error && !r.changeset) {
				queue.last = { ...r, name: q.name };
				break;
			}
			dequeue(q.station);
			queue.last = { ...r, name: q.name };
		}
	} finally {
		flushing = false;
	}
}

export const net = $state({ online: true });
let listening = false;
/** À appeler une fois (layout) : suit l'état du réseau et vide la file quand il revient. */
export function watchNetwork() {
	net.online = navigator.onLine;
	if (listening) return;
	listening = true;
	addEventListener('online', () => {
		net.online = true;
		flushQueue();
	});
	addEventListener('offline', () => (net.online = false));
	flushQueue();
}
