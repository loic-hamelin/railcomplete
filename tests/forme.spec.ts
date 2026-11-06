import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Lot 7 : modifier la forme d'un quai existant, le redessiner en surface, le supprimer.
// Ambérieu-en-Bugey (données réelles), serveur de test simulé : aucun appel réel à OSM.
const fixture = JSON.parse(readFileSync('tests/fixtures/amberieu-en-bugey.json', 'utf8'));
const tile = readFileSync('tests/fixtures/tuile-grise.jpg');
const STATION = 'w67074448';
const DEV = 'https://master.apis.dev.openstreetmap.org';
const QUAI_A = 1357219270;
const QUAI_BC = 1420417938;
type El = {
	type: 'node' | 'way' | 'relation';
	id: number;
	version?: number;
	lat?: number;
	lon?: number;
	nodes?: number[];
	members?: { type: string; ref: number; role: string }[];
	tags?: Record<string, string>;
};
const base = fixture.elements as El[];

// Quai tracé en ligne (absent de la fixture), dans un coin vide de l'emprise : 3 nœuds sur
// 40 m d'ouest en est ; celui du milieu porte un tag (il est donc verrouillé).
const LINE = 9_000_000_010;
const lineData = (): El[] => {
	const lat = 45.9547,
		lon0 = 5.34369,
		dLon = 20 / (111_320 * Math.cos((lat * Math.PI) / 180));
	return [
		{ type: 'node', id: 9_000_000_001, version: 1, lat, lon: lon0 },
		{
			type: 'node',
			id: 9_000_000_002,
			version: 1,
			lat,
			lon: lon0 + dLon,
			tags: { highway: 'elevator' }
		},
		{ type: 'node', id: 9_000_000_003, version: 1, lat, lon: lon0 + 2 * dLon },
		{
			type: 'way',
			id: LINE,
			version: 1,
			nodes: [9_000_000_001, 9_000_000_002, 9_000_000_003],
			tags: { railway: 'platform', public_transport: 'platform', train: 'yes', ref: '9' }
		}
	];
};

/** Serveur de test simulé (lecture, changeset, envoi) ; renvoie le journal des appels. */
async function setup(page: Page, elements: El[] = base) {
	await page.addInitScript((dev) => {
		localStorage.setItem('rc:server', JSON.stringify('dev'));
		localStorage.setItem('rc:clientId:dev', JSON.stringify('client-de-test'));
		localStorage.setItem('rc:user:dev', JSON.stringify({ name: 'testeur', id: 1 }));
		localStorage.setItem(dev + 'oauth2_access_token', 'jeton-de-test');
	}, DEV);
	await page.context().route('https://data.geopf.fr/**', (r) =>
		r.fulfill({
			contentType: 'image/jpeg',
			headers: { 'Access-Control-Allow-Origin': '*' },
			body: tile
		})
	);
	const calls: { method: string; path: string; body: string }[] = [];
	await page.route(`${DEV}/api/0.6/**`, async (route) => {
		const req = route.request();
		const url = new URL(req.url());
		const p = url.pathname;
		calls.push({ method: req.method(), path: p + url.search, body: req.postData() ?? '' });
		const json = (o: unknown) =>
			route.fulfill({ contentType: 'application/json', body: JSON.stringify(o) });
		if (p.endsWith('/map.json')) return json({ elements });
		if (p.endsWith('/ways.json')) {
			const ids = (url.searchParams.get('ways') ?? '').split(',').map(Number);
			return json({ elements: elements.filter((e) => e.type === 'way' && ids.includes(e.id)) });
		}
		const rel = p.match(/\/way\/(\d+)\/relations\.json$/);
		if (rel)
			return json({
				elements: elements.filter(
					(e) =>
						e.type === 'relation' &&
						e.members!.some((m) => m.type === 'way' && m.ref === Number(rel[1]))
				)
			});
		if (p.endsWith('/changeset/create')) return route.fulfill({ body: '1234' });
		if (p.endsWith('/changeset/1234/upload'))
			return route.fulfill({ contentType: 'text/xml', body: '<diffResult version="0.6"/>' });
		if (p.endsWith('/close')) return route.fulfill({ body: '' });
		return route.fulfill({ status: 404, body: 'inconnu' });
	});
	return calls;
}

