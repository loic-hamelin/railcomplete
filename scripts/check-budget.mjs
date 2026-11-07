// Vérifie le budget de poids (sobriété) du site construit dans build/.
// Compte, en octets compressés gzip, le JavaScript et le CSS chargés par la page d'accueil,
// plus le dictionnaire de la langue de l'interface (lot traduction) : chaque dictionnaire est
// un morceau chargé à part (import dynamique), mais celui de la langue active l'est toujours au
// démarrage. On compte le plus lourd des cinq, pour que le budget tienne dans toutes les langues.
// Usage : node scripts/check-budget.mjs   (après npm run build)

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGETS = {
	// Appli au démarrage (hors carte, chargée à part à partir du lot 1).
	js: 70 * 1024,
	css: 15 * 1024
};

const BUILD = 'build';
const html = readFileSync(join(BUILD, 'index.html'), 'utf8');
const gz = (file) => gzipSync(readFileSync(file), { level: 9 }).length;

// Fichiers référencés par la page : préchargements, imports du script de démarrage, feuilles de style.
const refs = new Set(
	[...html.matchAll(/["'(](?:\.\/|\/)?(_app\/immutable\/[^"')\s]+\.(?:js|css))/g)].map((m) => m[1])
);

const total = { js: 0, css: 0 };
const seen = new Set();
const queue = [...refs];
while (queue.length) {
	const rel = queue.shift();
	if (seen.has(rel)) continue;
	seen.add(rel);
	const file = join(BUILD, rel);
	if (!existsSync(file)) continue;
	const kind = rel.endsWith('.css') ? 'css' : 'js';
	total[kind] += gz(file);
	// Suit les imports statiques entre morceaux de JavaScript (pas les imports dynamiques).
	if (kind === 'js') {
		const src = readFileSync(file, 'utf8');
		for (const m of src.matchAll(
			/(?:^|[;\n}])\s*import\s*(?:[^'"()]*?from\s*)?["']\.\/([^"']+\.js)["']/g
		)) {
			const dir = rel.slice(0, rel.lastIndexOf('/') + 1);
			queue.push(new URL(m[1], 'http://x/' + dir).pathname.slice(1));
		}
	}
}

// Dictionnaires : morceaux qui contiennent les groupes de messages, reconnus par langue au
// texte du bouton « Annuler » (common.cancel) de chaque dictionnaire source.
const LOCALES = ['fr', 'en', 'de', 'it', 'es'];
const CHUNKS = join(BUILD, '_app/immutable/chunks');
const dicts = {};
for (const f of readdirSync(CHUNKS).filter((f) => f.endsWith('.js'))) {
	const src = readFileSync(join(CHUNKS, f), 'utf8');
	if (!src.includes('mapA11y') || !src.includes('shapePage')) continue;
	for (const l of LOCALES) {
		const m = JSON.parse(readFileSync(`src/lib/i18n/messages/${l}.json`, 'utf8'));
		const esc = m.common.cancel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		if (new RegExp(`cancel:[\`"']${esc}[\`"']`).test(src)) dicts[l] ??= gz(join(CHUNKS, f));
	}
}
const missing = LOCALES.filter((l) => !(l in dicts));
if (missing.length) {
	console.error(`Dictionnaire introuvable dans le build : ${missing.join(', ')}.`);
	process.exit(1);
}
const heaviest = LOCALES.reduce((a, b) => (dicts[b] > dicts[a] ? b : a));
console.log(
	`  dictionnaires (gzip) : ${LOCALES.map((l) => `${l} ${(dicts[l] / 1024).toFixed(1)} ko`).join(', ')}`
);
total.js += dicts[heaviest];

let ok = true;
for (const kind of ['js', 'css']) {
	const kb = (n) => (n / 1024).toFixed(1) + ' ko';
	const pass = total[kind] <= BUDGETS[kind];
	ok &&= pass;
	console.log(
		`${pass ? '✓' : '✗'} ${kind.toUpperCase()} au démarrage : ${kb(total[kind])}${kind === 'js' ? ` (dont dictionnaire « ${heaviest} », le plus lourd)` : ''} (budget ${kb(BUDGETS[kind])})`
	);
}
if (!ok) {
	console.error('Budget de poids dépassé : allégez le code ou chargez-le à la demande.');
	process.exit(1);
}
