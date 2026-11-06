<script lang="ts">
	import '@fontsource/atkinson-hyperlegible/latin-400.css';
	import '@fontsource/atkinson-hyperlegible/latin-700.css';
	import '@fontsource/atkinson-hyperlegible/latin-ext-400.css';
	import '@fontsource/atkinson-hyperlegible/latin-ext-700.css';
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import NetStatus from '#lib/NetStatus.svelte';
	import type { LayoutProps } from './$types';
	import { onMount } from 'svelte';

	let { children }: LayoutProps = $props();

	// Quand une nouvelle version de l'appli prend le relais, on recharge une fois la page
	// pour l'afficher (sauf à la toute première installation).
	onMount(() => {
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
	<meta name="theme-color" content="#0B4F9C" />
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
