// Langue de l'interface (lot traduction) : état réactif, chargement des messages, préférence.
//
// - Seule la langue active est chargée : chaque dictionnaire est un morceau JavaScript à part
//   (import dynamique), le français compris. Au build (prerender), les pages sont rendues en
//   français ; au démarrage, le chargement de la mise en page (+layout.ts) attend les messages
//   de la langue choisie avant d'afficher l'appli.
// - Choix : préférence « rc:lang » (Réglages, E10), sinon la langue du téléphone la plus
//   proche (navigator.languages : fr-CH → fr, de-CH → de, sinon anglais).
// - <html lang> suit la langue active (lecteurs d'écran, césure, correcteur).

import { readPref, writePref } from '../cache.js';
import {
	isLocale,
	LOCALE_NAMES,
	LOCALES,
	matchLocale,
	SOURCE_LOCALE,
	type Locale
} from './locales.js';
import { setSource, type Catalog, type Messages } from './t.js';

const loaders: Record<Locale, () => Promise<{ default: unknown }>> = {
	fr: () => import('./messages/fr.json'),
	en: () => import('./messages/en.json'),
	de: () => import('./messages/de.json'),
	it: () => import('./messages/it.json'),
	es: () => import('./messages/es.json')
};

// Dictionnaires déjà chargés (simple cache, pas un état réactif).
const loaded: Partial<Record<Locale, Messages>> = {};

let catalog = $state.raw<Catalog>({ locale: SOURCE_LOCALE, messages: {} });
setSource(() => catalog);

/** Langues proposées (sélecteur des Réglages, futur premier lancement). */
export const LANGUAGES = LOCALES.map((code) => ({ code, name: LOCALE_NAMES[code] }));

/** État réactif de la langue : `lang.current` se met à jour au changement de langue. */
export const lang = {
	get current(): Locale {
		return catalog.locale;
	},
	/** Messages de la langue active chargés (faux seulement avant le premier chargement). */
	get ready() {
		return !!loaded[catalog.locale];
	}
};

async function messagesOf(l: Locale): Promise<Messages> {
	return (loaded[l] ??= (await loaders[l]()).default as Messages);
}

/** Charge puis active une langue (sans l'enregistrer). */
export async function useLocale(l: Locale) {
	const messages = await messagesOf(l);
	catalog = { locale: l, messages };
	if (typeof document !== 'undefined') document.documentElement.lang = l;
}

/** Langue à utiliser : préférence enregistrée, sinon celle du téléphone. */
export function preferredLocale(): Locale {
	const saved = readPref<unknown>('lang', undefined);
	if (isLocale(saved)) return saved;
	return matchLocale(typeof navigator === 'undefined' ? [] : navigator.languages);
}

/** Au démarrage : langue enregistrée ou détectée (navigateur), français au build. */
export function initLocale() {
	return useLocale(typeof window === 'undefined' ? SOURCE_LOCALE : preferredLocale());
}

/** Choix explicite de l'utilisateur (Réglages) : enregistré dans « rc:lang ». */
export async function setLocale(l: Locale) {
	if (!isLocale(l)) return false;
	await useLocale(l);
	writePref('lang', l);
	return true;
}
