# railcomplete

Application web mobile (PWA) pour compléter, dans [OpenStreetMap](https://www.openstreetmap.org/), les données ferroviaires des gares françaises : numéros des quais, numéros des voies, pancartes d'arrêt des trains.

Site : <https://railcomplete.org>

> **Sécurité** : restez toujours derrière la ligne de sécurité. Tout se fait depuis le quai ou à distance, sur la photo aérienne.

## État

Lot 0a : page d'accueil (présentation et consignes de sécurité) et page « À propos », publiées sur railcomplete.org.

## Développer sur son ordinateur

Prérequis : [Node.js](https://nodejs.org/) 22.17 ou plus récent.

```sh
npm install        # installe les dépendances (une seule fois)
npm run dev        # lance le site sur http://localhost:5173
npm run check      # vérifie les types
npm run lint       # vérifie la mise en forme et le code
npm run build      # construit le site statique dans build/
```

## Publication

Chaque envoi sur la branche `main` déclenche le workflow `.github/workflows/deploy.yml`, qui vérifie, construit et publie le site sur GitHub Pages. Le fichier `static/CNAME` relie le site au domaine `railcomplete.org`.

## Documentation

- `docs/ux-spec.md` : spécification UX (écrans, quêtes, principes visuels)
- `docs/osm-tags-rapport.md` : modèle de données OpenStreetMap
- `docs/architecture.md` : architecture technique et plan en lots

## Licences

- Code : [GPL-3.0-or-later](LICENSE)
- Données contribuées : © contributeurs OpenStreetMap, licence [ODbL](https://opendatacommons.org/licenses/odbl/)
- Photographies aériennes : IGN – BD ORTHO, Licence Ouverte 2.0
- Police : Atkinson Hyperlegible (SIL Open Font License)
