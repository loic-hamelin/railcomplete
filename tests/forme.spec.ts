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
	// (Lot 7d : un sommet se glisse au doigt ; partir d'un sommet le déplacerait au lieu de
	// faire glisser la carte. On cherche donc la zone libre la plus proche de la croix, sur une
	// grille de 20 px, d'où le doigt peut glisser sans sortir de l'écran si possible.)
	// (Cible lointaine : le doigt peut finir hors de l'écran, comme avant le lot 7d.)
	const spots: { x: number; y: number }[] = [];
	for (let x = 8; x < vp.width - 8; x += 20)
		for (let y = 8; y < vp.height - 8; y += 20) spots.push({ x, y });
	const out = (p: { x: number; y: number }) => {
		const q = { x: p.x + d.x, y: p.y + d.y };
		return q.x < 4 || q.y < 4 || q.x > vp.width - 4 || q.y > vp.height - 4 ? 1 : 0;
	};
	spots.sort(
		(a, b) => out(a) - out(b) || Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y)
	);
	const free = await page.evaluate(
		(list) =>
			list.findIndex((p) =>
				document.elementFromPoint(p.x, p.y)?.classList.contains('maplibregl-canvas')
			),
		spots
	);
	const from = free >= 0 ? spots[free] : undefined;
	if (!from) throw new Error('Aucune zone libre de la carte pour y poser le doigt.');
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
	// Bandeau d'ouverture : part des points partagés avec d'autres objets (ils suivront)
	await expect(page.getByRole('note')).toContainText(
		'15 points sur 26 sont partagés avec d’autres objets (espace intérieur, bâtiment…) : ils suivront vos modifications. Les points 15 et 16 portent des informations (entrée)'
	);
	await page.getByRole('button', { name: 'Compris' }).click();
	await expect(page.getByRole('note')).toHaveCount(0);
	// Au zoom d'ouverture, les sommets serrés ne sont pas des cibles : on zoome pour les toucher
	await page.getByRole('button', { name: 'Zoomer', exact: true }).click();
	await page.getByRole('button', { name: 'Zoomer', exact: true }).click();
	// Point partagé avec le bâtiment et la gare : annoncé comme tel, sélectionnable
	await expect(
		page.getByRole('button', {
			name: 'Point 9 : aussi un point d’un bâtiment et de la gare, le sélectionner'
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

	// Un point partagé se déplace ou se retire : l'appli dit avant ce qui suivra
	const shared10 = 'Point 10 : aussi un point d’un bâtiment et de la gare, le sélectionner';
	await moved(page, () => tap(page, shared10));
	await expect(page.locator('header .share')).toHaveText(
		'Ce point est aussi un point de : un bâtiment et la gare — ils suivront le déplacement. Retiré, il reste dans un bâtiment et la gare ; seul le quai change.'
	);
	await expect(page.getByRole('button', { name: 'Retirer ce point' })).toBeEnabled();
	await expect(page.getByRole('button', { name: 'Déplacer le point ici' })).toBeEnabled();
	await tap(page, shared10); // désélection, sans rien changer

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

test('quai B-C réel : point partagé avec le toit et le bord du quai déplacé à la croix, puis envoyé', async ({
	page
}) => {
	test.setTimeout(60_000);
	const calls = await setup(page);
	await page.goto(`/gare/forme/?id=${STATION}&osm=way/${QUAI_BC}`);
	await expect(page.locator('.maplibregl-canvas')).toBeVisible();
	await expect(page.getByText('20 points')).toBeVisible();
	await expect(page.getByRole('note')).toHaveText(
		'19 points sur 20 sont partagés avec d’autres objets (bord du quai, toit) : ils suivront vos modifications. Compris'
	);
	// Aucun point fixe : plus de carrés « verrouillés »
	await expect(page.locator('.rc-vertex.locked')).toHaveCount(0);
	await expect.poll(() => page.locator('.rc-vertex.shared').count()).toBeGreaterThan(10);

	// Croix loin de tout point : message clair
	await pan(page, 0, -2);
	await page.getByRole('button', { name: 'Prendre ce point' }).click();
	await expect(page.getByRole('alert')).toContainText(
		'Aucun point sous la croix : amenez la croix sur un point du quai'
	);

	// Point 4, sous le toit et sur le bord du quai, pris à la croix : ce qui suivra est dit
	await toCross(page, await spot(page, 4));
	await page.getByRole('button', { name: 'Zoomer', exact: true }).click();
	await page.getByRole('button', { name: 'Zoomer', exact: true }).click();
	await page.getByRole('button', { name: 'Prendre ce point' }).click();
	await expect(page.locator('header .share')).toHaveText(
		'Ce point est aussi un point de : le toit et le bord du quai — ils suivront le déplacement. Il ne peut pas être retiré du contour : le bord du quai en a besoin.'
	);
	await expect(page.getByRole('button', { name: 'Retirer ce point' })).toBeDisabled();
	await page.getByRole('button', { name: 'Ajuster au centimètre' }).click();
	for (let i = 0; i < 5; i++)
		await moved(page, () =>
			page.getByRole('button', { name: 'Déplacer la croix vers la droite' }).click()
		);
	await page.getByRole('button', { name: 'Déplacer le point ici' }).click();
	await expect(page.locator('header .share')).toHaveText(
		'Point 4 déplacé : toit et bord du quai ajustés aussi.'
	);
	await page.getByRole('button', { name: 'Ajuster au centimètre' }).click(); // referme le pavé
	await expectAccessible(page);
	await page.getByRole('button', { name: 'Terminer' }).click();
	await expect(page).toHaveURL(/\/gare\/carte/);

	await page.goto(`/envoi/?id=${STATION}`);
	await expect(
		page.getByText(
			'Quai B-C : forme modifiée (20 → 20 points) — toit et bord du quai ajustés aussi'
		)
	).toBeVisible();
	await expect(page.getByRole('textbox')).toHaveValue(
		/forme de quai corrigée \(toit et bord du quai ajustés aussi\)/
	);
	await page.getByRole('button', { name: 'Envoyer 1 modification' }).click();
	await expect(page.getByText('1 modification envoyée.')).toBeVisible();

	// Un seul nœud modifié (le même dans le quai, le toit et le bord de quai) ; aucun way touché
	const quai = base.find((e) => e.type === 'way' && e.id === QUAI_BC)!;
	const n4 = base.find((e) => e.type === 'node' && e.id === quai.nodes![3])!;
	const xml = calls.find((c) => c.path.endsWith('/upload'))!.body;
	expect([...xml.matchAll(/<node /g)]).toHaveLength(1);
	expect(xml).toContain(`<modify><node id="${n4.id}" version="${n4.version}" changeset="1234"`);
	expect(xml).not.toContain('<way');
	expect(xml).not.toContain('<create>');
	expect(xml).not.toContain('<delete>');
	expect(xml).not.toContain('<relation');
	const create = calls.find((c) => c.path.endsWith('/changeset/create'))!.body;
	expect(create).toContain('toit et bord du quai ajustés aussi');
});

test('E5 → E12 : zoom et centre de l’utilisateur conservés, point sélectionné sans zoom, menus au-dessus des repères', async ({
	page
}) => {
	test.setTimeout(60_000);
	await setup(page);
	await page.goto(`/gare/carte/?id=${STATION}&focus=way/${QUAI_A}`);
	const sheet = page.getByRole('region', { name: 'Objet sélectionné' });
	await expect(sheet).toContainText('Quai A');
	// L'utilisateur zoome à sa façon (clavier : +1), puis décale la vue
	const e5 = page.locator('.map[data-zoom]');
	await expect(e5).toHaveAttribute('data-zoom', '18.50');
	await page.locator('.maplibregl-canvas').focus();
	await page.keyboard.press('=');
	await expect(e5).toHaveAttribute('data-zoom', '19.50');
	await page.keyboard.press('ArrowLeft');
	let last = '';
	await expect
		.poll(
			async () => {
				const now = (await e5.getAttribute('data-center')) ?? '';
				const stable = now === last;
				last = now;
				return stable;
			},
			{ intervals: [300] }
		)
		.toBe(true);
	const zoom = await e5.getAttribute('data-zoom');
	const center = await e5.getAttribute('data-center');

	await sheet.getByRole('link', { name: 'Modifier la forme' }).click();
	await expect(page).toHaveURL(new RegExp(`&z=${zoom}&c=${center!.replace('.', '\\.')}`));
	const box = page.locator('.mapbox');
	await expect(box).toHaveAttribute('data-zoom', zoom!);
	await expect(box).toHaveAttribute('data-center', center!);

	// Sélectionner un point (toucher, puis « Prendre ce point ») : la carte glisse, le zoom reste
	await moved(page, () => tap(page, 'Point 2 : le sélectionner'));
	await expect(box).toHaveAttribute('data-zoom', zoom!);
	await tap(page, 'Point 2 : le sélectionner'); // désélection
	await page.getByRole('button', { name: 'Prendre ce point' }).click();
	await expect(page.getByRole('button', { name: 'Déplacer le point ici' })).toBeVisible();
	await expect(box).toHaveAttribute('data-zoom', zoom!);
	await tap(page, 'Point 2 : le sélectionner');

	// Les menus flottants sont au-dessus des repères de sommets (jamais l'inverse) : le quai
	// passe sous le panneau du bas, chaque repère recouvert reste caché par le panneau.
	const coverage = () =>
		page.evaluate(() => {
			const boxes = [...document.querySelectorAll('[data-map-avoid]')].map((e) =>
				e.getBoundingClientRect()
			);
			let covered = 0,
				onTop = 0;
			for (const m of document.querySelectorAll<HTMLElement>('[data-point], .rc-mid')) {
				const r = m.getBoundingClientRect();
				const x = r.x + r.width / 2,
					y = r.y + r.height / 2;
				if (!boxes.some((b) => x > b.left && x < b.right && y > b.top && y < b.bottom)) continue;
				covered++;
				// (Un repère trop serré ignore le toucher : on le rend touchable le temps du test,
				// sinon elementFromPoint le traverserait.)
				const pe = m.style.pointerEvents;
				m.style.pointerEvents = 'auto';
				const hit = document.elementFromPoint(x, y);
				m.style.pointerEvents = pe;
				if (hit && m.contains(hit)) onTop++;
			}
			return { covered, onTop };
		});
	let hidden = await coverage();
	for (let k = 0; k < 8 && !hidden.covered; k++) {
		await pan(page, 0, -1);
		hidden = await coverage();
	}
	expect(hidden.covered).toBeGreaterThan(0);
	expect(hidden.onTop).toBe(0);
	const done = page.getByRole('button', { name: 'Terminer' });
	const r = (await done.boundingBox())!;
	expect(
		await page.evaluate(
			([x, y]) => document.elementFromPoint(x, y)?.closest('button')?.textContent?.trim(),
			[r.x + r.width / 2, r.y + r.height / 2]
		)
	).toBe('Terminer');

	// Quitter : retour sur la carte de la gare avec la vue de E12
	const z12 = await box.getAttribute('data-zoom');
	const c12 = await box.getAttribute('data-center');
	await page.getByRole('link', { name: 'Quitter sans enregistrer' }).click();
	await expect(page).toHaveURL(/\/gare\/carte/);
	await expect(page.locator('.map[data-zoom]')).toHaveAttribute('data-zoom', z12!);
	await expect(page.locator('.map[data-zoom]')).toHaveAttribute('data-center', c12!);
	await expect(sheet).toContainText('Quai A');
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

// ---------- Lot 7d : accrochage limité à 12 px, sommets glissés au doigt ----------

/** Coordonnées du nœud n de la fixture. */
const at = (id: number) => {
	const n = base.find((e) => e.type === 'node' && e.id === id)!;
	return { lon: n.lon!, lat: n.lat! };
};
/** Distance (m) entre deux positions proches. */
const meters = (a: { lon: number; lat: number }, b: { lon: number; lat: number }) =>
	Math.hypot(
		(a.lon - b.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180),
		(a.lat - b.lat) * 111_320
	);

test('E12 zoomé : la croix sur un côté du quai, près d’une voie, sans accrochage parasite', async ({
	page
}) => {
	test.setTimeout(60_000);
	const calls = await setup(page);
	// Milieu du côté 25-26 du quai A : axe de la voie à 3,9 m (l'ancienne règle accrochait le
	// point 2,4 m plus loin, au bord de la voie, comme sur la capture de Loïc).
	const quai = base.find((e) => e.type === 'way' && e.id === QUAI_A)!;
	const ring = quai.nodes!.slice(0, -1);
	const [a, b] = [at(ring[24]), at(ring[25])];
	const mid = { lon: (a.lon + b.lon) / 2, lat: (a.lat + b.lat) / 2 };
	const c = `${mid.lon.toFixed(7)},${mid.lat.toFixed(7)}`;

	// Vue d'ensemble (z18) : 12 px ≈ 5 m, l'accrochage s'applique et se voit sur la croix
	await page.goto(`/gare/forme/?id=${STATION}&osm=way/${QUAI_A}&z=18.00&c=${c}`);
	await expect(page.locator('.mapbox')).toHaveAttribute('data-zoom', '18.00');
	const info = page.locator('.panel [role="status"]');
	await expect(info).toContainText('Accroché au bord de la voie');
	await expect(page.locator('.reticle.snapped')).toHaveCount(1);
	await expect(page.locator('.rc-preview')).toHaveCount(1);

	// Zoomé (z21) : 12 px ≈ 0,3 m, plus d'accrochage : le point est sous la croix
	await page.goto(`/gare/forme/?id=${STATION}&osm=way/${QUAI_A}&z=21.00&c=${c}`);
	const box = page.locator('.mapbox');
	await expect(box).toHaveAttribute('data-zoom', '21.00'); // carte chargée, croix connue
	await expect(info).toContainText('Point sous la croix');
	await expect(page.locator('.reticle.snapped')).toHaveCount(0);
	await expect(page.locator('.rc-preview')).toHaveCount(0);
	const cross = (await box.getAttribute('data-center'))!.split(',').map(Number);
	await page.getByRole('button', { name: 'Ajouter un point ici' }).click();
	await expect(page.getByText('27 points')).toBeVisible();
	await expect(page.getByText(/Point 26 ajouté entre 25 et 26\.$/)).toBeAttached();
	await expectAccessible(page);
	await page.getByRole('button', { name: 'Terminer' }).click();
	await expect(page).toHaveURL(/\/gare\/carte/);

	await page.goto(`/envoi/?id=${STATION}`);
	await page.getByRole('button', { name: 'Envoyer 1 modification' }).click();
	await expect(page.getByText('1 modification envoyée.')).toBeVisible();
	const xml = calls.find((x) => x.path.endsWith('/upload'))!.body;
	const added = xml.match(/<node id="-\d+" changeset="1234" lat="([\d.]+)" lon="([\d.]+)"/)!;
	// Le point ajouté est exactement sous la croix (au dixième de millimètre de degré près)
	expect(
		meters({ lat: Number(added[1]), lon: Number(added[2]) }, { lon: cross[0], lat: cross[1] })
	).toBeLessThan(0.02);
});

test('E12 : « Accrocher à la voie » se coupe, et la préférence est gardée', async ({ page }) => {
	await setup(page);
	const quai = base.find((e) => e.type === 'way' && e.id === QUAI_A)!;
	const ring = quai.nodes!.slice(0, -1);
	const [a, b] = [at(ring[24]), at(ring[25])];
	const c = `${((a.lon + b.lon) / 2).toFixed(7)},${((a.lat + b.lat) / 2).toFixed(7)}`;
	await page.goto(`/gare/forme/?id=${STATION}&osm=way/${QUAI_A}&z=18.00&c=${c}`);
	const info = page.locator('.panel [role="status"]');
	await expect(info).toContainText('Accroché au bord de la voie');
	const toggle = page.getByRole('switch', { name: 'Accrocher à la voie' });
	await expect(toggle).toBeChecked();
	await toggle.uncheck();
	await expect(info).toContainText('Point sous la croix');
	await expect(page.locator('.reticle.snapped')).toHaveCount(0);
	expect(await page.evaluate(() => localStorage.getItem('rc:snapEdge'))).toBe('false');
	await page.reload();
	await expect(page.locator('.mapbox')).toHaveAttribute('data-zoom', '18.00');
	await expect(page.getByRole('switch', { name: 'Accrocher à la voie' })).not.toBeChecked();
	await expect(info).toContainText('Point sous la croix');
});

test('E12 : glisser un sommet au doigt, l’annuler, le refaire, puis l’envoyer', async ({
	page
}) => {
	test.setTimeout(60_000);
	const calls = await setup(page);
	const quai = base.find((e) => e.type === 'way' && e.id === QUAI_A)!;
	const ring = quai.nodes!.slice(0, -1);
	const p2 = at(ring[1]);
	// Vue zoomée centrée à côté du point 2 (le point reste touchable, hors de la croix)
	await page.goto(
		`/gare/forme/?id=${STATION}&osm=way/${QUAI_A}&z=21.00&c=${(p2.lon + 0.00004).toFixed(7)},${p2.lat.toFixed(7)}`
	);
	await expect(page.locator('.maplibregl-canvas')).toBeVisible();
	const point2 = page.getByRole('button', { name: 'Point 2 : le sélectionner' });
	await expect(point2).toBeVisible();
	const box = page.locator('.mapbox');
	const centerBefore = await box.getAttribute('data-center');

	/** Glisser au doigt (événements tactiles réels) du sommet n, de (dx, dy) px. */
	async function dragVertex(n: number, dx: number, dy: number) {
		const from = await spot(page, n);
		const cdp = await page.context().newCDPSession(page);
		const touch = (type: string, p?: { x: number; y: number }) =>
			cdp.send('Input.dispatchTouchEvent', {
				type: type as 'touchStart',
				touchPoints: p ? [{ x: Math.round(p.x), y: Math.round(p.y) }] : []
			});
		await touch('touchStart', from);
		for (let i = 1; i <= 10; i++)
			await touch('touchMove', { x: from.x + (dx * i) / 10, y: from.y + (dy * i) / 10 });
		await touch('touchEnd');
		await cdp.detach();
	}
	await dragVertex(2, 0, -40);
	// Annonce au relâcher ; la carte n'a pas bougé (le doigt a glissé le point, pas la carte)
	await expect(page.getByText(/^Point 2 déplacé/)).toBeAttached();
	await expect(box).toHaveAttribute('data-center', centerBefore!);
	await page.getByRole('button', { name: 'Annuler la dernière action' }).click();
	await expect(page.getByText('Dernière action annulée.')).toBeAttached();
	await dragVertex(2, 0, -40);
	await expect(page.getByText(/^Point 2 déplacé/)).toBeAttached();
	// Un toucher sans glisser sélectionne toujours le point
	await point2.click();
	await expect(page.getByRole('button', { name: 'Déplacer le point ici' })).toBeVisible();
	await point2.click();
	await page.getByRole('button', { name: 'Terminer' }).click();
	await expect(page).toHaveURL(/\/gare\/carte/);

	await page.goto(`/envoi/?id=${STATION}`);
	await expect(page.getByText('Quai A : forme modifiée (26 → 26 points)')).toBeVisible();
	await page.getByRole('button', { name: 'Envoyer 1 modification' }).click();
	await expect(page.getByText('1 modification envoyée.')).toBeVisible();
	const xml = calls.find((x) => x.path.endsWith('/upload'))!.body;
	const n2 = base.find((e) => e.type === 'node' && e.id === ring[1])!;
	const m = xml.match(
		new RegExp(
			`<node id="${ring[1]}" version="${n2.version}" changeset="1234" lat="([\\d.]+)" lon="([\\d.]+)"`
		)
	)!;
	// 40 px au zoom 21 ≈ 1 m vers le nord (un seul glisser compté : l'annulé ne s'ajoute pas)
	const moved = { lat: Number(m[1]), lon: Number(m[2]) };
	expect(meters(moved, p2)).toBeGreaterThan(0.6);
	expect(meters(moved, p2)).toBeLessThan(1.4);
	expect(moved.lat).toBeGreaterThan(p2.lat);
	expect(xml).not.toContain('<create>');
	expect(xml).not.toContain(`<way id="${QUAI_A}"`); // seule la position du nœud change
});

// ---------- Lot 7d : avertissement « le quai ne longe plus la voie » ----------

// Quai court (40 m × 4 m) le long d'une voie « 9 », ajoutés dans un coin vide de l'emprise
// d'Ambérieu. (Les quais réels d'Ambérieu longent des voies à longs segments : déplacer un
// de leurs points ne leur fait perdre aucune voie, voir sign.test.ts.)
const SHORT = 9_000_000_110;
const TRACK9 = 9_000_000_120;
const shortData = (): El[] => {
	const lat = 45.95462,
		lon0 = 5.34369;
	const dLon = (m: number) => m / (111_320 * Math.cos((lat * Math.PI) / 180));
	const dLat = (m: number) => m / 111_320;
	const n = (id: number, x: number, y: number): El => ({
		type: 'node',
		id,
		version: 1,
		lat: lat + dLat(y),
		lon: lon0 + dLon(x)
	});
	return [
		n(9_000_000_101, -60, 0),
		n(9_000_000_102, 100, 0),
		{
			type: 'way',
			id: TRACK9,
			version: 1,
			nodes: [9_000_000_101, 9_000_000_102],
			tags: { railway: 'rail', 'railway:track_ref': '9' }
		},
		n(9_000_000_111, 0, 1.6),
		n(9_000_000_112, 40, 1.6),
		n(9_000_000_113, 40, 5.6),
		n(9_000_000_114, 0, 5.6),
		{
			type: 'way',
			id: SHORT,
			version: 1,
			nodes: [9_000_000_111, 9_000_000_112, 9_000_000_113, 9_000_000_114, 9_000_000_111],
			tags: { railway: 'platform', public_transport: 'platform', train: 'yes', ref: '9' }
		}
	];
};

test('E12 : le quai ne longe plus sa voie → avertissement non bloquant, « Corriger » ou « Enregistrer quand même »', async ({
	page
}) => {
	test.setTimeout(60_000);
	await setup(page, [...base, ...shortData()]);
	const corner = shortData().find((e) => e.id === 9_000_000_113)!;
	await page.goto(
		`/gare/forme/?id=${STATION}&osm=way/${SHORT}&z=19.00&c=${corner.lon!.toFixed(7)},${corner.lat!.toFixed(7)}`
	);
	await expect(page.locator('.mapbox')).toHaveAttribute('data-zoom', '19.00');
	// Coin nord-est tiré d'environ 30 m vers le nord, à la croix (pas de 100 px ≈ 10 m)
	await page.getByRole('button', { name: 'Prendre ce point' }).click();
	await expect(page.getByRole('button', { name: 'Déplacer le point ici' })).toBeVisible();
	await pan(page, 0, -3);
	await page.getByRole('button', { name: 'Déplacer le point ici' }).click();
	await page.getByRole('button', { name: 'Terminer' }).click();
	const warn = page.locator('.panel .lost');
	await expect(warn).toHaveText(
		/Le quai ne longe plus la voie 9 \(bord plus parallèle à la voie\)\. Vérifiez la forme : le bord du quai doit suivre la voie\./
	);
	await expect(page).toHaveURL(/\/gare\/forme/);
	await expectAccessible(page);
	// « Corriger » : on reste sur l'écran ; « Annuler » remet le point, plus d'avertissement
	await warn.getByRole('button', { name: 'Corriger' }).click();
	await expect(warn).toHaveCount(0);
	await page.getByRole('button', { name: 'Terminer' }).click();
	await expect(warn).toBeVisible();
	await warn.getByRole('button', { name: 'Enregistrer quand même' }).click();
	await expect(page).toHaveURL(/\/gare\/carte/);
	// La voie reste sur la carte, discrète, avec son numéro (elle ne longe plus aucun quai) ;
	// son étiquette peut être masquée par l'évitement des collisions (feuille ouverte).
	await expect(
		page.getByRole('button', {
			name: 'Voie 9. Ne longe aucun quai cartographié',
			includeHidden: true
		})
	).toBeAttached();
	await page.goto(`/envoi/?id=${STATION}`);
	await expect(page.getByText('Quai voies 9 : forme modifiée (4 → 4 points)')).toBeVisible();
});
