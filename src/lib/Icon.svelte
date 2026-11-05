<script lang="ts">
	// Icônes au trait (SVG en ligne), couleur héritée du texte.
	type Name =
		| 'quai'
		| 'voie'
		| 'pancarte'
		| 'alerte'
		| 'verif'
		| 'back'
		| 'chevron'
		| 'search'
		| 'locate'
		| 'home'
		| 'list'
		| 'gear'
		| 'lock'
		| 'refresh'
		| 'map'
		| 'download';
	let { name, size = 24, label }: { name: Name; size?: number; label?: string } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="2.2"
	stroke-linecap="round"
	stroke-linejoin="round"
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
>
	{#if name === 'quai'}
		<rect x="3" y="7" width="18" height="8" rx="1" /><path d="M3 18.5h18" stroke-width="3" />
	{:else if name === 'voie'}
		<path d="M8 3v18M16 3v18M5 7h14M5 12h14M5 17h14" />
	{:else if name === 'pancarte'}
		<rect x="6" y="3" width="12" height="9" rx="1" /><path d="M12 12v9" />
	{:else if name === 'alerte'}
		<circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5v.5" />
	{:else if name === 'verif'}
		<path d="M4 12l5 5L20 6" />
	{:else if name === 'back'}
		<path d="M15 5l-7 7 7 7" />
	{:else if name === 'chevron'}
		<path d="M9 5l7 7-7 7" />
	{:else if name === 'search'}
		<circle cx="11" cy="11" r="7" /><path d="M16.5 16.5L21 21" />
	{:else if name === 'locate'}
		<circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
	{:else if name === 'home'}
		<path d="M3 10l9-6 9 6v10H3z" /><path d="M9 20v-6h6v6" />
	{:else if name === 'list'}
		<path d="M4 6h16M4 12h16M4 18h10" />
	{:else if name === 'gear'}
		<circle cx="12" cy="12" r="3" /><path
			d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"
		/>
	{:else if name === 'lock'}
		<rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" />
	{:else if name === 'refresh'}
		<path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" />
	{:else if name === 'map'}
		<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" />
	{:else if name === 'download'}
		<path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
	{/if}
</svg>
