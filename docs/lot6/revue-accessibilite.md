# Revue d'accessibilité (lot 6)

## Vérifié automatiquement, à chaque déploiement

- Règles WCAG 2.2 A et AA (axe-core) sur tous les écrans, sur les profils Android et iPhone : accueil, gares, tableau de bord, carte, placement, saisie, dessin, envoi, contributions, réglages, connexion, pages légales.
- Thème sombre : contrastes conformes sur l'accueil, les réglages, À propos et les données personnelles.
- Pas de défilement horizontal à 320 px de large (WCAG 1.4.10, équivalent d'un zoom à 400 %) sur les pages sans carte.
- Toutes les commandes de la carte ont un équivalent par boutons : flèches de 20 cm, zoom +/−, sommets du quai sous forme de boutons numérotés.
- Focus visible au clavier (`:focus-visible`) ; animations réduites si le téléphone le demande.

## À vérifier à la main sur téléphone (pendant le pilote)

Avec le lecteur d'écran activé (TalkBack sur Android, VoiceOver sur iPhone) :

- [ ] Choisir une gare, ouvrir une tâche « numéro de voie », saisir et enregistrer sans regarder l'écran.
- [ ] Sur l'écran d'envoi, les messages (envoi réussi, saisie à revoir, envois suspendus) sont bien lus à voix haute.
- [ ] Taille du texte réglée au maximum dans le téléphone : aucun texte coupé, aucun bouton inaccessible.
- [ ] En plein soleil, sur le quai : la croix de visée et les boutons restent lisibles.

## Limites connues

- Placer une pancarte ou dessiner un quai demande de voir la photo aérienne. Les numéros de quais et de voies restent saisissables sans la carte.
- Le design sera repris (traits trop épais, objets trop grossiers) : refaire cette revue après la refonte.
