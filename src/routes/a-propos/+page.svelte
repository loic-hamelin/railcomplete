<script lang="ts">
	import { resolve } from '$app/paths';
	import Logo from '#lib/Logo.svelte';
	import { CONTACT_EMAIL, REPO_URL } from '#lib/config.js';
	import { photoCredits } from '#lib/core/countries.js';
</script>

<svelte:head>
	<title>À propos — stationcomplete</title>
</svelte:head>

<main class="page">
	<header><Logo /></header>

	<h1>À propos de stationcomplete</h1>

	<section>
		<h2>Le projet</h2>
		<p>
			stationcomplete aide chacun à compléter les données des gares françaises dans
			<a href="https://www.openstreetmap.org/">OpenStreetMap</a> : numéros des quais, numéros des
			voies et pancartes d'arrêt des trains. Ces données libres servent à tous, notamment aux outils
			de conception ferroviaire comme <a href="https://osrd.fr/">OSRD</a>.
		</p>
	</section>

	<section>
		<h2>Sécurité</h2>
		<p>
			Restez toujours derrière la ligne de sécurité. Tout se fait depuis le quai ou à distance, sur
			la photo aérienne. Ne descendez jamais sur les voies.
		</p>
	</section>

	<section>
		<h2>Données et licences</h2>
		<ul>
			<li>
				Les contributions sont publiées dans OpenStreetMap sous votre pseudo, sous licence
				<a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. © les contributeurs
				OpenStreetMap.
			</li>
			{#each photoCredits() as c (c.product)}
				<li>Photographies aériennes : {c.product}, sous {c.licence}.</li>
			{/each}
			<li>
				Le code de stationcomplete est libre, sous licence GPL-3.0 ou ultérieure :
				<a href={REPO_URL} rel="external">voir le code source</a>.
			</li>
		</ul>
	</section>

	<section>
		<h2>Vie privée</h2>
		<p>
			Ce site ne dépose aucun cookie et n'utilise aucun outil de mesure d'audience. Vos saisies
			restent sur votre téléphone jusqu'à leur envoi dans OpenStreetMap.
			<a href={resolve('/donnees-personnelles')}>Données personnelles</a> ·
			<a href={resolve('/mentions-legales')}>Mentions légales</a>
		</p>
	</section>

	<section>
		<h2>Contact</h2>
		<p>
			Une erreur, une idée, une gare qui pose problème ? Écrivez à
			<a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> ou ouvrez un ticket sur
			<a href={`${REPO_URL}/issues`} rel="external">GitHub</a>.
		</p>
	</section>

	<p><a href={resolve('/')}>← Retour à l'accueil</a></p>
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
	ul {
		padding-left: 1.2em;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
</style>
