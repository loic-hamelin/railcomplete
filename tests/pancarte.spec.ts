import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Lot 7d : supprimer une pancarte d'arrêt existante ; légende de la carte E5.
// Ambérieu-en-Bugey (données réelles), serveur de test simulé : aucun appel réel à OSM.
// La fixture n'a pas de pancarte : on en insère une dans la voie 2, le long du quai A.
const fixture = JSON.parse(readFileSync('tests/fixtures/amberieu-en-bugey.json', 'utf8'));
const tile = readFileSync('tests/fixtures/tuile-grise.jpg');
const STATION = 'w67074448';
const DEV = 'https://master.apis.dev.openstreetmap.org';
const VOIE_2 = 177859445;
const SIGN = 9_100_000_001;
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

/** Données de la gare avec une pancarte « TT » au milieu d'un segment de la voie 2 (alignée). */
function withSign(): El[] {
	const els = structuredClone(fixture.elements) as El[];
	const way = els.find((e) => e.type === 'way' && e.id === VOIE_2)!;
	const [a, b] = [way.nodes![13], way.nodes![14]].map((id) =>
		els.find((e) => e.type === 'node' && e.id === id)!
	);
	els.push({
		type: 'node',
		id: SIGN,
		version: 3,
		lat: (a.lat! + b.lat!) / 2,
		lon: (a.lon! + b.lon!) / 2,
		tags: {
			railway: 'signal',
			'railway:signal:direction': 'forward',
			'railway:signal:position': 'right',
			'railway:signal:stop': 'FR:passenger_stop',
			'railway:signal:stop:conventional': 'FR:TT',
			'railway:signal:stop:conventional:form': 'sign'
		}
	});
	way.nodes!.splice(14, 0, SIGN);
	return els;
}

/** Serveur de test simulé (lecture, relectures avant envoi, changeset) ; journal des appels. */
async function setup(page: Page, elements: El[]) {
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
	const byId = (type: string, id: number) => elements.find((e) => e.type === type && e.id === id);
	await page.route(`${DEV}/api/0.6/**`, async (route) => {
		const req = route.request();
		const url = new URL(req.url());
		const p = url.pathname;
		calls.push({ method: req.method(), path: p + url.search, body: req.postData() ?? '' });
		const json = (list: unknown[]) =>
			route.fulfill({ contentType: 'application/json', body: JSON.stringify({ elements: list }) });
		if (p.endsWith('/map.json')) return json(elements);
		const many = p.match(/\/(nodes|ways)\.json$/);
		if (many) {
			const ids = (url.searchParams.get(many[1]) ?? '').split(',').map(Number);
			return json(ids.map((id) => byId(many[1].slice(0, -1), id)).filter(Boolean));
		}
		const full = p.match(/\/way\/(\d+)\/full\.json$/);
		if (full) {
			const w = byId('way', Number(full[1]));
			if (!w) return route.fulfill({ status: 404, body: '' });
			return json([...w.nodes!.map((id) => byId('node', id)), w]);
		}
		const of = p.match(/\/node\/(\d+)\/(ways|relations)\.json$/);
		if (of) {
			const id = Number(of[1]);
			return json(
				elements.filter((e) =>
					of[2] === 'ways'
						? e.type === 'way' && e.nodes!.includes(id)
						: e.type === 'relation' && e.members!.some((m) => m.type === 'node' && m.ref === id)
				)
			);
		}
		if (p.endsWith('/changeset/create')) return route.fulfill({ body: '1234' });
		if (p.endsWith('/changeset/1234/upload'))
			return route.fulfill({ contentType: 'text/xml', body: '<diffResult version="0.6"/>' });
		if (p.endsWith('/close')) return route.fulfill({ body: '' });
		return route.fulfill({ status: 404, body: 'inconnu' });
	});
	return calls;
}

async function expectAccessible(page: Page) {
	const { violations } = await new AxeBuilder({
		page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]['page']
	})
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
		.exclude('.maplibregl-canvas-container')
		.analyze();
	expect(
		violations.map(
			(v) => `${v.id} : ${v.help} ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`
		)
	).toEqual([]);
}

