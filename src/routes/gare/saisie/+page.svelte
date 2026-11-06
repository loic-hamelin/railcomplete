<script lang="ts">
	// E7 — Fiche objet : renseigner, corriger ou vérifier un quai, une voie ou une pancarte.
	// Les saisies restent sur le téléphone (lot 2) ; l'envoi vers OpenStreetMap arrive au lot 3.
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Icon from '#lib/Icon.svelte';
	import {
		bearingName,
		checkSign,
		cleanTrackRef,
		joinRefs,
		newEditId,
		signSummary,
		signTags,
		today,
		type ElementKey,
		type SignInput,
		type SignType
	} from '#lib/core/edits.js';
	import { platformTitle } from '#lib/core/features.js';
	import { isPlatform, isRail, isStopSign, splitValues, type OsmWay } from '#lib/core/osm.js';
	import { current, openStation } from '#lib/current.svelte.js';
	import { editsOf, loadEdits, nextTempId, pending, saveEdit } from '#lib/edits.svelte.js';
	import { canSurvey, checkOnSite, where } from '#lib/onsite.svelte.js';
	import { stationView } from '#lib/view.js';
	import { onMount, untrack } from 'svelte';

	let mounted = $state(false);
	onMount(() => {
		mounted = true;
		loadEdits();
	});
	const q = $derived(mounted ? page.url.searchParams : new URLSearchParams());
	const id = $derived(q.get('id') ?? '');
	const osm = $derived((q.get('osm') ?? '') as ElementKey | '');
	// Nouvelle pancarte placée sur E6
	const placed = $derived(
		q.get('way')
			? {
					way: Number(q.get('way')),
					after: Number(q.get('after')),
					lon: Number(q.get('lon')),
					lat: Number(q.get('lat')),
					bearing: Number(q.get('bearing'))
				}
			: undefined
	);
	$effect(() => {
		const gare = id;
		if (gare) untrack(() => openStation(gare));
	});

	const st = $derived(current.value);
	const ready = $derived(st.status === 'ready' && st.station.id === id ? st : undefined);
	const view = $derived(
		ready && pending.loaded ? stationView(ready.station, ready.elements, editsOf(id)) : undefined
	);
	const el = $derived(
		view && osm ? view.elements.find((e) => `${e.type}/${e.id}` === osm) : undefined
	);
	const kind = $derived(
		placed
			? 'pancarte'
			: !el
				? undefined
				: isStopSign(el.tags)
					? 'pancarte'
					: isPlatform(el.tags)
						? 'quai'
						: isRail(el.tags)
							? 'voie'
							: undefined
	);
	const survey = $derived(canSurvey(id));
	const title = $derived(
		kind === 'quai'
			? platformTitle(el?.tags ?? {})
			: kind === 'voie'
				? `Voie ${el?.tags?.['railway:track_ref'] ?? ''}`.trim()
				: kind === 'pancarte'
					? 'Pancarte d’arrêt'
					: 'Fiche'
	);
	const back = $derived(
		resolve(`/gare/carte?id=${encodeURIComponent(id)}${osm ? `&focus=${osm}` : ''}`)
	);

	// ---------------- Quai ----------------
	let refs = $state<string[]>([]);
	let newRef = $state('');
	let localRef = $state('');
	let initFor = '';
	$effect(() => {
		// Préremplissage, une seule fois par objet.
		if (!el || !view || initFor === osm) return;
		initFor = osm;
		const t = el.tags ?? {};
		if (kind === 'quai') {
			const info = view.analysis.platforms.find((p) => `${p.ref.type}/${p.ref.id}` === osm);
			const fromTracks = (info?.tracks ?? []).flatMap((x) => [...splitValues(x.trackRef)]);
			const letters = /^[A-Za-z]{1,3}(;[A-Za-z]{1,3})*$/.test(t.ref ?? '');
			refs = letters || !t.ref ? [...new Set(fromTracks)] : [...splitValues(t.ref)];
			localRef = t.local_ref ?? (letters ? (t.ref ?? '').replaceAll(';', '-') : '');
		} else if (kind === 'voie') trackRef = t['railway:track_ref'] ?? '';
	});
	function addRef() {
		const v = cleanTrackRef(newRef);
		if (v && !refs.includes(v)) refs = [...refs, v];
		newRef = '';
	}

	// ---------------- Voie ----------------
	let trackRef = $state('');
	let changes = $state(false);

	// ---------------- Pancarte ----------------
	let correcting = $state(false);
	const sign = $state<Partial<SignInput>>({});
	const TYPES: { t: SignType; label: string; plate?: boolean }[] = [
		{ t: 'TT', label: 'TT', plate: true },
		{ t: 'nV', label: 'n V', plate: true },
		{ t: 'L', label: 'L 220', plate: true },
		{ t: 'Z57', label: 'Z57', plate: true },
		{ t: 'Z50', label: 'Z50', plate: true },
		{ t: 'TGV', label: 'TGV', plate: true },
		{ t: 'UFR', label: 'UFR', plate: true },
		{ t: 'long', label: 'Train long' },
		{ t: 'short', label: 'Train court' },
		{ t: 'all', label: 'Tous trains' },
		{ t: 'other', label: 'Autre / illisible' }
	];
	// Cap de la voie au point de la pancarte, pour nommer les deux sens.
	const bearing = $derived(placed?.bearing ?? wayBearingAt());
	function wayBearingAt() {
		if (!el || el.type !== 'node' || !view) return undefined;
		const w = view.elements.find(
			(e) => e.type === 'way' && (e as OsmWay).nodes.includes(el.id) && isRail(e.tags)
		) as OsmWay | undefined;
		if (!w) return undefined;
		const i = w.nodes.indexOf(el.id);
		const a = view.elements.find((e) => e.id === w.nodes[Math.max(0, i - 1)] && e.type === 'node');
		const b = view.elements.find(
			(e) => e.id === w.nodes[Math.min(w.nodes.length - 1, i + 1)] && e.type === 'node'
		);
		if (!a || !b || a.type !== 'node' || b.type !== 'node') return undefined;
		const dx = (b.lon - a.lon) * Math.cos((a.lat * Math.PI) / 180);
		return ((Math.atan2(dx, b.lat - a.lat) * 180) / Math.PI + 360) % 360;
	}
	const dirName = (backward: boolean) =>
		bearing === undefined
			? backward
				? 'Sens inverse de la voie'
				: 'Sens de la voie'
			: towards(bearingName(bearing + (backward ? 180 : 0)));
	const towards = (d: string) => (d === 'est' || d === 'ouest' ? `Vers l’${d}` : `Vers le ${d}`);

	// ---------------- Enregistrement ----------------
	let error = $state('');
	let saving = $state(false);

	async function save(tags: Record<string, string | null>, summary: string) {
		if (!el) return;
		const orig = ready?.elements.find((e) => `${e.type}/${e.id}` === osm);
		saving = true;
		try {
			await saveEdit({
				kind: 'tags',
				id: newEditId(),
				station: id,
				createdAt: Date.now(),
				target: osm as ElementKey,
				// Version et valeurs d'origine (avant toute saisie locale) : servent à détecter, à
				// l'envoi, si quelqu'un a modifié le même tag entre-temps.
				version: orig?.version,
				base: Object.fromEntries(Object.keys(tags).map((k) => [k, orig?.tags?.[k] ?? null])),
				tags,
				summary
			});
			await goto(back);
		} catch {
			error = "L'enregistrement sur ce téléphone a échoué. Réessayez.";
		} finally {
			saving = false;
		}
	}

	function saveQuai() {
		error = '';
		const ref = joinRefs(refs);
		if (!ref) return (error = 'Indiquez au moins un numéro de voie le long du quai.');
		const lr = localRef.trim().toUpperCase().slice(0, 8);
		const t = el?.tags ?? {};
		const tags: Record<string, string | null> = {
			ref,
			local_ref: lr || null,
			check_date: today()
		};
		if (!t.public_transport) tags.public_transport = 'platform';
		if (!t.railway) tags.railway = 'platform';
		if (!t.train) tags.train = 'yes';
		save(
			tags,
			lr
				? `Quai ${lr} : voies ${ref.replaceAll(';', ', ')}`
				: `Quai : voies ${ref.replaceAll(';', ', ')}`
		);
	}

	function saveVoie() {
		error = '';
		if (changes)
			return (error =
				'Ce tronçon devra être découpé par un cartographe. Le signalement (Note OSM) arrive avec l’envoi, au lot 3.');
		const v = cleanTrackRef(trackRef);
		if (!v) return (error = 'Indiquez le numéro ou la lettre affichés en gare.');
		save({ 'railway:track_ref': v, check_date: today() }, `Voie ${v}`);
	}

	function verify() {
		const t = el?.tags ?? {};
		const what =
			kind === 'quai'
				? platformTitle(t)
				: kind === 'voie'
					? `Voie ${t['railway:track_ref'] ?? ''}`.trim()
					: 'Pancarte';
		save({ check_date: today() }, `${what} vérifié${kind === 'pancarte' ? 'e' : ''}`);
	}

	async function saveSign() {
		error = '';
		const msg = checkSign(sign);
		if (msg) return (error = msg);
		const input = $state.snapshot(sign) as SignInput;
		const tags = { ...signTags(input), check_date: today() };
		const summary = `Pancarte « ${signSummary(input)} »`;
		if (placed) {
			saving = true;
			try {
				const tempId = nextTempId();
				await saveEdit({
					kind: 'node',
					id: newEditId(),
					station: id,
					createdAt: Date.now(),
					tempId,
					lon: placed.lon,
					lat: placed.lat,
					way: placed.way,
					wayVersion: view?.elements.find((e) => e.type === 'way' && e.id === placed.way)?.version,
					after: placed.after,
					afterNode: (
						ready?.elements.find((e) => e.type === 'way' && e.id === placed.way) as
							OsmWay | undefined
					)?.nodes[placed.after],
					tags,
					summary
				});
				await goto(resolve(`/gare/carte?id=${encodeURIComponent(id)}&focus=node/${tempId}`));
			} catch {
				error = "L'enregistrement sur ce téléphone a échoué. Réessayez.";
			} finally {
				saving = false;
			}
			return;
		}
		// Correction d'une pancarte existante : on remplace toutes les clés railway:signal:stop*.
		const old = el?.tags ?? {};
		const replace: Record<string, string | null> = {};
		for (const k of Object.keys(old))
			if (k.startsWith('railway:signal:stop') && !(k in tags)) replace[k] = null;
		save({ ...replace, ...tags }, summary);
	}

	const choose = (t: SignType) => {
		for (const k of Object.keys(sign) as (keyof SignInput)[])
			if (k !== 'direction' && k !== 'position') delete sign[k];
		sign.type = t;
	};
