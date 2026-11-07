// Schéma des pancartes d'arrêt d'un pays (lot P1, organisation par pays). Code pur.
//
// Chaque pays balise ses pancartes d'arrêt voyageurs à sa façon dans OSM (France :
// railway:signal:stop=FR:passenger_stop + sous-clés ; Suisse : CH-FDV:577…580, étude
// docs/pays/etude-suisse.md § 4). Un schéma regroupe la reconnaissance (lecture), la
// génération des tags (écriture), le contrôle et le résumé d'une saisie, et la grille de choix
// de l'écran E7. Un pays sans schéma établi a `stopSigns: null` : pas de quêtes de pancartes.

import type { Tags } from '../osm.ts';

/** Placement d'une pancarte, commun à tous les pays (tags OpenRailwayMap génériques). */
export interface SignPlacement {
	/** Sens des trains qui lisent le panneau, par rapport au sens du way de la voie. */
	direction: 'forward' | 'backward';
	/** Vu du conducteur. */
	position: 'left' | 'right' | 'in_track' | 'ground';
	/** Petit numéro sur une plaque, facultatif. */
	ref?: string;
}

/** Saisie d'une pancarte : un type (bouton de la grille E7) et ses précisions propres au pays. */
export interface SignInputBase extends SignPlacement {
	type: string;
}

/** Bouton de la grille « Quel panneau voyez-vous ? » (E7). */
export interface SignTypeDef {
	/** Identifiant du type (valeur de `SignInputBase.type`). */
	t: string;
	/** Texte du bouton. */
	label: string;
	/** Affiché comme une plaque (texte du panneau) plutôt qu'un libellé. */
	plate?: boolean;
	/** Bouton visible mais désactivé (type pas encore saisissable) : explication en infobulle. */
	disabled?: string;
}

export interface StopSignSchema<I extends SignInputBase = SignInputBase> {
	/** Identifiant du schéma (choisit le sous-formulaire de l'écran E7) : 'fr', 'ch'… */
	id: string;
	/** Grille de choix de l'écran E7, dans l'ordre d'affichage. */
	types: SignTypeDef[];
	/** Nœud reconnu comme pancarte d'arrêt voyageurs (nouveau ou ancien balisage). */
	isStopSign(t?: Tags): boolean;
	/** Ancien balisage, à confirmer sur place (quête Q5). */
	isLegacy(t?: Tags): boolean;
	/** Libellé court pour la carte (« TGV 2D », « 6 V »…). */
	label(t?: Tags): string;
	/** Tags OSM d'une pancarte saisie. */
	toTags(s: I): Tags;
	/** Contrôle d'une saisie : message d'erreur, ou undefined si elle est complète. */
	check(s: Partial<I>): string | undefined;
	/** Libellé court d'une saisie (résumé de la contribution). */
	summary(s: I): string;
	/** Clé décrivant la pancarte, remplacée en bloc quand on corrige une pancarte existante. */
	ownsKey(k: string): boolean;
}
