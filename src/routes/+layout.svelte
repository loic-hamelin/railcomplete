<script lang="ts">
	import '@fontsource/atkinson-hyperlegible/latin-400.css';
	import '@fontsource/atkinson-hyperlegible/latin-700.css';
	import '@fontsource/atkinson-hyperlegible/latin-ext-400.css';
	import '@fontsource/atkinson-hyperlegible/latin-ext-700.css';
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="theme-color" content="#0B4F9C" />
	<link rel="manifest" href="/manifest.webmanifest" />
	<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
	<meta name="apple-mobile-web-app-title" content="railcomplete" />
	<meta name="mobile-web-app-capable" content="yes" />
	<meta
		name="description"
		content="railcomplete : complétez les données ferroviaires des gares dans OpenStreetMap."
	/>
</svelte:head>

{@render children()}
