# stationcomplete : étude de faisabilité « Suisse, deuxième pays »

_Étude du 7 novembre 2026. Dépôt lu en lecture seule : `/home/claude/stationcomplete` (aucune modification)._

> **Méthode.** Chaque affirmation sur la Suisse est suivie de sa source (URL). Ce qui n'a pas pu être vérifié est marqué **[non vérifié]**. Les tests réseau (curl) ont été faits depuis le shell de l'environnement d'étude, derrière un proxy ; leurs limites sont signalées.

Sommaire

1. Photo aérienne : swisstopo SWISSIMAGE
2. Liste des gares suisses
3. Balisage OSM suisse des quais et des voies
4. Pancartes d'arrêt : l'équivalent suisse
5. Communauté OSM suisse et règles
6. Conséquences techniques pour l'appli
7. Recommandation, risques, prérequis, questions à Loïc

---

## 1. Photo aérienne : swisstopo SWISSIMAGE

### 1.1 Le produit

- **SWISSIMAGE 10 cm** : orthophotomosaïque nationale, « 10 cm in the plain areas and main alpine valleys and 25 cm over the Alps », précision ±0,15 m, « updated in a cycle of 3 years ». Source : [swisstopo – SWISSIMAGE 10 cm](https://www.swisstopo.admin.ch/en/orthoimage-swissimage-10). C'est **meilleur que la BD ORTHO IGN** (20 cm) en plaine, donc plus confortable pour dessiner des quais.
- **Fraîcheur** : la mosaïque est mise à jour canton par canton. Le cycle « images 2025 » s'est achevé le 10 septembre 2026 (Uri), après Zurich, Schaffhouse, Zoug (nov. 2025), Thurgovie (déc. 2025), Schwyz (janv. 2026), Saint-Gall/Appenzell/Liechtenstein (févr. 2026), Glaris (mai 2026), Grisons (août 2026). Les images 2024 couvrent Argovie, Lucerne, Berne, Tessin (2025, avec des zones non survolées pour cause de météo). Source : [swisstopo – News overview](https://www.swisstopo.admin.ch/en/news-overview). Le reste du pays (Romandie notamment) date du cycle précédent **[non vérifié canton par canton]**. Chaque tuile du téléchargement porte l'année de vol majoritaire (≥ 70 %) ([même page produit](https://www.swisstopo.admin.ch/en/orthoimage-swissimage-10)).

### 1.2 Service de tuiles public

- **Gabarit XYZ en Web Mercator documenté par la Confédération** :
  `https://wmts.geo.admin.ch/1.0.0/{LayerName}/{StyleName}/{Time}/3857/{z}/{x}/{y}.{FormatExtension}`. Les couches `ch.swisstopo.swissimage*` sont servies en `jpeg`. Source : [docs.geo.admin.ch – XYZ](https://docs.geo.admin.ch/visualize-data/xyz.html).
- **URL candidate pour stationcomplete** (déduite de ce gabarit, nom de couche `ch.swisstopo.swissimage`, style `default`, temps `current`) :
  `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg`
  Le schéma `{z}/{x}/{y}` est le même que celui que MapLibre attend : aucune conversion n'est nécessaire, contrairement à l'IGN (paramètres `TILEROW`/`TILECOL` dans une URL KVP).
- La documentation WMTS précise qu'il faut en principe construire les requêtes à partir du `ResourceURL` des capacités : `https://wmts.geo.admin.ch/EPSG/3857/1.0.0/WMTSCapabilities.xml` ([docs.geo.admin.ch – WMTS](https://docs.geo.admin.ch/visualize-data/wmts.html)). Ce fichier **n'a pas pu être lu** (refusé par l'outil web et par le proxy du shell).
- **Zoom maximal en 3857 : [non vérifié]**. La documentation ne donne de table de zooms que pour la projection suisse LV95 (niveaux 27-28 à 0,25 et 0,1 m « only available for a few layers », dont SWISSIMAGE). Un projet tiers (gpx.studio) utilise `maxzoom: 18` pour la carte topographique `pixelkarte-farbe`, pas pour SWISSIMAGE ([commit gpx.studio](https://code.stevenpolley.net/steven/gpx.studio/commit/13c7574e25a39f1aaa9f55a82e490bf6f7cb9acb)). **À mesurer** avant le lot P3 : demander les tuiles z = 18, 19, 20, 21 d'une gare (ex. Berne) depuis un navigateur et noter le dernier niveau qui répond 200 avec une image distincte. Si le service s'arrête à 18, MapLibre agrandira (comme aujourd'hui au-delà de 19 pour l'IGN) mais le tracé fin des quais sera moins précis.
- **Clé d'API** : aucune inscription préalable n'est exigée (« does not require prior registration ») ([swisstopo – Geoservices](https://www.swisstopo.admin.ch/en/geoservices-with-swisstopo-geodata) ; CGU IFDG § 2.2).
- **CORS : [non vérifié]**. Le test curl (en-tête `Origin: https://stationcomplete.org`) a échoué : le proxy de l'environnement d'étude refuse la connexion à `wmts.geo.admin.ch` (HTTP 403 au CONNECT). La documentation consultée ne parle pas de CORS. Indice indirect seulement : la documentation renvoie à un exemple OpenLayers hébergé sur codesandbox.io, donc chargé depuis une autre origine ([docs.geo.admin.ch – XYZ](https://docs.geo.admin.ch/visualize-data/xyz.html)). Pour un `<img>`/raster MapLibre, le CORS est de toute façon requis (MapLibre charge les tuiles en `fetch`/`crossOrigin`), ainsi que pour le cache du service worker. **Test à faire par Loïc en une minute** : dans la console du navigateur sur stationcomplete.org, `fetch('https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/18/136400/91550.jpeg').then(r=>console.log(r.status, r.headers.get('access-control-allow-origin')))`.

### 1.3 Conditions d'utilisation

- **Gratuité et usage libre** : « The acquisition and use of data or services is free of charge, subject to the provisions on fair use. » Les conditions OGD de swisstopo « allow free use for all purposes » et « oblige the user to indicate the source ». Sources : [CGU de l'infrastructure fédérale de données géographiques (IFDG)](https://www.geo.admin.ch/en/general-terms-of-use-fsdi), [swisstopo – Conditions geodata](https://www.swisstopo.admin.ch/en/conditions-geodata).
- **Usage raisonnable (fair use)** : l'intégration de géoservices dans des applications web d'en moyenne **20 000 utilisateurs par jour** est considérée comme du fair use ; au-delà, contacter `info@geo.admin.ch`. L'exploitation automatisée à forte intensité est à éviter ; « for offline systems or databases, use the download service ». Source : [CGU IFDG § 2.3](https://www.geo.admin.ch/en/general-terms-of-use-fsdi). Conséquence : le **téléchargement hors-ligne d'une gare** (quelques centaines de tuiles, à la demande d'un humain) reste raisonnable, mais un **pré-chargement massif** serait à proscrire. La CGU ne traite pas explicitement le cache côté client **[point à faire confirmer par swisstopo si l'on veut être irréprochable]**.
- **Disponibilité** : « best-effort », 98 % annoncés ; changements non rétrocompatibles annoncés un mois à l'avance (CGU IFDG § 2.1 et 5.2).
- **Attribution** : la CGU IFDG renvoie à la mention visible dans le visualiseur, **« © Data: swisstopo »** ([CGU IFDG § 3](https://www.geo.admin.ch/en/general-terms-of-use-fsdi)). La FAQ swisstopo demande idéalement la source à côté de la donnée affichée, sinon une page centrale liée depuis l'application ; pour les données dérivées, on peut préfixer « dérivé de » ([swisstopo – Attribution FAQ](https://www.swisstopo.admin.ch/en/source-reference-ogd-swisstopo)). **Proposition** : sur la carte « Photo © swisstopo – SWISSIMAGE » (ou « © Data: swisstopo »), et dans À propos / Mentions légales une ligne dédiée.

### 1.4 Peut-on tracer dans OSM avec SWISSIMAGE ?

- **Oui, c'est l'état actuel documenté par la communauté suisse**, avec un historique à connaître :
  - Le 8 mars 2021, l'association SOSM annonce l'ouverture des données swisstopo (OGD, attribution seule, depuis début mars 2021) et indique que swisstopo a accepté que SWISSIMAGE soit proposé dans les éditeurs OSM ; l'usage direct des autres données était alors bloqué faute d'accord sur l'attribution centralisée. **Mise à jour du 14 septembre 2021** : « central attribution is acceptable for uses that combine many different data sources ». Source : [sosm.ch – Use of swisstopo data and products with and in OpenStreetMap](https://sosm.ch/use-of-swisstopo-data-and-products-with-and-in-openstreetmap/).
  - Le wiki OSM : « Use of the swissimage orthophotos is unproblematic », les objets digitalisés étant des dérivés ; à partir du 14 septembre 2021 les sources ouvertes de swisstopo sont utilisables dans OSM ; il faut citer la source dans le changeset et inscrire toute nouvelle source swisstopo sur la page Contributors. Le wiki signale aussi qu'à un moment swisstopo « has in the mean time changed their position on the terms for use of imagery », note antérieure à la clarification de septembre 2021. Page modifiée pour la dernière fois le 22 avril 2025. Source : [wiki OSM – Swisstopo data use](https://wiki.openstreetmap.org/wiki/Swisstopo_data_use).
  - La page [Switzerland/Datasources](https://wiki.openstreetmap.org/wiki/Switzerland/Datasources) classe SWISSIMAGE dans « Compliant aerial imagery », résolution 10-25 cm, « 3 year cycle rolling updates », **valeur de source recommandée : `swissimage (swisstopo)`**. Elle liste aussi des orthophotos cantonales (Genève SITG 5-20 cm, Zurich 10 cm, Bâle-Ville, Soleure, Neuchâtel, Zoug, Thurgovie…), certaines hors service.
- **editor-layer-index : [non vérifié]**. Le dépôt GitHub `osmlab/editor-layer-index` n'a pas pu être consulté depuis l'environnement (accès refusé). Je n'ai donc pas pu confirmer l'identifiant exact de l'entrée SWISSIMAGE ni la valeur que iD écrit dans `imagery_used`. À vérifier dans `sources/europe/ch/` avant de choisir la valeur du tag de changeset ; à défaut, utiliser **`imagery_used=swissimage (swisstopo)`** et `source=survey;swissimage (swisstopo)` selon le cas, conformément au wiki suisse.
- **Recommandation** : SWISSIMAGE convient pour stationcomplete. Les orthophotos cantonales ne sont pas utiles en première approche (couverture partielle, services hétérogènes, certains éteints) : une seule source nationale est la solution durable.

---

## 2. Liste des gares suisses

### 2.1 Extrait OSM

- **Geofabrik** : `europe/switzerland-latest.osm.pbf`, **463 Mo** (France : 4,4 Go), relevé le 7 novembre 2026 sur [download.geofabrik.de/europe.html](https://download.geofabrik.de/europe.html). « Most of these files are updated every day » ([Geofabrik – Download server](https://www.geofabrik.de/data/download.html)). La page Suisse de Geofabrik (polygone, inclusion ou non du Liechtenstein) **n'a pas pu être lue** (refus de l'outil web).
- **Alternative suisse** : [planet.osm.ch](https://planet.osm.ch/) (serveur de la communauté) propose `switzerland-exact.osm.pbf` (599 Mo, frontière exacte, polygone `switzerland-exact.poly`) et `switzerland-padded.osm.pbf` (768 Mo, frontière + 10 km, « includes Liechtenstein »), mis à jour toutes les heures. **Recommandation** : rester sur Geofabrik pour l'homogénéité avec la France (même tâche CI, même fournisseur), et découper au polygone exact pour éviter les doublons frontaliers ; planet.osm.ch reste un secours.
- Effet sur la CI : le traitement suisse prend une fraction du temps du traitement français (10 fois moins de données). Pas de risque de dépassement du runner GitHub.

### 2.2 Tags des gares voyageurs en Suisse

- **`railway=station` / `railway=halt`** : en Suisse, comme dans les pays germanophones, une gare sans aiguillage où ne s'arrêtent que des trains voyageurs est en général taguée `halt` ([Tag:railway=station](https://wiki.openstreetmap.org/wiki/Tag:railway=station)). Le script actuel traite déjà les deux.
- **`uic_ref`** : numéro DIDOK au format `85XXXXX` (ex. `8502113` pour Aarau), importé en 2010 (compte `DidokImportCH`) avec `uic_name`, `operator` (abréviation officielle : `SBB`, `VBZ`…). Source : [Switzerland/DIDOK](https://wiki.openstreetmap.org/wiki/Switzerland/DIDOK). Pour les gares, `name` = nom de la gare (« Aarau »).
- **`operator`** : abréviation officielle du registre de l'Office fédéral des transports (OFT/BAV), ex. `operator=SBB` ; `network` = canton ou communauté tarifaire (`network=ZVV`) pour le régional. Source : [Switzerland:Public Transport/Railways](https://wiki.openstreetmap.org/wiki/Switzerland:Public_Transport/Railways) (modifiée le 26 juillet 2025). Attention : en Suisse la valeur est en **allemand** (`SBB`), pas `CFF`/`FFS`.
- **Nouveaux identifiants (2026)** : la communauté a acté au forum (juin-novembre 2026) la clé **`ref:sloid`** (Swiss Location ID, par arrêt et **par quai** : `ch:1:sloid:2113` pour Aarau, `ch:1:sloid:2113:1` pour son quai 1), en conservant `uic_ref` ; **ne pas** utiliser `ref:IFOPT`. Des ajouts semi-automatiques, vérifiés à la main, sont en cours (MapTapir/OSMDiffs). Sources : [forum – Public Transport Stops Swiss Location Identification (sloid)](https://community.openstreetmap.org/t/public-transport-stops-swiss-location-identification-sloid/144753), [forum – New public transport ids/modelling in Switzerland](https://community.openstreetmap.org/t/new-public-transport-ids-modelling-in-switzerland/139323) (déc. 2025 : SKI+, CFF et OFT souhaitent ces identifiants dans OSM). **Conséquence** : stationcomplete ne doit pas toucher `ref:sloid`/`uic_ref`, mais peut les **lire** (identifier un quai de façon stable, afficher le numéro officiel).
- **Nombre de gares** : « rund 1800 Bahnhöfe » en Suisse selon la presse ([Südostschweiz, 29 sept. 2026](https://www.suedostschweiz.ch/schweiz-und-welt/knapp-zwei-drittel-der-bahnhoefe-in-der-schweiz-sind-barrierefrei-2-2179388)). L'index stationcomplete suisse devrait donc compter **de l'ordre de 1 700 à 2 000 lignes** selon les règles de sélection **[à mesurer en CI]**, soit environ la moitié de l'index français (3 286 gares) ; poids estimé ~200 ko brut, ~50 ko gzip, par proportion avec `stations-fr.json` (428 ko brut).

### 2.3 Cas particuliers suisses (règles de sélection)

Règles actuelles (`isRailStation` dans `scripts/build-stations.mjs`) : exclut `station=subway|light_rail|monorail|funicular|tram`, `usage=tourism`, `tourism=yes`, `train=no`.

| Cas                                                                                        | Situation suisse                                                                                                                | Règle proposée                                                                                                                                                  |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Funiculaires                                                                               | Très nombreux (ex. stations de montagne) ; tagués `station=funicular` selon le schéma général **[pratique suisse non mesurée]** | Exclusion conservée : pas de quai numéroté ni de pancarte d'arrêt utile                                                                                         |
| Chemins de fer à crémaillère et lignes de montagne (Gornergrat, Jungfrau, Rigi…)           | Ce sont des trains (`railway=rail` + crémaillère `rack=*`) ; gares souvent `railway=station`                                    | **Inclure** par défaut (ce sont des gares avec quais), mais prévoir une liste d'exclusion manuelle si des gares touristiques sans intérêt polluent la recherche |
| Voie métrique (RhB, MOB, MGB, zb, RBS…)                                                    | Réseaux voyageurs à part entière, quais et numéros de voie                                                                      | Inclure (rien à changer)                                                                                                                                        |
| Tram                                                                                       | Arrêts `railway=tram_stop`, non sélectionnés                                                                                    | Rien à changer                                                                                                                                                  |
| Métro de Lausanne (m1/m2), lignes `light_rail` (ex. Forchbahn, Lausanne–Échallens ?)       | Taggage variable **[non vérifié]**                                                                                              | Exclusion actuelle conservée ; à revoir sur les statistiques du premier index                                                                                   |
| Gares frontalières (Genève, Bâle SBB / Bad Bf, Chiasso, Schaffhouse, Kreuzlingen–Konstanz) | Présentes dans les deux extraits ; Bâle Bad Bf (DB) est en Suisse                                                               | Découpe au polygone + dédoublonnage par identifiant OSM entre index                                                                                             |
| Liechtenstein                                                                              | 3 haltes ÖBB (Schaan-Vaduz…) **[non vérifié]**                                                                                  | Hors périmètre au départ, ou index « CH-LI » si l'extrait les contient                                                                                          |
| Commune / canton                                                                           | `geo.api.gouv.fr` inutilisable                                                                                                  | Rattachement local aux limites OSM (cantons : `admin_level=4`, communes : `admin_level=8` **[niveaux à confirmer sur le wiki suisse]**)                         |

### 2.4 Noms multilingues

- La Suisse a quatre langues nationales ; les cantons déclarent leurs langues officielles (Berne `de`, `fr` ; Grisons `de`, `it`, `rm`) ([WikiProject Switzerland](https://wiki.openstreetmap.org/wiki/Switzerland)).
- Les gares portent le nom officiel local, parfois bilingue dans la valeur même (« Biel/Bienne », « Fribourg/Freiburg »), avec selon les cas `name:de`, `name:fr`, `name:it` **[convention exacte non vérifiée ; à mesurer dans l'extrait]**. Le wiki ferroviaire suisse montre des intitulés bilingues du type « Biel/Bienne [Gleis 11/voie 11] » ([Switzerland:Public Transport/Railways](https://wiki.openstreetmap.org/wiki/Switzerland:Public_Transport/Railways)).
- **Conséquences** : (1) la recherche doit aussi indexer `name:fr`, `name:de`, `name:it` et `uic_name` (un utilisateur francophone tapera « Bâle », « Zurich », « Lucerne » ; un germanophone « Genf ») — ajouter une colonne `alt` (noms normalisés supplémentaires) à l'index ; (2) la normalisation actuelle (`normalize`) traite déjà « / » et les diacritiques (« Zürich » → « zurich »), c'est bon.

---

## 3. Balisage OSM suisse des quais et des voies

### 3.1 Ce que voit le voyageur en Suisse

- L'information voyageur suisse affiche la **voie** (« Gleis 7 », « voie 7 », « binario 7 ») et des **secteurs** A, B, C, D le long du quai pour la composition. Le mot « Perron » (quai) existe mais le numéro de quai propre est rarement affiché au public **[connaissance générale, non sourcée dans cette étude]**. C'est plus proche de la France (« Voie 1 ») que de la Pologne (numéro de quai distinct).

### 3.2 Conventions écrites trouvées

- **Aucune page du wiki OSM suisse ne fixe de convention propre** pour `ref`/`local_ref` des quais ou `railway:track_ref` : la page [Switzerland:Public Transport/Railways](https://wiki.openstreetmap.org/wiki/Switzerland:Public_Transport/Railways) traite surtout des relations de lignes, `operator`, `network` ; la page [DE:OpenRailwayMap/Tagging in Switzerland](https://wiki.openstreetmap.org/wiki/DE:OpenRailwayMap/Tagging_in_Switzerland) (modifiée le 18 août 2026, en allemand) traite des signaux et des voies mais pas des quais. Le [wiki WikiProject Switzerland](https://wiki.openstreetmap.org/wiki/Switzerland) ne mentionne pas de sous-projet ferroviaire.
- Les conventions applicables sont donc les **conventions germanophones générales**, très proches de celles retenues pour la France :
  - [DE:Tag:railway=platform_edge](https://wiki.openstreetmap.org/wiki/DE:Tag:railway%3Dplatform_edge) : le quai porte `ref` avec « alle Nummern durch Semikolons getrennt » (ex. `ref=4;5`), chaque bord `railway=platform_edge` porte son `ref` ; hauteur `height` en mètres au-dessus du rail (0,55 / 0,76 / 0,96 m) ; un quai peut être découpé en sections (« 4a », « 4b »), « meist an größeren Bahnhöfen », sans tag dédié.
  - [DE:Tag:railway=platform](https://wiki.openstreetmap.org/wiki/DE:Tag:railway%3Dplatform) : `ref=Bahnsteignummer` ; « Gleisnummern werden mit `railway:track_ref=*` an den Gleisen selbst hinzugefügt ». `local_ref` et les secteurs n'y sont pas traités.
- Les **secteurs A-D** ne sont pas des numéros de quai : ils relèvent de l'équivalent des « repères de quai » français (`railway=platform_marker`, hors MVP, cf. `docs/osm-tags-rapport.md` § 3.1). Il ne faut surtout pas les écrire dans `ref` ou `local_ref` du quai.
- **Nouveau** : `ref:sloid` par quai (§ 2.2) donne un identifiant officiel du quai/bord. Le document SKI+ (CFF) de 2024 souhaite que la modélisation OSM porte le SLOID « auch auf Haltekantenebene » (au niveau du bord de quai) ([SKI+ – OSM Überlegungen v0.9.0, 8 août 2024, brouillon](https://tp-info.ch/sites/default/files/2024-08/ski_osm_ueberlegungen_v0.9.0_0.pdf)). Cela renforce l'intérêt de `platform_edge` en Suisse.

### 3.3 Mesures d'usage

- **[non vérifié]** : ni taginfo Suisse (`taginfo.osm.ch`, dont l'accueil indique d'ailleurs des données d'avril 2025), ni Overpass, ni l'API OSM n'étaient joignables depuis l'environnement d'étude. La fréquence réelle de `railway:track_ref`, `platform_edge` et `local_ref` en Suisse n'est donc **pas chiffrée**. Requêtes à lancer (Overpass Turbo, zone « Schweiz ») : `nwr["railway"="platform"](area)` avec/sans `ref` ; `way["railway"="platform_edge"](area)` ; `way["railway"="rail"]["railway:track_ref"](area)`.
- Exemple ponctuel observé : la voie `way/18114624` à Uznach (`operator=SBB`, `railway:etcs=1`, `passenger_lines=2`) — balisage d'infrastructure riche, typique des contributeurs ferroviaires suisses ([osm.org/way/18114624](https://www.openstreetmap.org/way/18114624)).

### 3.4 Données ouvertes officielles utiles (contrôle, pas import)

- Les CFF publient « Haltestelle: Perronkante – inkl. BLS » (bords de quai, CFF + BLS, 15 formats dont GeoJSON, modifié le 17 février 2025) : [opendata.swiss](https://ckan.opendata.swiss/dataset/haltestelle-perronkante-inkl-bls) / [data.sbb.ch](https://data.sbb.ch/explore/dataset/haltestelle-perronkante-inkl-bls). Licence : renvoi aux conditions opendata.swiss « terms_by » (usage libre avec citation de la source) **[texte exact et compatibilité ODbL non vérifiés]**. Les champs (numéro de voie, longueur, hauteur) **n'ont pas pu être lus**.
- **Usage recommandé** : en interne seulement, pour **suggérer** au contributeur (« les CFF indiquent voie 7 ici : est-ce ce que vous lisez sur place ? ») ou pour prioriser les quêtes — et seulement après accord explicite de la communauté suisse, car recopier ces valeurs dans OSM serait un **import** (règles d'import et page wiki dédiée). Hors MVP Suisse.

### 3.5 Comparaison avec la France

| Point                | France (`docs/osm-tags-rapport.md`)               | Suisse                                                                                                                                                                |
| -------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Affichage voyageur   | « Voie 1 », parfois lettre de quai                | « Gleis/voie/binario 7 » + secteurs A-D                                                                                                                               |
| `ref` du quai        | Liste des voies (`1;2`), choix de conception      | Idem selon le wiki germanophone (`4;5`)                                                                                                                               |
| `local_ref`          | Lettre de quai propre (« Quai A »)                | Peu pertinent (pas de numéro de quai affiché, sauf exceptions) **[à confirmer]**                                                                                      |
| `railway:track_ref`  | Numéro affiché sur la voie à quai ; débat wiki FR | Même usage (définition anglaise/allemande), pas de débat suisse trouvé                                                                                                |
| `platform_edge`      | Recommandé                                        | Recommandé ; renforcé par `ref:sloid` par bord                                                                                                                        |
| Identifiant officiel | `uic_ref` (gare)                                  | `uic_ref` (gare) + **`ref:sloid`** (gare et quai), 2026                                                                                                               |
| Langue des valeurs   | Français                                          | Valeurs numériques : pas de problème de langue ; `name` éventuels (« Gleis 7 ») à proscrire comme en France (Q7 doit aussi détecter « Gleis », « voie », « binario ») |

**Conclusion § 3** : les quêtes Q0, Q1, Q2, Q5, Q6 s'appliquent **telles quelles** en Suisse. Q7 doit apprendre les motifs « Gleis N », « voie N », « binario N ».

---

## 4. Pancartes d'arrêt : l'équivalent suisse

### 4.1 Règlementation (source primaire)

Prescriptions suisses de circulation des trains (FDV/PCT), édition A2024, R 300.2, **§ 5.5.7, p. 161** ([FDV R 300.1–.15 A2024, OFT](https://www.bav.admin.ch/dam/de/sd-web/pggvw0pgKi00/fdv-r-300-1-15-a2024.pdf)) :

- « Halteort für alle Reisezüge » : lieu d'arrêt pour tous les trains de voyageurs ;
- « Halteort für Reisezüge mit einer Länge von 100 m » : lieu d'arrêt selon la longueur ;
- les **Zuglängentafeln** (tableaux de longueur) fixent le lieu d'arrêt de tous les trains d'une longueur donnée ; « Die Angaben auf den Tafeln beziehen sich auf die Länge des Zuges inklusive Triebfahrzeug » ;
- « Auf älteren Zuglängentafeln kann die Zuglänge auch mit einer Achszahl angegeben sein » ;
- suite de tableaux « 05, 15, 2, 25, 3, 35, 4 usw. » pour 50 à 400 m ;
- § 6.10, p. 173 : **ETCS Merktafel Halteort** (« Es folgt ein kommerzieller Halteort »), placée à distance de freinage du milieu du bord de quai, avec l'abréviation de la gare — c'est un repère d'annonce, **pas** une pancarte d'arrêt.

Le dessin des tableaux (H noir, chiffre, « A » + essieux) n'est pas dans le texte extrait (figures). La numérotation des signaux du wiki (577-580) vient de l'ancienne numérotation FDV **[correspondance avec l'édition en vigueur non vérifiée ; les FDV sont révisées chaque année (A2024, A2025…)]**.

### 4.2 Balisage OSM documenté

Page [DE:OpenRailwayMap/Tagging in Switzerland](https://wiki.openstreetmap.org/wiki/DE:OpenRailwayMap/Tagging_in_Switzerland) (allemand, modifiée le 18 août 2026), section « Halt-, Kontroll- und Achtungssignale » :

| Panneau | Signification                                                                                                           | Tags documentés                                                                            |
| ------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 577     | Halteort für alle Reisezüge — « schwarzes H auf weissem Grund »                                                         | `railway:signal:stop=CH-FDV:577` + `railway:signal:stop:form=sign`                         |
| 578     | Halteort selon longueur — chiffre noir ; « Die Ziffer multipliziert mit 10 gibt die Zuglänge (inkl. Triebfahrzeug) an » | `railway:signal:stop=CH-FDV:578` + `…:form=sign` + `railway:signal:stop:caption=2` (200 m) |
| 579     | Halteort selon nombre d'essieux — « A » sur la ligne du haut, nombre d'essieux en bas                                   | `railway:signal:stop=CH-FDV:579` + `…:form=sign` + `…:caption=A 48`                        |
| 580     | Zuglängentafel — longueur en clair + « m »                                                                              | `railway:signal:stop=CH-FDV:580` + `…:form=sign` + `…:caption=120 m`                       |

Plus, avec `railway=signal`, les tags génériques communs à tous les signaux ORM (`railway:signal:direction`, `railway:signal:position`), employés par les contributeurs suisses sur les autres signaux (ex. [node/10210368455](https://www.openstreetmap.org/node/10210368455) : `CH-FDV:n`, `direction=backward`, `position=right`). La page ne les répète pas pour 577-580.

### 4.3 Différences avec le schéma français et conséquences

- **Préfixe `CH-FDV:`**, pas `CH:`. Schéma **plat** (une valeur par panneau + `caption`), bien plus simple que le schéma français 2026 à sous-clés par catégorie (`railway:signal:stop:highspeed=FR:TGV`…).
- **Pas de famille « par type de matériel »** comme en France (TGV, Z57, nV) : en Suisse, c'est H (tous), longueur (chiffre ×100 m ou « 120 m ») ou essieux.
- Le saisisseur suisse aurait **4 boutons** : H / chiffre / « A + nombre » / « N m », chacun avec la légende lue (`caption`). Le placement (sens, côté) réutilise exactement le moteur actuel (`railway:signal:direction` calculé par l'appli, `railway:signal:position`).
- **Usage réel non mesuré** (taginfo/Overpass inaccessibles) : on ne sait pas combien de 577-580 existent déjà dans OSM. À mesurer : `node["railway:signal:stop"~"^CH-FDV:57[7-9]|^CH-FDV:580"](area)`.
- **Rendu** : prise en charge de ces valeurs par OpenRailwayMap-vector **[non vérifié]**.
- **Recommandation** : schéma documenté et cohérent → implémentable (`stopsigns/ch.ts`, lot P5). Mais comme pour la France, **l'annoncer au forum suisse** avant d'écrire massivement ces valeurs, et demander si les contributeurs ferroviaires suisses veulent ces pancartes cartographiées par des non-spécialistes. À défaut d'accord, ouvrir la Suisse **sans** les quêtes pancartes (Q3/Q4 désactivées), ce que l'architecture « par pays » permet proprement (`stopSigns = null`).

---

## 5. Communauté OSM suisse et règles

### 5.1 Canaux

- **Forum** : catégorie « Switzerland » du forum communautaire, [community.openstreetmap.org/c/communities/ch/107](https://community.openstreetmap.org/c/communities/ch/107). Règles : « The OSM Etiquette Guidelines apply in this category » ; aucune langue imposée ([About the Switzerland category](https://community.openstreetmap.org/t/about-the-switzerland-category/31728)).
- **Langues observées** (titres de septembre 2026) : majorité **allemand**, plusieurs en **anglais**, quelques-uns en **français** ; les « Projets du mois » sont trilingues (« Bordsteine / Kerbs / Ressauts »). Les fils techniques nationaux (SLOID) sont en anglais. **Recommandation** : message en **anglais**, avec un résumé en allemand et en français.
- **Autres canaux** : liste `talk-ch` (lists.openstreetmap.ch), IRC/Matrix `#osm-ch`, Mastodon `#WikiProjectSwitzerland`, rencontres mensuelles (Stammtisch de Zurich, 191ᵉ en septembre 2026) ; association **SOSM** (Swiss OpenStreetMap Association, chapitre local de l'OSMF, [sosm.ch](https://sosm.ch/)). Source : [WikiProject Switzerland](https://wiki.openstreetmap.org/wiki/Switzerland).

### 5.2 Règles d'édition

- Pas de règle suisse spécifique aux éditions organisées trouvée sur la page nationale ; s'appliquent les règles OSMF générales ([Automated Edits code of conduct](https://wiki.openstreetmap.org/wiki/Automated_Edits_code_of_conduct), [Organised Editing Guidelines](https://wiki.openstreetmap.org/wiki/Organised_Editing_Guidelines)) déjà analysées pour la France (`docs/osm-tags-rapport.md` § 6.2). Une saisie humaine, terrain, un objet à la fois (modèle StreetComplete) n'est pas une édition automatisée.
- Pour les données swisstopo : citer la source dans le changeset, inscrire les nouvelles sources sur la page Contributors, suivre les règles d'import au-delà du « small-scale QA » ([Swisstopo data use](https://wiki.openstreetmap.org/wiki/Swisstopo_data_use)).
- Les ajouts `ref:sloid` de 2026 montrent la pratique attendue : annonce au forum, discussion de la clé, résumé de décision, puis éditions **vérifiées à la main** ([fil SLOID](https://community.openstreetmap.org/t/public-transport-stops-swiss-location-identification-sloid/144753)).

### 5.3 Sensibilités connues

- **Applications grand public et défauts locaux** : fil d'août 2026 (étiquette _streetcomplete_) sur les réponses « no » saisies via StreetComplete pour des équipements qui n'existent pas localement ; reproche principal : l'appli ne connaît pas les **défauts implicites régionaux** ; pas de consensus, mais une demande claire de formulations précises et de quêtes désactivables par région ([forum – Vorgehen gegen das Eintragen von Nicht-Eigenschaften](https://community.openstreetmap.org/t/vorgehen-gegen-das-eintragen-von-nicht-eigenschaften/145808?page=2)). **Leçon pour stationcomplete** : questions sans ambiguïté, vocabulaire suisse exact (Gleis, pas Bahnsteig ; voie, pas quai), aucun tag « négatif » inventé, quêtes désactivables par pays.
- **Identifiants officiels** : sujet actif (SLOID, CFF/OFT/SKI+) avec un souci de **limiter les clés étrangères** exprimé par un membre historique de SOSM ([fil déc. 2025](https://community.openstreetmap.org/t/new-public-transport-ids-modelling-in-switzerland/139323)). Ne rien ajouter de ce type.
- **Données swisstopo** : historique de négociation (2021) mené par SOSM ; respecter scrupuleusement l'attribution ([sosm.ch, 2021](https://sosm.ch/use-of-swisstopo-data-and-products-with-and-in-openstreetmap/)).
- **Contributeurs ferroviaires très pointus** (signalisation `CH-FDV` détaillée, ETCS, vitesses) : ils peuvent voir d'un mauvais œil des modifications approximatives sur « leurs » voies. Ne jamais modifier la géométrie des voies, ne pas toucher aux tags d'infrastructure.

### 5.4 Groupes actifs (noms publics)

- **SOSM** (association) ; **WikiProject Switzerland** (wiki) ; catégorie forum **Switzerland** ; **Stammtisch Zürich** ; **MapTapir** (projet de Sascha Brawer, conflation SLOID/OSMDiffs) ; **SKI+** (Systemaufgabe Kundeninformation, CFF, contact `opendata@sbb.ch` selon le document SKI+ 2024) ; **OpenRailwayMap** (page de balisage suisse en allemand). Aucun groupe « ferroviaire suisse » dédié n'a été trouvé sur le forum **[non exhaustif]**.

---

## 6. Conséquences techniques pour l'appli (lecture du code)

_Section rédigée en premier, à partir du code. Les noms de fichiers sont relatifs à la racine du dépôt._

### 6.1 Ce qui est propre à la France aujourd'hui

| Domaine              | Où                                                                                                                                                                                                                                                                       | Ce qui est figé « France »                                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Imagerie             | `src/lib/core/tiles.ts`                                                                                                                                                                                                                                                  | `IGN_TILE_URL` (WMTS Géoplateforme, `TILEMATRIXSET=PM`), `IGN_MAX_ZOOM = 19`, `AVG_TILE_BYTES = 16 000` (mesuré sur l'IGN), `stationTiles()` appelle `IGN_MAX_ZOOM`                      |
| Imagerie             | `src/lib/map/StationMap.svelte`, `PlacementMap.svelte`, `DrawMap.svelte`                                                                                                                                                                                                 | Source MapLibre nommée `ign`, URL et zoom importés de `tiles.ts` (3 copies du même bloc de style)                                                                                        |
| Attribution          | `src/lib/map/style.ts`                                                                                                                                                                                                                                                   | `IGN_ATTRIBUTION = 'Photo © IGN – BD ORTHO'`                                                                                                                                             |
| Hors-ligne           | `src/service-worker.ts` (l. 15, 59)                                                                                                                                                                                                                                      | Cache des tuiles reconnu par `url.origin === 'https://data.geopf.fr'`                                                                                                                    |
| Hors-ligne           | `src/lib/offline.svelte.ts`                                                                                                                                                                                                                                              | Commentaires et débit (« 4 à la fois, service gratuit de l'IGN »)                                                                                                                        |
| CSP                  | `vite.config.ts`                                                                                                                                                                                                                                                         | `img-src` et `connect-src` ne contiennent que `https://data.geopf.fr` comme fournisseur d'imagerie                                                                                       |
| Changeset            | `src/lib/core/upload.ts` l. 587-590                                                                                                                                                                                                                                      | `locale: 'fr'` par défaut, `imagery_used = 'BDOrtho IGN'` en dur                                                                                                                         |
| Index des gares      | `.github/workflows/stations.yml`                                                                                                                                                                                                                                         | Téléchargement de `europe/france-latest.osm.pbf`, fichiers `rail-fr.*`                                                                                                                   |
| Index des gares      | `scripts/build-stations.mjs`                                                                                                                                                                                                                                             | Sortie `static/data/stations-fr.json` ; géocodage commune/département par `geo.api.gouv.fr` (API française) ; colonne `dep` (département) ; détection des anciennes pancartes `FR:ARRET` |
| Index des gares      | `src/lib/stations.ts`                                                                                                                                                                                                                                                    | Charge `data/stations-fr.json` ; type `Station` avec `dep`                                                                                                                               |
| Pancartes (lecture)  | `src/lib/core/osm.ts`                                                                                                                                                                                                                                                    | `isStopSign()` ne reconnaît que `FR:passenger_stop` et `FR:ARRET_*`                                                                                                                      |
| Pancartes (libellés) | `src/lib/core/features.ts`                                                                                                                                                                                                                                               | `stopSignLabel()` ne traduit que les valeurs `FR:*`                                                                                                                                      |
| Pancartes (écriture) | `src/lib/core/edits.ts` `signTags()`                                                                                                                                                                                                                                     | Types `TT`, `nV`, `L`, `Z57`, `Z50`, `TGV`, `UFR`, `long`, `short`, `all`, `other` → valeurs `FR:*` uniquement                                                                           |
| Pancartes (UI)       | `src/routes/gare/saisie/+page.svelte` (l. 124-127, 478-511)                                                                                                                                                                                                              | Boutons et sous-formulaires Z57/Z50/TGV/UFR                                                                                                                                              |
| Quêtes               | `src/lib/core/quests.ts`                                                                                                                                                                                                                                                 | Q3/Q4 (pancartes) s'appuient sur `isStopSign` donc sur le schéma FR ; Q7 cherche « Voie 1 » dans `name`/`ref` (motif français)                                                           |
| Textes               | `src/routes/+page.svelte` (« Explorez les gares de France »), `gares/+page.svelte` (« gares et haltes de France », `toLocaleString('fr-FR')`), `a-propos`, `mentions-legales` (« pas un service de la SNCF »), `donnees-personnelles` (« IGN – Géoplateforme (France) ») | Textes en dur, en français                                                                                                                                                               |
| Traduction           | —                                                                                                                                                                                                                                                                        | Le dossier d'architecture (§ 9.2) prévoit Paraglide et `messages/fr.json`/`en.json`, **mais aucun dossier `messages/` n'existe** : toutes les chaînes sont en dur dans les composants    |
| Docs                 | `README.md`, `docs/osm-tags-rapport.md`                                                                                                                                                                                                                                  | Périmètre déclaré « gares du réseau ferré français »                                                                                                                                     |

Ce qui est **déjà neutre** et se réutilise tel quel : modèle OSM (`osm.ts` hors pancartes), géométrie (`geo.ts`, `draw.ts`, `shape.ts`), quêtes Q0, Q1, Q2, Q5, Q6 (quais, `ref`, `local_ref`, `railway:track_ref`, vérification), file d'envoi et changesets (`upload.ts`, hors deux valeurs), OAuth2, lecture API OSM 0.6 (`osmapi.ts`), téléchargement hors-ligne (calcul des tuiles en Web Mercator).

### 6.2 Architecture « par pays » proposée (durable)

Principe : **un pays = un fichier de configuration typé + un module de schéma de pancartes**, choisis par la gare (pas par l'utilisateur). Une gare porte le code pays de l'index d'où elle vient ; l'appli n'a jamais à « deviner » le pays d'après la position.

```ts
// src/lib/core/countries.ts (nouveau, code pur)
export interface ImageryConfig {
	id: string; // 'ign-bdortho', 'swisstopo-swissimage'
	tileUrl: string; // gabarit {z}/{x}/{y}
	maxZoom: number; // 19 (IGN) ; à mesurer pour swisstopo
	avgTileBytes: number; // mesuré
	origin: string; // pour la CSP et le service worker
	attribution: string; // texte affiché sur la carte
	imageryUsed: string; // valeur du tag de changeset imagery_used
	licenceText: string; // pages À propos / Mentions
	bounds: BBox; // emprise couverte (repli hors emprise)
	maxParallel: number; // politesse envers le fournisseur
}
export interface CountryConfig {
	code: 'FR' | 'CH';
	index: string; // 'data/stations-fr.json', 'data/stations-ch.json'
	imagery: ImageryConfig;
	stopSigns: StopSignSchema; // module de schéma (voir ci-dessous)
	locale: string; // 'fr-FR' ; pour CH dépend de la langue de l'UI
	adminLabel: string; // 'département' / 'canton'
}
```

```ts
// src/lib/core/stopsigns/types.ts
export interface StopSignSchema {
	isStopSign(t: Tags): boolean; // remplace osm.ts isStopSign
	isLegacy(t: Tags): boolean;
	label(t: Tags): string; // remplace features.ts stopSignLabel
	types: SignTypeDef[]; // boutons de l'écran de saisie
	toTags(s: SignInput): Tags; // remplace edits.ts signTags
}
// stopsigns/fr.ts : code actuel déplacé tel quel ; stopsigns/ch.ts : à écrire (§ 4)
// Si un pays n'a pas de schéma établi, `stopSigns = null` → quêtes Q3/Q4 désactivées.
```

Points de conception :

1. **Index par pays, recherche fusionnée.** Un fichier par pays (`stations-fr.json`, `stations-ch.json`), chacun avec un champ `country`. La recherche charge les deux (le suisse sera petit, voir § 2) ou seulement celui du pays choisi. Les gares frontalières (Genève, Bâle, Delémont–Belfort…) ne doivent apparaître qu'une fois : l'extrait Geofabrik de chaque pays déborde un peu de la frontière, il faut **découper par le polygone du pays** (osmium `extract -p` avec le `.poly` Geofabrik) ou dédoublonner par identifiant OSM entre index.
2. **Champ administratif générique.** Remplacer `dep` par `admin` (département ou canton) et le géocodage `geo.api.gouv.fr` par une source par pays. Pour la Suisse : soit les limites cantonales d'OSM (`admin_level=4`, déjà dans l'extrait, traitement local en CI, sans appel réseau), soit l'API de géolocalisation de swisstopo **[non vérifié]**. La solution OSM locale est la plus durable et marche pour tous les pays.
3. **Imagerie par gare** : `StationMap`, `PlacementMap`, `DrawMap` reçoivent `imagery` (au lieu d'importer les constantes IGN). Factoriser le bloc de style raster commun (aujourd'hui copié 3 fois) dans `style.ts`.
4. **Service worker** : reconnaître l'ensemble des origines d'imagerie déclarées (liste générée depuis `countries.ts` au build), pas seulement `data.geopf.fr`.
5. **CSP** : ajouter l'origine swisstopo à `img-src` et `connect-src` dans `vite.config.ts` (idéalement générée depuis la même liste, pour qu'il n'y ait qu'une seule source de vérité).
6. **Changeset** : `imagery_used` et `locale` viennent de la config du pays et de la langue de l'interface.
7. **Pancartes** : interface `StopSignSchema`, le schéma français déplacé sans changement fonctionnel ; tests unitaires existants (`edits.test.ts`, `quests.test.ts`) rejoués à l'identique.
8. **Traduction** : la Suisse romande parle français, mais la majorité des gares sont en zone germanophone et une partie en zone italophone. Une ouverture « Suisse » crédible impose au minimum l'allemand (§ 2.4, § 5). C'est le chantier Paraglide déjà prévu (§ 9.2 de l'architecture) mais pas commencé.
9. **Textes « France »** : à rendre génériques (« Explorez les gares », mention SNCF → « ni d'une entreprise ferroviaire »).
10. **Valeurs suisses connues à ce stade** : origine d'imagerie `https://wmts.geo.admin.ch` (à ajouter à `img-src` et `connect-src`) ; `imagery_used=swissimage (swisstopo)` (valeur du wiki suisse, à recouper avec editor-layer-index) ; attribution « © Data: swisstopo » ; `maxZoom` et `avgTileBytes` à mesurer ; index enrichi d'une colonne de noms alternatifs (`name:fr/de/it`, `uic_name`) ; Q7 étendue aux motifs « Gleis N », « voie N », « binario N ».
11. **Langue du changeset** : `locale` = langue de l'interface (fr, de, it), pas le pays ; `comment` généré dans la langue du contributeur.
12. **CI** : la tâche `stations.yml` devient une matrice `country: [fr, ch]` (même script, paramètres différents), chaque pays écrivant son propre fichier ; un échec suisse ne doit pas bloquer l'index français.

### 6.3 Fichiers concernés et effort, en lots

Estimations en jours de développement assisté, à confirmer ; elles supposent les réponses aux questions du § 7.

| Lot                                      | Contenu                                                                                                                                                                                                                                                      | Fichiers                                                                                                                                                                                                                                                  | Effort                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| P1 — Refonte « par pays », France seule  | `countries.ts`, `stopsigns/fr.ts` (déplacement), imagerie passée en paramètre, service worker et CSP depuis la liste, `imagery_used`/`locale` depuis la config, champ `country` et `admin` dans l'index. **Aucun changement visible**, tous les tests verts. | `tiles.ts`, `style.ts`, 3 cartes, `service-worker.ts`, `offline.svelte.ts`, `vite.config.ts`, `upload.ts`, `send.svelte.ts`, `osm.ts`, `features.ts`, `edits.ts`, `quests.ts`, `saisie/+page.svelte`, `stations.ts`, `build-stations.mjs`, `stations.yml` | 3 à 4 j                     |
| P2 — Index suisse                        | Matrice CI, extrait Geofabrik Suisse découpé au polygone, règles de sélection CH (§ 2), canton par limites OSM, dédoublonnage frontalier, statistiques                                                                                                       | `build-stations.mjs`, `stations.yml`, `stations.ts`, page `gares`                                                                                                                                                                                         | 2 j                         |
| P3 — Imagerie swisstopo                  | Config SWISSIMAGE, mesure du zoom et du poids moyen, attribution, pages légales, tests e2e hors-ligne sur une gare suisse                                                                                                                                    | `countries.ts`, `a-propos`, `mentions-legales`, `donnees-personnelles`, tests                                                                                                                                                                             | 1 à 2 j                     |
| P4 — Traduction (allemand, puis italien) | Mise en place Paraglide, extraction de toutes les chaînes, glossaire métier (Gleis/Perron/Sektor), relecture par un germanophone                                                                                                                             | tous les composants                                                                                                                                                                                                                                       | 5 à 8 j + relecture humaine |
| P5 — Pancartes suisses                   | Seulement si un schéma OSM établi existe (§ 4) ; sinon quêtes pancartes désactivées en Suisse                                                                                                                                                                | `stopsigns/ch.ts`, saisie, tests                                                                                                                                                                                                                          | 2 à 3 j, ou 0               |
| P6 — Ouverture                           | Message au forum suisse, pilote fermé (liste `pilotUsers` par pays dans `static/config.json`), gares de référence suisses en fixtures                                                                                                                        | `config.json`, `config.ts`, `fetch-fixtures.mjs`                                                                                                                                                                                                          | 1 j + délai communautaire   |

---

## 7. Recommandation

### 7.1 Verdict

**Faisable, et techniquement sain**, à condition de faire d'abord la refonte « par pays » (lot P1) plutôt que d'ajouter des `if (suisse)` dans le code actuel. Les fondations sont favorables :

- **Imagerie** : SWISSIMAGE est ouverte (OGD), gratuite, sans clé, plus fine que la BD ORTHO, servie en `{z}/{x}/{y}` Web Mercator, et son usage pour éditer OSM est accepté par swisstopo et documenté par la communauté suisse depuis 2021 (§ 1).
- **Données** : extrait léger (463 Mo), ~1 800 gares, `uic_ref` homogène (DIDOK), identifiants de quai `ref:sloid` en cours d'ajout (§ 2).
- **Quais et voies** : mêmes conventions que celles déjà retenues pour la France ; 5 quêtes sur 8 réutilisables sans changement (§ 3).
- **Pancartes** : schéma OSM suisse documenté et plus simple que le français (`CH-FDV:577` à `580`) (§ 4).

Ce qui rend l'ouverture **non triviale** n'est pas technique : c'est la **langue** (une majorité de gares en zone germanophone ; l'appli n'est pas encore traduisible) et l'**acceptation communautaire**.

### 7.2 Risques

| Risque                                                                        | Gravité                                             | Parade                                                                                                                                                                      |
| ----------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CORS absent sur `wmts.geo.admin.ch`                                           | Bloquant pour la carte et le hors-ligne             | Test d'une minute dans le navigateur (§ 1.2) **avant tout développement** ; si absent, demander à swisstopo plutôt que monter un proxy (pas de serveur dans l'architecture) |
| Zoom maximal 3857 limité à 18                                                 | Moyen (tracé des quais moins précis)                | Mesurer ; si 18, accepter l'agrandissement ou envisager l'usage de la grille suisse (lourd, non recommandé)                                                                 |
| Cache hors-ligne jugé contraire au fair use                                   | Faible (usage humain, quelques centaines de tuiles) | Débit limité (4 requêtes parallèles comme pour l'IGN), téléchargement uniquement à la demande d'un humain ; écrire à `info@geo.admin.ch` pour faire confirmer cet usage     |
| Rejet communautaire (appli « étrangère », non traduite, vocabulaire français) | Élevé                                               | Message préalable au forum, pilote fermé, interface en allemand avant l'ouverture publique                                                                                  |
| Mauvais libellés (Gleis/Perron/Sektor) → données fausses                      | Moyen                                               | Glossaire relu par un contributeur suisse germanophone ; Q7 étendue                                                                                                         |
| Confusion secteurs A-D / numéros de voie                                      | Moyen                                               | Texte d'aide explicite ; jamais de lettre seule dans `ref` du quai en Suisse sans confirmation                                                                              |
| Divergence d'usage réel (`local_ref`, `track_ref`) non mesurée                | Moyen                                               | Mesure Overpass avant P2 ; ajuster les quêtes si l'usage suisse diffère                                                                                                     |
| Doublons de gares frontalières                                                | Faible                                              | Découpe au polygone + dédoublonnage par identifiant                                                                                                                         |
| Évolution FDV (renumérotation des signaux)                                    | Faible                                              | Suivre la page ORM suisse ; schéma isolé dans `stopsigns/ch.ts`                                                                                                             |

### 7.3 Prérequis, dans l'ordre

1. **Test CORS + zoom max** de SWISSIMAGE depuis un navigateur sur stationcomplete.org (Loïc, 10 minutes).
2. **Mesures Overpass** sur la Suisse : quais avec/sans `ref`, `local_ref`, `platform_edge`, `railway:track_ref`, pancartes `CH-FDV:577-580`, `station=*` des gares (funiculaires, light_rail).
3. **Message au forum suisse (catégorie Switzerland), avant tout envoi en Suisse**, en anglais avec résumés allemand/français : présentation de l'appli, tags écrits (exemples), modèle de changeset (`created_by`, `comment`, `source=survey`, `imagery_used=swissimage (swisstopo)`, `hashtags=#stationcomplete`), question sur les pancartes `CH-FDV:57x`, question sur `ref`/`local_ref` des quais en Suisse, proposition d'un pilote avec des contributeurs locaux. Attendre les retours (au moins deux à trois semaines).
4. **Lot P1** (refonte par pays, France inchangée) — utile même si la Suisse ne se fait pas : elle sépare proprement ce qui est national.
5. Lots P2, P3, puis **P4 traduction allemande** avant toute ouverture publique ; P5 pancartes seulement si le forum est d'accord.
6. **Pilote fermé** suisse (liste `pilotUsers` par pays), envois d'abord sur le serveur de test.

### 7.4 Questions à poser à Loïc

1. **Pourquoi la Suisse en deuxième ?** Contributeurs suisses déjà identifiés, demande d'un partenaire, proximité (Genève, Bâle, Jura) ? La réponse change la priorité de la traduction.
2. **Langues** : accepte-t-il d'ouvrir d'abord la **Suisse romande seulement** (interface française, ~25 % des gares **[ordre de grandeur non vérifié]**), ou veut-il le pays entier, ce qui impose l'allemand (et l'italien pour le Tessin) ?
3. **Traduction** : qui relit l'allemand ? Faut-il lancer maintenant le chantier Paraglide prévu (§ 9.2 de l'architecture), au bénéfice aussi d'autres pays ?
4. **Pancartes** : ouvrir la Suisse sans les quêtes pancartes au départ (quais et voies seulement), en attendant l'avis du forum ?
5. **Données CFF** (« Perronkante ») : souhaite-t-il les explorer pour suggérer des numéros (avec l'accord de la communauté), ou rester strictement sur le relevé terrain ?
6. **Index** : un fichier par pays chargé à la demande, ou un index européen unique à terme ? (Conditionne le format P2.)
7. **Qui écrit au forum** : Loïc en son nom (`LoicHam`), en anglais ? Faut-il préparer le brouillon ?
8. **Mesures** : peut-il lancer lui-même le test CORS et les requêtes Overpass (l'environnement d'étude n'y avait pas accès) ?

### 7.5 Ce qui n'a pas pu être vérifié (récapitulatif)

- CORS de `wmts.geo.admin.ch` (proxy de l'environnement d'étude) ; zoom maximal SWISSIMAGE en 3857 ; fichier `WMTSCapabilities.xml`.
- Entrée SWISSIMAGE de l'editor-layer-index et valeur `imagery_used` écrite par iD.
- Page Geofabrik Suisse (polygone, Liechtenstein).
- Fréquence d'usage en Suisse de `ref`/`local_ref` sur les quais, `platform_edge`, `railway:track_ref`, `CH-FDV:577-580` (taginfo, Overpass, API OSM inaccessibles).
- Conventions de noms multilingues des gares (`name` vs `name:xx`) ; niveaux `admin_level` des cantons et communes.
- Correspondance entre la numérotation 577-580 du wiki et l'édition en vigueur des FDV ; rendu par OpenRailwayMap-vector.
- Champs et licence exacte du jeu CFF « Perronkante ».
