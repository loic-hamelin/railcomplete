<script lang="ts">
	// Jetons, police (Atkinson Hyperlegible Next 400/600, auto-hébergée) et composants partagés.
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import font400 from '@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-400-normal.woff2?url';
	import NetStatus from '#lib/NetStatus.svelte';
	import { loadTheme } from '#lib/theme.svelte.js';
	import type { LayoutProps } from './$types';
	import { onMount } from 'svelte';

	let { children }: LayoutProps = $props();

	// Quand une nouvelle version de l'appli prend le relais, on recharge une fois la page
	// pour l'afficher (sauf à la toute première installation).
	onMount(() => {
		loadTheme();
		const sw = navigator.serviceWorker;
		if (!sw?.controller) return;
		let reloaded = false;
		sw.addEventListener('controllerchange', () => {
			if (reloaded) return;
			reloaded = true;
			location.reload();
		});
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preload" href={font400} as="font" type="font/woff2" crossorigin="anonymous" />
	<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
	<meta name="theme-color" content="#161412" media="(prefers-color-scheme: dark)" />
	<link rel="manifest" href="/manifest.webmanifest" />
	<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
	<meta name="apple-mobile-web-app-title" content="stationcomplete" />
	<meta name="mobile-web-app-capable" content="yes" />
	<meta
		name="description"
		content="stationcomplete : complétez les données ferroviaires des gares dans OpenStreetMap."
	/>
</svelte:head>

{@render children()}
<NetStatus />
