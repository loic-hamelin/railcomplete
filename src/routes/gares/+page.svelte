<script lang="ts">
	// E3 — Choisir une gare (recherche, gares récentes, « autour de moi »).
	import { resolve } from '$app/paths';
	import BottomNav from '#lib/BottomNav.svelte';
	import Icon from '#lib/Icon.svelte';
	import { country } from '#lib/country.svelte.js';
	import { fmtNumber, t, tk } from '#lib/i18n/t.js';
	import { recentIds } from '#lib/current.svelte.js';
	import {
		formatDistance,
		loadAllStations,
		loadStations,
		nearby,
		search,
		type Station
	} from '#lib/stations.js';
	import { onMount } from 'svelte';

	let stations = $state<Station[]>([]);
	let error = $state('');
	let query = $state('');
	let recent = $state<Station[]>([]);
	let around = $state<{ s: Station; d: number }[]>([]);
	let locating = $state(false);
	let geoError = $state('');

	const results = $derived(search(stations, query));

	onMount(async () => {
		try {
			// Recherche et « autour de moi » : gares du pays courant ; récentes : tous pays.
			stations = (await loadStations(country.code)).stations;
			const byId = new Map((await loadAllStations(country.code)).map((s) => [s.id, s]));
			recent = recentIds()
				.map((id) => byId.get(id))
				.filter((s): s is Station => !!s);
		} catch (e) {
			error = (e as Error).message;
		}
	});

	function locate() {
		geoError = '';
		if (!('geolocation' in navigator)) {
			geoError = t('stations.geoUnavailable');
			return;
		}
		locating = true;
		// GPS demandé une seule fois, à la demande (sobriété) ; pas de suivi continu.
		navigator.geolocation.getCurrentPosition(
			(p) => {
				locating = false;
				around = nearby(stations, p.coords.latitude, p.coords.longitude, 8);
			},
			() => {
				locating = false;
				geoError = t('stations.geoError');
			},
			{ enableHighAccuracy: false, maximumAge: 300_000, timeout: 15_000 }
		);
	}

	const sub = (s: Station) =>
		[s.commune && s.commune !== s.name ? s.commune : '', s.admin, s.halt ? t('stations.halt') : '']
			.filter(Boolean)
			.join(' · ');
</script>

<svelte:head><title>{t('stations.title')}</title></svelte:head>

<div class="screen">
	<main>
		<h1>{t('home.chooseStation')}</h1>
		<label class="search">
			<Icon name="search" size={20} />
			<span class="visually-hidden">{t('stations.searchLabel')}</span>
			<input
				type="search"
				bind:value={query}
				placeholder={t('stations.placeholder')}
				autocomplete="off"
				enterkeyhint="search"
			/>
		</label>
		<button
			class="btn-sm near"
			type="button"
			onclick={locate}
			disabled={!stations.length || locating}
		>
			<Icon name="locate" size={20} />
			{locating ? t('stations.locating') : t('stations.nearby')}
		</button>
		{#if geoError}<p class="banner warn" role="status">
				<Icon name="alert" size={18} />{geoError}
			</p>{/if}

		{#if error}
			<p class="banner err" role="alert"><Icon name="alert" size={18} />{error}</p>
		{:else if !stations.length}
			<p class="note" role="status">{t('stations.loading')}</p>
		{/if}

		{#snippet list(title: string, items: { s: Station; d?: number }[])}
			<h2 class="overline">{title}</h2>
			<ul>
				{#each items as { s, d } (s.id)}
					<li>
						<a href={resolve(`/gare?id=${encodeURIComponent(s.id)}`)}>
							<span class="name">{s.name}</span>
							<span class="sub">{sub(s)}{d !== undefined ? ` · ${formatDistance(d)}` : ''}</span>
						</a>
					</li>
				{/each}
			</ul>
		{/snippet}

		{#if query.trim().length >= 2}
			{#if results.length}
				{@render list(
					t('stations.results'),
					results.map((s) => ({ s }))
				)}
			{:else if stations.length}
				<p class="note" role="status">{t('stations.noMatch', { query })}</p>
			{/if}
		{:else}
			{#if around.length}{@render list(t('stations.around'), around)}{/if}
			{#if recent.length}{@render list(
					t('stations.recent'),
					recent.map((s) => ({ s }))
				)}{/if}
			{#if !around.length && !recent.length && stations.length}
				<p class="note">
					{t('stations.count', {
						count: fmtNumber(stations.length),
						of: tk(`country.${country.code}.of`)
					})}
				</p>
			{/if}
		{/if}
	</main>
	<BottomNav current="gare" />
</div>

<style>
	/* Coque d'appli : seul le contenu défile, la barre basse ne recouvre jamais rien. */
	.screen {
		height: 100dvh;
		display: flex;
		flex-direction: column;
	}
	main {
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
		width: 100%;
		padding: 20px 16px;
		/* colonne de 640 px au plus, barre de défilement au bord de l'écran */
		padding-inline: max(16px, calc((100% - 640px) / 2));
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	main > :global(*) {
		flex-shrink: 0;
	}
	h1 {
		margin: 0 0 4px;
		font-size: 1.5rem;
		line-height: 1.33;
	}
	.overline {
		margin-bottom: 0;
	}
	.search {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 48px;
		padding: 0 12px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--bg);
		color: var(--text-2);
	}
	.search:focus-within {
		outline: 2px solid var(--primary);
		outline-offset: 2px;
	}
	input {
		flex-grow: 1;
		min-width: 0;
		border: 0;
		outline: none;
		background: transparent;
		color: var(--text);
		font: 1rem var(--font);
		min-height: 44px;
	}
	input::placeholder {
		color: var(--text-3);
	}
	.near {
		align-self: flex-start;
		min-height: 48px;
		padding: 0 16px 0 12px;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li a {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 1px;
		padding: 10px 0;
		min-height: 56px;
		border-bottom: 1px solid var(--border);
		color: var(--text);
		text-decoration: none;
	}
	.name {
		font-size: 1rem;
		font-weight: 600;
	}
	.sub {
		font-size: 0.875rem;
		color: var(--text-2);
	}
	.note {
		margin: 0;
		font-size: 0.875rem;
		color: var(--text-2);
	}
</style>
