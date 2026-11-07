// Pays courant (préférence « rc:country ») : un pays désactivé ne peut pas être choisi.
import { afterEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
	getItem: (k: string) => store.get(k) ?? null,
	setItem: (k: string, v: string) => void store.set(k, v),
	removeItem: (k: string) => void store.delete(k)
});

afterEach(() => {
	store.clear();
	vi.resetModules();
});

describe('pays courant', () => {
	it('France par défaut, sans préférence', async () => {
		const { country } = await import('./country.svelte.js');
		expect(country.code).toBe('fr');
	});
	it('une préférence vers un pays désactivé ou inconnu est ignorée', async () => {
		store.set('rc:country', JSON.stringify('ch'));
		expect((await import('./country.svelte.js')).country.code).toBe('fr');
		vi.resetModules();
		store.set('rc:country', JSON.stringify('xx'));
		expect((await import('./country.svelte.js')).country.code).toBe('fr');
	});
	it('setCountry refuse un pays désactivé et accepte un pays activé', async () => {
		const { country, setCountry } = await import('./country.svelte.js');
		expect(setCountry('ch')).toBe(false);
		expect(country.code).toBe('fr');
		expect(store.has('rc:country')).toBe(false);
		expect(setCountry('fr')).toBe(true);
		expect(store.get('rc:country')).toBe('"fr"');
	});
});
