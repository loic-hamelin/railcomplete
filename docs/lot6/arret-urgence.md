# Arrêt d'urgence et phase pilote : mode d'emploi

Tout se règle dans un seul fichier public, **`static/config.json`**, que vous modifiez directement sur GitHub, sans rien installer. L'appli relit ce fichier juste avant chaque envoi.

```json
{
	"uploadsEnabled": true,
	"minVersion": "0.4",
	"message": null,
	"pilotUsers": []
}
```

| Champ            | Rôle                                                                                                                                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `uploadsEnabled` | `false` coupe **tous** les envois, sur la vraie carte comme sur le serveur de test. Les saisies restent dans les téléphones et partiront plus tard.                                                 |
| `message`        | Texte affiché à tous sur l'écran d'envoi, entre guillemets (ex. `"Envois suspendus : correction en cours."`), ou `null` pour rien afficher.                                                         |
| `minVersion`     | Version minimale de l'appli autorisée à envoyer. Sert si une ancienne version est fautive : l'utilisateur est invité à fermer et rouvrir l'appli pour la mettre à jour.                             |
| `pilotUsers`     | Pseudos OSM autorisés à envoyer sur la **vraie carte** pendant le pilote, ex. `["Pseudo1", "Pseudo2"]`. `[]` = personne. `null` (sans guillemets) = tout le monde, à mettre à l'ouverture publique. |

## Couper les envois (en cas de problème)

1. Ouvrez https://github.com/loic-hamelin/stationcomplete/edit/main/static/config.json (connecté à GitHub).
2. Remplacez `"uploadsEnabled": true` par `"uploadsEnabled": false`, et mettez un message, par exemple `"message": "Envois suspendus : correction en cours."`.
3. Cliquez sur **Commit changes…**, puis de nouveau **Commit changes**.
4. Le site se met à jour tout seul. Comptez le temps du déploiement (onglet **Actions**, quelques minutes), plus 10 minutes au plus de cache de GitHub Pages.

Pour rétablir, faites l'inverse : `true` et `"message": null`.

## Ajouter un testeur pendant le pilote

Même procédure, en ajoutant son pseudo OSM **exactement** (majuscules et espaces compris) dans `pilotUsers`.

## Ouvrir à tous

Mettez `"pilotUsers": null`.

## Attention au format

Une virgule oubliée ou en trop rend le fichier illisible. Les tests automatiques le vérifient : le déploiement échoue alors (croix rouge dans l'onglet **Actions**) et **l'ancienne version reste en ligne**, donc l'arrêt n'est pas pris en compte. Vérifiez toujours que le déploiement est vert. En cas de doute, collez le fichier sur https://jsonlint.com avant de valider.