test('supprimer une pancarte d’arrêt existante, puis l’envoyer', async ({ page }) => {
	const els = withSign();
	const calls = await setup(page, els);
	const voie = els.find((e) => e.type === 'way' && e.id === VOIE_2)!;
	await page.goto(`/gare/carte/?id=${STATION}&focus=node/${SIGN}`);
	const sheet = page.getByRole('region', { name: 'Objet sélectionné' });
	await expect(sheet).toContainText('Pancarte « TT »');
	// Menu ⋮ de la fiche, comme pour un quai
	await sheet.getByRole('button', { name: 'Plus d’actions' }).click();
	await sheet.getByRole('button', { name: 'Supprimer cette pancarte…' }).click();
	await expect(sheet.getByRole('heading', { name: 'Supprimer cette pancarte ?' })).toBeVisible();
	// Récapitulatif : nœud aligné, une seule voie → retiré de la voie, géométrie inchangée
	await expect(sheet).toContainText(
		'Le point sera retiré de la voie puis supprimé : la forme de la voie ne change pas.'
	);
	await expect(sheet.getByRole('radio', { name: 'Mal placée' })).toBeEnabled();
	// Sans motif : refus
	await sheet.getByRole('button', { name: 'Supprimer la pancarte' }).click();
	await expect(sheet.getByRole('alert')).toContainText('motif');
	await sheet.getByRole('radio', { name: 'En double' }).check();
	await expectAccessible(page);
	await sheet.getByRole('button', { name: 'Supprimer la pancarte' }).click();
	await expect(
		page.getByRole('status').filter({ hasText: 'Pancarte « TT » : suppression en attente' })
	).toBeVisible();

	// E9 : déjà « Retirer » possible ; E8 : résumé, nature, commentaire
	await page.goto(`/envoi/?id=${STATION}`);
	await expect(
		page.getByText('Pancarte « TT » supprimée (en double) — point retiré de la voie')
	).toBeVisible();
	await expect(page.getByText('Suppression de pancarte · motif : en double')).toBeVisible();
	await expect(page.getByRole('textbox')).toHaveValue(
		/pancarte d’arrêt « TT » supprimée \(en double\)/
	);
	await page.getByRole('button', { name: 'Envoyer 1 modification' }).click();
	await expect(page.getByText('1 modification envoyée.')).toBeVisible();

	// Relecture juste avant l'envoi : nœud, voie complète, usage du nœud
	const reads = calls.filter((c) => c.method === 'GET').map((c) => c.path);
	expect(reads.some((p) => p.includes(`/nodes.json?nodes=${SIGN}`))).toBe(true);
	expect(reads).toContain(`/api/0.6/way/${VOIE_2}/full.json`);
	expect(reads).toContain(`/api/0.6/node/${SIGN}/ways.json`);
	expect(reads).toContain(`/api/0.6/node/${SIGN}/relations.json`);

	// osmChange : modify de la voie (même version, sans le nœud) puis delete du nœud
	const xml = calls.find((c) => c.path.endsWith('/upload'))!.body;
	const w = xml.match(
		new RegExp(`<modify><way id="${VOIE_2}" version="${voie.version}" changeset="1234">(.*?)</way>`)
	)![1];
	const nds = [...w.matchAll(/<nd ref="(\d+)"\/>/g)].map((m) => Number(m[1]));
	expect(nds).toEqual(voie.nodes!.filter((id) => id !== SIGN));
	expect(w).toContain('<tag k="railway" v="rail"/>');
	expect(xml).toContain(`<delete><node id="${SIGN}" version="3" changeset="1234"`);
	expect(xml).not.toContain('<create>');
	expect(xml).not.toContain('<relation');
	expect(xml.indexOf('</modify>')).toBeLessThan(xml.indexOf('<delete>'));
	const cs = calls.find((c) => c.path.endsWith('/changeset/create'))!.body;
	expect(cs).toContain('pancarte d’arrêt « TT » supprimée (en double)');
});

