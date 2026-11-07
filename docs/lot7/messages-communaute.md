# Lot 7 : informer la communauté

L'annonce du forum, la page wiki et le ticket des administrateurs de l'API disaient que l'appli ne supprime rien et ne touche qu'à quelques tags. C'est faux depuis le lot 7 : il faut le dire **avant** le premier envoi qui modifie une forme ou supprime un quai.

## 1. Page wiki

Ouvrez la page wiki de stationcomplete, cliquez sur « Modifier le code source », remplacez tout par le contenu de `docs/lot6/wiki-FR-Stationcomplete.wiki` (sans la première ligne en italique), résumé : « Lot 7 : forme et suppression des quais ».

## 2. Réponse sur le fil du forum (à coller telle quelle)

> Petite mise à jour avant d'aller plus loin : à la demande des premiers essais, stationcomplete permet maintenant aussi de **corriger les quais existants** :
>
> - modifier la forme d'un quai (déplacer, ajouter ou retirer des points du contour) ;
> - redessiner en surface un quai tracé comme une simple ligne ;
> - supprimer un quai, avec un motif obligatoire : « en double » (permis à distance) ou « n'existe plus » (seulement sur place, la photo pouvant être ancienne).
>
> Les garde-fous :
>
> - le quai garde son identifiant (historique et relations conservés) ;
> - un point qui porte des tags ou qui est partagé avec un autre objet n'est **jamais** déplacé ni supprimé, sauf un cas : un point partagé **seulement avec le bord du quai** (`railway=platform_edge`, sans tag ni relation) peut être déplacé, et le bord suit (c'est le même nœud) ; il n'est jamais retiré du contour ;
> - l'appli dit à l'utilisateur à quoi un point verrouillé est relié (toit, bâtiment, chemin piéton…) et l'envoie vers JOSM ou iD pour ceux-là ;
> - juste avant l'envoi, l'appli relit les données à jour ; si quelque chose a changé, la saisie est mise de côté au lieu d'écraser le travail d'un autre ;
> - un quai supprimé est retiré de ses relations (zone d'arrêt, lignes), et l'utilisateur le voit écrit en clair avant de confirmer ; les multipolygones ne sont pas modifiables dans l'appli ;
> - le motif de suppression figure dans le commentaire du changeset.
>
> La page wiki est à jour. Les remarques sont bienvenues, en particulier sur la suppression d'un quai qui appartient à des relations de lignes : vaut-il mieux la refuser et laisser faire dans JOSM ?

## 3. Commentaire sur le ticket des administrateurs de l'API (en anglais)

> Update before the pilot goes further: stationcomplete can now also edit the geometry of existing platforms (move/add/remove untagged, unshared nodes; turn a linear platform into an area while keeping the same way id) and delete a platform (with a mandatory reason; the platform is removed from its relations). Nodes that carry tags or are shared with other objects are never moved or deleted, with one exception: a node shared only with `railway=platform_edge` ways (no tags, no relations) may be moved — the platform edge follows, since it is the same node (only the node is modified); such nodes are never removed from the outline, and the app re-checks just before upload that they are still shared only with platform edges. Just before uploading, the app re-reads the platform's area with one `GET /api/0.6/map` call (bbox of its nodes + 10 m; per-node `ways`/`relations` calls only as a fallback) and puts the edit aside if anything changed. Expected volume is unchanged: a handful of calls per upload.
