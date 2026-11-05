# Tests des services tiers — lot 0a

_5 novembre 2026, navigateur Chromium (navigateur intégré de l'appli Claude, ordinateur de Loïc), depuis une page d'une autre origine (`https://example.org`), avec `fetch(…, { mode: 'cors' })`._

## 1. Tuiles IGN BD ORTHO (Géoplateforme, WMTS `ORTHOIMAGERY.ORTHOPHOTOS`, matrice `PM`)

| Zoom | Statut | Type       | Taille  | Cache HTTP                            |
| ---- | ------ | ---------- | ------- | ------------------------------------- |
| 17   | 200    | image/jpeg | 20,6 ko | `private, max-age=1814400` (21 jours) |
| 18   | 200    | image/jpeg | 17,9 ko | idem                                  |
| 19   | 200    | image/jpeg | 12,2 ko | idem                                  |
| 20   | 404    | text/xml   | —       | —                                     |

- **CORS : autorisé.** La requête en mode `cors` depuis une autre origine aboutit et le contenu est lisible. MapLibre pourra donc afficher l'ortho, et le service worker pourra la mettre en cache (réponses non opaques). Le risque R3 est levé.
- **Zoom maximal : 19** (environ 30 cm par pixel à la latitude de Lyon). Au-delà, MapLibre agrandit la tuile 19 (`maxzoom: 19` sur la source raster).
- Taille moyenne d'une tuile : 12 à 20 ko, soit environ 6 à 10 Mo pour une zone hors-ligne de ±800 m aux zooms 17 à 19 (estimation à affiner au lot 4).

## 2. API OSM `GET /api/0.6/map` (emprise d'environ ±400 m autour de la gare)

| Gare              | Statut | Durée | Taille décompressée | Nœuds  | Ways  | Quais | Voies `railway=rail` | `railway:track_ref` | Pancartes `railway:signal:stop` |
| ----------------- | ------ | ----- | ------------------- | ------ | ----- | ----- | -------------------- | ------------------- | ------------------------------- |
| Ambérieu-en-Bugey | 200    | 1,0 s | 2,9 Mo              | 8 187  | 950   | 4     | 118                  | 38                  | 0                               |
| Lyon Part-Dieu    | 200    | 3,3 s | 11,2 Mo             | 17 806 | 3 058 | 21    | 168                  | 156                 | 0                               |

- **CORS : autorisé.**
- Le volume réellement transféré (compressé) n'a pas pu être mesuré : le navigateur le masque pour une autre origine. Il est sans doute 5 à 10 fois plus petit, à mesurer depuis l'appli au lot 1.
- **Les volumes décompressés sont bien supérieurs aux estimations** du dossier d'architecture : l'emprise doit être serrée sur les quais et les voies (polygone `landuse=railway` ou emprise des quais + 50 m), et non un carré de ±400 m. À traiter au lot 1 (emprise précalculée dans l'index).
- **Aucune pancarte d'arrêt** n'est cartographiée dans ces deux gares : l'appli a de quoi faire.
- Les numéros de voie (`railway:track_ref`) existent déjà en partie : le moteur de quêtes devra bien distinguer « manquant » et « à vérifier ».

## 3. Conséquences sur le plan

- Lot 0a : critère « compte rendu CORS IGN » **rempli**.
- Lot 1 : ajouter la mesure de la taille compressée et le calcul d'une emprise serrée.
- Architecture § 6 et R3 : CORS IGN confirmé ; zoom max 19 confirmé.
