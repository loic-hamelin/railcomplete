import { defineConfig, devices } from '@playwright/test';

// Tests de bout en bout sur le site construit (npm run build), servi en local.
export default defineConfig({
	testDir: 'tests',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? 'github' : 'list',
	// Téléphone réglé en français : l'appli choisit sa langue d'après le navigateur (lot
	// traduction). Les parcours en d'autres langues la choisissent dans les Réglages.
	use: { baseURL: 'http://localhost:4173', locale: 'fr-FR' },
	webServer: {
		command: 'npm run preview -- --port 4173 --strictPort',
		port: 4173,
		reuseExistingServer: !process.env.CI
	},
	projects: [
		{ name: 'android', use: { ...devices['Pixel 7'] } },
		{ name: 'iphone', use: { ...devices['iPhone 13'], browserName: 'chromium' } }
	]
});
