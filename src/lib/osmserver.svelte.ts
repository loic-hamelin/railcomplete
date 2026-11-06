// Serveur OpenStreetMap utilisé : la vraie carte (consultation) ou le serveur de test (essais d'envoi).
// L'envoi vers la vraie carte s'ouvre dès que l'application OAuth de production est déclarée ;
// pendant le pilote, /config.json le réserve aux testeurs (core/remote.ts).

import { readPref, writePref } from './cache.js';

export type ServerId = 'prod' | 'dev';

export interface OsmServer {
	id: ServerId;
	label: string;
	/** Site web (connexion OAuth2, liens vers les objets). */
	web: string;
	/** Racine de l'API (sans /api/0.6). */
	api: string;
	/** Identifiant public de l'application OAuth2 déclarée sur ce serveur ('' = pas encore). */
	clientId: string;
	/** Envoi des contributions autorisé depuis l'appli (et seulement si clientId est connu). */
	canUpload: boolean;
}

export const SERVERS: Record<ServerId, OsmServer> = {
	prod: {
		id: 'prod',
		label: 'OpenStreetMap',
		web: 'https://www.openstreetmap.org',
		api: 'https://api.openstreetmap.org',
		clientId: '',
		canUpload: true
	},
	dev: {
		id: 'dev',
		label: 'Serveur de test OSM',
		web: 'https://master.apis.dev.openstreetmap.org',
		api: 'https://master.apis.dev.openstreetmap.org',
		// Application « stationcomplete (test) » déclarée par Loïc sur le serveur de test (public).
		clientId: '83_IZ4ufBX1cwJJJe4bkHcaxFz4xmNiyxgbIzD8BT98',
		canUpload: true
	}
};

export const server = $state<{ id: ServerId }>({ id: readPref<ServerId>('server', 'prod') });
/**
 * Serveur choisi. L'identifiant OAuth2 peut être fourni localement (développement, tests) :
 * il est public par nature et ne donne aucun droit à lui seul.
 */
export const srv = (): OsmServer => {
	const s = SERVERS[server.id] ?? SERVERS.prod;
	const clientId = s.clientId || readPref<string>(`clientId:${s.id}`, '');
	return { ...s, clientId, canUpload: s.canUpload && !!clientId };
};

export function setServer(id: ServerId) {
	server.id = id;
	writePref('server', id);
}
