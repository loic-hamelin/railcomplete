// Lecture de /config.json (arrêt d'urgence). Relu au démarrage et juste avant chaque envoi ;
// la dernière valeur lue est gardée pour l'affichage hors-ligne.

import { readPref, writePref } from './cache.js';
import { DEFAULT_CONFIG, parseConfig, type RemoteConfig } from './core/remote.js';

export const remote = $state<{ cfg: RemoteConfig }>({
	cfg: readPref<RemoteConfig>('config', DEFAULT_CONFIG)
});

/** Relit le fichier ; en cas d'échec (hors-ligne, GitHub indisponible), garde la dernière valeur. */
export async function refreshConfig(): Promise<RemoteConfig> {
	try {
		const r = await fetch('/config.json', { cache: 'no-store' });
		if (r.ok) {
			remote.cfg = parseConfig(await r.json());
			writePref('config', remote.cfg);
		}
	} catch {
		// on garde la dernière configuration connue
	}
	return remote.cfg;
}
