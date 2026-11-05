// Vérifie le budget de poids (sobriété) du site construit dans build/.
// Compte, en octets compressés gzip, le JavaScript et le CSS chargés par la page d'accueil.
// Usage : node scripts/check-budget.mjs   (après npm run build)

import { readFileSync, existsSync } from 'node:fs';
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

let ok = true;
for (const kind of ['js', 'css']) {
	const kb = (n) => (n / 1024).toFixed(1) + ' ko';
	const pass = total[kind] <= BUDGETS[kind];
	ok &&= pass;
	console.log(
		`${pass ? '✓' : '✗'} ${kind.toUpperCase()} au démarrage : ${kb(total[kind])} (budget ${kb(BUDGETS[kind])})`
	);
}
if (!ok) {
	console.error('Budget de poids dépassé : allégez le code ou chargez-le à la demande.');
	process.exit(1);
}
