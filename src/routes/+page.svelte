<script lang="ts">
	import { resolve } from '$app/paths';
	import Logo from '#lib/Logo.svelte';
	import { readPref, writePref } from '#lib/cache.js';
	import { t } from '#lib/i18n/t.js';
	import { onMount } from 'svelte';

	// E1 — Bienvenue et sécurité (ux-spec.md § 3). La carte « Sécurité » ne peut pas être passée.
	const STEPS = 3;
	const SAFETY = 1;
	let step = $state(0);
	let done = $state(false);

	function next() {
		if (step < STEPS - 1) step += 1;
		else {
			done = true;
			writePref('intro', true);
		}
	}
	// Présentation déjà vue : on propose directement de choisir une gare.
	onMount(() => {
		if (readPref('intro', false)) done = true;
	});
	function skip() {
		// « Passer » mène toujours à la carte sécurité si elle n'a pas été vue.
		step = step < SAFETY ? SAFETY : STEPS - 1;
	}
</script>

<svelte:head>
	<title>{t('home.title')}</title>
</svelte:head>

<main class="screen">
	<header class="top">
		<Logo />
		{#if !done && step < STEPS - 1 && step !== SAFETY}
			<button class="link" type="button" onclick={skip}>{t('home.skip')}</button>
		{:else if !done}
			<span class="counter">{t('home.step', { step: step + 1, total: STEPS })}</span>
		{/if}
	</header>

	{#if !done}
		<section class="card" aria-live="polite">
			{#if step === 0}
				<!-- Aperçu de la carte au style de l'appli : traits clairs à liseré, étiquettes compactes. -->
				<div class="illu photo" aria-hidden="true">
					<svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice">
						<rect width="320" height="180" fill="#8C877C" />
						<rect y="58" width="320" height="64" fill="#857C6F" />
						<rect x="190" y="18" width="96" height="30" fill="#A29C90" />
						<rect x="20" y="128" width="120" height="34" fill="#9C968A" />
						<g fill="none" stroke-linecap="round">
							<path
								d="M0 64h320M0 84h320M0 112h320"
								stroke="#14110E"
								stroke-opacity=".7"
								stroke-width="3.6"
							/>
							<path d="M0 64h320M0 84h320M0 112h320" stroke="#E4E0FF" stroke-width="2" />
							<path d="M0 112h320" stroke="#857C6F" stroke-width="2" stroke-dasharray="5 3" />
							<rect
								x="30"
								y="90"
								width="250"
								height="16"
								fill="#B5EDE4"
								fill-opacity=".16"
								stroke="#14110E"
								stroke-opacity=".7"
								stroke-width="3.2"
							/>
							<rect x="30" y="90" width="250" height="16" stroke="#B5EDE4" stroke-width="1.5" />
						</g>
						<g font-family="inherit" font-size="11" font-weight="600" text-anchor="middle">
							<rect
								x="141"
								y="89"
								width="22"
								height="18"
								rx="2"
								fill="#1F1B17"
								fill-opacity=".86"
							/>
							<text x="152" y="102" fill="#fff">A</text>
							<rect x="60" y="75" width="22" height="18" rx="9" fill="#1F1B17" fill-opacity=".86" />
							<text x="71" y="88" fill="#fff">1</text>
							<rect
								x="226"
								y="103"
								width="22"
								height="18"
								rx="9"
								fill="#1F1B17"
								fill-opacity=".86"
							/>
							<text x="237" y="116" fill="#FFE08A">?</text>
							<rect x="236" y="38" width="44" height="16" rx="1" fill="#fff" stroke="#14110E" />
							<text x="258" y="50" fill="#1F1B17" font-size="10">TGV 2</text>
							<path d="M258 54v10" stroke="#14110E" stroke-width="1.5" />
						</g>
					</svg>
				</div>
				<h1>{t('home.intro.title')}</h1>
				<p>{t('home.intro.text')}</p>
			{:else if step === 1}
				<div class="illu" aria-hidden="true">
					<svg width="260" height="170" viewBox="0 0 260 170">
						<rect width="260" height="62" fill="#C9CED6" />
						<path d="M0 22h260M0 42h260" stroke="#6B7280" stroke-width="4" />
						<rect y="62" width="260" height="108" fill="#E6E9EE" />
						<rect y="80" width="260" height="9" fill="#FFD400" />
						<circle cx="130" cy="114" r="10" fill="#1844EF" />
						<path
							d="M130 125v24M130 134l-12 9M130 134l12 9M130 149l-9 16M130 149l9 16"
							stroke="#1844EF"
							stroke-width="6"
							stroke-linecap="round"
						/>
					</svg>
				</div>
				<p class="kicker">{t('home.safety.kicker')}</p>
				<h1>{t('home.safety.title')}</h1>
				<p>{t('home.safety.text')}</p>
			{:else}
				<div class="illu" aria-hidden="true">
					<svg width="260" height="170" viewBox="0 0 260 170">
						<circle cx="130" cy="85" r="62" fill="none" stroke="currentColor" stroke-width="3" />
						<path
							d="M76 70h108M76 100h108M130 23c-24 22-24 102 0 124M130 23c24 22 24 102 0 124"
							stroke="currentColor"
							stroke-width="2"
							fill="none"
						/>
					</svg>
				</div>
				<h1>{t('home.osm.title')}</h1>
				<p>{t('home.osm.text')}</p>
			{/if}
		</section>

		<footer class="actions">
			<div class="dots" role="img" aria-label={t('home.step', { step: step + 1, total: STEPS })}>
				{#each { length: STEPS }, i (i)}
					<span class:active={i === step}></span>
				{/each}
			</div>
			<button class="btn" type="button" onclick={next}>
				{step === SAFETY
					? t('home.understood')
					: step === STEPS - 1
						? t('home.start')
						: t('home.next')}
			</button>
		</footer>
	{:else}
		<section class="card">
			<h1>{t('home.explore.title')}</h1>
			<p>{t('home.explore.text')}</p>
		</section>
		<footer class="actions">
			<a class="btn" href={resolve('/gares')}>{t('home.chooseStation')}</a>
			<a class="btn btn-secondary" href={resolve('/a-propos')}>{t('home.more')}</a>
			<button class="link" type="button" onclick={() => ((done = false), (step = 0))}>
				{t('home.replay')}
			</button>
		</footer>
	{/if}
</main>

<style>
	.screen {
		min-height: 100dvh;
		max-width: 480px;
		margin: 0 auto;
		padding: 8px 24px 24px;
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
		font-size: 0.875rem;
	}
	.card {
		flex-grow: 1;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 12px;
	}
	.illu {
		display: flex;
		justify-content: center;
		padding: 20px 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
		color: var(--text-2);
	}
	.illu svg {
		max-width: 100%;
		height: auto;
	}
	.illu.photo {
		padding: 0;
		overflow: hidden;
		aspect-ratio: 16 / 9;
	}
	.illu.photo svg {
		width: 100%;
		height: 100%;
	}
	h1 {
		margin: 8px 0 0;
		font-size: 1.625rem;
		line-height: 1.23;
	}
	p {
		margin: 0;
		font-size: 1.0625rem;
		line-height: 1.55;
		color: var(--text-2);
	}
	.kicker {
		margin-top: 8px;
		color: var(--danger);
		font-weight: 600;
		font-size: 0.8125rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.actions {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding-top: 24px;
	}
	.dots {
		display: flex;
		gap: 6px;
	}
	.dots span {
		width: 6px;
		height: 6px;
		border-radius: 3px;
		background: var(--border-strong);
	}
	.dots span.active {
		width: 20px;
		background: var(--text);
	}
	.link {
		min-height: 44px;
		padding: 0 4px;
		border: 0;
		background: transparent;
		color: var(--primary);
		font: 600 0.9375rem var(--font);
		text-decoration: underline;
		text-underline-offset: 2px;
		cursor: pointer;
	}
</style>
