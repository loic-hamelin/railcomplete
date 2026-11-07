// Pancartes d'arrêt françaises : schéma FR:passenger_stop (rapport tags § 3.5), et ancien
// balisage FR:ARRET_* à confirmer sur place. Code pur, déplacé sans changement fonctionnel
// depuis osm.ts, edits.ts et features.ts (lot P1, organisation par pays).

import type { Tags } from '../osm.ts';
import type { SignPlacement, StopSignSchema, SignTypeDef } from './types.ts';
import { t as tr } from '../../i18n/t.ts';

const K = 'railway:signal:stop';

/** Pancarte d'arrêt : nouveau schéma (railway:signal:stop=FR:passenger_stop…) ou ancien (FR:ARRET_*). */
export const isStopSign = (t: Tags = {}) =>
	t.railway === 'signal' && (t[K] === 'FR:passenger_stop' || (t[K] ?? '').startsWith('FR:ARRET_'));
// « FR:ARRET » seul est un arrêt réglementaire (ordre verbal), pas une pancarte d'arrêt voyageurs.

export const isLegacyStopSign = (t: Tags = {}) => (t[K] ?? '').startsWith('FR:ARRET_');

/** Libellé d'une pancarte pour la carte, à partir des tags du schéma FR:passenger_stop. */
// Rapport tags § 3.5 : railway:signal:stop=FR:passenger_stop + une sous-clé de catégorie.
export function stopSignLabel(t: Record<string, string> = {}) {
	const k = K;
	const v = t[k] ?? '';
	if (v === 'FR:ARRET') return tr('sign.label.stop');
	if (v.startsWith('FR:ARRET_'))
		return (t[`${k}:caption`] ?? v.slice('FR:ARRET_'.length).replace(/_/g, ' ')).slice(0, 8);
	const conv = t[`${k}:conventional`];
	if (conv === 'FR:TT') return 'TT';
	if (conv === 'FR:vehicle_number') return `${t[`${k}:conventional:number`] ?? 'n'} V`;
	if (t[`${k}:any`] === 'FR:train_length') return `L ${t[`${k}:any:length`] ?? ''}`.trim();
	if (t[`${k}:regional`] === 'FR:Z57') {
		const n = t[`${k}:regional:unit_number`];
		return n ? `Z57 ${n.replace(';', '-')}` : 'Z57';
	}
	if (t[`${k}:suburban`] === 'FR:Z50')
		return t[`${k}:suburban:for`] === 'multiple_unit' ? 'Z50-2' : 'Z50-1';
	const sub = t[`${k}:suburban`];
	if (sub === 'FR:long_train') return 'TL';
	if (sub === 'FR:short_train') return 'TC';
	if (sub === 'FR:all_trains') return tr('sign.label.all');
	if (t[`${k}:accessibility`] === 'FR:UFR') return 'UFR';
	if (t[`${k}:highspeed`] === 'FR:TGV') {
		const f = t[`${k}:highspeed:for`];
		const d = t[`${k}:highspeed:type`] === 'duplex' ? 'D' : '';
		return `TGV ${f === 'single_unit' ? '1' : f === 'multiple_unit' ? '2' : '1-2'}${d}`;
	}
	return tr('sign.label.stop');
}

export type SignType =
	'TT' | 'nV' | 'L' | 'Z57' | 'Z50' | 'TGV' | 'UFR' | 'long' | 'short' | 'all' | 'other';

export interface SignInput extends SignPlacement {
	type: SignType;
	/** nV : nombre de véhicules ; L : longueur en mètres ; Z57 : numéro(s) d'unité (« 2 », « 2;3 »). */
	number?: string;
	/** Z57, Z50, TGV : unité simple (US) ou multiple (UM) ; absent pour « 1-2 ». */
	unit?: 'single_unit' | 'multiple_unit';
	/** TGV duplex (« 2D »). */
	duplex?: boolean;
	/** Rebroussement (« RBT »). */
	reversal?: boolean;
	/** Texte libre lu sur la pancarte (type « autre »). */
	caption?: string;
}

