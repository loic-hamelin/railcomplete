import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

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
			csp: {
				mode: 'hash',
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					'style-src': ['self', 'unsafe-inline'],
					'img-src': ['self', 'data:', 'blob:', 'https://data.geopf.fr'],
					'font-src': ['self'],
					'connect-src': [
						'self',
						'https://api.openstreetmap.org',
						'https://www.openstreetmap.org',
						'https://master.apis.dev.openstreetmap.org',
						'https://data.geopf.fr'
					],
					'worker-src': ['self', 'blob:'],
					'manifest-src': ['self'],
					'base-uri': ['self'],
					'form-action': ['self'],
					'object-src': ['none']
				}
			}
		})
	]
});
