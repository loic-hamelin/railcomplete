<script lang="ts">
	// E5 — Carte de la gare, avec les saisies locales (lot 2).
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Icon from '#lib/Icon.svelte';
	import type { FeatureProps } from '#lib/core/features.js';
	import { current, openStation } from '#lib/current.svelte.js';
	import { editsOf, loadEdits, pending } from '#lib/edits.svelte.js';
	import { canSurvey, checkOnSite, where } from '#lib/onsite.svelte.js';
	import { srv } from '#lib/osmserver.svelte.js';
	import { stationView } from '#lib/view.js';
	import StationMap from '#lib/map/StationMap.svelte';
	import { onMount, untrack } from 'svelte';

	let mounted = $state(false);
	onMount(() => {
		mounted = true;
		loadEdits();
	});
	const id = $derived(mounted ? (page.url.searchParams.get('id') ?? '') : '');
	const focus = $derived(mounted ? (page.url.searchParams.get('focus') ?? undefined) : undefined);
	$effect(() => {
		// Ne dépend que de l'identifiant : openStation lit et modifie l'état partagé.
		const gare = id;
		if (gare) untrack(() => openStation(gare));
	});

	const st = $derived(current.value);
	const ready = $derived(st.status === 'ready' && st.station.id === id ? st : undefined);
	const view = $derived(
		ready && pending.loaded ? stationView(ready.station, ready.elements, editsOf(id)) : undefined
	);
	const data = $derived.by(() => {
		if (!view) return undefined;
		const fc = view.features();
		for (const f of fc.features) f.properties.edited = view.edited.has(f.properties.osm);
		return fc;
	});
	const survey = $derived(canSurvey(id));
	// Point de départ du placement d'une pancarte : la voie sélectionnée, sinon le centre de la gare.
	const placeHref = $derived.by(() => {
		const f = data?.features.find((x) => x.properties.osm === selected?.osm);
		const ll =
			f?.anchor ??
			(f?.geometry.type === 'LineString'
				? f.geometry.coordinates[Math.floor(f.geometry.coordinates.length / 2)]
				: undefined);
		return resolve(
			`/gare/placer?id=${encodeURIComponent(id)}${ll ? `&lon=${ll[0].toFixed(7)}&lat=${ll[1].toFixed(7)}` : ''}`
		);
	});
	const isLocal = (osm: string) => osm.startsWith('node/-');
	const visible = $state({ quai: true, voie: true, pancarte: true });
	let selected = $state<FeatureProps | undefined>();
	let mapRef = $state<{ locate: () => void }>();

	const QUEST_TEXT: Record<string, string> = {
		Q1: 'Numéro du quai à relever',
		Q2: 'Numéro de la voie à relever',
		Q3: 'Numéros du quai et des voies à vérifier',
		Q4: 'Pancartes d’arrêt à relever le long de ce quai',
		Q5: 'Pancarte à compléter',
		Q6: 'À vérifier (aucune date de vérification récente)',
		Q7: 'Numéro de voie en double ou incohérent'
	};
	// Constats de la feuille basse : une icône par nature (alerte, à relever, à vérifier).
	const QUEST_ICON: Record<string, 'alert' | 'question' | 'clock'> = {
		Q3: 'alert',
		Q7: 'alert',
		Q6: 'clock'
	};
	const filters = [
		{ k: 'quai', label: 'Quais' },
		{ k: 'voie', label: 'Voies' },
		{ k: 'pancarte', label: 'Pancartes' }
	] as const;
</script>

<svelte:head><title>Carte — {ready?.station.name ?? 'Gare'} — stationcomplete</title></svelte:head>

