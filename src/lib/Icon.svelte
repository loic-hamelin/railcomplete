<script lang="ts">
	// Icônes au trait fin (refonte v1), couleur héritée du texte. Tracés : icons.ts.
	import { ICONS, type IconName } from './icons.js';
	let { name, size = 24, label }: { name: IconName; size?: number; label?: string } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.5"
	stroke-linecap="round"
	stroke-linejoin="round"
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
	focusable="false"
>
	<!-- Tracés constants du jeu d'icônes (aucune donnée externe) -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html ICONS[name]}
</svg>
