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
	expect(
		violations.map(
			(v) => `${v.id} : ${v.help} ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`
		)
	).toEqual([]);
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

/** Centre à l'écran du sommet n (touchable ou non à ce zoom). */
async function spot(page: Page, n: number) {
	let b: { x: number; y: number; width: number; height: number } | null = null;
	await expect
		.poll(async () => (b = await page.locator(`[data-point="${n}"]`).boundingBox()))
		.not.toBeNull();
	return { x: b!.x + b!.width / 2, y: b!.y + b!.height / 2 };
}

/**
 * Amène un endroit de l'écran sous la croix en faisant glisser la carte au doigt (événements
 * tactiles réels, sans inertie) : c'est le geste de l'utilisateur, sans viser un repère.
 */
async function toCross(page: Page, target: { x: number; y: number }) {
	const box = (await page.locator('.mapbox').boundingBox())!;
	const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
	// Le doigt part d'une zone libre de la carte (le canevas, ni repère ni menu) et se déplace
	// de (croix − cible) : la cible arrive sous la croix.
	const d = { x: c.x - target.x, y: c.y - target.y };
	const vp = page.viewportSize()!;
	let from = c;
	for (const [dx, dy] of [
		[0, 0],
		[0, -60],
		[0, 60],
		[-60, 0],
		[60, 0],
		[-60, -60],
		[60, 60],
		[60, -60],
		[-60, 60]
	]) {
		const p = { x: c.x + dx, y: c.y + dy };
		const q = { x: p.x + d.x, y: p.y + d.y };
		if (q.x < 4 || q.y < 4 || q.x > vp.width - 4 || q.y > vp.height - 4) continue;
		const free = await page.evaluate(
			([x, y]) => document.elementFromPoint(x, y)?.classList.contains('maplibregl-canvas'),
			[p.x, p.y]
		);
		if (free) {
			from = p;
			break;
		}
	}
	const to = { x: from.x + d.x, y: from.y + d.y };
	const cdp = await page.context().newCDPSession(page);
	const touch = (type: string, p?: { x: number; y: number }) =>
		cdp.send('Input.dispatchTouchEvent', {
			type: type as 'touchStart',
			touchPoints: p ? [{ x: Math.round(p.x), y: Math.round(p.y) }] : []
		});
	await moved(page, async () => {
		await touch('touchStart', from);
		for (let i = 1; i <= 15; i++)
			await touch('touchMove', {
				x: from.x + ((to.x - from.x) * i) / 15,
				y: from.y + ((to.y - from.y) * i) / 15
			});
		await page.waitForTimeout(300); // doigt immobile avant de lever : pas d'inertie
		await touch('touchEnd');
	});
	await cdp.detach();
}

const wayXml = (xml: string, id: number) =>
	xml.match(new RegExp(`<way id="${id}" version="\\d+" changeset="1234">(.*?)</way>`))?.[1] ?? '';
const refs = (wayBody: string) => [...wayBody.matchAll(/<nd ref="(-?\d+)"\/>/g)].map((m) => m[1]);

