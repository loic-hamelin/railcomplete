// Textes des quêtes pour l'interface (E4, E5). Regroupe les quêtes identiques.

import { platformTitle } from './core/features.js';
import type { Quest, QuestId, StationAnalysis } from './core/quests.js';

export type Kind = 'quai' | 'voie' | 'pancarte' | 'alerte' | 'verif';

export interface QuestGroup {
	id: QuestId;
	kind: Kind;
	title: string;
	subtitle?: string;
	count: number;
	onSite: boolean;
	quests: Quest[];
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

export function platformLabel(a: StationAnalysis, ref?: { id: number }) {
	const p = a.platforms.find((x) => x.ref.id === ref?.id);
	return p ? platformTitle(p.tags) : 'Quai';
}

export function groupQuests(a: StationAnalysis): QuestGroup[] {
	const by = new Map<QuestId, Quest[]>();
	for (const q of a.quests) by.set(q.id, [...(by.get(q.id) ?? []), q]);
	const groups: QuestGroup[] = [];
	for (const [id, qs] of by) {
		const n = qs.length;
		const base = { id, count: n, onSite: qs[0].onSite, quests: qs };
		switch (id) {
			case 'Q0':
				groups.push({
					...base,
					kind: 'alerte',
					title: 'Aucun quai cartographié',
					subtitle: 'Vous pourrez le dessiner sur la photo aérienne'
				});
				break;
			case 'Q1':
				groups.push({
					...base,
					kind: 'quai',
					title: plural(n, 'quai sans numéro', 'quais sans numéro')
				});
				break;
			case 'Q2':
				groups.push({
					...base,
					kind: 'voie',
					title: plural(n, 'voie à quai sans numéro', 'voies à quai sans numéro')
				});
				break;
			case 'Q3':
				groups.push({
					...base,
					kind: 'quai',
					title: plural(
						n,
						'quai dont les numéros sont à vérifier',
						'quais dont les numéros sont à vérifier'
					),
					subtitle: 'Les numéros du quai et ceux des voies ne correspondent pas'
				});
				break;
			case 'Q4':
				groups.push({
					...base,
					kind: 'pancarte',
					title: plural(
						n,
						'côté de quai sans pancarte d’arrêt',
						'côtés de quai sans pancarte d’arrêt'
					),
					subtitle: [...new Set(qs.map((q) => platformLabel(a, q.platform)))].slice(0, 3).join(', ')
				});
				break;
			case 'Q5':
				groups.push({
					...base,
					kind: 'pancarte',
					title: plural(n, 'pancarte à compléter', 'pancartes à compléter')
				});
				break;
			case 'Q6':
				groups.push({
					...base,
					kind: 'verif',
					title: plural(n, 'objet à vérifier', 'objets à vérifier'),
					subtitle: 'Faisable aussi à distance'
				});
				break;
			case 'Q7':
				groups.push({
					...base,
					kind: 'alerte',
					title:
						qs[0].details?.motif === 'numéro en double'
							? `Deux voies portent le numéro ${qs[0].details?.ref}`
							: plural(n, 'numéro de voie mal placé', 'numéros de voie mal placés'),
					subtitle: 'À vérifier en priorité'
				});
				break;
		}
	}
	return groups;
}
