# RailComplete — Spécification UX du MVP

> Document de travail pour produire les maquettes visuelles. Version 0.3 — 2026-11-05 (maquettes validées par Loïc, avec pancartes nV et US/UM et dessin de quai en polygone).
> À valider par Loïc avant tout développement.
> v0.2 : décisions de Loïc intégrées (§ 0 bis) et champs alignés sur `osm-tags-rapport.md` (§ 3 E6, E7, E11, § 4).

## 0 bis. Décisions validées (5 novembre 2026)

| Sujet | Décision |
|---|---|
| Envoi | Un changeset **par gare**, après relecture sur E8 (choix par défaut, Loïc sans préférence) |
| Pancartes | **Position + type de pancarte (texte lu) + sens**. Les conditions détaillées (nombre de véhicules, longueur, US/UM) font partie du type et se saisissent dans la même grille |
| À distance | Autorisé pour **positions et vérifications** seulement. Les numéros de quais/voies et les pancartes exigent d'être **sur place** (GPS ponctuel dans l'emprise de la gare) |
| Gares sans quais | **Dessiner le quai** dans l'appli : nouvel écran E11 |
| Motivation | Compteurs personnels sobres, ni badges ni classement |
| Police | **Atkinson Hyperlegible** (Marianne est réservée aux services de l'État) |
| Contributeurs | Citoyens uniquement ; les employés de gare seront traités plus tard (organised editing) |

---

## 0. Principes directeurs (résumé)

| Principe | Traduction concrète |
|---|---|
| Une gare à la fois | Tout part de la gare choisie ; pas de carte « France entière » à explorer. |
| Quêtes simples | Une question = un objet = un écran de saisie (inspiré de StreetComplete). |
| Précision au mètre | Le GPS centre la carte ; l'utilisateur place l'objet sur ortho IGN 20 cm, avec accrochage OSM. |
| Sécurité d'abord | Jamais d'incitation à s'approcher des voies. Saisie possible depuis le quai ou à distance. |
| Sobriété | 10 écrans, pas d'animation décorative, mode sombre, hors-ligne, GPS à la demande. |
| Accessible | WCAG 2.2 AA, cibles ≥ 48 × 48 dp, actions principales dans la zone du pouce, alternative à tout glisser. |

Navigation globale : barre basse à 3 onglets — **Gare** · **Mes contributions** · **Réglages**. Un badge sur « Mes contributions » indique le nombre d'envois en attente.

---

## 1. Personas

### P1 — Julien, 34 ans, passionné de ferroviaire, contributeur OSM occasionnel
- Technicien de maintenance industrielle, prend le TER chaque jour (Lyon ↔ Ambérieu). Connaît la signalisation, lit les pancartes « 8 », « US/UM ».
- A déjà corrigé quelques rues dans OSM via iD, jamais de données ferroviaires.
- **Objectif** : documenter « ses » gares, voir sa gare passer à 100 %.
- **Contexte** : 5–10 min sur le quai en attendant son train, une main (l'autre tient un sac), souvent au soleil.
- **Frustrations** : les éditeurs OSM sont trop complexes sur mobile ; peur de « casser » les données.
- **Besoins UX** : quêtes courtes, reprise là où il s'est arrêté, retour visible de sa progression.

### P2 — Amina, 27 ans, voyageuse occasionnelle curieuse
- Chargée de communication, 1 trajet longue distance par mois. N'a jamais entendu parler d'OSM avant RailComplete.
- **Objectif** : « rendre service » pendant une attente, apprendre quelque chose.
- **Contexte** : gare inconnue, réseau mobile instable, batterie à 30 %.
- **Frustrations** : jargon (« ref », « changeset »), création de compte longue.
- **Besoins UX** : vocabulaire voyageur (« quai », « voie », « panneau d'arrêt »), aide illustrée, possibilité de tester sans compte, consommation batterie minimale.

### P3 — Bernard, 58 ans, contributeur OSM aguerri (mappeur ferroviaire)
- Retraité, 40 000 modifications OSM, connaît OpenRailwayMap et les tags `railway=*`.
- **Objectif** : compléter vite et proprement, depuis chez lui sur l'ortho, puis vérifier sur place.
- **Contexte** : tablette ou téléphone, sessions longues, à distance comme sur le terrain.
- **Frustrations** : outils qui masquent les tags ou écrasent des données existantes ; changesets mal commentés.
- **Besoins UX** : voir les tags bruts (option), contrôler le commentaire de changeset, gestion des conflits explicite, source renseignée.

---

## 2. Parcours utilisateurs principaux

Notation : `E#` renvoie aux écrans de la section 3.

### 2.1 Première ouverture + connexion OSM
1. **E1 Bienvenue** : 3 cartes défilables (À quoi ça sert · Sécurité · Vos données dans OSM). La carte Sécurité est obligatoire (bouton « J'ai compris » pour avancer).
2. **E2 Connexion** : « Se connecter avec OpenStreetMap » (OAuth2, navigateur système) ou « Créer un compte OSM » ou « Explorer sans compte ».
3. Retour d'OAuth → message « Connecté en tant que @pseudo » → **E3 Choisir une gare**.
4. *Variante sans compte* : tout est possible sauf l'envoi ; les contributions restent dans la file locale ; l'invitation à se connecter apparaît sur E8.

Points d'attention : pas de permission GPS demandée à ce stade ; la demande apparaît seulement au premier appui sur « Gares autour de moi ».

### 2.2 Choisir une gare
1. **E3** : champ de recherche (nom, commune, code UIC) en haut + bouton « Gares autour de moi » (GPS ponctuel, coupé après obtention).
2. Résultats en liste (nom, commune, distance, mini-jauge de complétude). Gares récentes et favorites en tête si champ vide.
3. Appui → **E4 Tableau de bord gare**. La gare devient « gare active » (mémorisée).
4. Option « Télécharger pour hors-ligne » (taille estimée affichée) depuis E4.

### 2.3 Voir ce qui manque
1. **E4** affiche 3 jauges (Quais · Voies · Pancartes) et la liste des quêtes triées par priorité (voir §4).
2. Appui sur une quête → **E5 Carte de la gare** centrée sur l'objet concerné, ou directement **E7 Fiche objet** si la quête ne demande pas de position.
3. Bascule « Liste / Carte » sur E4 pour voir les objets manquants sur la carte (pastilles « ? »).

### 2.4 Ajouter un objet (ex. une pancarte d'arrêt)
1. Depuis E4 (quête « Positionner les pancartes du quai B ») ou depuis E5 (bouton « + Ajouter » → choix du type).
2. **E6 Placement fin** : réticule fixe, carte glissante sur ortho, accrochage au bord de quai, loupe, indicateur de précision. Boutons de micro-déplacement (alternative au glisser). « Valider la position ».
3. **E7 Fiche objet** : attributs (numéro/texte de la pancarte, type, côté, source). « Enregistrer ».
4. Confirmation discrète (bandeau 3 s : « Pancarte ajoutée — 1 envoi en attente ») + proposition « Suivante sur ce quai ».
5. Retour E5 ; la quête se met à jour.

### 2.5 Vérifier / corriger un objet existant
1. Quête « À vérifier » sur E4, ou appui sur un objet existant sur E5 → feuille basse de résumé.
2. **E7 en mode vérification** : valeurs actuelles affichées, deux gros boutons : « C'est correct » / « Corriger ».
3. « C'est correct » → enregistre une vérification (date de vérification, à aligner sur le rapport tags), sans modifier le reste.
4. « Corriger » → champs éditables ; « Déplacer » ouvre E6 avec l'objet préchargé ; « Signaler une suppression » (objet disparu) demande une confirmation et un motif.
5. Les valeurs modifiées sont surlignées (ancien → nouveau) avant enregistrement.

### 2.6 Envoyer / hors-ligne
1. Toute saisie est d'abord enregistrée **localement** (file d'attente), qu'il y ait du réseau ou non.
2. **E8 Envoi** : liste des modifications groupées par gare, commentaire de changeset prérempli et modifiable, source prérenseignée, bouton « Envoyer dans OpenStreetMap ».
3. Hors-ligne : bandeau persistant « Hors-ligne — 4 modifications seront envoyées au retour du réseau ». Envoi automatique au retour du réseau **si l'utilisateur l'a autorisé** (réglage, activé par défaut), sinon notification « Prêt à envoyer ».
4. Conflit (l'objet a changé dans OSM entre-temps) → l'élément passe en « À revoir » sur E8 avec comparaison « Votre version / Version OSM » et choix explicite.
5. Succès → lien vers le changeset sur osm.org, compteurs mis à jour.

### 2.7 Historique de mes contributions
1. **E9** : 3 sections — En attente · À revoir · Envoyées.
2. Chaque ligne : icône objet, gare, résumé (« Quai 3 : numéro ajouté »), date, statut.
3. Appui sur une ligne envoyée → lien changeset OSM ; sur une ligne en attente → modifier ou supprimer avant envoi.
4. En tête : compteurs simples (modifications envoyées, gares touchées).

---

## 3. Écrans du MVP (10)

Conventions des wireframes : largeur ~ 360 dp ; `[ Bouton ]` ; `( )` bouton rond ; `▓` zone carte ; `═══` barre d'onglets.

### E1 — Bienvenue & sécurité

- **Objectif** : expliquer en 30 s le but, la sécurité, l'usage des données.
- **Contenu** : 3 cartes (illustration simple + 2 phrases). Carte 2 = règles de sécurité (pictogramme ligne jaune).
- **Composants** : carrousel avec pagination, bouton principal bas, lien « Passer » (sauf carte sécurité).
- **Actions** : Suivant / J'ai compris / Passer.
- **États** : hors-ligne → aucun impact (contenu embarqué). Pas d'état vide/chargement.

```
┌──────────────────────────────┐
│                     Passer › │
│                              │
│        ┌──────────────┐      │
│        │  /!\  ═══    │      │
│        │  quai | voie │      │
│        └──────────────┘      │
│                              │
│   Restez derrière la ligne   │
│   de sécurité.               │
│   Tout se fait depuis le     │
│   quai ou depuis chez vous : │
│   l'image aérienne suffit.   │
│                              │
│          ○  ●  ○             │
│ ┌──────────────────────────┐ │
│ │       J'ai compris       │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

### E2 — Connexion OpenStreetMap

- **Objectif** : relier le compte OSM (OAuth2) ou permettre l'exploration sans compte.
- **Contenu** : explication courte (« Vos modifications sont publiées sous votre pseudo OSM, sous licence ODbL »), 3 options.
- **Composants** : bouton principal, bouton secondaire, lien texte, lien « En savoir plus sur OSM ».
- **Actions** : Se connecter · Créer un compte (ouvre osm.org) · Explorer sans compte.
- **États** : chargement (retour OAuth, spinner + « Connexion… ») ; erreur (« Connexion refusée ou interrompue — Réessayer ») ; hors-ligne (boutons de connexion désactivés + « Connexion possible dès le retour du réseau », « Explorer sans compte » reste actif).

```
┌──────────────────────────────┐
│                              │
│   Vos contributions vont     │
│   dans OpenStreetMap, la     │
│   carte libre et collective. │
│                              │
│   Elles sont publiées sous   │
│   votre pseudo OSM.          │
│                              │
│ ┌──────────────────────────┐ │
│ │ Se connecter avec OSM    │ │
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ Créer un compte OSM  ↗   │ │
│ └──────────────────────────┘ │
│     Explorer sans compte     │
│                              │
│   En savoir plus sur OSM ↗   │
└──────────────────────────────┘
```

### E3 — Choisir une gare

- **Objectif** : trouver et sélectionner une gare en < 10 s.
- **Contenu** : recherche, bouton « Autour de moi », listes Récentes / Favorites / Résultats.
- **Composants** : champ de recherche (clavier immédiat optionnel), bouton GPS, ligne de résultat (nom, commune, distance, mini-jauge 3 segments), étoile favori.
- **Actions** : rechercher, localiser, ouvrir une gare, mettre en favori.
- **États** : vide (première fois : « Cherchez une gare par son nom ou sa commune ») ; chargement (squelettes de lignes) ; erreur (« Recherche indisponible — Réessayer ») ; hors-ligne (seules les gares téléchargées sont listées, mention « Hors-ligne : gares téléchargées uniquement ») ; GPS refusé (« Localisation désactivée — cherchez par nom »).

```
┌──────────────────────────────┐
│ Choisir une gare             │
│ ┌──────────────────────────┐ │
│ │ 🔍 Nom, commune, UIC…    │ │
│ └──────────────────────────┘ │
│ [ ◎ Gares autour de moi ]    │
│                              │
│ RÉCENTES                     │
│ Ambérieu-en-Bugey      ☆     │
│ Ambérieu · ▰▰▱  2 km         │
│ ──────────────────────────── │
│ Lyon Part-Dieu         ★     │
│ Lyon · ▰▱▱                   │
│ ──────────────────────────── │
│ Meximieux              ☆     │
│ Meximieux · ▰▰▰  ✓ complète  │
│                              │
│══════════════════════════════│
│  Gare     Contributions  ⚙   │
└──────────────────────────────┘
```

### E4 — Tableau de bord de la gare (quêtes)

- **Objectif** : montrer en un coup d'œil ce qui manque et lancer une quête.
- **Contenu** : nom de la gare, 3 jauges (Quais, Voies, Pancartes) avec comptes en clair, liste de quêtes priorisée, état hors-ligne de la gare.
- **Composants** : en-tête (nom + menu « Changer de gare », « Télécharger hors-ligne »), 3 tuiles jauge, bascule Liste/Carte, cartes de quête (icône objet, intitulé, nombre, chevron).
- **Actions** : ouvrir une quête, basculer vers la carte (E5), télécharger la gare, changer de gare.
- **États** : chargement (squelette des tuiles + « Chargement des données OSM de la gare… ») ; vide = gare complète (« Tout est renseigné. Vous pouvez vérifier les objets les plus anciens » + quêtes de vérification) ; gare sans aucun quai cartographié dans OSM (« Aucun quai dans OSM pour cette gare. Vous pouvez les dessiner sur l'image aérienne » → **E11**) ; erreur (« Données OSM indisponibles — Réessayer ») ; hors-ligne (données du cache avec date : « Données du 02/11 »).

```
┌──────────────────────────────┐
│ ‹ Ambérieu-en-Bugey      ⋮   │
│ ⬇ Disponible hors-ligne      │
│                              │
│ ┌────────┐┌────────┐┌───────┐│
│ │▭ Quais ││═ Voies ││⚑ Panc.││
│ │ 4/6    ││ 3/8    ││ 2/12  ││
│ │▰▰▰▰▱▱  ││▰▰▰▱▱▱  ││▰▱▱▱▱▱ ││
│ └────────┘└────────┘└───────┘│
│   [ Liste ]  Carte           │
│ QUÊTES                       │
│ ┌──────────────────────────┐ │
│ │▭ 2 quais sans numéro   › │ │
│ ├──────────────────────────┤ │
│ │═ 5 voies sans numéro   › │ │
│ ├──────────────────────────┤ │
│ │⚑ Quai B : pancartes    › │ │
│ │  à positionner           │ │
│ ├──────────────────────────┤ │
│ │✓ 3 objets à vérifier   › │ │
│ └──────────────────────────┘ │
│══════════════════════════════│
│  Gare     Contributions  ⚙   │
└──────────────────────────────┘
```

### E5 — Carte de la gare

- **Objectif** : voir et sélectionner les objets dans l'espace.
- **Contenu** : fond ortho IGN (ou plan OSM en option), géométries des quais et voies, pastilles d'état (complet ✓, manquant ?, à vérifier !), pancartes.
- **Composants** : carte plein écran ; filtres en puces (Quais · Voies · Pancartes) ; bouton « Me localiser » (GPS ponctuel) ; bouton « Fond » (Ortho / Plan) ; bouton flottant « + Ajouter » en bas à droite (zone pouce) ; feuille basse de résumé d'objet au toucher.
- **Actions** : toucher un objet → feuille basse (Vérifier / Corriger) ; « + Ajouter » → choix du type → E6 ; filtrer ; changer de fond.
- **États** : chargement (tuiles grises + spinner discret) ; erreur tuiles (« Image aérienne indisponible — fond Plan affiché ») ; hors-ligne hors zone téléchargée (« Zone non téléchargée ») ; GPS imprécis (cercle de précision affiché + « Position à ±8 m : utilisez l'image pour placer précisément »).

```
┌──────────────────────────────┐
│ ‹ Ambérieu   [▭][═][⚑] Fond │
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│▓▓ ══════════════════════ ▓▓▓│
│▓▓ ▭▭▭▭▭▭▭▭ ? ▭▭▭▭▭▭▭▭▭ ▓▓▓▓│
│▓▓ ══════(1)═════════════ ▓▓▓│
│▓▓ ══════(?)═════════════ ▓▓▓│
│▓▓ ▭▭▭▭▭▭▭▭ ✓ ▭▭▭▭▭▭▭▭▭ ▓▓▓▓│
│▓▓   ⚑8     ⚑?           ▓▓▓▓│
│▓▓ ══════(!)═════════════ ▓▓▓│
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│ (◎)                          │
│                  ( + Ajouter)│
│┌────────────────────────────┐│
││ ═ Voie sans numéro         ││
││ Entre quai A et quai B     ││
││ [ Renseigner ]             ││
│└────────────────────────────┘│
└──────────────────────────────┘
```

### E6 — Placement fin

- **Objectif** : positionner un objet à ~1 m près, à une main, sans s'approcher des voies.
- **Correction v0.2 (rapport tags § 3.5)** : une pancarte d'arrêt est un **nœud inséré dans le way de la voie**, au droit du panneau, et non sur le bord du quai. L'accrochage se fait donc sur **l'axe de la voie**. La consigne devient : « Placez le réticule sur la voie, au niveau du panneau ». Si une pancarte existe déjà à moins de 10 m, l'appli propose de la modifier plutôt que d'en créer une.
- **Contenu** : carte ortho zoomée (zoom 20–21), réticule fixe au centre, géométrie OSM d'accrochage surlignée, loupe, indicateur de précision, consigne contextuelle.
- **Composants** :
  - **Réticule fixe** (croix jaune `#FFD400` à halo noir, contraste 14,7:1) ; la carte glisse dessous.
  - **Loupe** (×3) en haut à gauche, affichée pendant le glisser et 2 s après.
  - **Accrochage** : si le réticule est à moins de ~1,5 m d'un bord de quai / axe de voie, il « saute » dessus ; le segment accroché passe en trait épais + libellé (« Accroché : bord du quai B ») + vibration courte (si autorisée).
  - **Indicateur de précision** : « ±0,4 m · accroché » (vert) / « ±1,2 m » (orange) / « Zoomez pour plus de précision » (sous zoom 19). Calculé à partir de la résolution d'affichage et de l'accrochage, pas du GPS.
  - **Croix de micro-déplacement** (↑ ↓ ← →, pas de 0,2 m) : alternative au glisser (WCAG 2.5.7), utilisable au pouce.
  - Bouton « Détacher » pour désactiver l'accrochage.
  - Bouton principal « Valider la position ».
- **Actions** : glisser / pincer la carte, micro-déplacer, (dé)activer l'accrochage, valider, annuler.
- **États** : chargement ortho (« Chargement de l'image aérienne… », placement bloqué) ; ortho indisponible (fond Plan + avertissement « Précision limitée sans image aérienne ») ; hors-ligne hors zone téléchargée (placement désactivé, proposition « Enregistrer sans position, à placer plus tard ») ; aucune géométrie d'accrochage (placement libre, indicateur orange).

```
┌──────────────────────────────┐
│ ✕ Placer la pancarte         │
│ Réticule sur le bord du quai │
│┌─────┐▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
││ ×3  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
││ ─┼─ │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│└─────┘▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│▓▓▓▓▓▓▓▓▓▓▓▓▓│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│━━━━━━━━━━━━━╋━━━━━━━━━━━━━━━━│
│▓▓▓▓▓▓▓▓▓▓▓▓▓│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│ ● Accroché : bord du quai B  │
│ Précision ±0,4 m   [Détacher]│
│            ( ↑ )             │
│      ( ← )       ( → )       │
│            ( ↓ )             │
│ ┌──────────────────────────┐ │
│ │    Valider la position   │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

### E7 — Fiche objet (ajout / vérification / correction)

- **Objectif** : saisir ou vérifier les attributs d'un objet en quelques touches.
- **Contenu** : en-tête (icône + type + localisation lisible « Quai B, côté voie 2 »), mini-carte de position (toucher → E6), champs, source, aide contextuelle (« Où trouver ce numéro ? » avec illustration).
- **Mode vérification** : valeurs actuelles en lecture + 2 gros boutons « C'est correct » / « Corriger ».
- **Champs par objet (alignés sur le rapport tags § 8)** :

| Objet | Question à l'écran | Tag OSM écrit | Composant |
|---|---|---|---|
| Quai | « Numéros des voies le long de ce quai » | `ref=1;2` | 1 à 4 jetons, préremplis avec les numéros des voies voisines |
| Quai | « Ce quai a-t-il une lettre ou un nom ? » (facultatif) | `local_ref=A` | Champ court, majuscules |
| Quai | (automatique, si absents) | `railway=platform`, `public_transport=platform`, `train=yes` | Ajoutés, jamais supprimés |
| Voie | « Numéro ou lettre affiché en gare » | `railway:track_ref=A` | Champ court ; « Voie » ou « V » retirés automatiquement |
| Voie | « Le numéro change-t-il le long de ce tronçon ? » | aucun (Note OSM si oui) | Oui / Non |
| Pancarte | « Quel panneau voyez-vous ? » | `railway:signal:stop=FR:passenger_stop` + sous-clé de catégorie | **Grille de vignettes (v0.3)** : TT, **n V**, **US / UM**, L…, Z57, Z50, TGV, UFR, Train long/court/tous, Autre |
| Pancarte | Vignette « n V » : « Nombre de véhicules écrit sur le panneau » | `…:conventional=FR:vehicle_number` + `…:for=vehicles` + `…:number=6` | Puces 3, 4, 5, 6, 8, 10 + « Autre… » (ex. RER C 4V/6V/8V, RER D 5V/10V) ; série facultative → `…:trainset` |
| Pancarte | Vignette « US / UM » : UM1, UM2, « 72500 US »… | **À valider** : le schéma 2026 ne prévoit `for=single_unit/multiple_unit` que sous Z57, Z50 et TGV. Piste : `for` + `unit_number` + `trainset=X72500`, à confirmer avec l'auteur du schéma (Noeld) sur le forum OSM France avant développement | Puces US / UM, numéro 1/2/3, série facultative |
| Pancarte | Précision selon la vignette (variante EAS/TTL, longueur, RBT…) | `…:for`, `…:length`, `…:reversal` | Puces |
| Pancarte | « Les trains qui lisent ce panneau vont vers… » | `railway:signal:direction=forward/backward` (calculé d'après le sens du way) | 2 grandes flèches nommées par les gares extrêmes |
| Pancarte | « Le panneau est… » (vu du conducteur) | `railway:signal:position=left/right/in_track/ground` | Puces Gauche / Droite / Entre les rails / Au sol |
| Pancarte | « Un numéro sur une petite plaque ? » (facultatif) | `ref` | Champ court |

  **Source** : écrite au niveau du changeset (`source=survey` ou `imagery_used=BDOrtho IGN`), comme StreetComplete. Pas de question à l'utilisateur : l'appli sait s'il est sur place.
  **Vérification** (« C'est correct ») : écrit `check_date=AAAA-MM-JJ` sur l'objet.
  **Jamais demandé** : PK, identifiants SNCF Réseau.
  **À ne pas confondre** : la plaque à **lettre seule** (A, B, R…) est un repère de quai voyageur (`railway=platform_marker`), hors MVP. L'aide « Où trouver ce panneau ? » montre la différence.
  **Ancien format** : une pancarte en `FR:ARRET_*` s'affiche « ancien format » ; conversion proposée seulement si l'utilisateur confirme sur place qu'elle existe toujours.
- **Composants** : champs larges (≥ 56 dp), puces, sélecteurs segmentés, bouton principal collant en bas, lien « Voir les tags OSM » (replié, pour P3).
- **Actions** : Enregistrer · C'est correct · Corriger · Déplacer (→ E6) · Signaler disparu · Annuler.
- **États** : validation (message sous le champ, jamais par la couleur seule : icône + texte) ; donnée existante non standard (« Valeur actuelle inhabituelle : "3/4" — la conserver ? ») ; hors-ligne (aucun impact, enregistrement local) ; objet modifié par un autre entre-temps (bandeau « Cet objet a changé dans OSM — recharger »).

```
┌──────────────────────────────┐
│ ✕  ⚑ Pancarte d'arrêt        │
│    Quai B · côté voie 2      │
│ ┌──────────────────────────┐ │
│ │▓▓▓▓▓▓▓▓ ⚑ ▓▓▓▓ Déplacer ›│ │
│ └──────────────────────────┘ │
│ Texte de la pancarte         │
│ ┌──────────────────────────┐ │
│ │ 8                        │ │
│ └──────────────────────────┘ │
│ (8) (10) (US) (UM) (Autre)   │
│ Pour quels trains ? ⓘ        │
│ [Tous][Selon composition]    │
│ Sens concerné                │
│ [ ← vers Lyon ][ Genève → ]  │
│ Source                       │
│ (● Sur place) (○ Image IGN)  │
│ ⓘ Où trouver ce panneau ?    │
│ ┌──────────────────────────┐ │
│ │       Enregistrer        │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

### E8 — Envoi (file d'attente)

- **Objectif** : relire et publier les modifications dans OSM, gérer hors-ligne et conflits.
- **Contenu** : modifications groupées par gare (1 changeset par gare), commentaire de changeset prérempli (« Numéros de quais et pancartes d'arrêt, gare d'Ambérieu-en-Bugey — via RailComplete »), source, état réseau.
- **Composants** : liste de modifications (icône, résumé, ancien → nouveau, supprimer), champ commentaire, bouton principal « Envoyer dans OSM », interrupteur « Envoyer automatiquement au retour du réseau ».
- **Actions** : envoyer, modifier/supprimer une modification, résoudre un conflit, se connecter (si sans compte).
- **États** : vide (« Rien à envoyer. Vos contributions apparaîtront ici. ») ; envoi en cours (barre de progression + « Envoi 2/5… ») ; succès (« Envoyé ✓ — voir le changeset ↗ ») ; erreur (« Envoi interrompu, vos modifications sont conservées — Réessayer ») ; hors-ligne (bouton remplacé par « En attente du réseau », bandeau) ; non connecté (« Connectez-vous à OSM pour publier ») ; conflit (ligne marquée « À revoir » → comparaison Votre version / Version OSM, choix « Garder la mienne » / « Garder OSM »).

```
┌──────────────────────────────┐
│ ‹ À envoyer (4)              │
│ ⚠ Hors-ligne : envoi au      │
│   retour du réseau           │
│ AMBÉRIEU-EN-BUGEY            │
│ ▭ Quai 2 : numéro « B »   ✕  │
│ ═ Voie : « 2 » ajouté     ✕  │
│ ⚑ Pancarte « 8 » ajoutée  ✕  │
│ ! Quai 1 : à revoir       ›  │
│                              │
│ Commentaire (public)         │
│ ┌──────────────────────────┐ │
│ │Numéros de quais, gare    │ │
│ │d'Ambérieu — RailComplete │ │
│ └──────────────────────────┘ │
│ Envoi auto au retour  [■■ ON]│
│ ┌──────────────────────────┐ │
│ │   En attente du réseau   │ │
│ └──────────────────────────┘ │
│══════════════════════════════│
│  Gare     Contributions● ⚙   │
└──────────────────────────────┘
```

### E9 — Mes contributions

- **Objectif** : retrouver ce que j'ai fait, ce qui attend, ce qui est à revoir.
- **Contenu** : compteurs (modifications envoyées, gares touchées), 3 segments : En attente · À revoir · Envoyées.
- **Composants** : contrôle segmenté, lignes d'historique (icône, gare, résumé, date relative, statut texte + icône), accès E8.
- **Actions** : ouvrir E8, ouvrir changeset OSM ↗, modifier une contribution en attente.
- **États** : vide (« Aucune contribution pour l'instant. Choisissez une gare pour commencer. » + bouton) ; chargement (squelettes) ; hors-ligne (historique local seul, statuts « Envoyées » non rafraîchis) ; erreur de synchronisation de l'historique (message discret, non bloquant).

```
┌──────────────────────────────┐
│ Mes contributions            │
│  127 envoyées · 9 gares      │
│ [En attente 4][À revoir 1]   │
│ [Envoyées]                   │
│ ──────────────────────────── │
│ ⚑ Ambérieu · Pancarte « 8 »  │
│   il y a 5 min · En attente  │
│ ──────────────────────────── │
│ ▭ Ambérieu · Quai 2 « B »    │
│   il y a 6 min · En attente  │
│ ──────────────────────────── │
│ ═ Meximieux · Voie « 1 »     │
│   12/10 · Envoyée ✓ ↗        │
│                              │
│ ┌──────────────────────────┐ │
│ │  Voir et envoyer (4)     │ │
│ └──────────────────────────┘ │
│══════════════════════════════│
│  Gare     Contributions● ⚙   │
└──────────────────────────────┘
```

### E10 — Réglages

- **Objectif** : maîtriser compte, apparence, données hors-ligne, confidentialité.
- **Contenu** :
  - Compte OSM (pseudo, se déconnecter).
  - Apparence : Thème (Système / Clair / Sombre), Taille du texte (suit le système), Contraste renforcé « plein soleil ».
  - Carte : fond par défaut (Ortho IGN / Plan), vibration à l'accrochage.
  - Hors-ligne : gares téléchargées (taille, date, supprimer), envoi auto au retour du réseau.
  - Mode expert : afficher les tags OSM bruts.
  - Langue, À propos (licences ODbL / IGN, code source), Rappel sécurité.
- **Composants** : liste de réglages groupés, interrupteurs ≥ 48 dp, sélecteurs.
- **États** : hors-ligne (déconnexion/connexion indisponibles, le reste fonctionne).

```
┌──────────────────────────────┐
│ Réglages                     │
│ COMPTE                       │
│ @julien_rail    Déconnexion  │
│ APPARENCE                    │
│ Thème        Système      ›  │
│ Plein soleil         [□ OFF] │
│ CARTE                        │
│ Fond par défaut  Ortho IGN › │
│ Vibration accrochage [■ ON]  │
│ HORS-LIGNE                   │
│ Gares téléchargées (2) 48 Mo›│
│ Envoi auto           [■ ON]  │
│ AVANCÉ                       │
│ Afficher les tags OSM [□ OFF]│
│ Langue       Français     ›  │
│ Sécurité · À propos       ›  │
│══════════════════════════════│
│  Gare     Contributions  ⚙   │
└──────────────────────────────┘
```

### E11 — Dessiner un quai (ajout v0.2)

- **Objectif** : créer un quai absent d'OSM, sur l'image aérienne, sans compétence d'édition.
- **Principe (v0.3, demande de Loïc)** : **polygone libre**. L'utilisateur fait le tour du quai coin après coin avec le réticule fixe (« Ajouter un point »), puis ferme la forme en touchant le point 1 ou avec « Fermer le quai ». Les points proches de la voie s'accrochent sur une ligne parallèle à ~1,5 m de l'axe, pour que le bord côté voie reste parallèle. Outils : annuler le dernier point, déplacer un point (sélection puis croix de micro-déplacement), longueur des côtés affichée. Minimum 3 points, contrôle des côtés qui se croisent.
- **Tags créés** : `railway=platform` + `public_transport=platform` + `train=yes` + `area=yes` si besoin, puis passage direct sur E7 pour les numéros (sur place) ou enregistrement sans numéro (à distance → quête Q1 créée).
- **Non fait au MVP** : quais à trou (multipolygones), bords de quai `platform_edge`, ajout à la relation `stop_area` (signalé dans le commentaire du changeset pour les cartographes).
- **Garde-fous** : longueur minimale 20 m et maximale 800 m ; alerte si le rectangle chevauche une voie ou un quai existant ; bouton « Annuler le dernier point ».
- **États** : ortho indisponible → dessin bloqué (« L'image aérienne est nécessaire pour dessiner un quai ») ; hors-ligne avec zone téléchargée → possible, envoi différé.

```
┌──────────────────────────────┐
│ ✕ Dessiner un quai     2 / 3 │
│ Placez la fin du bord côté   │
│ voie                         │
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│ ← voie
│▓▓ ●- - - - - - - - -╋ ▓▓▓▓▓▓▓│ ← bord en cours
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│ Longueur 142 m · le long de  │
│ la voie 2                    │
│ [↶ Annuler le point]         │
│ ┌──────────────────────────┐ │
│ │      Placer ce point     │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

---

## 4. Système de quêtes et indicateurs de complétude

### 4.1 Définition d'une quête
Une quête = **un manque ou un doute détecté automatiquement** dans les données OSM de la gare, formulé en langage voyageur, regroupé par type et par quai.

| Quête | Condition de détection (à aligner sur le rapport tags) | Formulation | Écran ouvert |
|---|---|---|---|
| Q0 Quais absents | Aucun `railway=platform`/`public_transport=platform` dans l'emprise de la gare | « Aucun quai cartographié » | **E11** |
| Q1 Numéro de quai | Quai sans `ref` | « 2 quais sans numéro » | E5 centré → E7 (sur place) |
| Q2 Numéro de voie | `railway=rail` longeant un quai, sans `railway:track_ref` | « 5 voies sans numéro » | E5 centré → E7 (sur place) |
| Q3 Lien quai–voie | `ref` du quai ≠ `railway:track_ref` des voies adjacentes | « Quai A : numéros à vérifier » | E7 |
| Q4 Pancartes d'arrêt | Tronçon de voie le long d'un quai sans nœud `railway:signal:stop` | « Quai B : pancartes à relever » | E6 (série, sur place) |
| Q5 Pancarte incomplète | Pancarte sans `railway:signal:direction`, ou en ancien format `FR:ARRET_*` | « 3 pancartes à compléter » | E7 (sur place) |
| Q6 Vérification | Objet sans `check_date` ou `check_date` > 2 ans | « 3 objets à vérifier » | E7 (vérif.) |
| Q7 Incohérence | Deux voies de la gare avec le même `railway:track_ref`, valeur non standard (« Voie 1 » dans `name`) | « Deux voies portent le numéro 2 » | E7 |

Les quêtes marquées « sur place » s'affichent à distance avec un cadenas et la mention « À faire en gare ».

### 4.2 Priorisation (ordre d'affichage sur E4)
1. Incohérences (Q7) — impact fort sur OSRD.
2. Numéros de quais (Q1) puis de voies (Q2) — prérequis aux pancartes.
3. Liens quai–voie (Q3).
4. Pancartes (Q4, Q5) — groupées **par quai** pour une session sur place cohérente.
5. Vérifications (Q6).

Si l'utilisateur est **sur place** (GPS récent dans la gare), les quêtes « sur place » (pancartes, numéros affichés) remontent ; **à distance**, les quêtes faisables sur ortho (lien quai–voie, positionnement d'objets visibles) remontent, avec la mention « Vérifiable sur l'image aérienne ».

### 4.3 Indicateurs de complétude
- Par type : **compte en clair** « 4/6 quais numérotés » + jauge segmentée (1 segment par objet jusqu'à 12, sinon proportionnelle). Jamais de pourcentage seul.
- Pancartes : dénominateur = quais (« 2 quais sur 6 ont leurs pancartes »), car le nombre réel de pancartes est inconnu tant que personne ne les a relevées.
- Gare : 3 états textuels, avec icône : « À compléter » · « Presque complète » (tout Q1–Q3 fait) · « Complète » (Q1–Q5 faits, aucune incohérence). Affichés dans les résultats de E3.
- Fraîcheur : « Dernière vérification : il y a 3 mois ».

### 4.4 Motivation (sobre)
- Retour immédiat après chaque saisie (bandeau + jauge qui se met à jour, sans animation).
- Proposition « Suivante sur ce quai » pour enchaîner.
- Compteurs personnels sur E9. Pas de classement ni de badges au MVP (voir question ouverte 4).

---

## 5. Principes visuels

### 5.1 Palette (contrastes WCAG calculés)

Thème clair (fond `#FFFFFF`) :

| Rôle | Couleur | Contraste sur fond |
|---|---|---|
| Texte principal | `#1A1D21` | 16,9:1 |
| Texte secondaire | `#4A515B` | 8,0:1 |
| Primaire (boutons, liens) | `#0B4F9C` (texte blanc dessus : 8,0:1) | 8,0:1 |
| Objet Quai | `#00707A` (sarcelle) | 5,8:1 |
| Objet Voie | `#6A3FB5` (violet) | 7,0:1 |
| Objet Pancarte | `#A34A00` (orange brûlé) | 5,9:1 |
| État complet | `#1E7A34` | 5,4:1 |
| État manquant | `#8A5A00` | 5,9:1 |
| Danger / sécurité | `#B3261E` | 6,5:1 |

Thème sombre (fond `#121417`, défaut si système sombre ; recommandé pour l'économie d'énergie sur OLED) :

| Rôle | Couleur | Contraste sur fond |
|---|---|---|
| Texte principal | `#ECEEF1` | 15,9:1 |
| Texte secondaire | `#AEB6C0` | 9,0:1 |
| Primaire | `#8CB8FF` (texte `#121417` dessus : 9,2:1) | 9,2:1 |
| Quai / Voie / Pancarte | `#4FC7CF` / `#B79CFF` / `#FFA45C` | 9,1 / 8,1 / 9,4:1 |
| Complet / Manquant / Danger | `#6FD48A` / `#F2C14E` / `#FF8A80` | 10,1 / 11,0 / 8,1:1 |

Règles :
- **Sur l'ortho**, les couleurs seules ne suffisent pas (sarcelle sur ballast gris ≈ 1,3:1) : tout tracé ou pictogramme sur carte porte un **halo** blanc (clair) ou noir (sombre) de 2 px pour garantir ≥ 3:1 (WCAG 1.4.11).
- Réticule : jaune `#FFD400` + halo noir (14,7:1), visible sur toutes les textures.
- Mode « Plein soleil » : texte principal noir pur, traits ×1,5, ortho légèrement désaturée/éclaircie pour faire ressortir les tracés.
- Aucune information portée par la couleur seule : toujours icône ou texte (✓, ?, !).

### 5.2 Typographie
- **Atkinson Hyperlegible** (décision v0.2) (lisibilité, distinction 1/l/I, 0/O — utile pour les numéros de voie) ; repli système (`system-ui`).
- Échelle (sp, suit la taille système, testée à 200 %) : Titre 24/32 gras · Sous-titre 18/24 semi-gras · Corps 16/24 · Légende 14/20 (minimum).
- Numéros de quai/voie/pancarte : chiffres tabulaires, gras, ≥ 20 sp dans les fiches.

### 5.3 Iconographie des 3 objets
Pictogrammes simples, trait 2 px, lisibles à 24 dp, chacun avec sa couleur **et** une forme distincte :

| Objet | Pictogramme | Forme du marqueur sur carte |
|---|---|---|
| Quai | Rectangle allongé avec bord épais côté voie (`▭`) | Pastille **carrée** au centre du quai, contenant le numéro (« B ») ou « ? » |
| Voie | Deux rails + traverses (`═`) | Pastille **ronde** sur l'axe, contenant le numéro (« 2 ») ou « ? » |
| Pancarte d'arrêt | Panneau carré sur mât, avec chiffre (`⚑`) — s'inspirer de la vraie pancarte (fond blanc, chiffre noir) | **Losange/panneau** sur le bord de quai, contenant le texte (« 8 ») |

États superposés en coin du marqueur : ✓ complet · ? manquant · ! à vérifier/conflit · ⏱ en attente d'envoi.
Autres icônes : jeu standard sous licence libre (ex. Material Symbols ou Lucide), trait homogène.

### 5.4 Ton rédactionnel
- **Vouvoiement**, phrases courtes, verbes d'action (« Placez », « Vérifiez »).
- **Vocabulaire voyageur** à l'écran (« numéro du quai », « panneau d'arrêt ») ; termes OSM (« changeset », « tag ») seulement en mode expert ou entre parenthèses la première fois.
- Rassurant sur l'erreur : « Pas d'inquiétude, vous pourrez corriger avant l'envoi. »
- Messages de sécurité **fermes et sobres**, jamais culpabilisants : « Restez derrière la ligne de sécurité. Tout se fait depuis le quai. »
- Remerciement factuel, sans emphase : « Merci, c'est enregistré. »
- i18n : toutes les chaînes externalisées, pas de texte dans les images, prévoir +30 % de longueur (allemand), pluriels gérés (ICU).

---

## 6. Accessibilité et sobriété — check-list pour les maquettes

- Cibles tactiles ≥ 48 × 48 dp, espacées de 8 dp ; actions principales dans le tiers inférieur (usage à une main).
- Alternative à tout glisser (croix de micro-déplacement, boutons zoom +/−) — WCAG 2.5.7.
- Focus visible, ordre de lecture logique, libellés pour lecteurs d'écran sur la carte (« Quai B, numéroté, 2 pancartes »). Vue **Liste** équivalente à la carte (E4).
- Pas d'authentification à mémoriser (OAuth OSM) — WCAG 3.3.8.
- Respect de `prefers-reduced-motion` ; aucune animation décorative ; transitions ≤ 150 ms.
- GPS uniquement sur action explicite, coupé après obtention ; pas de suivi continu.
- Hors-ligne : pré-téléchargement explicite d'une gare (données OSM + ortho zoom 17–20 dans un rayon ~800 m), taille affichée avant téléchargement.
- Message de sécurité : à l'onboarding, en rappel discret sur E6 la première fois, et dans Réglages.

---

## 7. Questions ouvertes pour Loïc

1. **Envoi** : un changeset par gare après relecture sur E8 (proposé), ou envoi immédiat à chaque objet (plus simple mais plus de changesets et moins de contrôle) ?
2. **Pancartes d'arrêt** : quel niveau de détail au MVP — seulement position + texte de la pancarte, ou aussi les conditions (composition US/UM, longueur, type de train) et le sens ? Dépend du rapport tags et des besoins réels d'OSRD.
3. **Contribution à distance** : l'autoriser pour tous les objets, ou réserver l'ajout de numéros et de pancartes à « sur place » (non visibles sur l'ortho) et laisser le distant aux positions/vérifications ? Faut-il une photo de preuve (ex. via Panoramax), hors OSM ?
4. **Motivation** : rester sur des compteurs personnels sobres (proposé), ou ajouter badges / classement par gare pour l'engagement ?
5. **Gares sans quais dans OSM** : le MVP se limite-t-il aux gares dont les quais existent déjà (proposé : signalement via note OSM), ou faut-il permettre de dessiner un quai (forte complexité UX) ?
