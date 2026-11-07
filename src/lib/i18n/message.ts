// Format des messages traduits : sous-ensemble de la syntaxe ICU MessageFormat, celle que
// connaissent les plateformes de traduction (Weblate, Crowdin) et les traducteurs bénévoles.
// Code pur, sans dépendance.
//
//   {name}                                  valeur du paramètre « name »
//   {count, plural, one {# quai} other {# quais}}   pluriel selon la langue (Intl.PluralRules) ;
//                                           « # » = le nombre formaté ; « =0 {…} » = valeur exacte
//   {g, select, f {elle} other {il}}        choix sur une valeur (genre, motif…)
//
// Les accolades sont réservées à cette syntaxe ; l'apostrophe n'a aucun rôle particulier
// (pas d'échappement ICU : on écrit « l’ » ou « l' » librement).

export type Params = Record<string, string | number | undefined>;

type Part =
	| string
	| { arg: string }
	| { arg: string; kind: 'plural' | 'select'; cases: Record<string, Part[]> }
	| { hash: true };

/** Analyse un message ; lève une erreur sur une accolade non fermée. */
export function parse(src: string): Part[] {
	let i = 0;
	function message(inPlural: boolean, closing: boolean): Part[] {
		const out: Part[] = [];
		let text = '';
		const flush = () => {
			if (text) out.push(text);
			text = '';
		};
		while (i < src.length) {
			const c = src[i];
			if (c === '}') {
				if (!closing) throw new Error(`Accolade fermante en trop dans « ${src} »`);
				flush();
				return out;
			}
			if (c === '#' && inPlural) {
				flush();
				out.push({ hash: true });
				i++;
				continue;
			}
			if (c !== '{') {
				text += c;
				i++;
				continue;
			}
			flush();
			i++;
			out.push(argument());
		}
		if (closing) throw new Error(`Accolade non fermée dans « ${src} »`);
		flush();
		return out;
	}
	function word() {
		const m = /^\s*([^\s,{}]+)\s*/.exec(src.slice(i));
		if (!m) throw new Error(`Paramètre attendu dans « ${src} »`);
		i += m[0].length;
		return m[1];
	}
	function argument(): Part {
		const arg = word();
		if (src[i] === '}') {
			i++;
			return { arg };
		}
		if (src[i] !== ',') throw new Error(`« , » ou « } » attendu dans « ${src} »`);
		i++;
		const kind = word();
		if (kind !== 'plural' && kind !== 'select')
			throw new Error(`Type « ${kind} » inconnu dans « ${src} » (plural ou select)`);
		if (src[i] !== ',') throw new Error(`« , » attendu dans « ${src} »`);
		i++;
		const cases: Record<string, Part[]> = {};
		for (;;) {
			while (/\s/.test(src[i] ?? '')) i++;
			if (src[i] === '}') {
				i++;
				break;
			}
			const key = word();
			if (src[i] !== '{') throw new Error(`« { » attendu après « ${key} » dans « ${src} »`);
			i++;
			cases[key] = message(kind === 'plural', true);
			i++; // accolade fermante du cas
		}
		if (!cases.other) throw new Error(`Cas « other » manquant dans « ${src} »`);
		return { arg, kind, cases };
	}
	return message(false, false);
}

/** Noms des paramètres d'un message (contrôle de cohérence entre langues). */
export function paramsOf(src: string): string[] {
	const names = new Set<string>();
	const walk = (parts: Part[]) => {
		for (const p of parts) {
			if (typeof p === 'string' || 'hash' in p) continue;
			names.add(p.arg);
			if ('cases' in p) Object.values(p.cases).forEach(walk);
		}
	};
	walk(parse(src));
	return [...names].sort();
}

