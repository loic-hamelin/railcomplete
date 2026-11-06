<script lang="ts">
	// E8 — Relire et envoyer les saisies d'une gare : un changeset par gare.
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Icon from '#lib/Icon.svelte';
	import { account, configured, login, signedIn } from '#lib/auth.svelte.js';
	import type { Edit } from '#lib/core/edits.js';
	import { openStation } from '#lib/current.svelte.js';
	import { editsOf, loadEdits, pending, removeEdit, updateEdits } from '#lib/edits.svelte.js';
	import { sendStation, sending, type SendResult } from '#lib/send.svelte.js';
	import { srv } from '#lib/osmserver.svelte.js';
	import { loadStations, type Station } from '#lib/stations.js';
	import { onMount } from 'svelte';

	let mounted = $state(false);
	let station = $state<Station | undefined>();
	let online = $state(true);
	let comment = $state('');
	let result = $state<SendResult | undefined>();
	const id = $derived(mounted ? (page.url.searchParams.get('id') ?? '') : '');

	onMount(() => {
		mounted = true;
		online = navigator.onLine;
		const up = () => (online = navigator.onLine);
		addEventListener('online', up);
		addEventListener('offline', up);
		loadEdits();
		loadStations().then((d) => {
			station = d.stations.find((s) => s.id === page.url.searchParams.get('id'));
			if (station && !comment)
				comment = `Gare de ${station.name} : numéros de quais et de voies, pancartes d’arrêt`;
		});
		return () => {
			removeEventListener('online', up);
			removeEventListener('offline', up);
		};
	});

	const edits = $derived(id ? editsOf(id) : []);
	const ready = $derived(edits.filter((e) => !e.conflict));
	const review = $derived(edits.filter((e) => e.conflict));
	const busy = $derived(sending.step !== 'idle');
	const STEPS: Record<string, string> = {
		checking: 'Vérification d’un envoi précédent…',
		reading: 'Relecture des données à jour…',
		opening: 'Ouverture du groupe de modifications…',
		uploading: 'Envoi des modifications…',
		closing: 'Fermeture…'
	};
	const icon = (e: Edit) =>
		e.kind === 'node' || e.target.startsWith('node/')
			? 'pancarte'
			: e.summary.startsWith('Quai')
				? 'quai'
				: 'voie';

	async function send() {
		result = undefined;
		result = await sendStation(id, station?.name ?? id, comment);
		if (result.changeset) openStation(id, { force: true });
	}
	async function retry(e: Edit) {
		// Sans version de référence, la saisie s'appliquera telle quelle à la version à jour.
		await updateEdits([
			e.kind === 'tags'
				? { ...e, conflict: undefined, version: undefined, base: undefined }
				: { ...e, conflict: undefined, wayVersion: undefined }
		]);
	}
</script>

<svelte:head><title>Relire et envoyer — railcomplete</title></svelte:head>

