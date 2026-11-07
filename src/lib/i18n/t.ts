// Traduction de l'interface : fonction t(clé, paramètres) et formats (nombres, distances,
// dates, listes) selon la langue active. Code pur, utilisable par le cœur métier (core/) comme
// par l'interface, et chargeable par Node sans outil.
//
// Les messages de la langue active sont fournis par i18n.svelte.ts (état réactif de Svelte) :
// une page qui affiche t('…') se met à jour d'elle-même quand on change de langue. Sans
// fournisseur (tests unitaires, scripts), ce sont les messages posés par setMessages.

import { INTL_LOCALE, SOURCE_LOCALE, type Locale } from './locales.ts';
import { numberFormat, parse, render, type Params } from './message.ts';
import type { MessageKey } from './keys.ts';

/** Dictionnaire d'une langue : arbre de messages, groupés par écran ou par thème. */
export interface Messages {
	[k: string]: string | Messages;
}

export type { MessageKey };

export interface Catalog {
	locale: Locale;
	messages: Messages;
}

let fixed: Catalog = { locale: SOURCE_LOCALE, messages: {} };
let source: () => Catalog = () => fixed;

/** Fournisseur des messages (état réactif côté interface). */
export function setSource(fn: () => Catalog) {
	source = fn;
}

/** Messages fixes (tests unitaires, scripts) : remplace aussi le fournisseur. */
export function setMessages(locale: Locale, messages: Messages) {
	fixed = { locale, messages };
	source = () => fixed;
}

/** Langue active. */
export const locale = (): Locale => source().locale;
/** Locale Intl de la langue active (« fr-FR », « en-GB »…). */
export const intlLocale = () => INTL_LOCALE[locale()];

/** Message brut (non formaté) d'une clé, ou undefined. */
export function lookup(messages: Messages, key: string): string | undefined {
	let v: string | Messages | undefined = messages;
	for (const part of key.split('.')) {
		if (typeof v !== 'object') return undefined;
		v = v[part];
	}
	return typeof v === 'string' ? v : undefined;
}

const compiled = new WeakMap<Messages, Map<string, ReturnType<typeof parse>>>();

/**
 * Texte d'un message dans la langue active. Une clé absente renvoie la clé elle-même (visible
 * en test, jamais en production : un test unitaire vérifie chaque clé dans chaque langue).
 */
export function t(key: MessageKey, params: Params = {}): string {
	const { locale: l, messages } = source();
	let cache = compiled.get(messages);
	if (!cache) compiled.set(messages, (cache = new Map()));
	let parts = cache.get(key);
	if (!parts) {
		const raw = lookup(messages, key);
		if (raw === undefined) return key;
		parts = parse(raw);
		cache.set(key, parts);
	}
	return render(parts, params, INTL_LOCALE[l]);
}

/** Variante pour une clé construite à l'exécution (motif, type…) : même contrat que t. */
export const tk = (key: string, params?: Params) => t(key as MessageKey, params);

// ---------- Formats ----------

/** Nombre selon la langue (« 1 234 », « 1,234 », « 1.234 »). */
export const fmtNumber = (n: number, o?: Intl.NumberFormatOptions) =>
	o ? new Intl.NumberFormat(intlLocale(), o).format(n) : numberFormat(intlLocale()).format(n);

/** Nombre décimal à `digits` chiffres après la virgule (« 0,4 » en français, « 0.4 » en anglais). */
export const fmtDecimal = (n: number, digits = 1) =>
	fmtNumber(n, { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Distance arrondie au mètre : « 120 m » (sans séparateur de milliers sous 10 000). */
export const fmtDistance = (m: number) => `${fmtNumber(Math.round(m), { useGrouping: 'min2' })} m`;

/** Taille en mégaoctets, une décimale : « 3,2 Mo », « 3.2 MB ». */
export const fmtMegabytes = (bytes: number) => t('format.mb', { n: fmtDecimal(bytes / 1e6) });

/** Date courte : « 07/11/2026 », « 07/11/2026 » (en-GB), « 7.11.2026 ». */
export const fmtDate = (ts: number | Date) => new Date(ts).toLocaleDateString(intlLocale());

/** Date et heure courtes (« 07/11/2026 14:05 »). */
export const fmtDateTime = (ts: number | Date) =>
	new Date(ts).toLocaleString(intlLocale(), { dateStyle: 'short', timeStyle: 'short' });

/** Liste lisible : « toit, bâtiment et chemin piéton », « roof, building and footpath ». */
export const fmtList = (items: string[]) =>
	new Intl.ListFormat(intlLocale(), { type: 'conjunction' }).format(items);

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
	['year', 365 * 86400],
	['month', 30 * 86400],
	['week', 7 * 86400],
	['day', 86400],
	['hour', 3600],
	['minute', 60],
	['second', 1]
];

/** Date relative : « il y a 3 jours », « 3 days ago », « vor 3 Tagen », « hace 3 días ». */
export function fmtRelative(ts: number | Date, now: number | Date = Date.now()) {
	const s = (new Date(ts).getTime() - new Date(now).getTime()) / 1000;
	const [unit, size] = UNITS.find(([, size]) => Math.abs(s) >= size) ?? UNITS.at(-1)!;
	return new Intl.RelativeTimeFormat(intlLocale(), { numeric: 'auto' }).format(
		Math.round(s / size),
		unit
	);
}
