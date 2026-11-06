<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<a href={resolve('/')} class="logo" aria-label="stationcomplete, accueil">
	<svg
		width="24"
		height="24"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.5"
		stroke-linecap="round"
		aria-hidden="true"
	>
		<rect x="3" y="3" width="18" height="18" rx="4" />
		<path d="M3 9.5h18M3 14.5h18M8 7v10M12 7v10M16 7v10" />
	</svg>
	stationcomplete
</a>

<style>
	.logo {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 48px;
		font-weight: 600;
		font-size: 1.0625rem;
		color: var(--text);
		text-decoration: none;
	}
</style>
