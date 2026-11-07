<script lang="ts">
	// Message traduit avec des liens ou une mise en valeur : « … dans <osm>OpenStreetMap</osm> ».
	// Chaque balise du message est rendue par l'élément décrit dans `links` (lien) ou en <strong>
	// (balise « b ») ; le texte n'est jamais interprété comme du HTML.
	import { richParts } from './message.js';

	interface Link {
		href: string;
		rel?: string;
	}
	let { text, links = {} }: { text: string; links?: Record<string, Link> } = $props();
	const parts = $derived(richParts(text));
</script>

<!-- Liens fournis par la page : déjà passés par resolve() (internes) ou externes (rel). -->
<!-- eslint-disable svelte/no-navigation-without-resolve -->
{#each parts as p, i (i)}{#if p.tag && links[p.tag]}<a
			href={links[p.tag].href}
			rel={links[p.tag].rel}>{p.text}</a
		>{:else if p.tag === 'b'}<strong>{p.text}</strong>{:else}{p.text}{/if}{/each}
<!-- eslint-enable svelte/no-navigation-without-resolve -->
