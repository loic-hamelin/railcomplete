<script lang="ts">
	// E4 — Tableau de bord d'une gare : jauges de complétude et quêtes, saisies locales comprises.
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import BottomNav from '#lib/BottomNav.svelte';
	import Icon from '#lib/Icon.svelte';
	import { current, openStation } from '#lib/current.svelte.js';
	import { editsOf, loadEdits, pending } from '#lib/edits.svelte.js';
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

	const iconOf: Record<Kind, 'quai' | 'voie' | 'pancarte' | 'alerte' | 'verif'> = {
		quai: 'quai',
		voie: 'voie',
		pancarte: 'pancarte',
		alerte: 'alerte',
		verif: 'verif'
	};
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
	<header>
		<div class="row">
			<a class="icon-btn" href={resolve('/gares')} aria-label="Changer de gare">
				<Icon name="back" />
			</a>
			<h1>{station?.name ?? 'Gare'}</h1>
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
		</div>
		{#if ready}
			<p class="meta">
				{#if ready.fromCache}<Icon name="download" size={16} /> Données enregistrées sur ce téléphone
					du {fmtDate(ready.fetchedAt)}{:else}Données OpenStreetMap à jour{/if}
			</p>
		{/if}
	</header>

	<main>
		<p class="demo" role="note">
			Version d’essai : vos saisies restent sur ce téléphone. L’envoi vers OpenStreetMap arrive
			bientôt.
		</p>
		{#if myEdits.length}
			<a class="pending" href={resolve('/contributions')}>
				<Icon name="download" size={20} />
				<span
					>{myEdits.length} saisie{myEdits.length > 1 ? 's' : ''} en attente d’envoi dans cette gare</span
				>
				<Icon name="chevron" size={18} />
			</a>
		{/if}

		{#if !mounted}
			<p class="note" role="status">Chargement…</p>
		{:else if !id}
			<p class="note">Aucune gare choisie. <a href={resolve('/gares')}>Choisir une gare</a></p>
		{:else if st.status === 'loading'}
			<p class="note" role="status">Chargement des données de la gare depuis OpenStreetMap…</p>
		{:else if st.status === 'error'}
			<div class="card error" role="alert">
				<p>{st.message}</p>
				<button class="btn" type="button" onclick={() => openStation(id, { force: true })}>
					Réessayer
				</button>
			</div>
		{:else if ready}
			{#if server.id === 'dev' && !analysis?.platforms.length}
				<div class="card" role="note">
					<p>
						<strong>Cette gare n’existe pas encore sur le serveur de test.</strong> Recopiez-y ses quais,
						voies et pancartes depuis la vraie carte pour essayer la saisie et l’envoi.
					</p>
					{#if !configured()}
						<p>La connexion au serveur de test n’est pas encore configurée.</p>
					{:else if !(mounted && signedIn())}
						<button class="btn" type="button" onclick={() => login()}
							>Se connecter au serveur de test</button
						>
					{:else}
						<button class="btn" type="button" disabled={seeding === 'busy'} onclick={seed}>
							{seeding === 'busy' ? 'Copie en cours…' : 'Recopier la vraie gare ici'}
						</button>
					{/if}
					{#if seedMsg}<p role="status">{seedMsg}</p>{/if}
				</div>
			{/if}
			<section class="gauges" aria-label="Complétude de la gare">
				{#each gauges as g (g.kind)}
					<div class="gauge {g.kind}">
						<span class="g-title"><Icon name={g.kind} size={20} />{g.label}</span>
						{#if g.total}
							<span class="g-num">{g.done}/{g.total}</span>
							<span class="g-unit">{g.unit}</span>
							<span class="bar" aria-hidden="true">
								<span style="width: {Math.round((g.done / g.total) * 100)}%"></span>
							</span>
						{:else}
							<span class="g-num">—</span>
							<span class="g-unit">aucun à relever</span>
						{/if}
					</div>
				{/each}
			</section>

			<div class="card offline" role="group" aria-label="Hors-ligne">
				{#if progress.station === id}
					<p role="status">
						Téléchargement des photos aériennes… {progress.done} / {progress.total}
					</p>
					<progress max={progress.total} value={progress.done}></progress>
				{:else if dl}
					<p>
						<Icon name="download" size={18} /> <strong>Disponible hors-ligne</strong> · {mo(
							dl.bytes
						)} · le
						{fmtDate(dl.at)}
					</p>
					<button class="btn-small" type="button" onclick={() => downloadStation(ready.station)}
						>Mettre à jour</button
					>
				{:else}
					<p>Pas de réseau en gare ? Emportez les données et la photo aérienne.</p>
					<button class="btn-small" type="button" onclick={() => downloadStation(ready.station)}>
						<Icon name="download" size={18} /> Télécharger pour le hors-ligne (≈ {mo(
							estimate(ready.station).bytes
						)})
					</button>
				{/if}
				{#if progress.error && !progress.station}<p class="err" role="alert">
						{progress.error}
					</p>{/if}
			</div>

			<div class="list-head">
				<h2>À faire ici</h2>
				<a class="btn-map" href={resolve(`/gare/carte?${mapQuery()}`)}
					><Icon name="map" size={20} />Carte</a
				>
			</div>

			{#if !groups.length}
				<p class="card ok"><Icon name="verif" /> Tout est renseigné dans cette gare. Bravo !</p>
			{:else}
				<ul class="quests">
					{#each groups as g (g.id)}
						{@const first = g.quests[0]}
						{@const target = first.target ?? first.platform}
						<li>
							<a
								class="quest {g.kind}"
								href={resolve(
									`/gare/carte?${mapQuery(target ? `${target.type}/${target.id}` : undefined)}`
								)}
							>
								<Icon name={iconOf[g.kind]} size={26} />
								<span class="q-text">
									<span class="q-title">{g.title}</span>
									{#if g.subtitle}<span class="q-sub">{g.subtitle}</span>{/if}
									{#if g.onSite}<span class="q-sub onsite"
											><Icon name="lock" size={14} /> À faire en gare</span
										>{/if}
								</span>
								<Icon name="chevron" size={20} />
							</a>
						</li>
					{/each}
				</ul>
			{/if}
			<p class="attribution">© contributeurs OpenStreetMap, ODbL</p>
		{/if}
	</main>
	<BottomNav current="gare" />
</div>

<style>
	.screen {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		background: var(--surface);
	}
	header {
		background: var(--bg);
		border-bottom: 1px solid var(--border);
		padding: 8px 8px 12px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 4px;
		max-width: 640px;
		margin: 0 auto;
	}
	h1 {
		flex-grow: 1;
		margin: 0;
		font-size: 1.375rem;
		line-height: 1.25;
	}
	.icon-btn {
		width: 48px;
		height: 48px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 0;
		background: transparent;
		color: var(--text);
		cursor: pointer;
	}
	.meta {
		display: flex;
		align-items: center;
		gap: 6px;
		max-width: 640px;
		margin: 2px auto 0;
		padding-left: 52px;
		font-size: 0.875rem;
		color: var(--text-2);
	}
	main {
		flex-grow: 1;
		width: 100%;
		max-width: 640px;
		margin: 0 auto;
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.demo {
		margin: 0;
		padding: 10px 14px;
		border-radius: 12px;
		background: var(--bg);
		border: 1px dashed var(--text-2);
		font-size: 0.9375rem;
	}
	.note {
		margin: 0;
		color: var(--text-2);
	}
	.offline p {
		margin: 0;
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}
	.offline progress {
		width: 100%;
		height: 8px;
		accent-color: var(--primary);
	}
	.err {
		color: var(--danger);
		font-weight: 700;
	}
	.btn-small {
		align-self: flex-start;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 44px;
		padding: 0 14px;
		border: 2px solid var(--primary);
		border-radius: 12px;
		background: var(--bg);
		color: var(--primary);
		font: 700 0.9375rem var(--font);
		cursor: pointer;
	}
	.pending {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 52px;
		padding: 8px 14px;
		border-radius: var(--radius);
		background: var(--bg);
		border: 2px solid var(--primary);
		color: var(--primary);
		font-weight: 700;
		text-decoration: none;
	}
	.pending span {
		flex-grow: 1;
	}
	.card {
		margin: 0;
		padding: 14px;
		border-radius: var(--radius);
		background: var(--bg);
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.card p {
		margin: 0;
	}
	.card.error {
		border: 2px solid var(--danger);
	}
	.card.ok {
		flex-direction: row;
		align-items: center;
		color: var(--ok);
		font-weight: 700;
	}
	.gauges {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
	}
	.gauge {
		background: var(--bg);
		border-radius: var(--radius);
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 4px;
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
		font-weight: 700;
		font-size: 0.9375rem;
	}
	.g-num {
		font-size: 1.5rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.g-unit {
		font-size: 0.8125rem;
		color: var(--text-2);
		line-height: 1.3;
	}
	.bar {
		height: 6px;
		border-radius: 3px;
		background: var(--border);
		overflow: hidden;
	}
	.bar span {
		display: block;
		height: 100%;
		background: var(--c);
	}
	.list-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	h2 {
		margin: 0;
		font-size: 1.125rem;
	}
	.btn-map {
		display: flex;
		align-items: center;
		gap: 6px;
		min-height: 44px;
		padding: 0 16px;
		border-radius: 22px;
		border: 2px solid var(--primary);
		color: var(--primary);
		font-weight: 700;
		text-decoration: none;
	}
	.quests {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.quest {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 64px;
		padding: 10px 14px;
		border-radius: var(--radius);
		background: var(--bg);
		color: var(--text);
		text-decoration: none;
		--c: var(--text-2);
	}
	.quest > :global(svg:first-child) {
		color: var(--c);
		flex-shrink: 0;
	}
	.quest.quai {
		--c: var(--quai);
	}
	.quest.voie {
		--c: var(--voie);
	}
	.quest.pancarte {
		--c: var(--pancarte);
	}
	.quest.verif {
		--c: var(--ok);
	}
	.quest.alerte {
		--c: var(--danger);
		border: 2px solid var(--danger);
	}
	.q-text {
		flex-grow: 1;
		display: flex;
		flex-direction: column;
	}
	.q-title {
		font-weight: 700;
	}
	.q-sub {
		font-size: 0.875rem;
		color: var(--text-2);
	}
	.onsite {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.attribution {
		margin: 8px 0 0;
		font-size: 0.8125rem;
		color: var(--text-2);
		text-align: center;
	}
</style>
