<script lang="ts">
	import { resolve } from '$app/paths';
	import Logo from '#lib/Logo.svelte';
	import { wipeAll } from '#lib/cache.js';
	import { CONTACT_EMAIL } from '#lib/config.js';
	import { photoCredits } from '#lib/core/countries.js';
	import { loadEdits, pending } from '#lib/edits.svelte.js';
	import { onMount } from 'svelte';

	let confirming = $state(false);
	let done = $state(false);
	onMount(() => loadEdits());

	async function wipe() {
		await wipeAll();
		pending.list = [];
		confirming = false;
		done = true;
	}
</script>

<svelte:head>
	<title>Données personnelles — stationcomplete</title>
</svelte:head>

<main class="page">
	<header><Logo /></header>

	<h1>Données personnelles</h1>
	<p class="lead">
		stationcomplete n’a pas de serveur à lui : il ne reçoit, ne stocke et ne vend aucune donnée vous
		concernant. Cette page explique ce qui se passe sur votre téléphone et auprès des services que
		l’appli contacte.
	</p>

	<section>
		<h2>Sur votre téléphone</h2>
		<ul>
			<li>
				Les gares consultées, vos saisies pas encore envoyées, vos réglages et les photos aériennes
				téléchargées restent dans la mémoire du navigateur de votre téléphone.
			</li>
			<li>
				Votre position sert seulement à vérifier, sur le téléphone, que vous êtes bien en gare. Elle
				n’est envoyée à personne.
			</li>
			<li>
				Si vous vous connectez, la clé de connexion à OpenStreetMap et votre pseudo sont gardés sur
				le téléphone. Votre mot de passe n’est jamais vu par stationcomplete : vous le saisissez sur
				le site d’OpenStreetMap.
			</li>
			<li>Aucun cookie, aucune publicité, aucune mesure d’audience.</li>
		</ul>
	</section>

	<section>
		<h2>Ce que vous publiez sur OpenStreetMap</h2>
		<p>
			Quand vous envoyez vos saisies, elles sont publiées sur OpenStreetMap sous votre pseudo, avec
			la date et la description de l’envoi. Comme toute contribution à OpenStreetMap, elles sont
			publiques et restent dans l’historique de la carte. Ces données sont gérées par la Fondation
			OpenStreetMap, selon sa
			<a href="https://osmfoundation.org/wiki/Privacy_Policy" rel="external"
				>politique de confidentialité</a
			>.
		</p>
	</section>

	<section>
		<h2>Services contactés par votre téléphone</h2>
		<p>Comme pour tout site web, ces services voient l’adresse IP de votre connexion :</p>
		<ul>
			<li>
				<strong>GitHub Pages</strong> (GitHub, Inc., États-Unis) : hébergement de l’appli.
				<a
					href="https://docs.github.com/fr/site-policy/privacy-policies/github-general-privacy-statement"
					rel="external">Déclaration de confidentialité de GitHub</a
				>.
			</li>
			<li>
				<strong>OpenStreetMap</strong> (Fondation OpenStreetMap, Royaume-Uni) : lecture des données des
				gares, connexion et envoi des contributions.
			</li>
			{#each photoCredits() as c (c.operator)}
				<li>
					<strong>{c.operator}</strong> ({c.operatorSeat}) : photos aériennes.
				</li>
			{/each}
		</ul>
	</section>

	<section>
		<h2>Vos droits</h2>
		<p>
			Vous pouvez effacer à tout moment tout ce que stationcomplete garde sur ce téléphone. Pour vos
			contributions publiées et votre compte OpenStreetMap, adressez-vous à la Fondation
			OpenStreetMap. Pour toute question : <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
			Vous pouvez aussi saisir la <a href="https://www.cnil.fr/fr/plaintes" rel="external">CNIL</a>.
		</p>

		<div class="wipe">
			{#if done}
				<p role="status">
					<strong>C’est fait :</strong> plus rien de stationcomplete sur ce téléphone.
				</p>
			{:else if confirming}
				<p role="alert">
					{#if pending.list.length}
						<strong
							>{pending.list.length} saisie{pending.list.length > 1 ? 's' : ''} pas encore envoyée{pending
								.list.length > 1
								? 's'
								: ''} sera{pending.list.length > 1 ? 'ont' : ''} perdue{pending.list.length > 1
								? 's'
								: ''}.</strong
						>
					{/if}
					Tout effacer de ce téléphone ? Vos contributions déjà publiées ne sont pas touchées.
				</p>
				<div class="two">
					<button class="btn btn-secondary" type="button" onclick={() => (confirming = false)}
						>Annuler</button
					>
					<button class="btn danger" type="button" onclick={wipe}>Tout effacer</button>
				</div>
			{:else}
				<button class="btn btn-secondary" type="button" onclick={() => (confirming = true)}>
					Effacer mes données de ce téléphone
				</button>
			{/if}
		</div>
	</section>

	<p>
		<a href={resolve('/mentions-legales')}>Mentions légales</a> ·
		<a href={resolve('/a-propos')}>À propos</a>
	</p>
</main>

<style>
	.page {
		max-width: 680px;
		margin: 0 auto;
		padding: 16px 24px 48px;
	}
	h1 {
		font-size: 1.75rem;
		line-height: 1.2;
		margin: 16px 0 8px;
	}
	h2 {
		font-size: 1.25rem;
		margin: 28px 0 8px;
	}
	p,
	li {
		font-size: 1.0625rem;
	}
	.lead {
		color: var(--text-2);
	}
	ul {
		padding-left: 1.2em;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.wipe {
		margin-top: 16px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.two {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.danger {
		background: var(--danger);
		border-color: var(--danger);
		color: var(--on-danger);
	}
</style>
