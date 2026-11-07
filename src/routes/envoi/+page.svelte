<script lang="ts">
	// E8 — Relire et envoyer les saisies d'une gare : un changeset par gare.
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Icon from '#lib/Icon.svelte';
	import { account, configured, login, signedIn } from '#lib/auth.svelte.js';
	import {
		editFamily,
		editIcon,
		editKey,
		editLabel,
		isRemoval,
		type Edit
	} from '#lib/core/edits.js';
	import { openStation } from '#lib/current.svelte.js';
	import { editsOf, loadEdits, pending, removeEdit, updateEdits } from '#lib/edits.svelte.js';
	import {
		APP_VERSION,
		DEMO_REFUSED,
		sendStation,
		sending,
		type SendResult
	} from '#lib/send.svelte.js';
	import { server, srv } from '#lib/osmserver.svelte.js';
	import { uploadBlock } from '#lib/core/remote.js';
	import { proposedComment } from '#lib/core/upload.js';
	import { refreshConfig, remote } from '#lib/remote.svelte.js';
	import { dequeue, enqueue, isQueued } from '#lib/offline.svelte.js';
	import { loadStations, type Station } from '#lib/stations.js';
	import { onMount } from 'svelte';

	let mounted = $state(false);
	let station = $state<Station | undefined>();
	let online = $state(true);
	let comment = $state('');
	let result = $state<SendResult | undefined>();
	const id = $derived(mounted ? (page.url.searchParams.get('id') ?? '') : '');

	// Description proposée d'après les saisies (motif des suppressions compris), tant que la
	// personne ne l'a pas modifiée.
	let commentEdited = $state(false);
	$effect(() => {
		if (station && pending.loaded && !commentEdited)
			comment = proposedComment(station.name, ready.length ? ready : edits);
	});

	onMount(() => {
		mounted = true;
		online = navigator.onLine;
		const up = () => (online = navigator.onLine);
		addEventListener('online', up);
		addEventListener('offline', up);
		loadEdits();
		refreshConfig();
		loadStations().then((d) => {
			station = d.stations.find((s) => s.id === page.url.searchParams.get('id'));
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
	const real = $derived(server.id === 'prod');
	// Arrêt d'urgence ou phase pilote (config.json) ; revérifié au moment de l'envoi.
	const blocked = $derived(
		!mounted
			? undefined
			: real && ready.some((e) => e.demo)
				? DEMO_REFUSED
				: uploadBlock(remote.cfg, APP_VERSION, real && !!account.user, account.user?.name)
	);
	const STEPS: Record<string, string> = {
		checking: 'Vérification d’un envoi précédent…',
		reading: 'Relecture des données à jour…',
		opening: 'Ouverture du groupe de modifications…',
		uploading: 'Envoi des modifications…',
		closing: 'Fermeture…'
	};
	const icon = (e: Edit) => editIcon(e);
	const family = (e: Edit) => editFamily(e);

	async function send() {
		result = undefined;
		result = await sendStation(id, station?.name ?? id, comment);
		// Données relues après un envoi, ou après un conflit (pour refaire sur la carte à jour).
		if (result.changeset || result.conflicts) openStation(id, { force: true });
	}
	async function retry(e: Edit) {
		// Sans version de référence, la saisie s'appliquera telle quelle à la version à jour.
		// (Jamais pour une forme ou une suppression : elles se refont sur la carte.)
		if (e.kind === 'shape' || isRemoval(e)) return;
		await updateEdits([
			e.kind === 'tags'
				? { ...e, conflict: undefined, version: undefined, base: undefined }
				: e.kind === 'node'
					? { ...e, conflict: undefined, wayVersion: undefined }
					: { ...e, conflict: undefined }
		]);
	}
</script>

<svelte:head><title>Relire et envoyer — stationcomplete</title></svelte:head>

<div class="screen">
	<header class="head">
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
				<Icon name="offline" size={18} />Hors-ligne. Vos saisies sont conservées. Après relecture,
				vous pouvez programmer l’envoi : il partira tout seul au retour du réseau, appli ouverte.
			</p>
		{/if}
		{#if !srv().canUpload}
			<p class="banner warn" role="note">
				<Icon name="alert" size={18} />L’envoi n’est pas encore possible vers {srv().label}. Pour
				essayer, choisissez un autre serveur dans les <a href={resolve('/reglages')}>réglages</a>.
			</p>
		{:else if real}
			<p class="banner" role="note">
				<Icon name="info" size={18} />Vos modifications seront publiées sur la carte
				<strong>OpenStreetMap</strong>, visibles par tous.
			</p>
		{:else}
			<p class="banner" role="note">
				<Icon name="info" size={18} />Serveur : <strong>{srv().label}</strong> — aucun effet sur la vraie
				carte.
			</p>
		{/if}
		{#if blocked && srv().canUpload}
			<p class="banner warn" role="alert">{blocked}</p>
		{:else if remote.cfg.message}
			<p class="banner warn" role="note">{remote.cfg.message}</p>
		{/if}

		{#if result?.changeset}
			<div class="banner ok" role="status">
				<Icon name="check" size={18} />
				<div>
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
			</div>
		{/if}
		{#if result?.error}<p class="banner err" role="alert">{result.error}</p>{/if}
		{#if result && !result.error && result.conflicts}
			<p class="banner err" role="alert">
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
				<h2 class="overline">Prêtes à partir ({ready.length})</h2>
				<ul class="group">
					{#each ready as e (e.id)}
						<li class={family(e)}>
							<Icon name={icon(e)} size={20} />
							<span class="txt"
								><span class="sum">{e.summary}</span><span class="meta"
									>{editLabel(e)}{e.demo ? ' · mode démonstration' : ''}</span
								></span
							>
							{#if real && e.demo}
								<span class="acts">
									<button class="btn-sm" type="button" onclick={() => removeEdit(e.id)}
										>Retirer</button
									>
								</span>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
			{#if review.length}
				<h2 class="overline">À revoir ({review.length})</h2>
				<ul class="group">
					{#each review as e (e.id)}
						<li class="review">
							<Icon name="alert" size={20} />
							<span class="txt"
								><span class="sum">{e.summary}</span><span class="meta">{e.conflict}</span></span
							>
							<span class="acts">
								{#if e.kind === 'shape' || isRemoval(e)}
									<!-- Forme ou suppression : jamais renvoyée telle quelle, on la refait sur la carte à jour. -->
									<a
										class="btn-sm"
										href={resolve(`/gare/carte?id=${encodeURIComponent(id)}&focus=${e.target}`)}
										>Refaire</a
									>
								{:else}
									<a
										class="btn-sm"
										href={resolve(
											`/gare/saisie?id=${encodeURIComponent(id)}&osm=${e.kind === 'node' ? `way/${e.way}` : editKey(e)}`
										)}>Ouvrir</a
									>
									<button class="btn-sm" type="button" onclick={() => retry(e)}>Garder</button>
								{/if}
								<button class="btn-sm" type="button" onclick={() => removeEdit(e.id)}
									>Retirer</button
								>
							</span>
						</li>
					{/each}
				</ul>
				<p class="hint">
					« Garder » renvoie votre saisie telle quelle : vérifiez d’abord sur place qu’elle est
					juste. Une forme de quai ou une suppression se refait sur la carte à jour.
				</p>
			{/if}

			{#if ready.length && srv().canUpload}
				<label class="field">
					<span>Description publique de l’envoi</span>
					<textarea
						class="input"
						rows="3"
						maxlength="255"
						bind:value={comment}
						oninput={() => (commentEdited = true)}></textarea>
				</label>
				<p class="hint">
					Visible par tous sur OpenStreetMap, avec votre pseudo et la mention #stationcomplete.
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
				{#if blocked}
					<p class="hint">Envoi impossible pour le moment (voir le message en haut).</p>
				{:else if isQueued(id)}
					<p class="queued" role="status">
						<Icon name="clock" size={18} /> En attente du réseau : l’envoi partira tout seul.
					</p>
					<button class="btn btn-secondary" type="button" onclick={() => dequeue(id)}
						>Annuler l’envoi automatique</button
					>
				{:else if online}
					<button class="btn" type="button" onclick={send}>
						Envoyer {ready.length} modification{ready.length > 1 ? 's' : ''}
					</button>
				{:else}
					<button
						class="btn"
						type="button"
						onclick={() => enqueue(id, station?.name ?? id, comment)}
					>
						Envoyer dès le retour du réseau
					</button>
				{/if}
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
	main {
		flex-grow: 1;
		width: 100%;
		max-width: 640px;
		margin: 0 auto;
		padding: 12px 16px 16px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.overline {
		margin-bottom: -4px;
	}
	.banner p {
		margin: 0 0 4px;
	}
	.note,
	.hint {
		margin: 0;
		color: var(--text-2);
	}
	.hint {
		font-size: 0.875rem;
	}
	li {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 56px;
		padding: 10px 12px;
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
		font-weight: 600;
	}
	.meta {
		font-size: 0.875rem;
		color: var(--text-2);
	}
	.acts {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-weight: 600;
	}
	.field textarea {
		font-weight: 400;
	}
	.field textarea:focus {
		outline: 2px solid var(--primary);
		outline-offset: 2px;
	}
	footer {
		position: sticky;
		bottom: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
		border-top: 1px solid var(--border);
		background: var(--bg);
	}
	footer p {
		margin: 0;
	}
	.who {
		font-size: 0.875rem;
		color: var(--text-2);
	}
	.queued {
		display: flex;
		align-items: center;
		gap: 6px;
		font-weight: 600;
	}
	.queued :global(svg) {
		color: var(--primary);
	}
	.progress {
		font-weight: 600;
		text-align: center;
	}
</style>