async function expectAccessible(page: Page, exclude = '.maplibregl-canvas') {
	const { violations } = await new AxeBuilder({
		page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]['page']
	})
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
		.exclude(exclude)
		.analyze();
	expect(violations.map((v) => `${v.id} : ${v.help}`)).toEqual([]);
}

/** Attend la fin d'un déplacement de la carte après une action (technique de dessin.spec.ts). */
async function moved(page: Page, act: () => Promise<void>) {
	const box = page.locator('.mapbox');
	const before = await box.getAttribute('data-center');
	await act();
	await expect(box).not.toHaveAttribute('data-center', before ?? '');
	let last = '';
	await expect
		.poll(
			async () => {
				const now = (await box.getAttribute('data-center')) ?? '';
				const stable = now === last;
				last = now;
				return stable;
			},
			{ intervals: [250] }
		)
		.toBe(true);
}

/** Déplace la vue avec les flèches du clavier, un appui à la fois (100 px par appui). */
async function pan(page: Page, right: number, down: number) {
	const keys = [
		...Array(Math.abs(right)).fill(right > 0 ? 'ArrowRight' : 'ArrowLeft'),
		...Array(Math.abs(down)).fill(down > 0 ? 'ArrowDown' : 'ArrowUp')
	];
	for (const key of keys)
		await moved(page, async () => {
			await page.locator('.maplibregl-canvas').focus();
			await page.keyboard.press(key);
		});
}

/**
 * Active un repère de la carte au clavier (Entrée), comme un lecteur d'écran : au zoom
 * d'ensemble, les cibles de 44 px des sommets d'un quai étroit se recouvrent.
 */
const tap = (page: Page, name: string) =>
	page.getByRole('button', { name, exact: true }).press('Enter');

const wayXml = (xml: string, id: number) =>
	xml.match(new RegExp(`<way id="${id}" version="\\d+" changeset="1234">(.*?)</way>`))?.[1] ?? '';
const refs = (wayBody: string) => [...wayBody.matchAll(/<nd ref="(-?\d+)"\/>/g)].map((m) => m[1]);