test('modifier la forme d’un quai (déplacer, ajouter, retirer un point), puis l’envoyer', async ({
	page
}) => {
	test.setTimeout(60_000);
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
	// Bandeau d'ouverture : part des points reliés à d'autres objets
	await expect(page.getByRole('note')).toContainText(
		'15 points sur 26 sont reliés à d’autres objets (espace intérieur, bâtiment…) : ceux-là se corrigent avec JOSM ou iD.'
	);
	await page.getByRole('button', { name: 'Compris' }).click();
	await expect(page.getByRole('note')).toHaveCount(0);
	// Au zoom d'ouverture, les sommets serrés ne sont pas des cibles : on zoome pour les toucher
	await page.getByRole('button', { name: 'Zoomer', exact: true }).click();
	await page.getByRole('button', { name: 'Zoomer', exact: true }).click();
	// Point relié au bâtiment de la gare : verrouillé, annoncé avec la raison
	await expect(
		page.getByRole('button', {
			name: 'Point 9 : relié à d’autres objets (bâtiment et gare), non modifiable'
		})
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

	// Ajouter un point au milieu du côté 3-4, à la croix (il devient sélectionné)
	const p3 = await spot(page, 3);
	const p4 = await spot(page, 4);
	await toCross(page, { x: (p3.x + p4.x) / 2, y: (p3.y + p4.y) / 2 });
	await page.getByRole('button', { name: 'Ajouter un point ici' }).click();
	await expect(page.getByText('27 points')).toBeVisible();
	await expect(page.getByText(/Point 4 ajouté entre 3 et 4/)).toBeAttached();
	await expect(page.getByRole('button', { name: 'Retirer ce point' })).toBeEnabled();

	// Un point verrouillé ne peut être ni déplacé ni retiré
	await moved(page, () =>
		tap(page, 'Point 10 : relié à d’autres objets (bâtiment et gare), non modifiable')
	);
	await expect(page.locator('header')).toContainText('Le point 10 est relié à : bâtiment et gare.');
	await expect(page.getByRole('button', { name: 'Retirer ce point' })).toBeDisabled();
	await expect(page.getByRole('button', { name: 'Déplacer le point ici' })).toBeDisabled();

	// Retirer l'ancien point 25 (devenu 26 après l'ajout)
	await moved(page, () => tap(page, 'Point 26 : le sélectionner'));
	await page.getByRole('button', { name: 'Retirer ce point' }).click();
	await expect(page.getByText('26 points')).toBeVisible();

	// Annuler puis refaire la dernière action
	await page.getByRole('button', { name: 'Annuler la dernière action' }).click();
	await expect(page.getByText('27 points')).toBeVisible();
	// (la croix est restée sur ce point : la carte ne bouge pas)
	await tap(page, 'Point 26 : le sélectionner');
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
	expect(nds).not.toContain(String(ring[24]));
	expect(w).toContain('<tag k="name" v="Voie A"/>');
	// Ancien point 25, libre : supprimé ; aucun point relié touché
	expect(xml).toMatch(new RegExp(`<delete><node id="${ring[24]}" version="\\d+" changeset="1234"`));
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
	// Côtés assez longs à l'écran : repères « + » affichés
	expect(
		await page.getByRole('button', { name: /^Ajouter un point entre/ }).count()
	).toBeGreaterThan(0);
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

test('quai B-C réel : point partagé avec le bord du quai déplacé à la croix, point sous le toit expliqué', async ({
	page
}) => {
	test.setTimeout(60_000);
	const calls = await setup(page);
	await page.goto(`/gare/forme/?id=${STATION}&osm=way/${QUAI_BC}`);
	await expect(page.locator('.maplibregl-canvas')).toBeVisible();
	await expect(page.getByText('20 points')).toBeVisible();
	await expect(page.getByRole('note')).toHaveText(
		/4 points sur 20 sont reliés à d’autres objets \(toit\) : ceux-là se corrigent avec JOSM ou iD\. 15 points du bord du quai suivent vos déplacements\./
	);
	const roof = 'Point 4 : relié à d’autres objets (toit et bord du quai), non modifiable';

	// Croix loin de tout point : message
	await pan(page, 0, -2);
	await page.getByRole('button', { name: 'Prendre ce point' }).click();
	await expect(page.getByRole('alert')).toContainText('Placez la croix sur un point');

	// Point sous le toit, pris à la croix : la raison s'affiche en clair
	await toCross(page, await spot(page, 4));
	await page.getByRole('button', { name: 'Zoomer', exact: true }).click();
	await page.getByRole('button', { name: 'Zoomer', exact: true }).click();
	await page.getByRole('button', { name: 'Prendre ce point' }).click();
	await expect(page.locator('header')).toContainText(
		'Le point 4 est relié à : toit et bord du quai. Il reste en place ; corrigez-le avec JOSM ou iD'
	);
	await expect(page.getByRole('button', { name: 'Déplacer le point ici' })).toBeDisabled();
	await tap(page, roof); // désélection

	// Point du bord du quai, pris à la croix : déplaçable, pas retirable
	await page.getByRole('button', { name: 'Dézoomer' }).click();
	await page.getByRole('button', { name: 'Dézoomer' }).click();
	await toCross(page, await spot(page, 6));
	await page.getByRole('button', { name: 'Zoomer', exact: true }).click();
	await page.getByRole('button', { name: 'Zoomer', exact: true }).click();
	await page.getByRole('button', { name: 'Prendre ce point' }).click();
	await expect(page.locator('header')).toContainText(
		'point 6 est aussi un point du bord du quai : le déplacer déplace aussi le bord'
	);
	await expect(page.getByRole('button', { name: 'Retirer ce point' })).toBeDisabled();
	await page.getByRole('button', { name: 'Ajuster au centimètre' }).click();
	for (let i = 0; i < 5; i++)
		await moved(page, () =>
			page.getByRole('button', { name: 'Déplacer la croix vers la droite' }).click()
		);
	await page.getByRole('button', { name: 'Déplacer le point ici' }).click();
	await page.getByRole('button', { name: 'Ajuster au centimètre' }).click(); // referme le pavé
	await expectAccessible(page);
	await page.getByRole('button', { name: 'Terminer' }).click();
	await expect(page).toHaveURL(/\/gare\/carte/);

	await page.goto(`/envoi/?id=${STATION}`);
	await expect(
		page.getByText('Quai B-C : forme modifiée (20 → 20 points), bord du quai ajusté aussi')
	).toBeVisible();
	await page.getByRole('button', { name: 'Envoyer 1 modification' }).click();
	await expect(page.getByText('1 modification envoyée.')).toBeVisible();

	// Un seul nœud modifié (le même dans le quai et le bord de quai) ; aucun way touché
	const quai = base.find((e) => e.type === 'way' && e.id === QUAI_BC)!;
	const n6 = base.find((e) => e.type === 'node' && e.id === quai.nodes![5])!;
	const xml = calls.find((c) => c.path.endsWith('/upload'))!.body;
	expect([...xml.matchAll(/<node /g)]).toHaveLength(1);
	expect(xml).toContain(`<modify><node id="${n6.id}" version="${n6.version}" changeset="1234"`);
	expect(xml).not.toContain('<way');
	expect(xml).not.toContain('<create>');
	expect(xml).not.toContain('<delete>');
	expect(xml).not.toContain('<relation');
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
