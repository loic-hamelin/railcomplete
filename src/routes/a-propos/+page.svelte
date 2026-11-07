<script lang="ts">
	import { resolve } from '$app/paths';
	import Logo from '#lib/Logo.svelte';
	import { CONTACT_EMAIL, REPO_URL } from '#lib/config.js';
	import { photoCredits } from '#lib/core/countries.js';
	import Rich from '#lib/i18n/Rich.svelte';
	import { t } from '#lib/i18n/t.js';
</script>

<svelte:head>
	<title>{t('about.title')}</title>
</svelte:head>

<main class="page">
	<header><Logo /></header>

	<h1>{t('about.heading')}</h1>

	<section>
		<h2>{t('about.project.title')}</h2>
		<p>
			<Rich
				text={t('about.project.text')}
				links={{
					osm: { href: 'https://www.openstreetmap.org/' },
					osrd: { href: 'https://osrd.fr/' }
				}}
			/>
		</p>
	</section>

	<section>
		<h2>{t('about.safety.title')}</h2>
		<p>{t('about.safety.text')}</p>
	</section>

	<section>
		<h2>{t('about.data.title')}</h2>
		<ul>
			<li>
				<Rich
					text={t('about.data.osm')}
					links={{ odbl: { href: 'https://opendatacommons.org/licenses/odbl/' } }}
				/>
			</li>
			{#each photoCredits() as c (c.product)}
				<li>{t('about.data.photos', { product: c.product, licence: c.licence })}</li>
			{/each}
			<li>
				<Rich text={t('about.data.code')} links={{ code: { href: REPO_URL, rel: 'external' } }} />
			</li>
		</ul>
	</section>

	<section>
		<h2>{t('about.privacy.title')}</h2>
		<p>
			{t('about.privacy.text')}
			<a href={resolve('/donnees-personnelles')}>{t('legal.dataLink')}</a> ·
			<a href={resolve('/mentions-legales')}>{t('legal.noticeLink')}</a>
		</p>
	</section>

	<section>
		<h2>{t('about.contact.title')}</h2>
		<p>
			<Rich
				text={t('about.contact.text', { email: CONTACT_EMAIL })}
				links={{
					mail: { href: `mailto:${CONTACT_EMAIL}` },
					issues: { href: `${REPO_URL}/issues`, rel: 'external' }
				}}
			/>
		</p>
	</section>

	<p><a href={resolve('/')}>{t('about.back')}</a></p>
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