<!-- Carte plein écran ; barre, filtres, boutons et feuille basse flottent au-dessus. -->
<div class="screen" data-map-scope>
	{#if ready && data}
		<StationMap
			bind:this={mapRef}
			bbox={ready.station.bbox}
			{data}
			{visible}
			{focus}
			selected={selected?.osm}
			onselect={(p) => (selected = p)}
		/>
	{/if}

	<div class="top">
		<div class="bar float" data-map-avoid>
			<a
				class="icon-btn"
				href={resolve(`/gare?id=${encodeURIComponent(id)}`)}
				aria-label="Retour au tableau de bord"
			>
				<Icon name="back" size={22} />
			</a>
			<h1>{ready?.station.name ?? 'Carte'}</h1>
			{#if ready}
				<button
					class="where"
					class:on={survey}
					type="button"
					onclick={() => checkOnSite(ready.station)}
				>
					{#if survey}<span class="live" aria-hidden="true"></span>{:else}<Icon
							name="lock"
							size={16}
						/>{/if}
					{survey ? 'Sur place' : where.status === 'checking' ? 'Localisation…' : 'À distance'}
					<span class="visually-hidden">, vérifier ma position</span>
				</button>
			{/if}
		</div>
		<div class="filters" role="group" aria-label="Objets affichés">
			{#each filters as f (f.k)}
				<button
					type="button"
					class="chip {f.k}"
					data-map-avoid
					aria-pressed={visible[f.k]}
					onclick={() => (visible[f.k] = !visible[f.k])}
				>
					<span class="pict" aria-hidden="true"></span>{f.label}
				</button>
			{/each}
		</div>
	</div>

	{#if st.status === 'loading' || !mounted}
		<p class="status float" role="status">Chargement de la gare…</p>
	{:else if st.status === 'error'}
		<p class="status float error" role="alert">
			<Icon name="alert" size={20} />{st.message}
		</p>
	{/if}

	{#if ready && !selected}
		<button
			class="locate float"
			type="button"
			data-map-avoid
			aria-label="Me localiser"
			onclick={() => mapRef?.locate()}
		>
			<Icon name="locate" size={20} />
		</button>
		<a class="add" href={placeHref} data-map-avoid
			><Icon name="plus" size={20} />Ajouter une pancarte</a
		>
	{/if}

	{#if selected}
		<section class="sheet" aria-live="polite" aria-label="Objet sélectionné" data-map-avoid>
			<div class="sheet-head">
				<span class="fam {selected.kind}"><Icon name={selected.kind} size={20} /></span>
				<div class="titles">
					<h2>{selected.title}</h2>
					<p>{selected.detail}</p>
				</div>
				<button
					class="icon-btn"
					type="button"
					aria-label="Fermer"
					onclick={() => (selected = undefined)}
				>
					<Icon name="close" size={20} />
				</button>
			</div>
			{#if selected.quests || selected.edited}
				<ul class="facts">
					{#each (selected.quests ? selected.quests.split(',') : []).slice(0, 3) as q (q)}
						{@const ico = QUEST_ICON[q] ?? 'question'}
						<li class={ico}><Icon name={ico} size={18} />{QUEST_TEXT[q] ?? q}</li>
					{/each}
					{#if selected.edited}
						<li class="edited">
							<Icon name="send" size={18} />Modifié sur ce téléphone, en attente d’envoi.
						</li>
					{/if}
				</ul>
			{/if}
			<div class="actions">
				{#if isLocal(selected.osm)}
					<a class="btn-sm" href={resolve('/contributions')}>Voir mes contributions</a>
				{:else}
					<a
						class="btn-sm renseigner"
						href={resolve(`/gare/saisie?id=${encodeURIComponent(id)}&osm=${selected.osm}`)}
						><Icon name="pen" size={18} />Renseigner</a
					>
					{#if selected.kind === 'voie'}
						<a class="btn-quiet" href={placeHref}>Pancarte ici</a>
					{/if}
					<a class="btn-quiet osm" href={`${srv().web}/${selected.osm}`} rel="external">
						Voir sur OpenStreetMap<Icon name="ext" size={16} />
					</a>
				{/if}
			</div>
		</section>
	{/if}
</div>

<style>
	.screen {
		position: relative;
		height: 100dvh;
		overflow: hidden;
		background: #8c877c;
	}
	.top {
		position: absolute;
		top: calc(8px + env(safe-area-inset-top));
		left: calc(8px + env(safe-area-inset-left));
		right: calc(8px + env(safe-area-inset-right));
		display: flex;
		flex-direction: column;
		gap: 2px;
		pointer-events: none;
	}
	.top > * {
		pointer-events: auto;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 2px;
		min-height: 48px;
		padding: 0 4px 0 0;
	}
	h1 {
		flex: 1 1 auto;
		min-width: 0;
		margin: 0;
		font-size: 1.0625rem;
		line-height: 1.3;
		overflow-wrap: anywhere;
	}
	.where {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 6px;
		min-height: 44px;
		padding: 0 8px;
		border: 0;
		border-radius: var(--radius);
		background: transparent;
		color: var(--text-2);
		font: 600 0.875rem/1.2 var(--font);
		cursor: pointer;
	}
	.where.on {
		color: var(--ok);
	}
	.live {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: currentColor;
	}
	.filters {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		align-self: flex-start;
		pointer-events: none;
	}
	/* Puce : visuel 32 px, zone tactile 44 px (marge transparente). */
	.chip {
		display: flex;
		align-items: center;
		min-height: 44px;
		padding: 6px 0;
		border: 0;
		background: none;
		color: var(--text);
		font: 600 0.875rem/1 var(--font);
		cursor: pointer;
		pointer-events: auto;
		position: relative;
		isolation: isolate;
		gap: 6px;
		padding-inline: 12px;
	}
	.chip::before {
		content: '';
		position: absolute;
		inset: 6px 0;
		z-index: -1;
		border: 1px solid var(--overlay-line);
		border-radius: var(--radius-pill);
		background: var(--overlay);
		box-shadow: var(--shadow-float);
	}
	.chip[aria-pressed='false'] {
		color: var(--text-2);
	}
	.chip[aria-pressed='false']::before {
		border: 1px dashed var(--border-strong);
		box-shadow: none;
	}
	.pict {
		flex-shrink: 0;
		box-sizing: border-box;
	}
	.chip.quai .pict {
		width: 12px;
		height: 8px;
		border: 1.5px solid var(--quai);
		border-radius: 1px;
		background: var(--quai-soft);
	}
	.chip.voie .pict {
		width: 14px;
		height: 3px;
		border-radius: 2px;
		background: var(--voie);
	}
	.chip.pancarte .pict {
		width: 9px;
		height: 9px;
		border: 1.5px solid var(--pancarte);
		border-radius: 1px;
		background: var(--bg);
	}
	.chip[aria-pressed='false'] .pict {
		opacity: 0.35;
	}
	.status {
		position: absolute;
		inset: 45% 16px auto;
		margin: 0;
		padding: 12px 14px;
		display: flex;
		gap: 8px;
		justify-content: center;
		text-align: center;
	}
	.status.error :global(svg) {
		flex-shrink: 0;
		color: var(--danger);
	}
	.locate {
		position: absolute;
		left: calc(12px + env(safe-area-inset-left));
		bottom: calc(32px + env(safe-area-inset-bottom));
		width: 44px;
		height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		cursor: pointer;
	}
	.add {
		position: absolute;
		right: calc(12px + env(safe-area-inset-right));
		bottom: calc(32px + env(safe-area-inset-bottom));
		display: flex;
		align-items: center;
		gap: 6px;
		min-height: 44px;
		padding: 0 16px 0 12px;
		border-radius: 22px;
		background: var(--primary);
		color: var(--on-primary);
		font-weight: 600;
		font-size: 0.9375rem;
		text-decoration: none;
		box-shadow: 0 2px 6px rgb(0 0 0 / 0.28);
	}
	/* Feuille basse compacte (décision 5) : titre, 1 à 3 constats, un seul bouton discret. */
	.sheet {
		position: absolute;
		left: calc(8px + env(safe-area-inset-left));
		right: calc(8px + env(safe-area-inset-right));
		bottom: calc(24px + env(safe-area-inset-bottom)); /* au-dessus de l'attribution */
		max-width: 560px;
		margin: 0 auto;
		padding: 8px 8px 6px 12px;
		border: 1px solid var(--overlay-line);
		border-radius: var(--radius-sheet);
		background: var(--bg);
		box-shadow: var(--shadow-sheet);
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.sheet-head {
		display: flex;
		align-items: flex-start;
		gap: 10px;
	}
	.titles {
		flex-grow: 1;
		min-width: 0;
		padding-top: 4px;
	}
	.fam {
		flex-shrink: 0;
		width: 36px;
		height: 36px;
		margin-top: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius);
		background: var(--quai-soft);
		color: var(--quai);
	}
	.fam.voie {
		background: var(--voie-soft);
		color: var(--voie);
	}
	.fam.pancarte {
		background: var(--pancarte-soft);
		color: var(--pancarte);
	}
	h2 {
		margin: 0;
		font-size: 1.125rem;
		line-height: 1.3;
	}
	.titles p {
		margin: 0;
		font-size: 0.875rem;
		color: var(--text-2);
	}
	.facts {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 0.9375rem;
		line-height: 1.35;
	}
	.facts li {
		display: flex;
		align-items: flex-start;
		gap: 8px;
	}
	.facts :global(svg) {
		flex-shrink: 0;
		margin-top: 1px;
		color: var(--missing);
	}
	.facts .alert :global(svg) {
		color: var(--danger);
	}
	.facts .clock :global(svg),
	.facts .edited :global(svg) {
		color: var(--text-2);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 8px;
	}
	.renseigner {
		padding: 0 14px 0 10px;
		border-color: var(--primary);
		color: var(--primary);
	}
	.btn-quiet {
		padding: 0 6px;
	}
</style>
