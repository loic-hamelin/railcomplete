// Modifications saisies dans l'appli, gardées sur le téléphone jusqu'à leur envoi (lot 3).
// Code pur : application des modifications aux données OSM, tags des pancartes d'arrêt
// (schéma FR:passenger_stop, rapport tags § 3.5) et contrôles de saisie.

import { LocalProjection, projectOnSegment, type Pt } from './geo';
import type { OsmElement, OsmNode, OsmWay, Tags } from './osm';

export type ElementKey = `${'node' | 'way' | 'relation'}/${number}`;

interface EditBase {
	/** Identifiant local unique (horodatage + hasard). */
	id: string;
	station: string;
	createdAt: number;
	/** Serveur OSM d'origine des données modifiées (« prod » si absent). */
	server?: 'prod' | 'dev';
	/** Conflit détecté à l'envoi : la saisie est « à revoir » et n'est plus envoyée. */
	conflict?: string;
}

/** Ajoute, change ou retire des tags d'un objet existant (null = retirer le tag). */
export interface TagEdit extends EditBase {
	kind: 'tags';
	target: ElementKey;
	/** Version de l'objet au moment de la saisie (détection des conflits au lot 3). */
	version?: number;
	tags: Record<string, string | null>;
	/** Valeurs des tags modifiés au moment de la saisie (pour détecter un changement entre-temps). */
	base?: Record<string, string | null>;
	/** Résumé lisible pour la liste des contributions (« Voie 3 », « Quai A »…). */
	summary: string;
}

/** Nouvelle pancarte : nœud inséré dans le way de la voie, entre deux nœuds existants. */
export interface NewNodeEdit extends EditBase {
	kind: 'node';
	/** Identifiant négatif provisoire (convention OSM pour un objet à créer). */
	tempId: number;
	lon: number;
	lat: number;
	way: number;
	wayVersion?: number;
	/** Le nœud est inséré après le nœud d'indice `after` du way. */
	after: number;
	/** Identifiant de ce nœud voisin (retrouve la place même si le way a changé entre-temps). */
	afterNode?: number;
	tags: Tags;
	summary: string;
}

export type Edit = TagEdit | NewNodeEdit;

