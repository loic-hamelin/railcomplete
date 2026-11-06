# Annonce sur le forum OSM France

À publier sur https://community.openstreetmap.org, catégorie **France**, **avant** que les testeurs du pilote envoient leurs premières modifications sur la vraie carte. Le texte se colle tel quel : le forum lit le Markdown.

---

**Titre :** stationcomplete : une appli pour compléter les numéros de quais, de voies et les pancartes d'arrêt des gares

**Message :**

Bonjour à tous,

Je prépare **stationcomplete** (https://stationcomplete.org), une petite appli web pour téléphone, libre (GPL-3.0), qui aide à compléter les données des gares françaises dans OSM :

- les numéros des quais (`ref`, et `local_ref` quand le quai porte son propre numéro ou une lettre) ;
- les numéros locaux des voies (`railway:track_ref`) ;
- les pancartes d'arrêt des trains (`railway=signal` + `railway:signal:stop=FR:passenger_stop`, selon le schéma retravaillé cette année) : TT, nV, L, Z57 ;
- les quais absents d'OSM, tracés sur la BD ORTHO de l'IGN.

Quelques principes :

- les numéros ne se saisissent **que sur place** (la position est vérifiée sur le téléphone et n'est jamais envoyée) ; à distance, on peut seulement placer ou vérifier des objets sur la photo aérienne ;
- **un changeset par gare**, relu par la personne avant envoi, sous son propre compte, avec `created_by=stationcomplete`, `hashtags=#stationcomplete`, `source=survey` ou `imagery_used=BDOrtho IGN` ;
- l'appli ne supprime rien et ne touche qu'aux clés ci-dessus ; si un objet a changé entre-temps, la saisie est mise de côté au lieu d'écraser le travail d'un autre ;
- un interrupteur me permet de suspendre tous les envois en quelques minutes en cas de problème.

Tout est décrit sur [la page wiki de stationcomplete](https://wiki.openstreetmap.org/wiki/User:LoicHam/Stationcomplete).

**Pilote.** Pendant quelques semaines, 3 à 5 testeurs vont l'utiliser dans quelques gares. Seuls leurs comptes pourront envoyer vers OSM pendant cette phase, et leurs changesets seront relus. L'ouverture à tous viendra ensuite, si tout se passe bien.

Deux questions à la communauté :

1. **`ref` / `local_ref` des quais** : l'appli met dans `ref` les numéros des voies longeant le quai (« 1;3 »), et dans `local_ref` le numéro ou la lettre affiché sur le quai quand il diffère. Est-ce que cela vous convient ?
2. Les retours sur les tags écrits sont les bienvenus avant l'ouverture à tous.

Vos remarques sont bienvenues ici, ou à contact@stationcomplete.org. Si un changeset #stationcomplete vous paraît faux, commentez-le directement sur OSM.

Merci !
Loïc
