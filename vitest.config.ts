import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

// Tests unitaires du cœur métier (TypeScript pur, sans navigateur) et des scripts de la CI.
// Le greffon SvelteKit fournit la configuration TypeScript du projet ($app/tsconfig).
export default defineConfig({
	plugins: [sveltekit()],
	test: {
		include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
		environment: 'node',
		// Messages de l'interface en français (langue source), comme au build.
		setupFiles: ['src/lib/i18n/test-setup.ts']
	}
});
