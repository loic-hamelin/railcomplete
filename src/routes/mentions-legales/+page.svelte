<script lang="ts">
	import { resolve } from '$app/paths';
	import Logo from '#lib/Logo.svelte';
	import { CONTACT_EMAIL, REPO_URL } from '#lib/config.js';
	import { photoCredits } from '#lib/core/countries.js';
</script>

<svelte:head>
	<title>Mentions légales — stationcomplete</title>
</svelte:head>

<main class="page">
	<header><Logo /></header>

	<h1>Mentions légales</h1>

	<section>
		<h2>Éditeur</h2>
		<p>
			stationcomplete.org est un projet bénévole et non commercial, édité par Loïc Hamelin,
			particulier, également directeur de la publication.<br />
			Contact : <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
		</p>
	</section>

	<section>
		<h2>Hébergement</h2>
		<p>
			GitHub Pages — GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107,
			États-Unis.
		</p>
	</section>

	<section>
		<h2>Contenus et licences</h2>
		<ul>
			<li>
				Données cartographiques : © les contributeurs OpenStreetMap, sous licence
				<a href="https://opendatacommons.org/licenses/odbl/" rel="external">ODbL</a>.
			</li>
			{#each photoCredits() as c (c.product)}
				<li>
					Photographies aériennes : {c.product}, sous
					<a href={c.licenceUrl} rel="external">{c.licence}</a>.
				</li>
			{/each}
			<li>
				Code de l’appli : licence GPL-3.0 ou ultérieure,
				<a href={REPO_URL} rel="external">code source sur GitHub</a>.
			</li>
		</ul>
		<p>
			stationcomplete est un projet personnel : ce n’est pas un service de la SNCF ni de la
			Fondation OpenStreetMap.
		</p>
	</section>

	<p>
		<a href={resolve('/donnees-personnelles')}>Données personnelles</a> ·
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
	ul {
		padding-left: 1.2em;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
</style>
