// Cache local (IndexedDB) des données de gare déjà chargées, pour la consultation hors-ligne
// et pour éviter de solliciter l'API OSM à chaque ouverture.

import { openDB, type IDBPDatabase } from 'idb';
import type { OsmElement } from './core/osm.js';

export interface CachedStation {
	id: string;
	fetchedAt: number;
	elements: OsmElement[];
}

let db: Promise<IDBPDatabase> | undefined;
function open() {
	db ??= openDB('railcomplete', 2, {
		upgrade(d, oldVersion) {
			if (oldVersion < 1) d.createObjectStore('stations', { keyPath: 'id' });
			// Lot 2 : modifications saisies, en attente d'envoi vers OpenStreetMap.
			if (oldVersion < 2) d.createObjectStore('edits', { keyPath: 'id' });
		}
	});
	return db;
}

export async function getCachedStation(id: string): Promise<CachedStation | undefined> {
	try {
		return await (await open()).get('stations', id);
	} catch {
		return undefined; // navigation privée ou stockage refusé : on fonctionne sans cache
	}
}

export async function putCachedStation(entry: CachedStation) {
	try {
		await (await open()).put('stations', entry);
	} catch {
		/* sans cache */
	}
}

export async function getAllEdits<T>(): Promise<T[]> {
	try {
		return (await (await open()).getAll('edits')) as T[];
	} catch {
		return [];
	}
}
export async function putEdit(edit: { id: string }) {
	// Pas de repli silencieux ici : perdre une saisie doit se voir.
	await (await open()).put('edits', edit);
}
export async function deleteEdit(id: string) {
	await (await open()).delete('edits', id);
}

// Préférences légères (gares récentes, présentation vue) : localStorage, protégé.
export function readPref<T>(key: string, fallback: T): T {
	try {
		const v = localStorage.getItem(`rc:${key}`);
		return v ? (JSON.parse(v) as T) : fallback;
	} catch {
		return fallback;
	}
}
export function writePref(key: string, value: unknown) {
	try {
		localStorage.setItem(`rc:${key}`, JSON.stringify(value));
	} catch {
		/* sans préférences */
	}
}
