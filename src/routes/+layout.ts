import { initLocale } from '#lib/i18n/i18n.svelte.js';

// Site entièrement statique : chaque page est générée au build (GitHub Pages).
export const prerender = true;
// /a-propos/ → a-propos/index.html, servi correctement par GitHub Pages.
export const trailingSlash = 'always';

// Langue de l'interface : au build, le français ; au démarrage dans le téléphone, la langue
// enregistrée (Réglages) ou celle du téléphone. Seuls ses messages sont chargés, avant
// l'affichage de la première page (pas de texte qui change sous les yeux après l'hydratation).
export const load = async () => {
	await initLocale();
};
