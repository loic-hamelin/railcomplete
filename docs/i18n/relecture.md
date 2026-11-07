# Relire et corriger les traductions

Merci de relire stationcomplete dans votre langue ! Ce guide suffit, même sans savoir programmer.

## Où sont les textes

- Un fichier par langue : `src/lib/i18n/messages/fr.json` (français, langue d'origine), `en.json`, `de.json`, `it.json`, `es.json`.
- Les textes sont rangés par écran : `home` (accueil), `stations` (choisir une gare), `station` (tableau de bord), `map` (carte), `input` (fiche d'un objet), `place` (placer une pancarte), `drawPage` et `shapePage` (dessiner ou modifier un quai), `sendPage` (relire et envoyer), `settings` (réglages), `data` et `legal` (pages légales)…
- Le vocabulaire commun (quai, voie, pancarte d'arrêt, changeset…) est dans `docs/i18n/glossaire.md` ; les termes marqués ⚠ sont ceux sur lesquels votre avis compte le plus.

## Ce qu'il ne faut pas changer

- Les **clés** (à gauche des deux-points) : seul le texte à droite se traduit.
- Ce qui est **entre accolades** : `{name}`, `{count}` sont remplacés par l'appli. Dans `{count, plural, one {# quai} other {# quais}}`, ne traduisez que les textes des cas (`one`, `other`, et selon les langues `few`, `many`) ; `#` est le nombre. Dans `{g, select, f {…} other {…}}`, `g` est le genre grammatical : vous pouvez écrire le même texte dans tous les cas si votre langue n'accorde pas.
- Les **balises** `<b>…</b>`, `<osm>…</osm>`, `<settings>…</settings>`… : gardez-les, autour du mot qui convient dans votre phrase.
- Les termes du schéma français des pancartes (TT, n V, L, Z57, Z50, TGV, UFR, RBT, US, UM) et le nom « stationcomplete ».

## Voir le texte dans l'appli

Ouvrez <https://stationcomplete.org>, puis **Réglages → Apparence → Langue**. Le mode démonstration (Réglages → Saisie) permet de voir les écrans de saisie sans être en gare.

## Proposer une correction sur GitHub

1. Créez un compte GitHub si besoin, puis ouvrez le fichier de votre langue dans le dépôt <https://github.com/loic-hamelin/stationcomplete> (dossier `src/lib/i18n/messages/`).
2. Cliquez sur le crayon « Edit this file » : GitHub crée pour vous une copie du projet.
3. Corrigez le texte (gardez les guillemets droits `"` qui entourent chaque texte, et la virgule en fin de ligne).
4. En bas, décrivez la correction (« de : Haltetafel → Halteorttafel ») puis « Propose changes » et « Create pull request ».
5. Les tests automatiques vérifient qu'aucune clé, aucun `{paramètre}` ni aucune balise n'a été perdu ; s'ils échouent, nous vous aiderons dans la discussion de la pull request.

Vous préférez ne pas toucher aux fichiers ? Ouvrez un ticket (<https://github.com/loic-hamelin/stationcomplete/issues>) avec la phrase, l'écran et votre proposition, ou écrivez à contact@stationcomplete.org.

## Ajouter une langue

C'est possible : demandez-le dans un ticket. La marche à suivre technique est dans `docs/architecture.md` (§ 9.2.5).
