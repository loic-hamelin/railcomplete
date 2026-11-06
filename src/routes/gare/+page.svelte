<script lang="ts">
	// E4 — Tableau de bord d'une gare : jauges de complétude et quêtes, saisies locales comprises.
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import BottomNav from '#lib/BottomNav.svelte';
	import Icon from '#lib/Icon.svelte';
	import type { IconName } from '#lib/icons.js';
	import { current, openStation } from '#lib/current.svelte.js';
	import { editsOf, loadEdits, pending, settings } from '#lib/edits.svelte.js';
	import { groupQuests, type Kind } from '#lib/questText.js';
	import { stationView } from '#lib/view.js';
	import { configured, login, signedIn } from '#lib/auth.svelte.js';
	import { seedTestStation } from '#lib/seed.js';
	import { server } from '#lib/osmserver.svelte.js';
	import { downloadStation, downloads, estimate, progress } from '#lib/offline.svelte.js';
	import { onMount, untrack } from 'svelte';

	// Page statique : l'identifiant de la gare n'est lu que dans le navigateur.
	let mounted = $state(false);
	onMount(() => {
		mounted = true;
		loadEdits();
	});
	const id = $derived(mounted ? (page.url.searchParams.get('id') ?? '') : '');
	$effect(() => {
		// Ne dépend que de l'identifiant : openStation lit et modifie l'état partagé.
		const gare = id;
		if (gare) untrack(() => openStation(gare));
	});

	const st = $derived(current.value);
	const ready = $derived(st.status === 'ready' ? st : undefined);
	const myEdits = $derived(id ? editsOf(id) : []);
	const view = $derived(
		ready && pending.loaded ? stationView(ready.station, ready.elements, myEdits) : undefined
	);
	const analysis = $derived(view?.analysis ?? ready?.analysis);
	const groups = $derived(analysis ? groupQuests(analysis) : []);
	const station = $derived(st.status === 'idle' ? undefined : st.station);

	const gauges = $derived(
		ready
			? [
					{
						kind: 'quai' as const,
						label: 'Quais',
						unit: 'numérotés',
						...analysis!.completeness.platforms
					},
					{
						kind: 'voie' as const,
						label: 'Voies',
						unit: 'numérotées',
						...analysis!.completeness.tracks
					},
					{
						kind: 'pancarte' as const,
						label: 'Pancartes',
						unit: 'côtés relevés',
						...analysis!.completeness.stopSigns
					}
				]
			: []
	);

	const iconOf: Record<Kind, IconName> = {
		quai: 'quai',
		voie: 'voie',
		pancarte: 'pancarte',
		alerte: 'alert',
		verif: 'check'
	};
	/** Jauge segmentée : un segment par objet jusqu'à 12, une barre continue au-delà. */
	const segments = (done: number, total: number) =>
		total <= 12
			? Array.from({ length: total }, (_, i) => i < done)
			: Array.from({ length: 12 }, (_, i) => i < Math.round((done / total) * 12));
	const mapQuery = (focus?: string) =>
		`id=${encodeURIComponent(id)}${focus ? `&focus=${focus}` : ''}`;
	// Serveur de test : une gare encore vide peut être recopiée depuis la vraie carte.
	let seeding = $state<'idle' | 'busy' | 'error'>('idle');
	let seedMsg = $state('');
	async function seed() {
		if (!ready) return;
		seeding = 'busy';
		try {
			const n = await seedTestStation(ready.station);
			seedMsg = `${n} objets recopiés sur le serveur de test.`;
			seeding = 'idle';
			await openStation(id, { force: true });
		} catch (e) {
			seeding = 'error';
			seedMsg = (e as Error).message;
		}
	}
	const dl = $derived(downloads.list.find((d) => d.id === id));
	const mo = (b: number) => `${(b / 1e6).toFixed(1).replace('.', ',')} Mo`;
	const fmtDate = (t: number) =>
		new Date(t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
</script>

<svelte:head><title>{station?.name ?? 'Gare'} — stationcomplete</title></svelte:head>

<div class="screen">
	<header class="head">
		<a class="icon-btn" href={resolve('/gares')} aria-label="Changer de gare">
			<Icon name="back" />
		</a>
		<div class="titles">
			<h1>{station?.name ?? 'Gare'}</h1>
			{#if ready}
				<span class="sub">
					{#if ready.fromCache}Données enregistrées sur ce téléphone du {fmtDate(
							ready.fetchedAt
						)}{:else}Données OpenStreetMap à jour{/if}
				</span>
			{/if}
		</div>
		{#if ready}
			<button
				class="icon-btn"
				type="button"
				aria-label="Recharger les données depuis OpenStreetMap"
				onclick={() => openStation(id, { force: true })}
			>
				<Icon name="refresh" />
			</button>
		{/if}
	</header>

	<main>
		{#if settings.demo}
			<p class="banner" role="note">
				<Icon name="info" size={18} />
				<span
					>Mode démonstration : saisie possible hors de la gare, mais ces saisies ne partiront pas
					sur la vraie carte.</span
				>
			</p>
		{/if}
		{#if myEdits.length}
			<a class="row-link" href={resolve('/contributions')}>
				<Icon name="send" size={20} />
				<span
					>{myEdits.length} saisie{myEdits.length > 1 ? 's' : ''} en attente d’envoi dans cette gare</span
				>
				<Icon name="chev" size={18} />
			</a>
		{/if}

		{#if !mounted}
			<p class="note" role="status">Chargement…</p>
		{:else if !id}
			<p class="note">Aucune gare choisie. <a href={resolve('/gares')}>Choisir une gare</a></p>
		{:else if st.status === 'loading'}
			<p class="note" role="status">Chargement des données de la gare depuis OpenStreetMap…</p>
		{:else if st.status === 'error'}
			<div class="banner err" role="alert">
				<Icon name="alert" size={18} />
				<div class="stack">
					<p>{st.message}</p>
					<button class="btn-sm" type="button" onclick={() => openStation(id, { force: true })}>
						Réessayer
					</button>
				</div>
			</div>
		{:else if ready}
			{#if server.id === 'dev' && !analysis?.platforms.length}
				<div class="banner" role="note">
					<Icon name="info" size={18} />
					<div class="stack">
						<p>
							<strong>Cette gare n’existe pas encore sur le serveur de test.</strong> Recopiez-y ses quais,
							voies et pancartes depuis la vraie carte pour essayer la saisie et l’envoi.
						</p>
						{#if !configured()}
							<p>La connexion au serveur de test n’est pas encore configurée.</p>
						{:else if !(mounted && signedIn())}
							<button class="btn-sm" type="button" onclick={() => login()}
								>Se connecter au serveur de test</button
							>
						{:else}
							<button class="btn-sm" type="button" disabled={seeding === 'busy'} onclick={seed}>
								{seeding === 'busy' ? 'Copie en cours…' : 'Recopier la vraie gare ici'}
							</button>
						{/if}
						{#if seedMsg}<p role="status">{seedMsg}</p>{/if}
					</div>
				</div>
			{/if}
			<section class="gauges" aria-label="Complétude de la gare">
				{#each gauges as g (g.kind)}
					<div class="gauge {g.kind}">
						<span class="g-title"><Icon name={g.kind} size={18} />{g.label}</span>
						{#if g.total}
							<span class="g-num">{g.done}/{g.total}</span>
							<span class="g-unit">{g.unit}</span>
							<span class="bar" aria-hidden="true">
								{#each segments(g.done, g.total) as on, i (i)}<span class:on></span>{/each}
							</span>
						{:else}
							<span class="g-num">—</span>
							<span class="g-unit">aucun à relever</span>
						{/if}
					</div>
				{/each}
			</section>

			<div class="offline" role="group" aria-label="Hors-ligne">
				{#if progress.station === id}
					<p class="row" role="status">
						<Icon name="download" size={20} />
						<span>Téléchargement des photos aériennes… {progress.done} / {progress.total}</span>
					</p>
					<progress max={progress.total} value={progress.done}></progress>
				{:else if dl}
					<div class="row">
						<Icon name="check" size={20} />
						<span
							><strong>Disponible hors-ligne</strong> · {mo(dl.bytes)} · le {fmtDate(dl.at)}</span
						>
						<button class="btn-quiet" type="button" onclick={() => downloadStation(ready.station)}
							>Mettre à jour</button
						>
					</div>
				{:else}
					<button class="row row-btn" type="button" onclick={() => downloadStation(ready.station)}>
						<Icon name="download" size={20} />
						<span
							>Emporter la gare hors-ligne <span class="dim"
								>· ≈ {mo(estimate(ready.station).bytes)}</span
							></span
						>
					</button>
				{/if}
				{#if progress.error && !progress.station}<p class="err" role="alert">
						<Icon name="alert" size={18} />{progress.error}
					</p>{/if}
			</div>

			<div class="list-head">
				<h2>À faire ici</h2>
				<div class="seg views" role="group" aria-label="Affichage">
					<span aria-current="true"><Icon name="list" size={18} />Liste</span>
					<a href={resolve(`/gare/carte?${mapQuery()}`)}><Icon name="map" size={18} />Carte</a>
				</div>
			</div>

			{#if !groups.length}
				<p class="banner ok">
					<Icon name="check" size={18} /> Tout est renseigné dans cette gare. Bravo !
				</p>
			{:else}
				<ul class="group quests">
					{#each groups as g (g.id)}
						{@const first = g.quests[0]}
						{@const target = first.target ?? first.platform}
						<li>
							<a
								class="quest {g.kind}"
								href={g.id === 'Q0'
									? resolve(`/gare/dessiner?id=${encodeURIComponent(id)}`)
									: resolve(
											`/gare/carte?${mapQuery(target ? `${target.type}/${target.id}` : undefined)}`
										)}
							>
								<span class="q-ico"><Icon name={iconOf[g.kind]} size={20} /></span>
								<span class="q-text">
									<span class="q-title">{g.title}</span>
									{#if g.subtitle}<span class="q-sub">{g.subtitle}</span>{/if}
									{#if g.onSite}<span class="q-sub onsite"
											><Icon name="lock" size={14} /> À faire en gare</span
										>{/if}
								</span>
								<Icon name="chev" size={18} />
							</a>
						</li>
					{/each}
				</ul>
			{/if}
			{#if analysis?.platforms.length}
				<a class="draw" href={resolve(`/gare/dessiner?id=${encodeURIComponent(id)}`)}>
					<Icon name="pen" size={18} /> Un quai manque sur la carte ? Le dessiner</a
				>
			{/if}
			<p class="attribution">© contributeurs OpenStreetMap, ODbL</p>
		{/if}
	</main>
	<BottomNav current="gare" />
</div>

<style>
	/* Coque d'appli : seul le contenu défile, la barre basse ne recouvre jamais rien. */
	.screen {
		height: 100dvh;
		display: flex;
		flex-direction: column;
	}
	.titles {
		flex-grow: 1;
		min-width: 0;
	}
	main {
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
		width: 100%;
		padding: 12px 16px 16px;
		/* colonne de 640 px au plus, barre de défilement au bord de l'écran */
		padding-inline: max(16px, calc((100% - 640px) / 2));
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	main > :global(*) {
		flex-shrink: 0;
	}
	.stack {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 8px;
	}
	.stack p {
		margin: 0;
	}
	.note {
		margin: 0;
		color: var(--text-2);
	}
	.row-link,
	.row {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 48px;
		margin: 0;
		padding: 4px 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--bg);
		color: var(--text);
		text-decoration: none;
		font-size: 0.9375rem;
	}
	.row-link > :global(svg:first-child),
	.row > :global(svg:first-child) {
		flex-shrink: 0;
		color: var(--primary);
	}
	.row-link span,
	.row span {
		flex-grow: 1;
	}
	.row-link > :global(svg:last-child) {
		color: var(--text-3);
	}
	.row-btn {
		width: 100%;
		font: inherit;
		font-size: 0.9375rem;
		text-align: left;
		cursor: pointer;
	}
	.dim {
		color: var(--text-2);
	}
	.offline {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.offline progress {
		width: 100%;
		height: 6px;
		accent-color: var(--primary);
	}
	.err {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 0;
		font-size: 0.875rem;
	}
	.err :global(svg) {
		flex-shrink: 0;
		color: var(--danger);
	}
	.gauges {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
	}
	.gauge {
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: 10px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		--c: var(--quai);
	}
	.gauge.voie {
		--c: var(--voie);
	}
	.gauge.pancarte {
		--c: var(--pancarte);
	}
	.g-title {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--c);
		font-weight: 600;
		font-size: 0.875rem;
	}
	.g-num {
		font-size: 1.5rem;
		line-height: 1.33;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.g-unit {
		font-size: 0.875rem;
		color: var(--text-2);
		line-height: 1.3;
	}
	.bar {
		display: flex;
		gap: 2px;
		height: 4px;
		margin-top: 6px;
	}
	.bar span {
		flex: 1 1 0;
		border-radius: 1px;
		background: var(--border);
	}
	.bar span.on {
		background: var(--c);
	}
	.list-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin-top: 4px;
	}
	h2 {
		margin: 0;
		font-size: 1.0625rem;
	}
	.views {
		flex-shrink: 0;
	}
	.views > span,
	.views > a {
		padding: 0 12px;
	}
	.quest {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 56px;
		padding: 12px;
		color: var(--text);
		text-decoration: none;
		--c: var(--text-2);
		--s: var(--surface);
	}
	.quest > :global(svg:last-child) {
		flex-shrink: 0;
		color: var(--text-3);
	}
	.q-ico {
		flex-shrink: 0;
		align-self: flex-start;
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius);
		background: var(--s);
		color: var(--c);
	}
	.quest.quai {
		--c: var(--quai);
		--s: var(--quai-soft);
	}
	.quest.voie {
		--c: var(--voie);
		--s: var(--voie-soft);
	}
	.quest.pancarte {
		--c: var(--pancarte);
		--s: var(--pancarte-soft);
	}
	.quest.verif {
		--c: var(--ok);
		--s: var(--ok-soft);
	}
	.quest.alerte {
		--c: var(--danger);
		--s: var(--danger-soft);
	}
	.q-text {
		flex-grow: 1;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.q-title {
		font-weight: 600;
		line-height: 1.35;
	}
	.q-sub {
		font-size: 0.875rem;
		line-height: 1.43;
		color: var(--text-2);
	}
	.onsite {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.draw {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		font-weight: 600;
		font-size: 0.9375rem;
	}
	.attribution {
		margin: 4px 0 0;
		font-size: 0.8125rem;
		color: var(--text-2);
		text-align: center;
	}
</style>
