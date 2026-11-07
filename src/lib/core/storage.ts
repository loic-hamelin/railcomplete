// Clés du stockage local (IndexedDB), partagées par la consultation et le hors-ligne. Code pur.
//
// Lot P1 (organisation par pays) : les clés ne contiennent pas le pays. L'identifiant d'une
// gare est son identifiant OSM (« n123 »), unique dans le monde ; une gare frontalière n'est
// que dans un index. Les gares en cache et les saisies en attente enregistrées avant le lot P1
// restent donc valides sans migration ; leur pays se lit avec recordCountry (countries.ts).

/** Clé d'une gare en cache : une gare du serveur de test ne se mélange pas à la vraie. */
export const stationCacheKey = (server: string, id: string) =>
	server === 'prod' ? id : `${server}:${id}`;
