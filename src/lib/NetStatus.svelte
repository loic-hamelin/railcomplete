<script lang="ts">
	// Bandeau hors-ligne et compte rendu des envois partis tout seuls au retour du réseau.
	import { resolve } from '$app/paths';
	import Icon from './Icon.svelte';
	import { net, queue, watchNetwork } from './queue.svelte.js';
	import { onMount } from 'svelte';

	onMount(() => watchNetwork());
	const last = $derived(queue.last);
</script>

{#if !net.online}
	<p class="offline" role="status">
		Hors-ligne — vos saisies restent sur ce téléphone{#if queue.list.length}
			; {queue.list.length} envoi{queue.list.length > 1 ? 's' : ''} partira{queue.list.length > 1
				? 'ont'
				: ''} au retour du réseau{/if}.
	</p>
{/if}
{#if last}
	<div class="toast" role="status">
		<p>
			{#if last.changeset}
				<strong>{last.name} :</strong>
				{last.sent} modification{last.sent > 1 ? 's' : ''} envoyée{last.sent > 1 ? 's' : ''} automatiquement.
			{:else if last.error}
				<strong>{last.name} :</strong> {last.error}
			{:else}
				<strong>{last.name} :</strong> rien à envoyer{last.conflicts
					? `, ${last.conflicts} à revoir`
					: ''}.
			{/if}
			{#if last.conflicts}<a href={resolve('/contributions')}>Voir les saisies à revoir</a>{/if}
		</p>
		<button type="button" aria-label="Fermer le message" onclick={() => (queue.last = undefined)}
			><Icon name="close" size={20} /></button
		>
	</div>
{/if}

<style>
	.offline {
		position: fixed;
		z-index: 50;
		top: env(safe-area-inset-top);
		left: 50%;
		transform: translateX(-50%);
		max-width: calc(100% - 32px);
		margin: 6px 0 0;
		padding: 6px 12px;
		border-radius: var(--radius-pill);
		background: #1f1b17;
		color: #fff;
		font-size: 0.875rem;
		line-height: 1.43;
		box-shadow: var(--shadow-float);
		pointer-events: none;
	}
	.toast {
		position: fixed;
		z-index: 50;
		left: 16px;
		right: 16px;
		bottom: calc(88px + env(safe-area-inset-bottom));
		max-width: 560px;
		margin: 0 auto;
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 10px 4px 10px 14px;
		border-radius: var(--radius-lg);
		background: var(--bg);
		border: 1px solid var(--border);
		box-shadow: 0 2px 10px rgb(0 0 0 / 0.2);
		font-size: 0.9375rem;
	}
	.toast p {
		flex-grow: 1;
		margin: 0;
	}
	.toast a {
		display: block;
		margin-top: 4px;
		font-weight: 600;
	}
	.toast button {
		width: 44px;
		height: 44px;
		border: 0;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		color: var(--text);
		cursor: pointer;
	}
</style>
