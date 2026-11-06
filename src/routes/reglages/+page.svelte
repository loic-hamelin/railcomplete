<script lang="ts">
	// E10 — Réglages : compte OpenStreetMap, serveur, mode démonstration, informations.
	import { resolve } from '$app/paths';
	import BottomNav from '#lib/BottomNav.svelte';
	import { account, configured, login, logout, signedIn, syncAccount } from '#lib/auth.svelte.js';
	import { resetStation } from '#lib/current.svelte.js';
	import { setDemo, settings } from '#lib/edits.svelte.js';
	import { SERVERS, server, setServer, type ServerId } from '#lib/osmserver.svelte.js';
	import { onMount } from 'svelte';

	let mounted = $state(false);
	onMount(() => (mounted = true));
	function choose(id: ServerId) {
		setServer(id);
		resetStation();
		syncAccount();
	}
</script>

<svelte:head><title>Réglages — railcomplete</title></svelte:head>

<div class="screen">
	<main>
		<h1>Réglages</h1>

		<h2>Compte OpenStreetMap</h2>
		<div class="group">
			<div class="row">
				{#if mounted && signedIn() && account.user}
					<span class="txt"
						><span><strong>{account.user.name}</strong></span><span class="small"
							>{SERVERS[server.id].label}</span
						></span
					>
					<button class="small-btn" type="button" onclick={logout}>Se déconnecter</button>
				{:else if mounted && configured()}
					<span class="txt"><span>Non connecté</span></span>
					<button class="small-btn" type="button" onclick={() => login()}>Se connecter</button>
				{:else}
					<span class="txt"
						><span>Connexion indisponible</span><span class="small"
							>Pas encore configurée pour {SERVERS[server.id].label}.</span
						></span
					>
				{/if}
			</div>
		</div>

		<h2>Serveur</h2>
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
						>La vraie carte. Consultation ; l’envoi ouvrira après la phase de test.</span
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

		<h2>Saisie</h2>
		<div class="group">
			<div class="row">
				<span class="txt">
					<span id="demo-label">Mode démonstration</span>
					<span class="small" id="demo-desc"
						>Permet d’essayer la saisie sans être dans la gare. Tant que l’envoi n’existe pas, rien
						ne part vers OpenStreetMap.</span
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

		<h2>Affichage</h2>
		<div class="group">
			<div class="row">
				<span class="txt"
					><span>Thème</span><span class="small">Clair ou sombre, comme votre téléphone</span></span
				>
			</div>
		</div>

		<h2>À propos</h2>
		<div class="group">
			<a class="row link" href={resolve('/a-propos')}>
				<span class="txt">Sécurité, licences, vie privée</span><span aria-hidden="true">›</span>
			</a>
		</div>
	</main>
	<BottomNav current="reglages" />
</div>

<style>
	.screen {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		background: var(--surface);
	}
	main {
		flex-grow: 1;
		width: 100%;
		max-width: 640px;
		margin: 0 auto;
		padding: 24px 16px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	h1 {
		margin: 0 4px 8px;
		font-size: 1.625rem;
	}
	h2 {
		margin: 14px 4px 4px;
		font-size: 0.875rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.group {
		background: var(--bg);
		border-radius: var(--radius);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 56px;
		padding: 10px 16px;
	}
	.link {
		color: var(--text);
		text-decoration: none;
	}
	.txt {
		flex-grow: 1;
		display: flex;
		flex-direction: column;
	}
	.small {
		font-size: 0.875rem;
		color: var(--text-2);
	}
	fieldset.group {
		border: 0;
		margin: 0;
		padding: 0;
	}
	label.row {
		cursor: pointer;
	}
	label.row + label.row {
		border-top: 1px solid var(--border);
	}
	input[type='radio'] {
		width: 24px;
		height: 24px;
		accent-color: var(--primary);
		flex-shrink: 0;
	}
	.small-btn {
		flex-shrink: 0;
		min-height: 44px;
		padding: 0 14px;
		border: 2px solid var(--primary);
		border-radius: 12px;
		background: var(--bg);
		color: var(--primary);
		font: 700 0.9375rem var(--font);
		cursor: pointer;
	}
	.switch {
		flex-shrink: 0;
		width: 60px;
		height: 36px;
		padding: 3px;
		border: 2px solid var(--text-2);
		border-radius: 18px;
		background: var(--bg);
		display: flex;
		justify-content: flex-start;
		cursor: pointer;
	}
	.switch span {
		width: 26px;
		height: 26px;
		border-radius: 13px;
		background: var(--text-2);
	}
	.switch[aria-checked='true'] {
		border-color: var(--primary);
		background: var(--primary);
		justify-content: flex-end;
	}
	.switch[aria-checked='true'] span {
		background: var(--on-primary);
	}
</style>
