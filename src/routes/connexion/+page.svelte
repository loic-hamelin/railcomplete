<script lang="ts">
	// E2 — Connexion au compte OpenStreetMap. Cette page reçoit aussi le retour d'OpenStreetMap.
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Logo from '#lib/Logo.svelte';
	import { account, configured, finishLogin, login, signedIn } from '#lib/auth.svelte.js';
	import { srv } from '#lib/osmserver.svelte.js';
	import { onMount } from 'svelte';

	let status = $state<'idle' | 'finishing' | 'done' | 'error'>('idle');
	let error = $state('');
	let mounted = $state(false);

	onMount(async () => {
		mounted = true;
		const q = page.url.searchParams;
		if (q.get('error')) {
			status = 'error';
			error =
				q.get('error') === 'access_denied' ? 'Vous avez refusé l’accès.' : 'La connexion a échoué.';
			return;
		}
		if (q.get('code')) {
			status = 'finishing';
			try {
				const back = await finishLogin();
				status = 'done';
				// Retour à la page de départ (chemin interne uniquement).
				location.replace(
					back.startsWith('/') && !back.startsWith('//') && !back.startsWith('/connexion')
						? back
						: resolve('/')
				);
			} catch (e) {
				status = 'error';
				error = (e as Error).message;
			}
		}
	});
</script>

<svelte:head><title>Connexion — stationcomplete</title></svelte:head>

<main class="screen">
	<header><Logo /></header>
	<section class="body">
		<h1>Vos contributions vont dans OpenStreetMap</h1>
		{#if status === 'finishing'}
			<p role="status">Connexion en cours…</p>
		{:else}
			<ul>
				<li>Publiées sous votre pseudo, sous licence libre ODbL.</li>
				<li>Rien n’est envoyé sans que vous l’ayez relu.</li>
				<li>Aucun mot de passe n’est demandé ni gardé par stationcomplete.</li>
			</ul>
			<p class="server">Serveur : <strong>{srv().label}</strong></p>
			{#if error}<p class="err" role="alert">{error}</p>{/if}
			{#if mounted && signedIn() && account.user}
				<p class="ok">Connecté en tant que <strong>{account.user.name}</strong>.</p>
				<a class="btn" href={resolve('/contributions')}>Mes contributions</a>
			{:else if mounted && !configured()}
				<p class="err">
					La connexion à ce serveur n’est pas encore configurée. Choisissez le serveur de test dans
					les réglages.
				</p>
				<a class="btn btn-secondary" href={resolve('/reglages')}>Réglages</a>
			{:else}
				<button class="btn" type="button" onclick={() => login(resolve('/contributions'))}>
					Se connecter avec OpenStreetMap
				</button>
				<a class="btn btn-secondary" href={`${srv().web}/user/new`} rel="external"
					>Créer un compte OpenStreetMap</a
				>
			{/if}
		{/if}
	</section>
</main>

<style>
	.screen {
		min-height: 100dvh;
		max-width: 520px;
		margin: 0 auto;
		padding: 16px 24px 32px;
		display: flex;
		flex-direction: column;
	}
	.body {
		flex-grow: 1;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 14px;
	}
	h1 {
		margin: 0;
		font-size: 1.75rem;
		line-height: 1.2;
	}
	ul {
		margin: 0;
		padding: 16px 16px 16px 2.2em;
		border-radius: var(--radius);
		background: var(--surface);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	p {
		margin: 0;
	}
	.server {
		color: var(--text-2);
	}
	.err {
		color: var(--danger);
		font-weight: 600;
	}
	.ok {
		color: var(--ok);
	}
</style>
