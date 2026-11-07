// Serveur de test uniquement : recopie les quais, voies et pancartes d'une vraie gare,
// pour pouvoir essayer la saisie et l'envoi de bout en bout sans toucher à la vraie carte.

import { osmFetch } from './auth.svelte.js';
import { changesetXml, copyForTest, osmCreateXml } from './core/upload.js';
import type { OsmElement } from './core/osm.js';
import { analyzeStation } from './core/quests.js';
import { APP_VERSION } from './send.svelte.js';
import { SERVERS, server } from './osmserver.svelte.js';
import type { Station } from './stations.js';

const LIMIT =
	'Le serveur de test limite le nombre de modifications par heure pour les comptes récents. ' +
	'Réessayez dans une heure : la limite augmente avec l’ancienneté du compte.';

export async function seedTestStation(station: Station) {
	if (server.id !== 'dev') throw new Error('Réservé au serveur de test.');
	const b = station.bbox.map((x) => x.toFixed(5)).join(',');
	const r = await fetch(`${SERVERS.prod.api}/api/0.6/map.json?bbox=${b}`, {
		headers: { Accept: 'application/json' }
	});
	if (!r.ok) throw new Error(`Lecture de la vraie gare impossible (${r.status}).`);
	const elements = (await r.json()).elements as OsmElement[];
	// Seulement les voies qui longent un quai, coupées à l'emprise et simplifiées : le serveur
	// limite le nombre de modifications par heure pour les comptes récents.
	const rails = new Set(
		analyzeStation(elements, station.bbox, undefined, station.country).tracks.map((t) => t.way)
	);
	const copy = copyForTest(elements, station.bbox, { rails });
	if (!copy.length) throw new Error('Aucun quai ni voie à recopier pour cette gare.');
	if (copy.length > 2000) throw new Error('Gare trop grande pour une copie de test.');

	const cs = await osmFetch('/api/0.6/changeset/create', {
		method: 'PUT',
		xml: true,
		body: changesetXml({
			created_by: `stationcomplete ${APP_VERSION}`,
			comment: `Copie de test de la gare de ${station.name} (quais, voies, pancartes) pour essayer stationcomplete`,
			source: 'OpenStreetMap (copie pour essai)'
		})
	});
	if (cs.status === 429) throw new Error(LIMIT);
	if (!cs.ok) throw new Error(`Ouverture refusée par le serveur de test (${cs.status}).`);
	const id = Number(await cs.text());
	const up = await osmFetch(`/api/0.6/changeset/${id}/upload`, {
		method: 'POST',
		xml: true,
		body: osmCreateXml(id, copy)
	});
	await osmFetch(`/api/0.6/changeset/${id}/close`, { method: 'PUT' });
	if (up.status === 429) throw new Error(LIMIT);
	if (!up.ok) throw new Error(`Copie refusée par le serveur de test (${up.status}).`);
	return copy.length;
}
