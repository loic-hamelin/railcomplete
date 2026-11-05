// Vue d'une gare avec les saisies locales appliquées : données, analyse et objets cartographiques.

import { applyEdits, type Edit } from './core/edits.js';
import { buildFeatures } from './core/features.js';
import type { OsmElement } from './core/osm.js';
import { analyzeStation } from './core/quests.js';
import type { Station } from './stations.js';

export function stationView(station: Station, elements: OsmElement[], edits: Edit[]) {
	const merged = applyEdits(elements, edits);
	const analysis = analyzeStation(merged, station.bbox);
	// Objets modifiés localement, pour les distinguer sur la carte et dans les listes.
	const edited = new Set(edits.map((e) => (e.kind === 'tags' ? e.target : `node/${e.tempId}`)));
	return {
		elements: merged,
		analysis,
		edited,
		features: () => buildFeatures(merged, analysis, station.bbox)
	};
}
