import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

// Tests unitaires du cœur métier (TypeScript pur, sans navigateur).
// Le greffon SvelteKit fournit la configuration TypeScript du projet ($app/tsconfig).
export default defineConfig({
	plugins: [sveltekit()],
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node'
	}
});
