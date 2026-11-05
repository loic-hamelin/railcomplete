<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<a href={resolve('/')} class="logo" aria-label="railcomplete, accueil">
	<svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
		<path
			d="M9 3v22M19 3v22M6 8h16M6 14h16M6 20h16"
			stroke="currentColor"
			stroke-width="2.4"
			stroke-linecap="round"
		/>
	</svg>
	railcomplete
</a>

<style>
	.logo {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 48px;
		font-weight: 700;
		font-size: 1.125rem;
		color: var(--primary);
		text-decoration: none;
	}
</style>
