import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Lot 6 : pages légales accessibles, effacement de toutes les données du téléphone.
async function expectAccessible(page: Page) {
	const { violations } = await new AxeBuilder({
		page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]['page']
	})
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
		.analyze();
	expect(violations.map((v) => `${v.id} : ${v.help}`)).toEqual([]);
}

test('mentions légales et données personnelles, depuis les réglages', async ({ page }) => {
	await page.goto('/reglages/');
	await page.getByRole('link', { name: 'Mentions légales' }).click();
	await expect(page.getByRole('heading', { name: 'Mentions légales' })).toBeVisible();
	await expect(page.getByText(/édité par Loïc Hamelin/)).toBeVisible();
	await expect(page.getByRole('link', { name: 'contact@stationcomplete.org' })).toHaveAttribute(
		'href',
		'mailto:contact@stationcomplete.org'
	);
	await expectAccessible(page);
	await page.getByRole('link', { name: 'Données personnelles' }).click();
	await expect(page.getByRole('heading', { name: 'Données personnelles', level: 1 })).toBeVisible();
	await expectAccessible(page);
});

test('effacer toutes les données du téléphone', async ({ page }) => {
	await page.goto('/donnees-personnelles/');
	await page.evaluate(() => {
		localStorage.setItem('rc:server', '"dev"');
		localStorage.setItem('https://www.openstreetmap.orgoauth2_access_token', 'jeton');
		localStorage.setItem('autre-site', 'garder');
	});
	await page.getByRole('button', { name: 'Effacer mes données de ce téléphone' }).click();
	await expect(page.getByRole('alert')).toContainText('Tout effacer de ce téléphone ?');
	await expectAccessible(page);
	await page.getByRole('button', { name: 'Tout effacer' }).click();
	await expect(page.getByRole('status')).toContainText('C’est fait');
	const left = await page.evaluate(() => Object.keys(localStorage));
	expect(left.filter((k) => k.startsWith('rc:') || k.includes('oauth'))).toEqual([]);
	expect(left).toContain('autre-site');
});
