// Préférence « Accrocher à la voie » des écrans de dessin (E11) et de forme (E12), lot 7d.
// Activée par défaut ; mémorisée sur ce téléphone (préférences « rc: »).

import { readPref, writePref } from './cache.js';

export const snapPref = $state({ on: true });

/** À appeler après le montage (localStorage indisponible au prérendu). */
export function loadSnapPref() {
	snapPref.on = readPref<boolean>('snapEdge', true);
}

export function setSnapPref(on: boolean) {
	snapPref.on = on;
	writePref('snapEdge', on);
}
