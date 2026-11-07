<script lang="ts">
	// E10 — Réglages : compte OpenStreetMap, serveur, mode démonstration, informations.
	import { resolve } from '$app/paths';
	import BottomNav from '#lib/BottomNav.svelte';
	import Icon from '#lib/Icon.svelte';
	import { setTheme, theme, type Theme } from '#lib/theme.svelte.js';
	import { account, configured, login, logout, signedIn, syncAccount } from '#lib/auth.svelte.js';
	import { resetStation } from '#lib/current.svelte.js';
	import { setDemo, settings } from '#lib/edits.svelte.js';
	import { SERVERS, server, setServer, type ServerId } from '#lib/osmserver.svelte.js';
	import { downloads, reloadDownloads, removeDownload } from '#lib/offline.svelte.js';
	import { loadAllStations, type Station } from '#lib/stations.js';
	import { onMount } from 'svelte';

	let mounted = $state(false);
	let bboxes = $state<Record<string, Station['bbox']>>({});
	onMount(async () => {
		mounted = true;
		try {
			const ids = new Set(downloads.list.map((d) => d.id));
			bboxes = Object.fromEntries(
				(await loadAllStations()).filter((s) => ids.has(s.id)).map((s) => [s.id, s.bbox])
			);
		} catch {
			/* index indisponible : suppression des données seulement */
		}
	});
	const mo = (b: number) => `${(b / 1e6).toFixed(1).replace('.', ',')} Mo`;
	const total = $derived(downloads.list.reduce((n, d) => n + d.bytes, 0));
	const THEMES: [Theme, string][] = [
		['system', 'Système'],
		['light', 'Clair'],
		['dark', 'Sombre']
	];
	function choose(id: ServerId) {
		setServer(id);
		resetStation();
		syncAccount();
		reloadDownloads();
	}
</script>

<svelte:head><title>Réglages — stationcomplete</title></svelte:head>

<div class="screen">
	<main>
		<h1>Réglages</h1>

		<h2 class="overline">Compte OpenStreetMap</h2>
		<div class="group">
			<div class="row">
				{#if mounted && signedIn() && account.user}
					<span class="txt"
						><span><strong>{account.user.name}</strong></span><span class="small"
							>{SERVERS[server.id].label}</span
						></span
					>
					<button class="btn-sm" type="button" onclick={logout}>Se déconnecter</button>
				{:else if mounted && configured()}
					<span class="txt"><span>Non connecté</span></span>
					<button class="btn-sm" type="button" onclick={() => login()}>Se connecter</button>
				{:else}
					<span class="txt"
						><span>Connexion indisponible</span><span class="small"
							>Pas encore configurée pour {SERVERS[server.id].label}.</span
						></span
					>
				{/if}
			</div>
		</div>

		<h2 class="overline">Apparence</h2>
		<div class="group">
			<div class="row col">
				<span class="txt"
					><span id="theme-label">Thème</span><span class="small"
						>« Système » suit le réglage de votre téléphone.</span
					></span
				>
				<div class="seg" role="group" aria-labelledby="theme-label">
					{#each THEMES as [v, label] (v)}
						<button type="button" aria-pressed={theme.value === v} onclick={() => setTheme(v)}
							>{label}</button
						>
					{/each}
				</div>
			</div>
		</div>

		<h2 class="overline">Serveur</h2>
		<fieldset class="group">
			<legend class="visually-hidden">Serveur OpenStreetMap</legend>
			<label class="row">
				<input
					type="radio"
					name="server"
					checked={server.id === 'prod'}
					onchange={() => choose('prod')}
				/>
				<span class="txt"
					><span>OpenStreetMap</span><span class="small"
						>La vraie carte : vos envois sont publiés, visibles par tous.</span
					></span
				>
			</label>
			<label class="row">
				<input
					type="radio"
					name="server"
					checked={server.id === 'dev'}
					onchange={() => choose('dev')}
				/>
				<span class="txt"
					><span>Serveur de test OSM</span><span class="small"
						>Pour essayer l’envoi : rien n’apparaît sur la vraie carte.</span
					></span
				>
			</label>
		</fieldset>

		<h2 class="overline">Saisie</h2>
		<div class="group">
			<div class="row">
				<span class="txt">
					<span id="demo-label">Mode démonstration</span>
					<span class="small" id="demo-desc"
						>Permet d’essayer la saisie sans être dans la gare. Ces saisies ne partiront jamais sur
						la vraie carte (seulement sur le serveur de test).</span
					>
				</span>
				<button
					type="button"
					role="switch"
					aria-checked={settings.demo}
					aria-labelledby="demo-label"
					aria-describedby="demo-desc"
					class="switch"
					onclick={() => setDemo(!settings.demo)}
				>
					<span></span>
				</button>
			</div>
		</div>

		<h2 class="overline">
			Gares téléchargées{#if downloads.list.length}
				· {mo(total)}{/if}
		</h2>
		<div class="group">
			{#each downloads.list as d (d.id)}
				<div class="row">
					<span class="txt"
						><span>{d.name}</span><span class="small"
							>{mo(d.bytes)} · {new Date(d.at).toLocaleDateString('fr-FR')}</span
						></span
					>
					<button
						class="btn-sm"
						type="button"
						aria-label={`Supprimer ${d.name} du téléphone`}
						onclick={() => removeDownload(d, bboxes[d.id])}>Supprimer</button
					>
				</div>
			{:else}
				<div class="row">
					<span class="txt"
						><span>Aucune</span><span class="small"
							>Téléchargez une gare depuis son tableau de bord pour l’utiliser sans réseau.</span
						></span
					>
				</div>
			{/each}
		</div>

		<h2 class="overline">À propos</h2>
		<div class="group">
			<a class="row link" href={resolve('/a-propos')}>
				<span class="txt">Sécurité, licences, contact</span><Icon name="chev" size={18} />
			</a>
			<a class="row link" href={resolve('/donnees-personnelles')}>
				<span class="txt">Données personnelles</span><Icon name="chev" size={18} />
			</a>
			<a class="row link" href={resolve('/mentions-legales')}>
				<span class="txt">Mentions légales</span><Icon name="chev" size={18} />
			</a>
		</div>
	</main>
	<BottomNav current="reglages" />
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
		gap: 6px;
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
		margin: 14px 0 2px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 56px;
		padding: 8px 8px 8px 14px;
	}
	.row.col {
		flex-direction: column;
		align-items: stretch;
		gap: 8px;
		padding: 10px 14px 12px;
	}
	.link {
		color: var(--text);
		text-decoration: none;
	}
	.link > :global(svg) {
		flex-shrink: 0;
		color: var(--text-3);
	}
	.txt {
		flex-grow: 1;
		display: flex;
		flex-direction: column;
	}
	.txt > span:first-child {
		font-weight: 600;
	}
	.small {
		font-size: 0.875rem;
		color: var(--text-2);
	}
	fieldset.group {
		margin: 0;
		padding: 0;
	}
	label.row {
		cursor: pointer;
	}
	input[type='radio'] {
		width: 24px;
		height: 24px;
		margin: 0;
		accent-color: var(--primary);
		flex-shrink: 0;
	}
</style>
