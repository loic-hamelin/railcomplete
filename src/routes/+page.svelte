<script lang="ts">
	import { resolve } from '$app/paths';
	import Logo from '#lib/Logo.svelte';

	// E1 — Bienvenue et sécurité (ux-spec.md § 3). La carte « Sécurité » ne peut pas être passée.
	const STEPS = 3;
	const SAFETY = 1;
	let step = $state(0);
	let done = $state(false);

	function next() {
		if (step < STEPS - 1) step += 1;
		else done = true;
	}
	function skip() {
		// « Passer » mène toujours à la carte sécurité si elle n'a pas été vue.
		step = step < SAFETY ? SAFETY : STEPS - 1;
	}
</script>

<svelte:head>
	<title>railcomplete — complétez les gares dans OpenStreetMap</title>
</svelte:head>

<main class="screen">
	<header class="top">
		<Logo />
		{#if !done && step < STEPS - 1 && step !== SAFETY}
			<button class="link" type="button" onclick={skip}>Passer</button>
		{:else if !done}
			<span class="counter">Étape {step + 1} sur {STEPS}</span>
		{/if}
	</header>

	{#if !done}
		<section class="card" aria-live="polite">
			{#if step === 0}
				<div class="illu" aria-hidden="true">
					<svg width="260" height="170" viewBox="0 0 260 170">
						<rect width="260" height="170" rx="12" fill="#7D786E" />
						<path d="M0 50h260M0 120h260" stroke="#fff" stroke-width="8" />
						<path d="M0 50h260M0 120h260" stroke="#6A3FB5" stroke-width="4" />
						<rect
							x="20"
							y="66"
							width="220"
							height="38"
							fill="#CFCABD"
							stroke="#00707A"
							stroke-width="3"
						/>
						<rect x="112" y="72" width="28" height="26" rx="5" fill="#00707A" />
						<text x="126" y="91" text-anchor="middle" fill="#fff" font-size="16" font-weight="700"
							>A</text
						>
						<circle cx="40" cy="50" r="13" fill="#6A3FB5" stroke="#fff" stroke-width="3" />
						<text x="40" y="55" text-anchor="middle" fill="#fff" font-size="13" font-weight="700"
							>1</text
						>
						<circle cx="40" cy="120" r="13" fill="#FFD400" stroke="#1A1D21" stroke-width="3" />
						<text
							x="40"
							y="125"
							text-anchor="middle"
							fill="#1A1D21"
							font-size="14"
							font-weight="700">?</text
						>
						<rect
							x="190"
							y="30"
							width="46"
							height="22"
							rx="3"
							fill="#fff"
							stroke="#A34A00"
							stroke-width="3"
						/>
						<text
							x="213"
							y="46"
							text-anchor="middle"
							fill="#1A1D21"
							font-size="12"
							font-weight="700">TGV 2</text
						>
					</svg>
				</div>
				<h1>Complétez les données de votre gare</h1>
				<p>
					Numéros de quais, numéros de voies, pancartes d'arrêt : en quelques minutes sur le quai,
					vous rendez ces informations utiles à tous, des applis de voyage aux outils ferroviaires
					comme OSRD.
				</p>
			{:else if step === 1}
				<div class="illu" aria-hidden="true">
					<svg width="260" height="170" viewBox="0 0 260 170">
						<rect width="260" height="62" fill="#C9CED6" />
						<path d="M0 22h260M0 42h260" stroke="#6B7280" stroke-width="4" />
						<rect y="62" width="260" height="108" fill="#E6E9EE" />
						<rect y="80" width="260" height="9" fill="#FFD400" />
						<circle cx="130" cy="114" r="10" fill="#0B4F9C" />
						<path
							d="M130 125v24M130 134l-12 9M130 134l12 9M130 149l-9 16M130 149l9 16"
							stroke="#0B4F9C"
							stroke-width="6"
							stroke-linecap="round"
						/>
					</svg>
				</div>
				<p class="kicker">Sécurité</p>
				<h1>Restez derrière la ligne de sécurité.</h1>
				<p>
					Tout se fait depuis le quai, ou depuis chez vous grâce à la photo aérienne. Ne descendez
					jamais sur les voies et ne dépassez pas le bout du quai.
				</p>
			{:else}
				<div class="illu" aria-hidden="true">
					<svg width="260" height="170" viewBox="0 0 260 170">
						<circle cx="130" cy="85" r="62" fill="none" stroke="#0B4F9C" stroke-width="6" />
						<path
							d="M76 70h108M76 100h108M130 23c-24 22-24 102 0 124M130 23c24 22 24 102 0 124"
							stroke="#0B4F9C"
							stroke-width="4"
							fill="none"
						/>
					</svg>
				</div>
				<h1>Vos contributions vont dans OpenStreetMap</h1>
				<p>
					La carte libre et collective. Elles sont publiées sous votre pseudo OSM, sous licence
					ODbL, et rien n'est envoyé sans que vous l'ayez relu.
				</p>
			{/if}
		</section>

		<footer class="actions">
			<div class="dots" role="img" aria-label="Étape {step + 1} sur {STEPS}">
				{#each { length: STEPS }, i (i)}
					<span class:active={i === step}></span>
				{/each}
			</div>
			<button class="btn" type="button" onclick={next}>
				{step === SAFETY ? "J'ai compris" : step === STEPS - 1 ? 'Commencer' : 'Suivant'}
			</button>
		</footer>
	{:else}
		<section class="card">
			<h1>L'application arrive bientôt</h1>
			<p>
				railcomplete est en cours de développement. Le code est libre et les premières gares
				pourront être complétées bientôt.
			</p>
		</section>
		<footer class="actions">
			<a class="btn btn-secondary" href={resolve('/a-propos')}>En savoir plus sur le projet</a>
			<button class="link" type="button" onclick={() => ((done = false), (step = 0))}>
				Revoir la présentation
			</button>
		</footer>
	{/if}
</main>

<style>
	.screen {
		min-height: 100dvh;
		max-width: 480px;
		margin: 0 auto;
		padding: 16px 24px 32px;
		display: flex;
		flex-direction: column;
	}
	.top {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.counter {
		color: var(--text-2);
		font-size: 0.9375rem;
	}
	.card {
		flex-grow: 1;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 14px;
	}
	.illu {
		display: flex;
		justify-content: center;
		padding: 24px 0;
		border-radius: 20px;
		background: var(--surface);
	}
	.illu svg {
		max-width: 100%;
		height: auto;
	}
	h1 {
		margin: 8px 0 0;
		font-size: 1.75rem;
		line-height: 1.2;
	}
	p {
		margin: 0;
		font-size: 1.125rem;
		color: var(--text-2);
	}
	.kicker {
		margin-top: 8px;
		color: var(--danger);
		font-weight: 700;
		font-size: 0.9375rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.actions {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		padding-top: 24px;
	}
	.dots {
		display: flex;
		gap: 10px;
	}
	.dots span {
		width: 10px;
		height: 10px;
		border-radius: 5px;
		border: 2px solid var(--text-2);
	}
	.dots span.active {
		width: 28px;
		border-color: var(--primary);
		background: var(--primary);
	}
	.link {
		min-height: 48px;
		border: 0;
		background: transparent;
		color: var(--primary);
		font: 700 1.0625rem var(--font);
		text-decoration: underline;
		cursor: pointer;
	}
</style>
