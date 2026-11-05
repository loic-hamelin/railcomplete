// « Sur place » : la position GPS, demandée ponctuellement, tombe dans l'emprise de la gare.
// Les numéros et les pancartes ne se saisissent que sur place (décision du 5 novembre 2026),
// sauf en mode démonstration. Le GPS n'est jamais suivi en continu (sobriété).

import { settings } from './edits.svelte.js';
import { isOnSite, type Station } from './stations.js';

type Status = 'unknown' | 'checking' | 'onsite' | 'away' | 'denied';
export const where = $state<{ status: Status; station?: string; at?: number }>({
	status: 'unknown'
});

const FRESH_MS = 10 * 60 * 1000;

export function checkOnSite(station: Station) {
	if (!('geolocation' in navigator)) {
		where.status = 'denied';
		return;
	}
	where.status = 'checking';
	navigator.geolocation.getCurrentPosition(
		(p) => {
			const ok = isOnSite(station, p.coords.latitude, p.coords.longitude, p.coords.accuracy);
			where.status = ok ? 'onsite' : 'away';
			where.station = station.id;
			where.at = Date.now();
		},
		() => (where.status = 'denied'),
		{ enableHighAccuracy: true, maximumAge: 60_000, timeout: 20_000 }
	);
}

/** Peut-on saisir ce qui se lit sur le terrain dans cette gare ? */
export function canSurvey(stationId: string) {
	if (settings.demo) return true;
	return (
		where.status === 'onsite' &&
		where.station === stationId &&
		Date.now() - (where.at ?? 0) < FRESH_MS
	);
}
