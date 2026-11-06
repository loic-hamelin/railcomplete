// Interrupteur d'arrêt d'urgence (architecture § 8.4) : le fichier public /config.json,
// modifié à la main sur GitHub, peut couper les envois pour tous sans republier l'appli.

export interface RemoteConfig {
	/** false : plus aucun envoi, sur aucun serveur. */
	uploadsEnabled: boolean;
	/** Version minimale de l'appli autorisée à envoyer (ex. « 0.4 »). */
	minVersion: string;
	/** Message affiché à tous (panne, consigne), ou null. */
	message: string | null;
	/**
	 * Phase pilote : pseudos OSM autorisés à envoyer sur la vraie carte.
	 * null = tout le monde. Ne concerne pas le serveur de test.
	 */
	pilotUsers: string[] | null;
}

export const DEFAULT_CONFIG: RemoteConfig = {
	uploadsEnabled: true,
	minVersion: '0',
	message: null,
	pilotUsers: null
};

/** Lit un config.json en tolérant les champs absents ou mal formés. */
export function parseConfig(raw: unknown): RemoteConfig {
	const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	return {
		uploadsEnabled: o.uploadsEnabled !== false,
		minVersion: typeof o.minVersion === 'string' ? o.minVersion : '0',
		message: typeof o.message === 'string' && o.message.trim() ? o.message.trim() : null,
		pilotUsers: Array.isArray(o.pilotUsers)
			? o.pilotUsers.filter((u): u is string => typeof u === 'string')
			: null
	};
}

/** Compare deux versions « 1.2.3 » : négatif si a < b. */
export function compareVersions(a: string, b: string): number {
	const pa = a.split('.').map((x) => parseInt(x, 10) || 0);
	const pb = b.split('.').map((x) => parseInt(x, 10) || 0);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const d = (pa[i] ?? 0) - (pb[i] ?? 0);
		if (d) return d;
	}
	return 0;
}

/**
 * Raison pour laquelle l'envoi est bloqué, ou undefined s'il est permis.
 * `user` : pseudo OSM connecté (s'il est connu) ; `real` : vraie carte (pas le serveur de test).
 */
export function uploadBlock(
	cfg: RemoteConfig,
	version: string,
	real: boolean,
	user?: string
): string | undefined {
	if (!cfg.uploadsEnabled)
		return (
			cfg.message ??
			'Les envois sont suspendus pour le moment. Vos saisies restent sur ce téléphone.'
		);
	if (compareVersions(version, cfg.minVersion) < 0)
		return 'Une nouvelle version de l’appli est nécessaire : fermez-la puis rouvrez-la pour la mettre à jour. Vos saisies sont conservées.';
	if (real && cfg.pilotUsers && !(user && cfg.pilotUsers.includes(user)))
		return 'stationcomplete est en phase pilote : l’envoi vers la vraie carte est réservé à quelques testeurs. Vos saisies restent sur ce téléphone.';
	return undefined;
}
