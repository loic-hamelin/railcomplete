// Pays activés, pour la CI (workflow « Index des gares ») : lit la configuration des pays
// (src/lib/core/countries.ts, chargée directement par Node 22.18 ou plus récent).
//
// Usage :
//   node scripts/countries.mjs matrix        → [{"code":"fr","geofabrik":"europe/france",…}]
//   node scripts/countries.mjs matrix ch     → index d'un pays précis, même désactivé (préparation)
//   node scripts/countries.mjs check         → contrôle les pays activés (sortie 1 si incomplet)

import {
	COUNTRIES,
	countryProblems,
	enabledCountries,
	isCountryCode
} from '../src/lib/core/countries.ts';

/**
 * Une entrée de matrice par pays : ce dont la CI a besoin pour construire son index. Sans
 * liste, les pays activés ; avec une liste, ces pays-là (un pays en préparation peut ainsi
 * publier son index avant d'être activé), à condition que leur extrait Geofabrik soit connu.
 */
export const matrix = (codes = []) => {
	for (const code of codes)
		if (!isCountryCode(code) || !COUNTRIES[code].index.geofabrik)
			throw new Error(`Pays inconnu ou sans extrait Geofabrik : « ${code} ».`);
	const list = codes.length ? codes.map((code) => COUNTRIES[code]) : enabledCountries();
	return list.map((c) => ({
		code: c.code,
		geofabrik: c.index.geofabrik,
		file: `static/${c.index.file}`,
		cache: c.index.geocoderCache,
		stats: c.index.stats
	}));
};

/** Pays marqués activés mais incomplets (ils seraient ignorés en silence par l'appli). */
export const problems = () =>
	Object.values(COUNTRIES)
		.filter((c) => c.enabled && countryProblems(c).length)
		.map((c) => `${c.code} : ${countryProblems(c).join(', ')}`);

if (import.meta.url === `file://${process.argv[1]}`) {
	const cmd = process.argv[2];
	if (cmd === 'matrix') {
		try {
			console.log(JSON.stringify(matrix(process.argv.slice(3).filter(Boolean))));
		} catch (e) {
			console.error(e.message);
			process.exit(1);
		}
	} else if (cmd === 'check') {
		const p = problems();
		if (p.length) {
			console.error(`Pays activés incomplets :\n${p.join('\n')}`);
			process.exit(1);
		}
		console.log(
			`Pays activés : ${matrix()
				.map((c) => c.code)
				.join(', ')}`
		);
	} else {
		console.error('Usage : node scripts/countries.mjs matrix|check');
		process.exit(2);
	}
}
