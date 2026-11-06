// Envoi des saisies d'une gare vers OpenStreetMap : un changeset par gare (lot 3).
//
// Résilience (architecture § 4.6, relecture) :
// - chaque étape est notée sur le téléphone AVANT l'appel réseau ;
// - si l'envoi a été coupé, on vérifie d'abord sur le serveur si le changeset contient déjà
//   des modifications (un seul envoi par changeset) : jamais de doublon ;
// - un envoi coupé peut encore aboutir côté serveur : on attend 5 minutes avant de réessayer.

import { readPref, writePref } from './cache.js';
import type { Edit } from './core/edits.js';
import type { OsmElement } from './core/osm.js';
import {
	changesetTags,
	changesetXml,
	conflictTarget,
	elementsToFetch,
	osmChangeXml,
	planUpload
} from './core/upload.js';
import { osmFetch } from './auth.svelte.js';
import { editsOf, removeEdits, updateEdits } from './edits.svelte.js';
import { server, srv } from './osmserver.svelte.js';

export const APP_VERSION = '0.3';
const RETRY_AFTER_CUT_MS = 5 * 60 * 1000;

interface Job {
	changeset: number;
	editIds: string[];
	at: number;
}
const jobKey = (station: string) => `upload:${server.id}:${station}`;
const getJob = (station: string) => readPref<Job | undefined>(jobKey(station), undefined);
const setJob = (station: string, job?: Job) => writePref(jobKey(station), job);

export type Progress = 'idle' | 'checking' | 'reading' | 'opening' | 'uploading' | 'closing';
export const sending = $state<{ station?: string; step: Progress }>({ step: 'idle' });

export interface SendResult {
	changeset?: number;
	sent: number;
	conflicts: number;
	/** Message à afficher si l'envoi n'a pas pu se faire maintenant. */
	error?: string;
}

class HttpError extends Error {
	constructor(
		readonly status: number,
		readonly body: string
	) {
		super(`HTTP ${status}`);
	}
}

async function call(path: string, init: { method?: string; body?: string; xml?: boolean } = {}) {
	const r = await osmFetch(path, init);
	const body = await r.text();
	if (!r.ok) throw new HttpError(r.status, body);
	return { body, retryAfter: r.headers.get('Retry-After') };
}

async function readFresh(edits: Edit[]): Promise<OsmElement[]> {
	const ids = elementsToFetch(edits);
	const out: OsmElement[] = [];
	for (const [type, list] of [
		['nodes', ids.nodes],
		['ways', ids.ways],
		['relations', ids.relations]
	] as const) {
		for (let i = 0; i < list.length; i += 200) {
			const chunk = list.slice(i, i + 200);
			try {
				const { body } = await call(`/api/0.6/${type}.json?${type}=${chunk.join(',')}`);
				out.push(...(JSON.parse(body).elements as OsmElement[]));
			} catch (e) {
				// 404/410 : un objet a été supprimé ; on relit un par un pour isoler les autres.
				if (!(e instanceof HttpError) || ![404, 410].includes(e.status)) throw e;
				for (const id of chunk) {
					try {
						const one = await call(`/api/0.6/${type.slice(0, -1)}/${id}.json`);
						out.push(...(JSON.parse(one.body).elements as OsmElement[]));
					} catch (err) {
						if (!(err instanceof HttpError) || ![404, 410].includes(err.status)) throw err;
					}
				}
			}
		}
	}
	return out;
}

async function closeChangeset(id: number) {
	try {
		await call(`/api/0.6/changeset/${id}/close`, { method: 'PUT' });
	} catch {
		/* déjà fermé, ou fermeture automatique par le serveur au bout d'une heure */
	}
}

/** Termine un envoi interrompu, s'il y en a un. Renvoie true si la gare est libre. */
async function resume(station: string): Promise<SendResult | undefined> {
	const job = getJob(station);
	if (!job) return undefined;
	sending.step = 'checking';
	const { body } = await call(`/api/0.6/changeset/${job.changeset}.json`);
	const cs = JSON.parse(body).changeset ?? JSON.parse(body).elements?.[0];
	const changes = Number(cs?.changes_count ?? 0);
	if (changes > 0) {
		// L'envoi précédent a bien abouti : on range les saisies qu'il contenait.
		await removeEdits(job.editIds);
		await closeChangeset(job.changeset);
		setJob(station, undefined);
		return { changeset: job.changeset, sent: job.editIds.length, conflicts: 0 };
	}
	if (cs?.open && Date.now() - job.at < RETRY_AFTER_CUT_MS) {
		const min = Math.ceil((RETRY_AFTER_CUT_MS - (Date.now() - job.at)) / 60000);
		return {
			sent: 0,
			conflicts: 0,
			error: `Un envoi précédent a été interrompu. Par prudence, réessayez dans ${min} min.`
		};
	}
	await closeChangeset(job.changeset);
	setJob(station, undefined);
	return undefined;
}

