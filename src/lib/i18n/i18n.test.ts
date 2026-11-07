// Lot traduction : détection de la langue, format des messages (interpolation, pluriels,
// choix), formats Intl, et complétude des cinq dictionnaires.
import { afterEach, describe, expect, it } from 'vitest';
import { LOCALES, matchLocale, type Locale } from './locales.ts';
import { casesOf, paramUse, parse, render, richParts, tagsOf } from './message.ts';
import {
	fmtDecimal,
	fmtDistance,
	fmtList,
	fmtMegabytes,
	fmtNumber,
	fmtRelative,
	setMessages,
	t,
	type Messages
} from './t.ts';
import fr from './messages/fr.json';
import en from './messages/en.json';
import de from './messages/de.json';
import it_ from './messages/it.json';
import es from './messages/es.json';
import { changesetTags, proposedComment } from '../core/upload.ts';
import type { Edit } from '../core/edits.ts';

const DICTS: Record<Locale, Messages> = { fr, en, de, it: it_, es };
const flat = (o: Messages, p = '', out: Record<string, string> = {}) => {
	for (const [k, v] of Object.entries(o)) {
		if (typeof v === 'string') out[p + k] = v;
		else flat(v, `${p}${k}.`, out);
	}
	return out;
};
const FLAT = Object.fromEntries(LOCALES.map((l) => [l, flat(DICTS[l])])) as Record<
	Locale,
	Record<string, string>
>;

afterEach(() => setMessages('fr', fr));

describe('détection de la langue', () => {
	it('correspondance au plus proche, dans l’ordre des préférences', () => {
		expect(matchLocale(['fr-CH', 'de-CH'])).toBe('fr');
		expect(matchLocale(['de-CH', 'fr'])).toBe('de');
		expect(matchLocale(['it-CH'])).toBe('it');
		expect(matchLocale(['es-419'])).toBe('es');
		expect(matchLocale(['EN_gb'])).toBe('en');
		expect(matchLocale(['gsw-CH', 'rm', 'it'])).toBe('it');
	});
	it('aucune langue disponible : anglais', () => {
		expect(matchLocale(['nl-NL', 'pt-BR'])).toBe('en');
		expect(matchLocale([])).toBe('en');
		expect(matchLocale(undefined)).toBe('en');
	});
});

describe('format des messages', () => {
	const fmt = (src: string, params = {}, intl = 'fr-FR') => render(parse(src), params, intl);
	it('interpolation', () => {
		expect(fmt('Gare de {name} : {parts}', { name: 'Ambérieu', parts: 'quai' })).toBe(
			'Gare de Ambérieu : quai'
		);
		expect(fmt('{absent}x')).toBe('x');
	});
	it('pluriels selon la langue (0 est singulier en français, pluriel en anglais)', () => {
		const fr1 = '{count, plural, one {# quai} other {# quais}}';
		expect(fmt(fr1, { count: 0 })).toBe('0 quai');
		expect(fmt(fr1, { count: 1 })).toBe('1 quai');
		expect(fmt(fr1, { count: 2 })).toBe('2 quais');
		expect(fmt(fr1, { count: 1500 })).toBe('1\u202f500 quais');
		const en1 = '{count, plural, one {# platform} other {# platforms}}';
		expect(fmt(en1, { count: 0 }, 'en-GB')).toBe('0 platforms');
		expect(fmt(en1, { count: 1500 }, 'en-GB')).toBe('1,500 platforms');
		expect(fmt('{n, plural, =0 {aucun} one {un} other {#}}', { n: 0 })).toBe('aucun');
	});
	it('choix (genre) et imbrication', () => {
		const src =
			'{g, select, f {{count, plural, one {ajustée} other {ajustées}}} other {{count, plural, one {ajusté} other {ajustés}}}}';
		expect(fmt(src, { g: 'f', count: 2 })).toBe('ajustées');
		expect(fmt(src, { g: 'm', count: 1 })).toBe('ajusté');
		expect(fmt(src, { count: 1 })).toBe('ajusté');
	});
	it('erreurs de syntaxe détectées', () => {
		expect(() => parse('{oups')).toThrow();
		expect(() => parse('{n, plural, one {x}}')).toThrow(/other/);
		expect(() => parse('{n, nombre, other {x}}')).toThrow();
	});
	it('paramètres affichés et paramètres grammaticaux', () => {
		expect(paramUse('{list} {g, select, f {x} other {y}}')).toEqual({
			rendered: ['list'],
			all: ['g', 'list']
		});
		expect(paramUse('{count, plural, one {# a} other {# b}}').rendered).toEqual(['count']);
		expect(paramUse('{count, plural, one {a} other {b}}').rendered).toEqual([]);
	});
	it('texte enrichi : balises découpées, jamais interprétées', () => {
		expect(richParts('Voir <osm>OSM</osm> et <b>gras</b>.')).toEqual([
			{ text: 'Voir ' },
			{ tag: 'osm', text: 'OSM' },
			{ text: ' et ' },
			{ tag: 'b', text: 'gras' },
			{ text: '.' }
		]);
		expect(tagsOf('<b>x</b> <a>y</a>')).toEqual(['a', 'b']);
	});
});

