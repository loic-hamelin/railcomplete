import { expect, test } from '@playwright/test';

// Lot 6, revue d'accessibilité : à 320 px de large (zoom 400 % sur ordinateur, WCAG 1.4.10),
// aucune page ne doit défiler horizontalement.
const PAGES = [
	'/',
	'/gares/',
	'/contributions/',
	'/reglages/',
	'/a-propos/',
	'/donnees-personnelles/',
	'/mentions-legales/'
];

for (const path of PAGES)
	test(`pas de défilement horizontal à 320 px : ${path}`, async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 640 });
		await page.goto(path);
		await page.waitForLoadState('networkidle');
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(0);
	});