<div class="screen">
	<header>
		<a class="icon-btn" href={resolve('/contributions')} aria-label="Retour aux contributions">
			<Icon name="back" />
		</a>
		<div>
			<h1>Relire et envoyer</h1>
			<span class="sub">{station?.name ?? ''}</span>
		</div>
	</header>

	<main>
		{#if !online}
			<p class="banner warn" role="status">
				Hors-ligne. Vos saisies sont conservées ; envoyez-les quand le réseau revient.
			</p>
		{/if}
		{#if !srv().canUpload}
			<p class="banner warn" role="note">
				L’envoi vers la vraie carte OpenStreetMap sera ouvert après la phase de test. Pour essayer,
				choisissez le serveur de test dans les <a href={resolve('/reglages')}>réglages</a>.
			</p>
		{:else}
			<p class="banner" role="note">
				Serveur : <strong>{srv().label}</strong> — aucun effet sur la vraie carte.
			</p>
		{/if}

		{#if result?.changeset}
			<div class="card ok" role="status">
				<p>
					<strong
						>{result.sent} modification{result.sent > 1 ? 's' : ''} envoyée{result.sent > 1
							? 's'
							: ''}.</strong
					>
					Merci !
				</p>
				<a href={`${srv().web}/changeset/${result.changeset}`} rel="external"
					>Voir le groupe de modifications n° {result.changeset}</a
				>
			</div>
		{/if}
		{#if result?.error}<p class="card err" role="alert">{result.error}</p>{/if}
		{#if result && !result.error && result.conflicts}
			<p class="card err" role="alert">
				{result.conflicts} saisie{result.conflicts > 1 ? 's sont' : ' est'} à revoir : l’objet a changé
				sur OpenStreetMap entre-temps.
			</p>
		{/if}

		{#if !pending.loaded}
			<p class="note" role="status">Chargement…</p>
		{:else if !edits.length}
			<p class="note">Aucune saisie en attente pour cette gare.</p>
		{:else}
			{#if ready.length}
				<h2>Prêtes à partir ({ready.length})</h2>
				<ul>
					{#each ready as e (e.id)}
						<li class={icon(e)}>
							<Icon name={icon(e)} size={24} />
							<span class="txt"
								><span class="sum">{e.summary}</span><span class="meta"
									>{e.kind === 'node' ? 'Nouvelle pancarte' : 'Modification'}</span
								></span
							>
						</li>
					{/each}
				</ul>
			{/if}
			{#if review.length}
				<h2>À revoir ({review.length})</h2>
				<ul>
					{#each review as e (e.id)}
						<li class="review">
							<Icon name="alerte" size={24} />
							<span class="txt"
								><span class="sum">{e.summary}</span><span class="meta">{e.conflict}</span></span
							>
							<span class="acts">
								<a
									href={resolve(
										`/gare/saisie?id=${encodeURIComponent(id)}&osm=${e.kind === 'tags' ? e.target : `way/${e.way}`}`
									)}>Ouvrir</a
								>
								<button type="button" onclick={() => retry(e)}>Garder</button>
								<button type="button" onclick={() => removeEdit(e.id)}>Retirer</button>
							</span>
						</li>
					{/each}
				</ul>
				<p class="hint">
					« Garder » renvoie votre saisie telle quelle : vérifiez d’abord sur place qu’elle est
					juste.
				</p>
			{/if}

			{#if ready.length && srv().canUpload}
				<label class="field">
					<span>Description publique de l’envoi</span>
					<textarea rows="3" maxlength="255" bind:value={comment}></textarea>
				</label>
				<p class="hint">
					Visible par tous sur OpenStreetMap, avec votre pseudo et la mention #railcomplete.
				</p>
			{/if}
		{/if}
	</main>

	{#if ready.length && srv().canUpload}
		<footer>
			{#if busy}
				<p class="progress" role="status">{STEPS[sending.step] ?? 'Envoi…'}</p>
			{:else if !configured()}
				<p class="hint">La connexion à ce serveur n’est pas encore configurée.</p>
			{:else if !(mounted && signedIn())}
				<button class="btn" type="button" onclick={() => login()}>Se connecter pour envoyer</button>
			{:else}
				<p class="who">Envoyé par <strong>{account.user?.name ?? 'vous'}</strong></p>
				<button class="btn" type="button" disabled={!online} onclick={send}>
					Envoyer {ready.length} modification{ready.length > 1 ? 's' : ''}
				</button>
			{/if}
		</footer>
	{/if}
</div>

<style>
	.screen {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
	}
	header {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 8px 12px 8px 4px;
		border-bottom: 1px solid var(--border);
	}
	.icon-btn {
		width: 48px;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text);
	}
	h1 {
		margin: 0;
		font-size: 1.25rem;
	}
	.sub {
		font-size: 0.875rem;
		color: var(--text-2);
	}
	main {
		flex-grow: 1;
		width: 100%;
		max-width: 640px;
		margin: 0 auto;
		padding: 16px 20px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	h2 {
		margin: 8px 0 0;
		font-size: 1rem;
	}
	.banner,
	.card {
		margin: 0;
		padding: 12px 14px;
		border-radius: var(--radius);
		background: var(--surface);
	}
	.banner.warn {
		border: 2px solid var(--missing);
	}
	.card p {
		margin: 0 0 6px;
	}
	.card.ok {
		border: 2px solid var(--ok);
	}
	.card.err {
		border: 2px solid var(--danger);
		font-weight: 700;
	}
	.note,
	.hint {
		margin: 0;
		color: var(--text-2);
	}
	.hint {
		font-size: 0.9375rem;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 0;
		border-bottom: 1px solid var(--border);
	}
	li > :global(svg) {
		flex-shrink: 0;
		color: var(--voie);
	}
	li.quai > :global(svg) {
		color: var(--quai);
	}
	li.pancarte > :global(svg) {
		color: var(--pancarte);
	}
	li.review {
		flex-wrap: wrap;
	}
	li.review > :global(svg) {
		color: var(--danger);
	}
	.txt {
		flex: 1 1 200px;
		display: flex;
		flex-direction: column;
	}
	.sum {
		font-weight: 700;
	}
	.meta {
		font-size: 0.875rem;
		color: var(--text-2);
	}
	.acts {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.acts a,
	.acts button {
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		padding: 0 10px;
		border: 2px solid var(--border);
		border-radius: 12px;
		background: var(--bg);
		color: var(--text);
		font: 700 0.875rem var(--font);
		text-decoration: none;
		cursor: pointer;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-weight: 700;
	}
	textarea {
		font: 1rem/1.4 var(--font);
		color: var(--text);
		background: var(--bg);
		border: 2px solid var(--text-2);
		border-radius: 12px;
		padding: 10px 12px;
		resize: vertical;
	}
	footer {
		position: sticky;
		bottom: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px 20px calc(16px + env(safe-area-inset-bottom));
		border-top: 1px solid var(--border);
		background: var(--bg);
	}
	footer p {
		margin: 0;
	}
	.who {
		font-size: 0.9375rem;
		color: var(--text-2);
	}
	.progress {
		font-weight: 700;
		text-align: center;
	}
	.btn:disabled {
		opacity: 0.5;
	}
</style>
