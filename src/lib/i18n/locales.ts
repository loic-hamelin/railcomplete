// Langues de l'interface (lot traduction). Code pur, chargeable par Node sans outil (comme
// core/countries.ts) : aucune dépendance, TypeScript « effaçable ».
//
// La langue de l'interface est indépendante du pays de la gare : un Suisse alémanique peut
// contribuer en allemand sur une gare française, un touriste en anglais. Le français est la
// langue source (textes d'origine, tests de bout en bout).

import type { Language } from '../core/countries.ts';

export type Locale = Language;

/** Langues disponibles, dans l'ordre d'affichage du sélecteur (E10). */
export const LOCALES: readonly Locale[] = ['fr', 'en', 'de', 'it', 'es'];

/** Langue source : textes d'origine, rendu au build (prerender), repli. */
export const SOURCE_LOCALE: Locale = 'fr';

/** Langue choisie quand aucune langue du téléphone n'est disponible. */
export const FALLBACK_LOCALE: Locale = 'en';

/** Nom de chaque langue dans sa propre langue (sélecteur sobre, sans drapeau). */
export const LOCALE_NAMES: Record<Locale, string> = {
	fr: 'Français',
	en: 'English',
	de: 'Deutsch',
	it: 'Italiano',
	es: 'Español'
};

/**
 * Locale BCP 47 passée à Intl (nombres, dates, listes). L'anglais est celui d'Europe (dates
 * jour/mois/année). Quand un pays plurilingue sera activé (Suisse), la région pourra suivre le
 * pays de la gare (de-CH, fr-CH, it-CH) sans changer la langue des textes.
 */
export const INTL_LOCALE: Record<Locale, string> = {
	fr: 'fr-FR',
	en: 'en-GB',
	de: 'de-DE',
	it: 'it-IT',
	es: 'es-ES'
};

export const isLocale = (v: unknown): v is Locale =>
	typeof v === 'string' && (LOCALES as readonly string[]).includes(v);

/**
 * Langue la plus proche des préférences du navigateur (navigator.languages, dans l'ordre) :
 * on compare la langue principale de chaque étiquette (fr-CH → fr, de-AT → de, gsw-CH → aucune).
 * La première disponible gagne ; sinon l'anglais.
 */
export function matchLocale(preferred: readonly string[] | undefined): Locale {
	for (const tag of preferred ?? []) {
		const primary = String(tag).trim().toLowerCase().split(/[-_]/)[0];
		if (isLocale(primary)) return primary;
	}
	return FALLBACK_LOCALE;
}
