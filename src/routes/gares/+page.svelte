<script lang="ts">
	// E3 — Choisir une gare (recherche, gares récentes, « autour de moi »).
	import { resolve } from '$app/paths';
	import BottomNav from '#lib/BottomNav.svelte';
	import Icon from '#lib/Icon.svelte';
	import { recentIds } from '#lib/current.svelte.js';
	import { formatDistance, loadStations, nearby, search, type Station } from '#lib/stations.js';
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
			stations = (await loadStations()).stations;
			const byId = new Map(stations.map((s) => [s.id, s]));
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
			geoError = 'La localisation n’est pas disponible sur cet appareil.';
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
				geoError = 'Position indisponible. Autorisez la localisation ou cherchez par nom.';
			},
			{ enableHighAccuracy: false, maximumAge: 300_000, timeout: 15_000 }
		);
	}

	const sub = (s: Station) =>
		[s.commune && s.commune !== s.name ? s.commune : '', s.dep, s.halt ? 'halte' : '']
			.filter(Boolean)
			.join(' · ');
</script>

<svelte:head><title>Choisir une gare — stationcomplete</title></svelte:head>

<div class="screen">
	<main>
		<h1>Choisir une gare</h1>
		<label class="search">
			<Icon name="search" />
			<span class="visually-hidden">Rechercher une gare</span>
			<input
				type="search"
				bind:value={query}
				placeholder="Nom de gare ou commune"
				autocomplete="off"
				enterkeyhint="search"
			/>
		</label>
		<button class="chip" type="button" onclick={locate} disabled={!stations.length || locating}>
			<Icon name="locate" size={20} />
			{locating ? 'Localisation…' : 'Gares autour de moi'}
		</button>
		{#if geoError}<p class="note" role="status">{geoError}</p>{/if}

		{#if error}
			<p class="note error" role="alert">{error}</p>
		{:else if !stations.length}
			<p class="note" role="status">Chargement de la liste des gares…</p>
		{/if}

		{#snippet list(title: string, items: { s: Station; d?: number }[])}
			<h2>{title}</h2>
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
					'Résultats',
					results.map((s) => ({ s }))
				)}
			{:else if stations.length}
				<p class="note" role="status">Aucune gare ne correspond à « {query} ».</p>
			{/if}
		{:else}
			{#if around.length}{@render list('Autour de moi', around)}{/if}
			{#if recent.length}{@render list(
					'Récentes',
					recent.map((s) => ({ s }))
				)}{/if}
			{#if !around.length && !recent.length && stations.length}
				<p class="note">
					{stations.length.toLocaleString('fr-FR')} gares et haltes de France. Tapez au moins deux lettres.
				</p>
			{/if}
		{/if}
	</main>
	<BottomNav current="gare" />
</div>

<style>
	.screen {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
	}
	main {
		flex-grow: 1;
		width: 100%;
		max-width: 640px;
		margin: 0 auto;
		padding: 24px 20px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	h1 {
		margin: 0;
		font-size: 1.625rem;
	}
	h2 {
		margin: 12px 0 0;
		font-size: 0.875rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.search {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 54px;
		padding: 0 16px;
		border: 2px solid var(--text-2);
		border-radius: var(--radius);
		color: var(--text-2);
	}
	.search:focus-within {
		border-color: var(--primary);
	}
	input {
		flex-grow: 1;
		border: 0;
		outline: none;
		background: transparent;
		color: var(--text);
		font: 1.0625rem var(--font);
		min-height: 48px;
	}
	.chip {
		align-self: flex-start;
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 48px;
		padding: 0 18px;
		border: 2px solid var(--primary);
		border-radius: 24px;
		background: transparent;
		color: var(--primary);
		font: 700 1rem var(--font);
		cursor: pointer;
	}
	.chip:disabled {
		opacity: 0.6;
		cursor: default;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li a {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 12px 0;
		min-height: 48px;
		border-bottom: 1px solid var(--border);
		color: var(--text);
		text-decoration: none;
	}
	.name {
		font-size: 1.125rem;
		font-weight: 700;
	}
	.sub {
		font-size: 0.9375rem;
		color: var(--text-2);
	}
	.note {
		margin: 0;
		color: var(--text-2);
	}
	.error {
		color: var(--danger);
	}
</style>
