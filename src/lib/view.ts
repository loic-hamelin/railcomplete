// Vue d'une gare avec les saisies locales appliquées : données, analyse et objets cartographiques.

import { applyEdits, editKey, isRemoval, type Edit } from './core/edits.js';
import { buildFeatures } from './core/features.js';
import type { OsmElement } from './core/osm.js';
import { analyzeStation } from './core/quests.js';
import type { Station } from './stations.js';

export function stationView(station: Station, elements: OsmElement[], edits: Edit[]) {
	// Une forme ou une suppression « à revoir » ne s'affiche pas : la carte montre l'état
	// d'OpenStreetMap, pour pouvoir refaire la modification sur des données à jour.
	const shown = edits.filter((e) => !(e.conflict && (e.kind === 'shape' || isRemoval(e))));
	const merged = applyEdits(elements, shown);
	const analysis = analyzeStation(merged, station.bbox);
	// Objets modifiés localement, pour les distinguer sur la carte et dans les listes.
	const edited = new Set<string>(shown.map(editKey));
	return {
		elements: merged,
		analysis,
		edited,
		features: () => buildFeatures(merged, analysis, station.bbox)
	};
}
