// Pays courant (lot P1) : celui dont l'index sert à chercher une gare (E3). Préférence
// « rc:country », France par défaut ; une valeur inconnue ou un pays désactivé est ignoré.
// Une gare ouverte, elle, suit toujours la configuration de son propre pays (station.country).

import { readPref, writePref } from './cache.js';
import { isSelectable, resolveCountry, type CountryCode } from './core/countries.js';

export const country = $state<{ code: CountryCode }>({
	code: resolveCountry(readPref<unknown>('country', undefined))
});

/** Change de pays ; refusé (false) pour un pays inconnu ou désactivé. */
export function setCountry(code: unknown): boolean {
	if (!isSelectable(code)) return false;
	country.code = code;
	writePref('country', code);
	return true;
}
