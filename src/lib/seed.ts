// Serveur de test uniquement : recopie les quais, voies et pancartes d'une vraie gare,
// pour pouvoir essayer la saisie et l'envoi de bout en bout sans toucher à la vraie carte.

import { osmFetch } from './auth.svelte.js';
import { changesetXml, copyForTest, osmCreateXml } from './core/upload.js';
import type { OsmElement } from './core/osm.js';
import { analyzeStation } from './core/quests.js';
import { APP_VERSION } from './send.svelte.js';
import { SERVERS, server } from './osmserver.svelte.js';
import type { Station } from './stations.js';
import { t } from './i18n/t.js';

const LIMIT = () => t('seed.limit');

export async function seedTestStation(station: Station) {
	if (server.id !== 'dev') throw new Error(t('seed.devOnly'));
	const b = station.bbox.map((x) => x.toFixed(5)).join(',');
	const r = await fetch(`${SERVERS.prod.api}/api/0.6/map.json?bbox=${b}`, {
		headers: { Accept: 'application/json' }
	});
	if (!r.ok) throw new Error(t('seed.readFailed', { status: r.status }));
	const elements = (await r.json()).elements as OsmElement[];
	// Seulement les voies qui longent un quai, coupées à l'emprise et simplifiées : le serveur
	// limite le nombre de modifications par heure pour les comptes récents.
	const rails = new Set(
		analyzeStation(elements, station.bbox, undefined, station.country).tracks.map((t) => t.way)
	);
	const copy = copyForTest(elements, station.bbox, { rails });
	if (!copy.length) throw new Error(t('seed.empty'));
	if (copy.length > 2000) throw new Error(t('seed.tooBig'));

	const cs = await osmFetch('/api/0.6/changeset/create', {
		method: 'PUT',
		xml: true,
		body: changesetXml({
			created_by: `stationcomplete ${APP_VERSION}`,
			comment: t('seed.comment', { name: station.name }),
			source: 'OpenStreetMap (copie pour essai)'
		})
	});
	if (cs.status === 429) throw new Error(LIMIT());
	if (!cs.ok) throw new Error(t('seed.openRefused', { status: cs.status }));
	const id = Number(await cs.text());
	const up = await osmFetch(`/api/0.6/changeset/${id}/upload`, {
		method: 'POST',
		xml: true,
		body: osmCreateXml(id, copy)
	});
	await osmFetch(`/api/0.6/changeset/${id}/close`, { method: 'PUT' });
	if (up.status === 429) throw new Error(LIMIT());
	if (!up.ok) throw new Error(t('seed.copyRefused', { status: up.status }));
	return copy.length;
}
