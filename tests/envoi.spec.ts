import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Lot 3 : envoi d'un changeset par gare, serveur de test simulé (aucun appel réel à OSM).
const fixture = JSON.parse(readFileSync('tests/fixtures/amberieu-en-bugey.json', 'utf8'));
const tile = readFileSync('tests/fixtures/tuile-grise.jpg');
const STATION = 'w67074448';
const WAY = 983664438;
const DEV = 'https://master.apis.dev.openstreetmap.org';
type El = { type: string; id: number; version?: number; tags?: Record<string, string> };
const freshWay = (fixture.elements as El[]).find((e) => e.type === 'way' && e.id === WAY)!;

async function setup(page: Page) {
	await page.addInitScript((dev) => {
		localStorage.setItem('rc:server', JSON.stringify('dev'));
		localStorage.setItem('rc:clientId:dev', JSON.stringify('client-de-test'));
		localStorage.setItem('rc:user:dev', JSON.stringify({ name: 'testeur', id: 1 }));
		localStorage.setItem('rc:demo', 'true');
		localStorage.setItem(dev + 'oauth2_access_token', 'jeton-de-test');
	}, DEV);
	await page
		.context()
		.route('https://data.geopf.fr/**', (r) => r.fulfill({ contentType: 'image/jpeg', body: tile }));
}

/** Serveur de test simulé ; renvoie le journal des appels. */
async function mockDev(
	page: Page,
	opts: { way?: El; upload?: (r: Route) => Promise<void>; changesCount?: number } = {}
) {
	const calls: { method: string; path: string; body: string }[] = [];
	await page.route(`${DEV}/api/0.6/**`, async (route) => {
		const req = route.request();
		const url = new URL(req.url());
		calls.push({
			method: req.method(),
			path: url.pathname + url.search,
			body: req.postData() ?? ''
		});
		const p = url.pathname;
		const json = (o: unknown) =>
			route.fulfill({ contentType: 'application/json', body: JSON.stringify(o) });
		if (p.endsWith('/map.json')) return json({ elements: fixture.elements });
		if (p.endsWith('/ways.json')) return json({ elements: [opts.way ?? freshWay] });
		if (p.endsWith('/changeset/create')) return route.fulfill({ body: '1234' });
		if (p.endsWith('/changeset/1234/upload'))
			return opts.upload
				? opts.upload(route)
				: route.fulfill({
						contentType: 'text/xml',
						body: `<diffResult><way old_id="${WAY}" new_id="${WAY}" new_version="${(freshWay.version ?? 1) + 1}"/></diffResult>`
					});
		if (p.endsWith('/changeset/1234/close')) return route.fulfill({ body: '' });
		if (p.endsWith('/changeset/1234.json'))
			return json({ changeset: { id: 1234, open: true, changes_count: opts.changesCount ?? 0 } });
		return route.fulfill({ status: 404, body: 'inconnu' });
	});
	return calls;
}

async function expectAccessible(page: Page) {
	const { violations } = await new AxeBuilder({
		page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]['page']
	})
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
		.analyze();
	expect(violations.map((v) => `${v.id} : ${v.help}`)).toEqual([]);
}

async function editTrack(page: Page, value: string) {
	await page.goto(`/gare/saisie/?id=${STATION}&osm=way/${WAY}`);
	await page.getByRole('textbox', { name: 'Numéro de la voie' }).fill(value);
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page).toHaveURL(/\/gare\/carte/);
}

test('envoyer les saisies d’une gare : un changeset, puis plus rien en attente', async ({
	page
}) => {
	await setup(page);
	const calls = await mockDev(page);
	await editTrack(page, '13');

	await page.goto(`/envoi/?id=${STATION}`);
	await expect(page.getByText('Prêtes à partir (1)')).toBeVisible();
	await expect(page.getByText('Envoyé par testeur')).toBeVisible();
	await expectAccessible(page);
	await page.getByRole('button', { name: 'Envoyer 1 modification' }).click();
	await expect(page.getByText('1 modification envoyée.')).toBeVisible();
	await expect(page.getByRole('link', { name: /n° 1234/ })).toHaveAttribute(
		'href',
		`${DEV}/changeset/1234`
	);

	const create = calls.find((c) => c.path.endsWith('/changeset/create'))!;
	expect(create.body).toContain('<tag k="created_by" v="stationcomplete');
	expect(create.body).toContain('<tag k="hashtags" v="#stationcomplete"/>');
	const upload = calls.find((c) => c.path.endsWith('/upload'))!;
	expect(upload.body).toContain(`<way id="${WAY}" version="${freshWay.version}" changeset="1234">`);
	expect(upload.body).toContain('<tag k="railway:track_ref" v="13"/>');
	expect(calls.some((c) => c.path.endsWith('/close'))).toBe(true);
	await expect(page.getByText('Aucune saisie en attente pour cette gare.')).toBeVisible();
});

test('conflit : quelqu’un a changé le numéro entre-temps → à revoir, rien n’est envoyé', async ({
	page
}) => {
	await setup(page);
	const calls = await mockDev(page, {
		way: {
			...freshWay,
			version: (freshWay.version ?? 1) + 1,
			tags: { ...freshWay.tags, 'railway:track_ref': '14' }
		}
	});
	await editTrack(page, '13');
	await page.goto(`/envoi/?id=${STATION}`);
	await page.getByRole('button', { name: 'Envoyer 1 modification' }).click();
	await expect(page.getByText('À revoir (1)')).toBeVisible();
	await expect(page.getByText(/quelqu’un d’autre/)).toBeVisible();
	expect(calls.some((c) => c.path.endsWith('/changeset/create'))).toBe(false);
});

