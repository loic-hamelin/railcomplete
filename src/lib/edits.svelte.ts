// Saisies en attente d'envoi (lot 2), partagées par toutes les pages.
// Stockées dans IndexedDB : elles survivent à la fermeture de l'appli et au mode avion.

import { deleteEdit, getAllEdits, putEdit, readPref, writePref } from './cache.js';
import { mergeEdit, targets, type Edit } from './core/edits.js';
import { server } from './osmserver.svelte.js';

export const pending = $state<{ list: Edit[]; loaded: boolean }>({ list: [], loaded: false });

let loading: Promise<void> | undefined;
export function loadEdits() {
	loading ??= getAllEdits<Edit>().then((list) => {
		pending.list = list.sort((a, b) => a.createdAt - b.createdAt);
		pending.loaded = true;
	});
	return loading;
}

/** Saisies du serveur choisi (on n'envoie pas au serveur de test une saisie faite sur la vraie carte). */
export const mine = () => pending.list.filter((e) => (e.server ?? 'prod') === server.id);
export const editsOf = (station: string) => mine().filter((e) => e.station === station);

/** Autres saisies qui seraient retirées par la suppression de ce quai ou de cette pancarte. */
export const editsReplacedByDelete = (station: string, target: string) =>
	editsOf(station).filter((e) => targets(e) && e.target === target);

/** Enregistre une saisie ; la fusionne avec les saisies précédentes sur le même objet. */
export async function saveEdit(edit: Edit) {
	await loadEdits();
	const merged = mergeEdit(mine(), {
		...edit,
		server: server.id,
		...(settings.demo ? { demo: true } : {})
	});
	if (!merged.edit) return;
	const { edit: out, drop } = merged;
	for (const id of drop.filter((d) => d !== out.id)) await deleteEdit(id);
	await putEdit($state.snapshot(out) as Edit);
	pending.list = [...pending.list.filter((e) => e.id !== out.id && !drop.includes(e.id)), out];
}

/** Met à jour des saisies existantes (conflit marqué, par exemple). */
export async function updateEdits(changed: Edit[]) {
	for (const e of changed) await putEdit($state.snapshot(e) as Edit);
	const byId: Record<string, Edit> = Object.fromEntries(changed.map((e) => [e.id, e]));
	pending.list = pending.list.map((e) => byId[e.id] ?? e);
}

export async function removeEdits(ids: string[]) {
	for (const id of ids) await deleteEdit(id);
	pending.list = pending.list.filter((e) => !ids.includes(e.id));
}

export async function removeEdit(id: string) {
	await deleteEdit(id);
	pending.list = pending.list.filter((e) => e.id !== id);
}

/** Identifiant négatif provisoire pour un nouvel objet (unique sur ce téléphone). */
export function nextTempId() {
	const n = readPref<number>('tempId', 0) - 1;
	writePref('tempId', n);
	return n;
}

// Mode démonstration : permet d'essayer la saisie hors de la gare. Les saisies faites ainsi
// sont marquées « demo » et ne partent jamais vers la vraie carte (seulement le serveur de test).
export const settings = $state({ demo: readPref<boolean>('demo', false) });
export function setDemo(v: boolean) {
	settings.demo = v;
	writePref('demo', v);
}