describe('dictionnaires', () => {
	const keys = Object.keys(FLAT.fr);
	it('le français contient plusieurs centaines de messages', () => {
		expect(keys.length).toBeGreaterThan(600);
	});
	for (const l of LOCALES) {
		it(`${l} : chaque clé du français est présente, et aucune autre`, () => {
			expect(keys.filter((k) => !(k in FLAT[l]))).toEqual([]);
			expect(Object.keys(FLAT[l]).filter((k) => !(k in FLAT.fr))).toEqual([]);
			expect(Object.values(FLAT[l]).filter((v) => !v.trim())).toEqual([]);
		});
		it(`${l} : mêmes paramètres affichés et mêmes balises qu’en français`, () => {
			const bad: string[] = [];
			for (const k of keys) {
				const a = paramUse(FLAT.fr[k]);
				const b = paramUse(FLAT[l][k]);
				if (b.rendered.join() !== a.rendered.join())
					bad.push(`${k} : {${b.rendered}} ≠ {${a.rendered}}`);
				const unknown = b.all.filter((p) => !a.all.includes(p));
				if (unknown.length) bad.push(`${k} : paramètre inconnu {${unknown}}`);
				if (tagsOf(FLAT[l][k]).join() !== tagsOf(FLAT.fr[k]).join()) bad.push(`${k} : balises`);
			}
			expect(bad).toEqual([]);
		});
		it(`${l} : catégories de pluriel valides pour la langue`, () => {
			const cats = new Set(new Intl.PluralRules(l).resolvedOptions().pluralCategories);
			const bad: string[] = [];
			for (const k of keys)
				for (const c of casesOf(FLAT[l][k]))
					if (c.kind === 'plural')
						for (const key of c.keys)
							if (!key.startsWith('=') && !cats.has(key as Intl.LDMLPluralRule))
								bad.push(`${k} : ${key}`);
			expect(bad).toEqual([]);
		});
	}
	it('noms d’objets : genre grammatical m, f ou n', () => {
		for (const l of LOCALES)
			for (const [k, v] of Object.entries(FLAT[l]))
				if (/^obj\.\w+\.g$/.test(k)) expect(['m', 'f', 'n'], `${l} ${k}`).toContain(v);
	});
});

describe('formats selon la langue', () => {
	it('nombres, distances, tailles, listes', () => {
		expect(fmtDistance(120.4)).toBe('120 m');
		expect(fmtDecimal(0.45)).toBe('0,5');
		expect(fmtMegabytes(3_240_000)).toBe('3,2 Mo');
		expect(fmtList(['toit', 'bâtiment', 'chemin piéton'])).toBe('toit, bâtiment et chemin piéton');
		setMessages('en', en);
		expect(fmtDecimal(0.45)).toBe('0.5');
		expect(fmtMegabytes(3_240_000)).toBe('3.2 MB');
		expect(fmtList(['roof', 'building', 'footpath'])).toBe('roof, building and footpath');
		expect(fmtNumber(12345)).toBe('12,345');
		setMessages('de', de);
		expect(fmtNumber(12345)).toBe('12.345');
		expect(fmtDistance(800)).toBe('800 m');
	});
	it('dates relatives', () => {
		const now = Date.UTC(2026, 10, 7, 12);
		expect(fmtRelative(now - 3 * 86400_000, now)).toBe('il y a 3 jours');
		setMessages('en', en);
		expect(fmtRelative(now - 3 * 86400_000, now)).toBe('3 days ago');
		setMessages('de', de);
		expect(fmtRelative(now - 3 * 86400_000, now)).toBe('vor 3 Tagen');
		setMessages('es', es);
		expect(fmtRelative(now - 3 * 86400_000, now)).toBe('hace 3 días');
		setMessages('it', it_);
		expect(fmtRelative(now - 86400_000, now)).toBe('ieri');
	});
});

describe('ce qui part dans OpenStreetMap', () => {
	// Une saisie de numéro de voie.
	const edits: Edit[] = [
		{
			kind: 'tags',
			id: 'a',
			station: 'n1',
			createdAt: 0,
			target: 'way/1',
			tags: { 'railway:track_ref': '3' },
			summary: 'Voie 3',
			family: 'voie'
		}
	];
	it('commentaire proposé et locale du changeset dans la langue de l’interface', () => {
		expect(proposedComment('Ambérieu', edits)).toBe(
			'Gare de Ambérieu : numéros de quais et de voies, pancartes d’arrêt'
		);
		expect(
			changesetTags({ comment: 'x', version: '0.4', survey: true, imagery: false }).locale
		).toBe('fr');
		setMessages('en', en);
		expect(proposedComment('Ambérieu', edits)).toBe(
			'Ambérieu station: platform and track numbers, stop markers'
		);
		expect(
			changesetTags({ comment: 'x', version: '0.4', survey: true, imagery: false }).locale
		).toBe('en');
		setMessages('de', de);
		expect(proposedComment('Ambérieu', edits)).toBe(
			'Bahnhof Ambérieu: Bahnsteig- und Gleisnummern, Haltetafeln'
		);
	});
	it('les tags ne se traduisent jamais', () => {
		setMessages('de', de);
		expect(t('track.named', { ref: '3' })).toBe('Gleis 3');
		expect(
			changesetTags({ comment: 'x', version: '0.4', survey: true, imagery: false })
		).toMatchObject({
			hashtags: '#stationcomplete',
			source: 'survey',
			created_by: 'stationcomplete 0.4'
		});
	});
});