test('coupure pendant l’envoi : au nouvel essai, aucun doublon', async ({ page }) => {
	await setup(page);
	let uploads = 0;
	const calls = await mockDev(page, {
		upload: async (route) => {
			uploads++;
			await route.abort('connectionreset');
		},
		changesCount: 1 // le serveur avait bien reçu l'envoi coupé
	});
	await editTrack(page, '13');
	await page.goto(`/envoi/?id=${STATION}`);
	await page.getByRole('button', { name: 'Envoyer 1 modification' }).click();
	await expect(page.getByText(/La connexion a été perdue/)).toBeVisible();
	await expect(page.getByText('Prêtes à partir (1)')).toBeVisible();

	// Nouvel essai : l'appli vérifie le changeset au lieu de renvoyer.
	await page.getByRole('button', { name: 'Envoyer 1 modification' }).click();
	await expect(page.getByText('1 modification envoyée.')).toBeVisible();
	expect(uploads).toBe(1);
	expect(calls.filter((c) => c.path.endsWith('/changeset/create'))).toHaveLength(1);
});

/** Vraie carte (serveur simulé), connecté sous le pseudo donné. */
async function setupProd(page: Page, user: string, demo: boolean) {
	await page.addInitScript(
		({ user, demo }) => {
			localStorage.setItem('rc:server', JSON.stringify('prod'));
			localStorage.setItem('rc:user:prod', JSON.stringify({ name: user, id: 2 }));
			localStorage.setItem('rc:demo', JSON.stringify(demo));
			localStorage.setItem('https://www.openstreetmap.orgoauth2_access_token', 'jeton-de-test');
		},
		{ user, demo }
	);
	await page
		.context()
		.route('https://data.geopf.fr/**', (r) => r.fulfill({ contentType: 'image/jpeg', body: tile }));
	const calls: string[] = [];
	await page.route('https://api.openstreetmap.org/**', (r) => {
		calls.push(r.request().method() + ' ' + new URL(r.request().url()).pathname);
		return r.fulfill({
			contentType: 'application/json',
			body: JSON.stringify({ elements: fixture.elements })
		});
	});
	return calls;
}

test('vraie carte, phase pilote : envoi réservé aux testeurs', async ({ page }) => {
	// config.json publié : "pilotUsers": [] (personne tant que le pilote n'a pas commencé)
	await setupProd(page, 'Inconnu', false);
	await page.goto(`/envoi/?id=${STATION}`);
	await expect(page.getByText(/publiées sur la carte OpenStreetMap/)).toBeVisible();
	await expect(page.getByRole('alert')).toContainText('phase pilote');
	await expectAccessible(page);
});

test('vraie carte : une saisie faite en mode démonstration ne part jamais', async ({ page }) => {
	const calls = await setupProd(page, 'Pilote', true);
	await page.context().route('**/config.json', (r) =>
		r.fulfill({
			contentType: 'application/json',
			body: JSON.stringify({ pilotUsers: ['Pilote'] })
		})
	);
	await editTrack(page, '13');
	await page.goto(`/envoi/?id=${STATION}`);
	await expect(page.getByRole('alert')).toContainText('mode démonstration');
	await expect(page.getByText(/· mode démonstration/)).toBeVisible();
	await expect(page.getByRole('button', { name: 'Envoyer 1 modification' })).toHaveCount(0);
	await expectAccessible(page);
	await page.getByRole('button', { name: 'Retirer' }).click();
	await expect(page.getByRole('alert')).toHaveCount(0);
	expect(calls.filter((c) => c.startsWith('POST') || c.startsWith('PUT'))).toEqual([]);
});

test('réglages : compte, choix du serveur, page de connexion', async ({ page }) => {
	await setup(page);
	await mockDev(page);
	await page.goto('/connexion/');
	await expect(page.getByText('Serveur : Serveur de test OSM')).toBeVisible();
	await expect(page.getByText(/Connecté en tant que/)).toContainText('testeur');
	await expectAccessible(page);
	await page.goto('/reglages/');
	await expect(page.getByText('testeur')).toBeVisible();
	await expect(page.getByRole('radio', { name: /Serveur de test OSM/ })).toBeChecked();
	await expectAccessible(page);
	await page.getByRole('radio', { name: /OpenStreetMap La vraie carte/ }).check();
	await expect(page.getByText('Non connecté')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
});

test('arrêt d’urgence : config.json coupe les envois, puis les rétablit', async ({ page }) => {
	await setup(page);
	const calls = await mockDev(page);
	let cfg: object = { uploadsEnabled: false, message: 'Envois suspendus : bug en cours.' };
	await page
		.context()
		.route('**/config.json', (r) =>
			r.fulfill({ contentType: 'application/json', body: JSON.stringify(cfg) })
		);
	await editTrack(page, '13');

	await page.goto(`/envoi/?id=${STATION}`);
	await expect(page.getByRole('alert')).toHaveText('Envois suspendus : bug en cours.');
	await expect(page.getByRole('button', { name: 'Envoyer 1 modification' })).toHaveCount(0);
	await expectAccessible(page);

	cfg = { uploadsEnabled: true };
	await page.reload();
	await page.getByRole('button', { name: 'Envoyer 1 modification' }).click();
	await expect(page.getByText('1 modification envoyée.')).toBeVisible();
	expect(calls.filter((c) => c.path.endsWith('/upload'))).toHaveLength(1);
});
