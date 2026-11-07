import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { cspDirectives } from './src/lib/core/csp.ts';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({ fallback: '404.html' }),
			// GitHub Pages ne permet pas d'en-têtes HTTP : SvelteKit écrit la politique de sécurité
			// dans une balise <meta> de chaque page, avec l'empreinte de son script de démarrage.
			// Directives générées depuis la configuration des pays (photos aériennes autorisées).
			csp: { mode: 'hash', directives: cspDirectives() }
		})
	]
});