test('modifier la forme d’un quai (déplacer, ajouter, retirer un point), puis l’envoyer', async ({
	page
}) => {
	const calls = await setup(page);
	const quai = base.find((e) => e.type === 'way' && e.id === QUAI_A)!;
	const ring = quai.nodes!.slice(0, -1);

	// E5 : feuille du quai A, action discrète « Modifier la forme »
	await page.goto(`/gare/carte/?id=${STATION}&focus=way/${QUAI_A}`);
	const sheet = page.getByRole('region', { name: 'Objet sélectionné' });
	await expect(sheet).toContainText('Quai A');
	await sheet.getByRole('link', { name: 'Modifier la forme' }).click();
	await expect(page).toHaveURL(/\/gare\/forme\/?\?id=.*&osm=way\/1357219270/);
	await expect(page.locator('.maplibregl-canvas')).toBeVisible();
	await expect(page.getByText('26 points')).toBeVisible();
	// Point relié au bâtiment : verrouillé, annoncé comme tel
	await expect(
		page.getByRole('button', { name: 'Point 7 : relié à un autre objet, non modifiable' })
	).toBeVisible();

	// Déplacer le point 2 de 1 m (pavé de flèches de 20 cm)
	await moved(page, () => tap(page, 'Point 2 : le sélectionner'));
	await page.getByRole('button', { name: 'Ajuster au centimètre' }).click();
	for (let i = 0; i < 5; i++)
		await moved(page, () =>
			page.getByRole('button', { name: 'Déplacer la croix vers le haut' }).click()
		);
	await page.getByRole('button', { name: 'Déplacer le point ici' }).click();
	await expect(page.getByText(/Point 2 déplacé/)).toBeAttached();

	// Ajouter un point au milieu du côté 3-4 (il devient sélectionné)
	await moved(page, () => tap(page, 'Ajouter un point entre 3 et 4'));
	await expect(page.getByText('27 points')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Retirer ce point' })).toBeEnabled();

	// Un point verrouillé ne peut être ni déplacé ni retiré
	await moved(page, () => tap(page, 'Point 8 : relié à un autre objet, non modifiable'));
	await expect(page.getByRole('button', { name: 'Retirer ce point' })).toBeDisabled();
	await expect(page.getByRole('button', { name: 'Déplacer le point ici' })).toBeDisabled();

	// Retirer l'ancien point 24 (devenu 25 après l'ajout)
	await moved(page, () => tap(page, 'Point 25 : le sélectionner'));
	await page.getByRole('button', { name: 'Retirer ce point' }).click();
	await expect(page.getByText('26 points')).toBeVisible();

	// Annuler puis refaire la dernière action
	await page.getByRole('button', { name: 'Annuler la dernière action' }).click();
	await expect(page.getByText('27 points')).toBeVisible();
	// (la croix est restée sur ce point : la carte ne bouge pas)
	await tap(page, 'Point 25 : le sélectionner');
	await page.getByRole('button', { name: 'Retirer ce point' }).click();

	await expectAccessible(page);
	await page.getByRole('button', { name: 'Terminer' }).click();
	await expect(page).toHaveURL(/\/gare\/carte/);

	// E8 : résumé lisible, puis envoi
	await page.goto(`/envoi/?id=${STATION}`);
	await expect(page.getByText('Quai A : forme modifiée (26 → 26 points)')).toBeVisible();
	await expect(page.getByText('Forme du quai', { exact: true })).toBeVisible();
	await expect(page.getByRole('textbox')).toHaveValue(/forme de quai corrigée/);
	await page.getByRole('button', { name: 'Envoyer 1 modification' }).click();
	await expect(page.getByText('1 modification envoyée.')).toBeVisible();

	// Relecture fraîche : way, puis usage des nœuds (/map de la petite emprise du quai)
	const reads = calls.filter((c) => c.method === 'GET').map((c) => c.path);
	expect(reads.some((p) => p.includes(`/ways.json?ways=${QUAI_A}`))).toBe(true);
	expect(reads.filter((p) => p.includes('/map.json?bbox=')).length).toBeGreaterThanOrEqual(2);

	const xml = calls.find((c) => c.path.endsWith('/upload'))!.body;
	// create → modify → delete
	expect(xml.indexOf('<create>')).toBeLessThan(xml.indexOf('<modify>'));
	expect(xml.indexOf('<modify>')).toBeLessThan(xml.indexOf('<delete>'));
	const created = [...xml.matchAll(/<node id="(-\d+)" changeset/g)].map((m) => m[1]);
	expect(created).toHaveLength(1);
	// Point 2 déplacé : modify avec sa version
	const moved2 = base.find((e) => e.type === 'node' && e.id === ring[1])!;
	expect(xml).toContain(`<node id="${ring[1]}" version="${moved2.version}" changeset="1234"`);
	// Même way, nouvelle liste de nœuds fermée, tags conservés
	const w = wayXml(xml, QUAI_A);
	expect(xml).toContain(`<way id="${QUAI_A}" version="${quai.version}" changeset="1234">`);
	const nds = refs(w);
	expect(nds[0]).toBe(nds.at(-1));
	expect(nds).toHaveLength(27);
	expect(nds[3]).toBe(created[0]); // le nouveau point, entre 3 et 4
	expect(nds).not.toContain(String(ring[23]));
	expect(w).toContain('<tag k="name" v="Voie A"/>');
	// Ancien point 24, libre : supprimé ; aucun point relié touché
	expect(xml).toMatch(new RegExp(`<delete><node id="${ring[23]}" version="\\d+" changeset="1234"`));
	expect(xml).not.toContain(`<node id="${ring[6]}"`);
	expect(xml).not.toContain('<relation');
});

test('redessiner en surface un quai tracé en ligne, en gardant son point relié', async ({
	page
}) => {
	const calls = await setup(page, [...base, ...lineData()]);
	await page.goto(`/gare/carte/?id=${STATION}&focus=way/${LINE}`);
	const sheet = page.getByRole('region', { name: 'Objet sélectionné' });
	await sheet.getByRole('link', { name: 'Redessiner en surface' }).click();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Redessiner en surface');
	await expect(page.locator('.maplibregl-canvas')).toBeVisible();
	const anchor = page.getByRole('button', {
		name: 'Point relié 2 de l’ancienne ligne : l’ajouter au contour'
	});
	await expect(anchor).toBeVisible();

	// Rectangle autour de l'ancienne ligne ; la croix part du milieu de la ligne (point relié)
	const add = page.getByRole('button', { name: 'Ajouter un point', exact: true });
	await pan(page, 1, 0);
	await add.click();
	await pan(page, 0, 1);
	await add.click();
	await pan(page, -2, 0);
	await add.click();
	// Sans le point relié, le contour est refusé
	await page.getByRole('button', { name: 'Terminer' }).click();
	await expect(page.getByRole('alert')).toContainText('doit faire partie du contour');
	await pan(page, 0, -1);
	await add.click();
	await anchor.press('Enter');
	await expect(page.getByText('5 points')).toBeVisible();
	await expect(anchor).toHaveCount(0);
	await expectAccessible(page);
	await page.getByRole('button', { name: 'Terminer' }).click();
	await expect(page).toHaveURL(/\/gare\/carte/);

	await page.goto(`/envoi/?id=${STATION}`);
	await expect(page.getByText('Quai voies 9 redessiné en surface')).toBeVisible();
	await page.getByRole('button', { name: 'Envoyer 1 modification' }).click();
	await expect(page.getByText('1 modification envoyée.')).toBeVisible();

	const xml = calls.find((c) => c.path.endsWith('/upload'))!.body;
	const w = wayXml(xml, LINE);
	expect(w).not.toBe(''); // même way, modifié (jamais supprimé puis recréé)
	const nds = refs(w);
	expect(nds).toHaveLength(6);
	expect(nds[0]).toBe(nds[5]); // contour fermé
	expect(nds[4]).toBe('9000000002'); // le point relié, conservé tel quel
	expect(w).toContain('<tag k="area" v="yes"/>');
	expect(w).toContain('<tag k="ref" v="9"/>');
	expect([...xml.matchAll(/<node id="-\d+" changeset/g)]).toHaveLength(4);
	// Anciens points libres : supprimés, après le way modifié
	const del = xml.slice(xml.indexOf('<delete>'));
	expect(del).toContain('<node id="9000000001"');
	expect(del).toContain('<node id="9000000003"');
	expect(del).not.toContain('9000000002');
	expect(xml).not.toMatch(/<delete><way/);
});

test('supprimer un quai en double : retiré de la zone d’arrêt, puis envoyé', async ({ page }) => {
	const calls = await setup(page);
	await page.goto(`/gare/carte/?id=${STATION}&focus=way/${QUAI_BC}`);
	const sheet = page.getByRole('region', { name: 'Objet sélectionné' });
	await expect(sheet).toContainText('Quai B-C');
	await sheet.getByRole('button', { name: 'Plus d’actions' }).click();
	await sheet.getByRole('button', { name: 'Supprimer ce quai…' }).click();
	await expect(sheet).toContainText(
		"Il sera aussi retiré de la zone d’arrêt Gare d'Ambérieu et de 5 lignes."
	);
	await expect(sheet).toContainText('1 point supprimé ; 19 reliés à d’autres objets, conservés.');
	// Sans motif : refus
	await sheet.getByRole('button', { name: 'Supprimer le quai' }).click();
	await expect(sheet.getByRole('alert')).toContainText('motif');
	await sheet.getByRole('radio', { name: 'En double avec un autre quai' }).check();
	await expectAccessible(page, '.maplibregl-canvas-container');
	await sheet.getByRole('button', { name: 'Supprimer le quai' }).click();
	await expect(
		page.getByRole('status').filter({ hasText: 'suppression en attente' })
	).toBeVisible();
	// Le quai disparaît de la carte locale
	await expect(page.getByRole('button', { name: /^Quai B-C\./ })).toHaveCount(0);

	await page.goto(`/envoi/?id=${STATION}`);
	await expect(
		page.getByText(
			"Quai B-C supprimé (en double) — retiré de la zone d’arrêt Gare d'Ambérieu et de 5 lignes"
		)
	).toBeVisible();
	await expect(page.getByRole('textbox')).toHaveValue(
		/Quai B-C supprimé \(en double avec un autre quai\)/
	);
	await page.getByRole('button', { name: 'Envoyer 1 modification' }).click();
	await expect(page.getByText('1 modification envoyée.')).toBeVisible();

	// Relations relues explicitement juste avant l'envoi
	expect(calls.some((c) => c.path.endsWith(`/way/${QUAI_BC}/relations.json`))).toBe(true);
	const xml = calls.find((c) => c.path.endsWith('/upload'))!.body;
	const create = calls.find((c) => c.path.endsWith('/changeset/create'))!.body;
	expect(create).toContain('supprimé (en double avec un autre quai)');
	// modify des 6 relations (zone d'arrêt + 5 lignes), sans le quai
	const stop = xml.match(
		/<relation id="3614242" version="\d+" changeset="1234">(.*?)<\/relation>/
	)![1];
	expect(stop).not.toContain(`ref="${QUAI_BC}"`);
	expect(stop).toContain('<tag k="public_transport" v="stop_area"/>');
	expect([...xml.matchAll(/<relation id=/g)]).toHaveLength(6);
	// delete : le way d'abord, puis son seul nœud libre ; les nœuds partagés restent
	const del = xml.slice(xml.indexOf('<delete>'));
	expect(del.indexOf(`<way id="${QUAI_BC}"`)).toBeGreaterThan(0);
	expect([...del.matchAll(/<node id=/g)]).toHaveLength(1);
	expect(del.indexOf('<way')).toBeLessThan(del.indexOf('<node'));
	expect(xml.indexOf('</modify>')).toBeLessThan(xml.indexOf('<delete>'));
});

test('vraie carte, à distance : « N’existe plus » refusé, quai multipolygone non modifiable', async ({
	page
}) => {
	await page.addInitScript(() => {
		localStorage.setItem('rc:server', JSON.stringify('prod'));
		localStorage.setItem('rc:demo', 'false');
	});
	await page
		.context()
		.route('https://data.geopf.fr/**', (r) => r.fulfill({ contentType: 'image/jpeg', body: tile }));
	await page.route('https://api.openstreetmap.org/**', (r) =>
		r.fulfill({ contentType: 'application/json', body: JSON.stringify({ elements: base }) })
	);
	await page.goto(`/gare/carte/?id=${STATION}&focus=way/${QUAI_A}`);
	const sheet = page.getByRole('region', { name: 'Objet sélectionné' });
	await sheet.getByRole('button', { name: 'Plus d’actions' }).click();
	await sheet.getByRole('button', { name: 'Supprimer ce quai…' }).click();
	await expect(sheet.getByRole('radio', { name: 'N’existe plus' })).toBeDisabled();
	await expect(sheet).toContainText('Sur place seulement');
	await expect(sheet.getByRole('radio', { name: 'En double avec un autre quai' })).toBeEnabled();
	await expectAccessible(page, '.maplibregl-canvas-container');

	// Quai décrit par un multipolygone : ni forme, ni suppression
	await page.goto(`/gare/carte/?id=${STATION}&focus=way/1429001835`);
	await expect(sheet.getByRole('link', { name: 'Modifier la forme' })).toHaveCount(0);
	await sheet.getByRole('button', { name: 'Plus d’actions' }).click();
	await expect(sheet).toContainText('Quai complexe : à modifier avec un éditeur comme iD ou JOSM');
	await expect(sheet.getByRole('button', { name: 'Supprimer ce quai…' })).toHaveCount(0);
});