/** Clés de cas de pluriel et de choix d'un message (contrôle des catégories). */
export function casesOf(src: string): { arg: string; kind: string; keys: string[] }[] {
	const out: { arg: string; kind: string; keys: string[] }[] = [];
	const walk = (parts: Part[]) => {
		for (const p of parts) {
			if (typeof p === 'string' || 'hash' in p || !('cases' in p)) continue;
			out.push({ arg: p.arg, kind: p.kind, keys: Object.keys(p.cases) });
			Object.values(p.cases).forEach(walk);
		}
	};
	walk(parse(src));
	return out;
}

const plurals = new Map<string, Intl.PluralRules>();
const numbers = new Map<string, Intl.NumberFormat>();
const pluralRules = (l: string) =>
	plurals.get(l) ?? plurals.set(l, new Intl.PluralRules(l)).get(l)!;
export const numberFormat = (l: string) =>
	numbers.get(l) ?? numbers.set(l, new Intl.NumberFormat(l)).get(l)!;

/** Produit le texte d'un message analysé. */
export function render(parts: Part[], params: Params, intl: string, n?: number): string {
	let s = '';
	for (const p of parts) {
		if (typeof p === 'string') s += p;
		else if ('hash' in p) s += n === undefined ? '#' : numberFormat(intl).format(n);
		else if (!('cases' in p)) s += params[p.arg] ?? '';
		else {
			const v = params[p.arg];
			if (p.kind === 'plural') {
				const num = Number(v ?? 0);
				const c = p.cases[`=${num}`] ?? p.cases[pluralRules(intl).select(num)] ?? p.cases.other;
				s += render(c, params, intl, num);
			} else s += render(p.cases[String(v)] ?? p.cases.other, params, intl, n);
		}
	}
	return s;
}

/** Morceau de texte enrichi : texte simple, ou texte d'une balise (`<osm>OpenStreetMap</osm>`). */
export interface RichPart {
	tag?: string;
	text: string;
}

const TAG = /<([a-z][\w-]*)>(.*?)<\/\1>/g;

/**
 * Découpe un message traduit autour de ses balises (liens, mise en valeur), pour que la page les
 * rende en éléments HTML sans jamais interpréter le texte comme du HTML.
 */
export function richParts(text: string): RichPart[] {
	const out: RichPart[] = [];
	let at = 0;
	for (const m of text.matchAll(TAG)) {
		if (m.index > at) out.push({ text: text.slice(at, m.index) });
		out.push({ tag: m[1], text: m[2] });
		at = m.index + m[0].length;
	}
	if (at < text.length) out.push({ text: text.slice(at) });
	return out;
}

/** Noms des balises d'un message (contrôle de cohérence entre langues). */
export const tagsOf = (text: string) => [...text.matchAll(TAG)].map((m) => m[1]).sort();

/**
 * Usage des paramètres d'un message (contrôle de cohérence entre langues) :
 * - `rendered` : paramètres dont la valeur apparaît dans le texte ({x}, ou « # » d'un pluriel) ;
 *   ils doivent être les mêmes dans toutes les langues ;
 * - `all` : tous les paramètres, y compris ceux qui ne servent qu'à choisir une forme
 *   grammaticale (genre, accord) : une langue peut les ignorer, jamais en inventer.
 */
export function paramUse(src: string): { rendered: string[]; all: string[] } {
	const rendered = new Set<string>();
	const all = new Set<string>();
	const hasHash = (parts: Part[]): boolean =>
		parts.some(
			(p) =>
				typeof p !== 'string' &&
				('hash' in p ||
					('cases' in p && p.kind === 'select' && Object.values(p.cases).some(hasHash)))
		);
	const walk = (parts: Part[]) => {
		for (const p of parts) {
			if (typeof p === 'string' || 'hash' in p) continue;
			all.add(p.arg);
			if (!('cases' in p)) rendered.add(p.arg);
			else {
				if (p.kind === 'plural' && Object.values(p.cases).some(hasHash)) rendered.add(p.arg);
				Object.values(p.cases).forEach(walk);
			}
		}
	};
	walk(parse(src));
	return { rendered: [...rendered].sort(), all: [...all].sort() };
}
