// Clés des messages, tirées du dictionnaire source (français) : TypeScript refuse une clé
// inconnue. Fichier de types seulement (rien n'est chargé à l'exécution).
import type Fr from './messages/fr.json';

type Leaves<T, P extends string = ''> = {
	[K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

/** Clé d'un message (« station.title », « quest.q1.title »…). */
export type MessageKey = Leaves<typeof Fr>;