test('pancarte sur un nœud partagé : seuls ses tags sont retirés, la voie ne change pas', async ({
	page
}) => {
	const els = withSign();
	// Le nœud de la pancarte est aussi dans un autre way (aiguillage, autre voie…)
	els.push({
		type: 'way',
		id: 9_100_000_010,
		version: 1,
		nodes: [SIGN, voie2Node(els, 15)],
		tags: { railway: 'rail', service: 'crossover' }
	});
	const calls = await setup(page, els);
	await page.goto(`/gare/carte/?id=${STATION}&focus=node/${SIGN}`);
	const sheet = page.getByRole('region', { name: 'Objet sélectionné' });
	await sheet.getByRole('button', { name: 'Plus d’actions' }).click();
	await sheet.getByRole('button', { name: 'Supprimer cette pancarte…' }).click();
	await expect(sheet).toContainText(
		'Le point reste dans la voie (point partagé avec un autre objet (autre voie, aiguillage…)) : seuls les tags de la pancarte sont retirés. La forme de la voie ne change jamais.'
	);
	await sheet.getByRole('radio', { name: 'N’existe plus' }).check();
	await sheet.getByRole('button', { name: 'Supprimer la pancarte' }).click();
	// Attendre l'enregistrement sur le téléphone avant de changer de page.
	await expect(
		page.getByRole('status').filter({ hasText: 'Pancarte « TT » : suppression en attente' })
	).toBeVisible();
	await page.goto(`/envoi/?id=${STATION}`);
	await expect(
		page.getByText('Pancarte « TT » supprimée (n’existe plus) — point gardé dans la voie')
	).toBeVisible();
	await page.getByRole('button', { name: 'Envoyer 1 modification' }).click();
	await expect(page.getByText('1 modification envoyée.')).toBeVisible();
	const xml = calls.find((c) => c.path.endsWith('/upload'))!.body;
	// Nœud gardé, sans aucun tag (il ne portait que ceux de la pancarte) ; aucune voie touchée
	expect(xml).toMatch(
		new RegExp(
			`<modify><node id="${SIGN}" version="3" changeset="1234" lat="[\\d.]+" lon="[\\d.]+"></node></modify>`
		)
	);
	expect(xml).not.toContain('<way');
	expect(xml).not.toContain('<delete>');
	expect(calls.find((c) => c.path.endsWith('/changeset/create'))!.body).toContain(
		'<tag k="source" v="survey"/>'
	);
});

function voie2Node(els: El[], i: number) {
	return els.find((e) => e.type === 'way' && e.id === VOIE_2)!.nodes![i];
}

test('légende de la carte : ouverte, accessible, refermable ; menus au-dessus des repères', async ({
	page
}) => {
	await setup(page, withSign());
	await page.goto(`/gare/carte/?id=${STATION}`);
	await expect(page.locator('.maplibregl-canvas')).toBeVisible();
	const open = page.getByRole('button', { name: 'Légende de la carte' });
	await expect(open).toHaveAttribute('aria-expanded', 'false');
	await open.click();
	await expect(open).toHaveAttribute('aria-expanded', 'true');
	const legend = page.getByRole('region', { name: 'Légende' });
	await expect(legend).toBeVisible();
	for (const t of [
		'Quai',
		'Voie',
		'Pancarte d’arrêt',
		'Objet sélectionné',
		'Modifié par vous, en attente d’envoi',
		'Souterrain (tunnel, niveau inférieur)',
		'À compléter',
		'À vérifier en priorité'
	])
		await expect(legend.getByText(t, { exact: true })).toBeVisible();
	await expectAccessible(page);
	// Au-dessus des étiquettes de la carte : le centre de chaque ligne est bien la légende
	const hits = await legend.locator('li').evaluateAll((items) =>
		items.map((li) => {
			const r = li.getBoundingClientRect();
			return li.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
		})
	);
	expect(hits.every(Boolean)).toBe(true);
	// Échap referme ; le bouton aussi
	await page.keyboard.press('Escape');
	await expect(legend).toHaveCount(0);
	await open.click();
	await page.getByRole('button', { name: 'Fermer la légende' }).click();
	await expect(legend).toHaveCount(0);
});
