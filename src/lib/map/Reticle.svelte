<script lang="ts">
	// Croix de visée fixe au centre de la carte (E6, E11) : branches fines blanches sur liseré
	// sombre, centre libre de 16 px pour viser au mètre ; jaune quand le point est accroché.
	let { snapped = false }: { snapped?: boolean } = $props();
</script>

<svg
	class="reticle"
	class:snapped
	width="64"
	height="64"
	viewBox="0 0 64 64"
	fill="none"
	aria-hidden="true"
>
	<path
		d="M32 4v20M32 40v20M4 32h20M40 32h20"
		stroke="#14110E"
		stroke-opacity=".75"
		stroke-width="3.5"
	/>
	<path class="c" d="M32 4.75v18.5M32 40.75v18.5M4.75 32h18.5M40.75 32h18.5" stroke-width="1.5" />
	<circle class="d" cx="32" cy="32" r="1.75" stroke="#14110E" stroke-width="1" />
</svg>

<style>
	.reticle {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		pointer-events: none;
		--cross: #ffffff;
	}
	.reticle.snapped {
		--cross: #fff700;
	}
	.c {
		stroke: var(--cross);
	}
	.d {
		fill: var(--cross);
	}
</style>