</script>

<svelte:head><title>Fiche — stationcomplete</title></svelte:head>

<div class="screen">
	<header>
		<a class="icon-btn" href={back} aria-label="Fermer sans enregistrer"
			><span aria-hidden="true">✕</span></a
		>
		<div class="h">
			<h1>{title}</h1>
			<span class="sub">{ready?.station.name ?? ''}</span>
		</div>
	</header>

	<main>
		{#if !mounted || st.status === 'loading' || !pending.loaded}
			<p class="note" role="status">Chargement…</p>
		{:else if st.status === 'error'}
			<p class="note err" role="alert">{st.message}</p>
		{:else if !kind}
			<p class="note">Cet objet n’existe plus dans les données de la gare.</p>
		{:else}
			{#if !survey && !(kind === 'pancarte' && !placed && !correcting)}
				<div class="lock" role="note">
					<Icon name="lock" size={20} />
					<div>
						<p>
							Les numéros et les pancartes se relèvent <strong>sur place</strong>, en restant
							derrière la ligne de sécurité.
						</p>
						<button
							class="btn-small"
							type="button"
							disabled={where.status === 'checking'}
							onclick={() => ready && checkOnSite(ready.station)}
						>
							{where.status === 'checking' ? 'Localisation…' : 'Je suis dans la gare'}
						</button>
						<p class="small">
							Pour essayer depuis chez vous : <a href={resolve('/reglages')}
								>mode démonstration ou serveur de test</a
							>.
						</p>
						{#if where.status === 'away'}<p class="small">
								Votre position est hors de la gare. Vous pouvez seulement vérifier.
							</p>{:else if where.status === 'denied'}<p class="small">
								Position indisponible : autorisez la localisation.
							</p>{/if}
					</div>
				</div>
			{/if}

			{#if kind === 'quai'}
				<fieldset disabled={!survey}>
					<legend>Numéros des voies le long de ce quai</legend>
					<div class="tokens">
						{#each refs as r (r)}
							<span class="token">
								{r}
								<button
									type="button"
									aria-label={`Retirer la voie ${r}`}
									onclick={() => (refs = refs.filter((x) => x !== r))}>✕</button
								>
							</span>
						{/each}
						<label class="add">
							<span class="visually-hidden">Ajouter un numéro de voie</span>
							<input
								bind:value={newRef}
								placeholder="Ajouter"
								inputmode="text"
								autocapitalize="characters"
								onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addRef())}
								onblur={addRef}
							/>
						</label>
					</div>
					<p class="hint">Les numéros affichés au-dessus des voies, pas la lettre du quai.</p>
				</fieldset>
				<fieldset disabled={!survey}>
					<legend
						>Ce quai a-t-il une lettre ou un nom ? <span class="opt">(facultatif)</span></legend
					>
					<label class="field">
						<span class="visually-hidden">Lettre ou nom du quai</span>
						<input
							bind:value={localRef}
							placeholder="Ex. A"
							autocapitalize="characters"
							maxlength="8"
						/>
					</label>
				</fieldset>
			{:else if kind === 'voie'}
				<fieldset disabled={!survey}>
					<legend>Numéro ou lettre affichés en gare</legend>
					<label class="field big">
						<span class="visually-hidden">Numéro de la voie</span>
						<input
							bind:value={trackRef}
							placeholder="Ex. 3"
							autocapitalize="characters"
							maxlength="12"
						/>
					</label>
					<p class="hint">« Voie » ou « V » sont retirés automatiquement.</p>
				</fieldset>
				<fieldset disabled={!survey}>
					<legend>Le numéro change-t-il le long de ce tronçon ?</legend>
					<div class="seg">
						<button type="button" aria-pressed={!changes} onclick={() => (changes = false)}
							>Non</button
						>
						<button type="button" aria-pressed={changes} onclick={() => (changes = true)}
							>Oui</button
						>
					</div>
				</fieldset>
			{:else if kind === 'pancarte'}
				{#if !placed && !correcting}
					<div class="card">
						<p>
							<strong>{el?.tags?.['railway:signal:stop:caption'] ?? 'Pancarte existante'}</strong>
						</p>
						<p class="small">
							Vérifiez sur place qu’elle existe et qu’elle correspond, ou corrigez-la.
						</p>
					</div>
				{:else}
					<fieldset>
						<legend>Quel panneau voyez-vous ?</legend>
						<div class="grid">
							{#each TYPES as ty (ty.t)}
								<button
									type="button"
									class:wide={ty.t === 'other' || !ty.plate}
									aria-pressed={sign.type === ty.t}
									onclick={() => choose(ty.t)}
								>
									{#if ty.plate}<span class="plate">{ty.label}</span>{:else}{ty.label}{/if}
								</button>
							{/each}
							<button
								type="button"
								class="wide"
								disabled
								title="En attente de validation du schéma OSM"
							>
								US / UM (bientôt)
							</button>
						</div>
					</fieldset>

					{#if sign.type === 'nV'}
						<fieldset>
							<legend>Nombre de véhicules écrit sur le panneau</legend>
							<div class="chips">
								{#each ['3', '4', '5', '6', '8', '10'] as v (v)}
									<button
										type="button"
										aria-pressed={sign.number === v}
										onclick={() => (sign.number = v)}>{v}</button
									>
								{/each}
								<label class="mini">
									<span class="visually-hidden">Autre nombre</span>
									<input
										inputmode="numeric"
										placeholder="Autre"
										maxlength="2"
										bind:value={sign.number}
									/>
								</label>
							</div>
						</fieldset>
					{:else if sign.type === 'L'}
						<fieldset>
							<legend>Longueur écrite sur le panneau (m)</legend>
							<div class="chips">
								{#each ['110', '160', '220', '300', '400'] as v (v)}
									<button
										type="button"
										aria-pressed={sign.number === v}
										onclick={() => (sign.number = v)}>{v}</button
									>
								{/each}
							</div>
						</fieldset>
					{:else if sign.type === 'Z57' || sign.type === 'Z50' || sign.type === 'TGV'}
						<fieldset>
							<legend>Texte sous « {sign.type} »</legend>
							<div class="chips">
								{#if sign.type === 'Z57'}
									{#each [['1', 'single_unit', '1'], ['1-2', undefined, '1;2'], ['2', 'multiple_unit', '2'], ['2-3', 'multiple_unit', '2;3'], ['3', 'multiple_unit', '3']] as [lab, unit, num] (lab)}
										<button
											type="button"
											aria-pressed={sign.number === num}
											onclick={() => ((sign.number = num), (sign.unit = unit as SignInput['unit']))}
											>{lab}</button
										>
									{/each}
								{:else}
									{#each [['1', 'single_unit'], ['2', 'multiple_unit'], ['1-2', undefined]] as [lab, unit] (lab)}
										<button
											type="button"
											aria-pressed={sign.unit === unit && (sign.type !== 'TGV' || !sign.duplex)}
											onclick={() => (
												(sign.unit = unit as SignInput['unit']),
												(sign.duplex = false)
											)}>{lab}</button
										>
									{/each}
									{#if sign.type === 'TGV'}
										<button
											type="button"
											aria-pressed={!!sign.duplex}
											onclick={() => ((sign.unit = 'multiple_unit'), (sign.duplex = true))}
											>2D</button
										>
									{/if}
								{/if}
								{#if sign.type !== 'Z50'}
									<button
										type="button"
										aria-pressed={!!sign.reversal}
										onclick={() => (sign.reversal = !sign.reversal)}>RBT</button
									>
								{/if}
							</div>
						</fieldset>
					{:else if sign.type === 'other'}
						<fieldset>
							<legend>Texte de la pancarte</legend>
							<label class="field">
								<span class="visually-hidden">Texte lu sur la pancarte</span>
								<input bind:value={sign.caption} maxlength="40" placeholder="Recopiez le texte" />
							</label>
						</fieldset>
					{/if}

					<fieldset>
						<legend>Les trains qui lisent ce panneau vont…</legend>
						<div class="seg">
							<button
								type="button"
								aria-pressed={sign.direction === 'backward'}
								onclick={() => (sign.direction = 'backward')}>{dirName(true)}</button
							>
							<button
								type="button"
								aria-pressed={sign.direction === 'forward'}
								onclick={() => (sign.direction = 'forward')}>{dirName(false)}</button
							>
						</div>
					</fieldset>
					<fieldset>
						<legend>Vu du conducteur, le panneau est…</legend>
						<div class="seg four">
							{#each [['left', 'À gauche'], ['right', 'À droite'], ['in_track', 'Entre les rails'], ['ground', 'Au sol']] as [v, lab] (v)}
								<button
									type="button"
									aria-pressed={sign.position === v}
									onclick={() => (sign.position = v as SignInput['position'])}>{lab}</button
								>
							{/each}
						</div>
					</fieldset>
					<p class="hint">
						Une plaque avec une seule lettre (A, B…) n’est pas une pancarte d’arrêt : c’est un
						repère de quai.
					</p>
				{/if}
			{/if}

			{#if error}<p class="note err" role="alert">{error}</p>{/if}
		{/if}
	</main>

	{#if kind}
		<footer>
			{#if kind === 'pancarte' && !placed && !correcting}
				<button class="btn btn-secondary" type="button" disabled={saving} onclick={verify}
					>C’est correct</button
				>
				<button class="btn" type="button" disabled={!survey} onclick={() => (correcting = true)}
					>Corriger</button
				>
			{:else}
				{#if !placed && (el?.tags?.ref || el?.tags?.['railway:track_ref'])}
					<button class="btn btn-secondary" type="button" disabled={saving} onclick={verify}
						>C’est correct</button
					>
				{/if}
				<button
					class="btn"
					type="button"
					disabled={saving || !survey}
					onclick={kind === 'quai' ? saveQuai : kind === 'voie' ? saveVoie : saveSign}
				>
					Enregistrer
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
		text-decoration: none;
		font-size: 1.25rem;
	}
	.h {
		display: flex;
		flex-direction: column;
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
		gap: 18px;
	}
	fieldset {
		border: 0;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	fieldset:disabled {
		opacity: 0.55;
	}
	legend {
		padding: 0;
		margin-bottom: 8px;
		font-weight: 700;
		font-size: 1.0625rem;
	}
	.opt {
		font-weight: 400;
		color: var(--text-2);
	}
	.hint,
	.small {
		margin: 0;
		font-size: 0.9375rem;
		color: var(--text-2);
	}
	.note {
		margin: 0;
		color: var(--text-2);
	}
	.err {
		color: var(--danger);
		font-weight: 700;
	}
	.lock {
		display: flex;
		gap: 10px;
		padding: 12px 14px;
		border-radius: var(--radius);
		background: var(--surface);
	}
	.lock p {
		margin: 0 0 8px;
	}
	.card {
		padding: 14px;
		border-radius: var(--radius);
		background: var(--surface);
	}
	.card p {
		margin: 0;
	}
	input {
		font: 1.0625rem var(--font);
		color: var(--text);
		background: var(--bg);
		border: 2px solid var(--text-2);
		border-radius: 12px;
		min-height: 48px;
		padding: 0 12px;
		width: 100%;
	}
	input:focus {
		border-color: var(--primary);
		outline: none;
	}
	.field.big input {
		font-size: 1.5rem;
		font-weight: 700;
		max-width: 200px;
	}
	.tokens {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
	}
	.token {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		min-height: 44px;
		padding: 0 4px 0 14px;
		border-radius: 22px;
		background: var(--voie);
		color: #fff;
		font-weight: 700;
		font-size: 1.0625rem;
	}
	.token button {
		width: 36px;
		height: 36px;
		border: 0;
		border-radius: 18px;
		background: transparent;
		color: inherit;
		cursor: pointer;
	}
	.add {
		width: 110px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 6px;
	}
	.grid button,
	.chips button,
	.seg button {
		min-height: 50px;
		border: 2px solid var(--border);
		border-radius: 12px;
		background: var(--bg);
		color: var(--text);
		font: 700 0.9375rem var(--font);
		cursor: pointer;
	}
	.grid button.wide {
		grid-column: span 2;
	}
	.grid button[aria-pressed='true'],
	.chips button[aria-pressed='true'],
	.seg button[aria-pressed='true'] {
		border: 3px solid var(--primary);
		background: color-mix(in srgb, var(--primary) 14%, var(--bg));
		color: var(--primary);
	}
	.grid button:disabled {
		opacity: 0.5;
		cursor: default;
		border-style: dashed;
	}
	.plate {
		padding: 2px 6px;
		border: 2px solid #1a1d21;
		border-radius: 3px;
		background: #fff;
		color: #1a1d21;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.chips button {
		min-width: 48px;
		padding: 0 12px;
		border-radius: 24px;
	}
	.mini {
		width: 90px;
	}
	.seg {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}
	.seg.four {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
	.seg.four button {
		font-size: 0.8125rem;
	}
	.btn-small {
		min-height: 44px;
		padding: 0 14px;
		border: 2px solid var(--primary);
		border-radius: 12px;
		background: var(--bg);
		color: var(--primary);
		font: 700 0.9375rem var(--font);
		cursor: pointer;
	}
	footer {
		position: sticky;
		bottom: 0;
		display: flex;
		gap: 8px;
		padding: 12px 20px calc(16px + env(safe-area-inset-bottom));
		border-top: 1px solid var(--border);
		background: var(--bg);
	}
	footer .btn:disabled {
		opacity: 0.5;
		cursor: default;
	}
</style>
