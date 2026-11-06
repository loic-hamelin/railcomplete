// Saisies en attente d'envoi (lot 2), partagées par toutes les pages.
// Stockées dans IndexedDB : elles survivent à la fermeture de l'appli et au mode avion.

import { deleteEdit, getAllEdits, putEdit, readPref, writePref } from './cache.js';
import { editKey, type Edit } from './core/edits.js';
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

/** Enregistre une saisie ; remplace une saisie précédente sur le même objet. */
export async function saveEdit(edit: Edit) {
	await loadEdits();
	edit = { ...edit, server: server.id, ...(settings.demo ? { demo: true } : {}) };
	// Tags saisis sur un objet pas encore envoyé (pancarte posée, quai dessiné) : on les range
	// directement dans la saisie qui le crée, l'objet n'existant pas encore sur le serveur.
	if (edit.kind === 'tags' && Number(edit.target.split('/')[1]) < 0) {
		const tags = edit.tags;
		const target = edit.target;
		const creator = pending.list.find((e) => e.kind !== 'tags' && editKey(e) === target);
		if (!creator || creator.kind === 'tags') return;
		const merged: Record<string, string> = { ...creator.tags };
		for (const [k, v] of Object.entries(tags)) {
			if (v === null || v === '') delete merged[k];
			else merged[k] = v;
		}
		const summary = edit.summary.startsWith('Quai') ? `${edit.summary} (dessiné)` : creator.summary;
		edit = { ...creator, tags: merged, summary, ...(edit.demo ? { demo: true } : {}) };
	}
	const same = pending.list.find((e) =>
		edit.kind === 'tags'
			? e.kind === 'tags' && e.target === edit.target
			: e.kind === edit.kind && e.tempId === edit.tempId
	);
	if (same && same.kind === 'tags' && edit.kind === 'tags') {
		// Fusion : la nouvelle saisie complète la précédente sur le même objet.
		edit = {
			...edit,
			id: same.id,
			tags: { ...same.tags, ...edit.tags },
			base: { ...edit.base, ...same.base },
			version: same.version ?? edit.version
		};
	} else if (same) edit = { ...edit, id: same.id };
	await putEdit($state.snapshot(edit) as Edit);
	pending.list = [...pending.list.filter((e) => e.id !== edit.id), edit];
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
