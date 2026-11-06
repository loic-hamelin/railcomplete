// Connexion au compte OpenStreetMap (OAuth2 avec PKCE, sans secret ni serveur stationcomplete).
// Le jeton reste uniquement dans le stockage d'osm-auth (décision de relecture, architecture § 5).

import { osmAuth } from 'osm-auth';
import { readPref, writePref } from './cache.js';
import { server, srv } from './osmserver.svelte.js';

// write_notes sera demandé le jour où l'appli créera des notes OSM (pas encore le cas).
export const SCOPES = 'read_prefs write_api';

type User = { name: string; id: number };
export const account = $state<{ user?: User; checking: boolean; error?: string }>({
	user: readPref<User | undefined>(`user:${server.id}`, undefined),
	checking: false
});

let cache: { server: string; auth: ReturnType<typeof make> } | undefined;
function make() {
	const s = srv();
	return new osmAuth({
		url: s.web,
		apiUrl: s.api,
		client_id: s.clientId,
		redirect_uri: `${location.origin}/connexion/`,
		scope: SCOPES,
		singlepage: true,
		auto: false
	});
}
function auth() {
	if (cache?.server !== server.id) cache = { server: server.id, auth: make() };
	return cache.auth;
}

export const configured = () => !!srv().clientId;
export const signedIn = () => configured() && auth().authenticated();

/** Lance la connexion : la page part chez OpenStreetMap et revient sur /connexion/. */
export function login(returnTo = location.pathname + location.search) {
	sessionStorage.setItem('rc:after-login', returnTo);
	auth().authenticate(() => {});
}

/** Sur /connexion/ : échange le code reçu contre un jeton, puis lit le profil. */
export function finishLogin(): Promise<string> {
	return new Promise((resolve, reject) => {
		auth().authenticate(async (err) => {
			if (err) return reject(new Error('La connexion a été refusée ou a expiré.'));
			try {
				await refreshUser();
				resolve(sessionStorage.getItem('rc:after-login') ?? '/');
			} catch (e) {
				reject(e);
			}
		});
	});
}

export async function refreshUser() {
	account.checking = true;
	try {
		const r = await osmFetch('/api/0.6/user/details.json');
		if (!r.ok) throw new Error(`Profil indisponible (${r.status}).`);
		const u = (await r.json()).user;
		account.user = { name: u.display_name, id: u.id };
		writePref(`user:${server.id}`, account.user);
	} finally {
		account.checking = false;
	}
}

/** Déconnexion : le jeton est révoqué chez OpenStreetMap, puis oublié sur ce téléphone. */
export async function logout() {
	const a = auth();
	const token = (a as unknown as { getAccessToken: () => string }).getAccessToken();
	try {
		if (token)
			await fetch(`${srv().web}/oauth2/revoke`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: `token=${encodeURIComponent(token)}&client_id=${encodeURIComponent(srv().clientId)}`
			});
	} catch {
		/* hors-ligne : le jeton sera de toute façon oublié ici */
	}
	a.logout();
	account.user = undefined;
	writePref(`user:${server.id}`, undefined);
}

/** Requête authentifiée vers l'API du serveur choisi. */
export function osmFetch(
	path: string,
	init: { method?: string; body?: string; xml?: boolean } = {}
) {
	return auth().fetch(`${srv().api}${path}`, {
		method: (init.method ?? 'GET') as 'GET',
		body: init.body,
		headers: init.xml
			? { 'Content-Type': 'text/xml; charset=utf-8' }
			: { Accept: 'application/json' }
	});
}

/** À appeler quand le serveur change : le compte affiché est celui du nouveau serveur. */
export function syncAccount() {
	account.user = readPref<User | undefined>(`user:${server.id}`, undefined);
}