export async function sendStation(
	station: string,
	stationName: string,
	comment: string
): Promise<SendResult> {
	if (!srv().canUpload)
		return { sent: 0, conflicts: 0, error: 'Envoi non disponible sur ce serveur.' };
	if (!navigator.onLine)
		return { sent: 0, conflicts: 0, error: 'Pas de réseau : réessayez quand vous serez connecté.' };
	if (sending.step !== 'idle')
		return { sent: 0, conflicts: 0, error: 'Un envoi est déjà en cours.' };
	sending.station = station;
	try {
		const resumed = await resume(station);
		if (resumed) return resumed;

		const edits = editsOf(station).filter((e) => !e.conflict);
		if (!edits.length) return { sent: 0, conflicts: 0 };

		sending.step = 'reading';
		const plan = planUpload(edits, await readFresh(edits));
		if (plan.conflicts.length)
			await updateEdits(
				plan.conflicts.map((c) => ({ ...edits.find((e) => e.id === c.id)!, conflict: c.reason }))
			);
		if (!plan.sent.length) return { sent: 0, conflicts: plan.conflicts.length };

		const sentEdits = edits.filter((e) => plan.sent.includes(e.id));
		const tags = changesetTags({
			comment:
				comment || `Gare de ${stationName} : numéros de quais et de voies, pancartes d'arrêt`,
			version: APP_VERSION,
			survey: sentEdits.some(
				(e) => e.kind === 'node' || !Object.keys(e.tags).every((k) => k === 'check_date')
			),
			imagery: sentEdits.some((e) => e.kind !== 'tags')
		});

		sending.step = 'opening';
		const changeset = Number(
			(
				await call('/api/0.6/changeset/create', {
					method: 'PUT',
					body: changesetXml(tags),
					xml: true
				})
			).body
		);
		// Noté avant l'envoi : en cas de coupure, on saura où vérifier.
		setJob(station, { changeset, editIds: plan.sent, at: Date.now() });

		sending.step = 'uploading';
		try {
			await call(`/api/0.6/changeset/${changeset}/upload`, {
				method: 'POST',
				body: osmChangeXml(changeset, plan),
				xml: true
			});
		} catch (e) {
			if (e instanceof HttpError && [409, 412].includes(e.status)) {
				// Conflit sur un objet précis : il passe « à revoir », les autres restent prêts.
				const target = conflictTarget(e.body);
				const hit = sentEdits.filter(
					(ed) =>
						!target ||
						(ed.kind === 'tags'
							? ed.target === target
							: ed.kind === 'node' && `way/${ed.way}` === target)
				);
				await updateEdits(
					hit.map((ed) => ({ ...ed, conflict: 'Modifié sur OpenStreetMap pendant l’envoi.' }))
				);
				await closeChangeset(changeset);
				setJob(station, undefined);
				return { sent: 0, conflicts: plan.conflicts.length + hit.length };
			}
			throw e;
		}
		await removeEdits(plan.sent);
		sending.step = 'closing';
		await closeChangeset(changeset);
		setJob(station, undefined);
		return { changeset, sent: plan.sent.length, conflicts: plan.conflicts.length };
	} catch (e) {
		if (e instanceof HttpError) {
			if (e.status === 429 || e.status === 509)
				return {
					sent: 0,
					conflicts: 0,
					error:
						'OpenStreetMap limite le nombre de modifications par heure (surtout pour les comptes récents). Vos saisies sont conservées : réessayez dans une heure.'
				};
			if (e.status === 401 || e.status === 403)
				return { sent: 0, conflicts: 0, error: 'Votre connexion a expiré : reconnectez-vous.' };
			return { sent: 0, conflicts: 0, error: `Le serveur a refusé l’envoi (${e.status}).` };
		}
		return {
			sent: 0,
			conflicts: 0,
			error: 'La connexion a été perdue. Vos saisies sont conservées ; réessayez plus tard.'
		};
	} finally {
		sending.step = 'idle';
		sending.station = undefined;
	}
}
