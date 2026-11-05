// Saisies en attente d'envoi (lot 2), partagées par toutes les pages.
// Stockées dans IndexedDB : elles survivent à la fermeture de l'appli et au mode avion.

import { deleteEdit, getAllEdits, putEdit, readPref, writePref } from './cache.js';
import type { Edit } from './core/edits.js';

export const pending = $state<{ list: Edit[]; loaded: boolean }>({ list: [], loaded: false });

let loading: Promise<void> | undefined;
export function loadEdits() {
	loading ??= getAllEdits<Edit>().then((list) => {
		pending.list = list.sort((a, b) => a.createdAt - b.createdAt);
		pending.loaded = true;
	});
	return loading;
}

export const editsOf = (station: string) => pending.list.filter((e) => e.station === station);

/** Enregistre une saisie ; remplace une saisie précédente sur le même objet. */
export async function saveEdit(edit: Edit) {
	await loadEdits();
	const same = pending.list.find((e) =>
		edit.kind === 'tags'
			? e.kind === 'tags' && e.target === edit.target
			: e.kind === 'node' && e.tempId === edit.tempId
	);
	if (same && same.kind === 'tags' && edit.kind === 'tags') {
		// Fusion : la nouvelle saisie complète la précédente sur le même objet.
		edit = { ...edit, id: same.id, tags: { ...same.tags, ...edit.tags } };
	} else if (same) edit = { ...edit, id: same.id };
	await putEdit($state.snapshot(edit) as Edit);
	pending.list = [...pending.list.filter((e) => e.id !== edit.id), edit];
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

// Mode démonstration : permet d'essayer la saisie hors de la gare. Rien n'est envoyé au lot 2.
export const settings = $state({ demo: readPref<boolean>('demo', false) });
export function setDemo(v: boolean) {
	settings.demo = v;
	writePref('demo', v);
}