export const newEditId = () =>
	`${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Applique les modifications locales aux éléments OSM, sans modifier l'original. */
export function applyEdits(elements: OsmElement[], edits: Edit[]): OsmElement[] {
	if (!edits.length) return elements;
	const byKey = new Map<string, OsmElement>();
	for (const e of elements) byKey.set(`${e.type}/${e.id}`, e);
	const out = new Map(byKey);

	for (const ed of edits) {
		if (ed.kind === 'tags') {
			const e = out.get(ed.target);
			if (!e) continue;
			const tags: Tags = { ...(e.tags ?? {}) };
			for (const [k, v] of Object.entries(ed.tags)) {
				if (v === null || v === '') delete tags[k];
				else tags[k] = v;
			}
			out.set(ed.target, { ...e, tags } as OsmElement);
		} else {
			const w = out.get(`way/${ed.way}`) as OsmWay | undefined;
			if (!w) continue;
			const node: OsmNode = {
				type: 'node',
				id: ed.tempId,
				lat: ed.lat,
				lon: ed.lon,
				tags: ed.tags
			};
			out.set(`node/${ed.tempId}`, node);
			// Retrouve la place du nœud par son voisin (les indices peuvent avoir bougé).
			const nodes = [...w.nodes];
			const prev = (byKey.get(`way/${ed.way}`) as OsmWay).nodes[ed.after];
			const at = nodes.indexOf(prev);
			nodes.splice(at < 0 ? ed.after + 1 : at + 1, 0, ed.tempId);
			out.set(`way/${ed.way}`, { ...w, nodes });
		}
	}
	return [...out.values()];
}

// ---------- Accrochage sur une voie ----------

export interface Snap {
	way: number;
	/** Indice du nœud après lequel insérer. */
	after: number;
	lon: number;
	lat: number;
	/** Distance (m) entre le point visé et la voie. */
	distM: number;
	/** Cap de la voie au point d'accrochage, en degrés (0 = nord, 90 = est), dans le sens du way. */
	bearing: number;
}

/** Point le plus proche sur les voies candidates, si à moins de `maxM` mètres. */
export function snapToTracks(
	lon: number,
	lat: number,
	ways: OsmWay[],
	nodeOf: (id: number) => OsmNode | undefined,
	maxM = 3
): Snap | undefined {
	const proj = new LocalProjection(lon, lat);
	const p: Pt = { x: 0, y: 0 };
	let best: Snap | undefined;
	for (const w of ways) {
		for (let i = 0; i + 1 < w.nodes.length; i++) {
			const a = nodeOf(w.nodes[i]),
				b = nodeOf(w.nodes[i + 1]);
			if (!a || !b) continue;
			const A = proj.project(a.lon, a.lat),
				B = proj.project(b.lon, b.lat);
			const { point } = projectOnSegment(p, A, B);
			const d = Math.hypot(point.x, point.y);
			if (d > maxM || (best && d >= best.distM)) continue;
			const [plon, plat] = proj.unproject(point);
			const bearing = (Math.atan2(B.x - A.x, B.y - A.y) * 180) / Math.PI;
			best = {
				way: w.id,
				after: i,
				lon: plon,
				lat: plat,
				distM: d,
				bearing: (bearing + 360) % 360
			};
		}
	}
	return best;
}

/** Nom d'une direction à partir d'un cap (« vers le nord-est »). */
export function bearingName(deg: number) {
	const names = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest'];
	return names[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

// ---------- Numéros ----------

/** Nettoie un numéro de voie saisi : « Voie 3 » → « 3 », « v 1bis » → « 1bis ». */
export function cleanTrackRef(v: string) {
	return v
		.trim()
		.replace(/^(voie|v)\.?\s*/i, '')
		.replace(/\s+/g, ' ')
		.slice(0, 12);
}

/** Valeur OSM multiple à partir d'une liste (« 1;2 »), sans doublon, triée naturellement. */
export function joinRefs(values: string[]) {
	const clean = [...new Set(values.map(cleanTrackRef).filter(Boolean))];
	clean.sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
	return clean.join(';');
}

// ---------- Pancartes d'arrêt (schéma FR:passenger_stop) ----------

export type SignType =
	'TT' | 'nV' | 'L' | 'Z57' | 'Z50' | 'TGV' | 'UFR' | 'long' | 'short' | 'all' | 'other';

export interface SignInput {
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
	direction: 'forward' | 'backward';
	position: 'left' | 'right' | 'in_track' | 'ground';
	/** Petit numéro sur une plaque, facultatif. */
	ref?: string;
}

const K = 'railway:signal:stop';

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
	if (!s.type) return 'Choisissez le panneau que vous voyez.';
	if (s.type === 'nV' && !/^\d{1,2}$/.test(s.number ?? ''))
		return 'Indiquez le nombre de véhicules écrit sur le panneau.';
	if (s.type === 'L' && !/^\d{2,3}$/.test(s.number ?? ''))
		return 'Indiquez la longueur écrite sur le panneau (en mètres).';
	if (s.type === 'other' && !(s.caption ?? '').trim()) return 'Recopiez le texte de la pancarte.';
	if (!s.direction) return 'Indiquez le sens des trains qui lisent ce panneau.';
	if (!s.position) return 'Indiquez de quel côté se trouve le panneau.';
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
			return 'Train long';
		case 'short':
			return 'Train court';
		case 'all':
			return 'Tous trains';
		default:
			return s.caption ?? 'Autre';
	}
}

/** Date du jour au format OSM (check_date=AAAA-MM-JJ). */
export const today = (d = new Date()) =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
