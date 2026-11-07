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
> - un point partagé avec un autre objet (contour de la gare, bâtiment, toit, chemin, bord de quai…) ou qui porte des tags **peut être déplacé** : c'est le même nœud, seul lui est modifié, et **les objets qui le partagent suivent**. C'est voulu (sur les quais réels, presque tous les points sont partagés, souvent avec le contour de la gare), mais cela change aussi la forme de ces objets : l'appli le dit **avant** de valider (« Ce point est aussi un point de : la gare et un bâtiment — ils suivront le déplacement »), puis dans le récapitulatif et le commentaire du changeset (« … gare et bâtiment ajustés aussi ») ; seule exception, un point qui appartient à une voie ferrée reste verrouillé : la géométrie des voies n'est jamais modifiée ;
> - un point partagé ou tagué n'est **jamais supprimé** : retiré du contour, il quitte seulement le quai ; un point du bord du quai (`railway=platform_edge`) n'est jamais retiré du contour ;
> - juste avant l'envoi, l'appli relit les données à jour ; si quelque chose a changé, la saisie est mise de côté au lieu d'écraser le travail d'un autre ;
> - un quai supprimé est retiré de ses relations (zone d'arrêt, lignes), et l'utilisateur le voit écrit en clair avant de confirmer ; les multipolygones ne sont pas modifiables dans l'appli ;
> - le motif de suppression figure dans le commentaire du changeset.
>
> La page wiki est à jour. Les remarques sont bienvenues, en particulier sur deux points : le déplacement d'un point partagé (faut-il le limiter à certains objets voisins ?) et la suppression d'un quai qui appartient à des relations de lignes (vaut-il mieux la refuser et laisser faire dans JOSM ?).

## 3. Commentaire sur le ticket des administrateurs de l'API (en anglais)

> Update before the pilot goes further: stationcomplete can now also edit the geometry of existing platforms (move/add/remove nodes of the outline; turn a linear platform into an area while keeping the same way id) and delete a platform (with a mandatory reason; the platform is removed from its relations). Since real platforms share most of their nodes with other features (station outline, buildings, roofs, platform edges), a node shared with another way, or carrying tags, may now be moved: it is the same node, so only the node is modified and every way sharing it follows. Exception: a node that belongs to a railway track (rail, light_rail, tram…) stays locked; track geometry is never modified. The user is told before confirming which features will follow, and the changeset comment says so (e.g. "station and building adjusted too"). Shared or tagged nodes are never deleted: removing one from the outline only removes it from the platform way, and a node shared with a `railway=platform_edge` way is never removed from the outline. Just before uploading, the app re-reads the platform way and its area with one `GET /api/0.6/map` call (bbox of its nodes + 10 m; per-node `ways`/`relations` calls only as a fallback): if the way or a moved node has a new version, the edit is put aside; a removed node is deleted only if it is still unused and untagged. Expected volume is unchanged: a handful of calls per upload.