/** Tags OSM d'une pancarte d'arrêt voyageurs. */
export function signTags(s: SignInput): Tags {
	const t: Tags = {
		railway: 'signal',
		'railway:signal:direction': s.direction,
		'railway:signal:position': s.position,
		[K]: 'FR:passenger_stop'
	};
	const cat = (c: string, value: string) => {
		t[`${K}:${c}`] = value;
		t[`${K}:${c}:form`] = 'sign';
		return (key: string, v: string | undefined) => v && (t[`${K}:${c}:${key}`] = v);
	};
	switch (s.type) {
		case 'TT':
			cat('conventional', 'FR:TT');
			break;
		case 'nV': {
			const set = cat('conventional', 'FR:vehicle_number');
			set('for', 'vehicles');
			set('number', s.number);
			break;
		}
		case 'L': {
			const set = cat('any', 'FR:train_length');
			set('length', s.number);
			if (s.reversal) set('reversal', 'yes');
			break;
		}
		case 'Z57': {
			const set = cat('regional', 'FR:Z57');
			set('for', s.unit);
			set('unit_number', s.number);
			if (s.reversal) set('reversal', 'yes');
			break;
		}
		case 'Z50': {
			const set = cat('suburban', 'FR:Z50');
			set('for', s.unit);
			break;
		}
		case 'TGV': {
			const set = cat('highspeed', 'FR:TGV');
			set('for', s.unit);
			if (s.duplex) set('type', 'duplex');
			if (s.reversal) set('reversal', 'yes');
			break;
		}
		case 'UFR':
			cat('accessibility', 'FR:UFR');
			break;
		case 'long':
			cat('suburban', 'FR:long_train');
			break;
		case 'short':
			cat('suburban', 'FR:short_train');
			break;
		case 'all':
			cat('suburban', 'FR:all_trains');
			break;
		case 'other':
			// Pancarte non reconnue : on garde le texte lu, pour qu'un cartographe la précise.
			if (s.caption) t[`${K}:caption`] = s.caption.slice(0, 40);
			break;
	}
	if (s.ref) t.ref = s.ref.trim().slice(0, 12);
	return t;
}

/** Contrôle d'une saisie de pancarte : renvoie un message d'erreur ou undefined. */
export function checkSign(s: Partial<SignInput>): string | undefined {
	if (!s.type) return tr('sign.check.type');
	if (s.type === 'nV' && !/^\d{1,2}$/.test(s.number ?? '')) return tr('sign.check.vehicles');
	if (s.type === 'L' && !/^\d{2,3}$/.test(s.number ?? '')) return tr('sign.check.length');
	if (s.type === 'other' && !(s.caption ?? '').trim()) return tr('sign.check.caption');
	if (!s.direction) return tr('sign.check.direction');
	if (!s.position) return tr('sign.check.position');
	return undefined;
}

/** Libellé court d'une saisie de pancarte (« 6 V », « TGV 2 »…). */
export function signSummary(s: SignInput) {
	switch (s.type) {
		case 'TT':
			return 'TT';
		case 'nV':
			return `${s.number} V`;
		case 'L':
			return `L ${s.number}`;
		case 'Z57':
			return `Z57 ${(s.number ?? '').replace(';', '-')}`.trim();
		case 'Z50':
			return s.unit === 'multiple_unit' ? 'Z50-2' : 'Z50-1';
		case 'TGV':
			return `TGV ${s.unit === 'single_unit' ? '1' : s.unit === 'multiple_unit' ? '2' : '1-2'}${s.duplex ? 'D' : ''}`;
		case 'UFR':
			return 'UFR';
		case 'long':
			return tr('sign.type.long');
		case 'short':
			return tr('sign.type.short');
		case 'all':
			return tr('sign.type.all');
		default:
			return s.caption ?? tr('sign.type.otherShort');
	}
}

/** Grille de choix de l'écran E7 (pancartes françaises). */
export const SIGN_TYPES: SignTypeDef[] = [
	{ t: 'TT', label: 'TT', plate: true },
	{ t: 'nV', label: 'n V', plate: true },
	{ t: 'L', label: 'L 220', plate: true },
	{ t: 'Z57', label: 'Z57', plate: true },
	{ t: 'Z50', label: 'Z50', plate: true },
	{ t: 'TGV', label: 'TGV', plate: true },
	{ t: 'UFR', label: 'UFR', plate: true },
	// Libellés traduits lus à l'affichage (getters) : ils suivent la langue de l'interface.
	{
		t: 'long',
		get label() {
			return tr('sign.type.long');
		}
	},
	{
		t: 'short',
		get label() {
			return tr('sign.type.short');
		}
	},
	{
		t: 'all',
		get label() {
			return tr('sign.type.all');
		}
	},
	{
		t: 'other',
		get label() {
			return tr('sign.type.other');
		}
	},
	// Pancartes US/UM : schéma OSM pas encore validé, bouton affiché mais inactif.
	{
		t: 'US/UM',
		get label() {
			return tr('sign.type.usum');
		},
		get disabled() {
			return tr('sign.type.usumPending');
		}
	}
];

export const frStopSigns: StopSignSchema<SignInput> = {
	id: 'fr',
	types: SIGN_TYPES,
	isStopSign,
	isLegacy: isLegacyStopSign,
	label: stopSignLabel,
	toTags: signTags,
	check: checkSign,
	summary: signSummary,
	ownsKey: (k) => k.startsWith(K)
};
