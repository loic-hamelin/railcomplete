<script lang="ts">
	// E9 — Mes contributions : saisies en attente d'envoi, regroupées par gare.
	import { resolve } from '$app/paths';
	import BottomNav from '#lib/BottomNav.svelte';
	import Icon from '#lib/Icon.svelte';
	import type { Edit } from '#lib/core/edits.js';
	import { loadEdits, mine, pending, removeEdit } from '#lib/edits.svelte.js';
	import { srv } from '#lib/osmserver.svelte.js';
	import { loadStations, type Station } from '#lib/stations.js';
	import { onMount } from 'svelte';

	let names = $state<Record<string, Station>>({});
	let confirmId = $state('');
	onMount(async () => {
		await loadEdits();
		try {
			const wanted = new Set(mine().map((e) => e.station));
			names = Object.fromEntries(
				(await loadStations()).stations.filter((s) => wanted.has(s.id)).map((s) => [s.id, s])
			);
		} catch {
			/* noms des gares indisponibles : on affiche l'identifiant */
		}
	});

	const groups = $derived.by(() => {
		const by: Record<string, Edit[]> = {};
		for (const e of mine()) (by[e.station] ??= []).push(e);
		return Object.entries(by).map(([station, edits]) => ({ station, edits }));
	});
	const icon = (e: Edit) =>
		e.kind === 'node'
			? 'pancarte'
			: e.kind === 'way'
				? 'quai'
				: e.target.startsWith('node/')
					? 'pancarte'
					: e.summary.startsWith('Quai')
						? 'quai'
						: 'voie';
	const when = (t: number) =>
		new Date(t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
</script>

<svelte:head><title>Mes contributions — stationcomplete</title></svelte:head>

<div class="screen">
	<main>
		<h1>Mes contributions</h1>
		<p class="intro">
			Vos saisies restent sur ce téléphone, même sans réseau, jusqu’à leur envoi gare par gare.
			Serveur : <strong>{srv().label}</strong>.
		</p>

		{#if !pending.loaded}
			<p class="note" role="status">Chargement…</p>
		{:else if !groups.length}
			<div class="empty">
				<p>Aucune saisie en attente.</p>
				<a class="btn" href={resolve('/gares')}>Choisir une gare</a>
			</div>
		{:else}
			{#each groups as g (g.station)}
				<section>
					<h2>
						<a href={resolve(`/gare?id=${encodeURIComponent(g.station)}`)}
							>{names[g.station]?.name ?? g.station}</a
						>
						<span>{g.edits.length} saisie{g.edits.length > 1 ? 's' : ''}</span>
					</h2>
					<ul>
						{#each g.edits as e (e.id)}
							<li class={icon(e)}>
								<Icon name={icon(e)} size={24} />
								<span class="txt">
									<span class="sum">{e.summary}</span>
									<span class="meta"
										>{e.kind === 'node' ? 'Nouvelle pancarte' : 'Modification'} · {when(
											e.createdAt
										)}</span
									>
								</span>
								{#if confirmId === e.id}
									<button class="danger" type="button" onclick={() => removeEdit(e.id)}
										>Confirmer</button
									>
								{:else}
									<button
										type="button"
										aria-label={`Retirer : ${e.summary}`}
										onclick={() => (confirmId = e.id)}>Retirer</button
									>
								{/if}
							</li>
						{/each}
					</ul>
					<a class="btn send" href={resolve(`/envoi?id=${encodeURIComponent(g.station)}`)}>
						Relire et envoyer{#if g.edits.some((e) => e.conflict)}
							· {g.edits.filter((e) => e.conflict).length} à revoir{/if}
					</a>
				</section>
			{/each}
		{/if}
	</main>
	<BottomNav current="contributions" />
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
		padding: 24px 20px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	h1 {
		margin: 0;
		font-size: 1.625rem;
	}
	.intro,
	.note {
		margin: 0;
		color: var(--text-2);
	}
	.empty {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.empty p {
		margin: 0;
	}
	h2 {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin: 8px 0 4px;
		font-size: 1.0625rem;
	}
	h2 span {
		font-size: 0.875rem;
		font-weight: 400;
		color: var(--text-2);
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
	.txt {
		flex-grow: 1;
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
	.send {
		margin-top: 10px;
	}
	li button {
		min-height: 44px;
		padding: 0 12px;
		border: 2px solid var(--border);
		border-radius: 12px;
		background: var(--bg);
		color: var(--text);
		font: 700 0.875rem var(--font);
		cursor: pointer;
	}
	li button.danger {
		border-color: var(--danger);
		color: var(--danger);
	}
</style>
