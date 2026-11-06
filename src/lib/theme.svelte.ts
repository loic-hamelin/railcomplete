// Thème d'affichage (E10) : comme le téléphone, clair ou sombre. Simple préférence d'affichage,
// posée sur <html data-theme> ; les jetons de couleur sont dans app.css.

import { readPref, writePref } from './cache.js';

export type Theme = 'system' | 'light' | 'dark';

export const theme = $state<{ value: Theme }>({ value: 'system' });

function apply() {
	const root = document.documentElement;
	if (theme.value === 'system') delete root.dataset.theme;
	else root.dataset.theme = theme.value;
}

/** Lit la préférence enregistrée et l'applique (au démarrage de l'appli). */
export function loadTheme() {
	const v = readPref<Theme>('theme', 'system');
	theme.value = v === 'light' || v === 'dark' ? v : 'system';
	apply();
}

export function setTheme(v: Theme) {
	theme.value = v;
	writePref('theme', v);
	apply();
}
