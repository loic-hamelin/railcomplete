# Brouillon — Forum OSM France (catégorie France)

**Titre proposé :** Pancartes d'arrêt « UM1 », « UM2 », « 72500 US » : comment les taguer ? (et avis sur quais/voies)

---

Bonjour à toutes et à tous,

Je prépare **stationcomplete**, une application web libre de contribution citoyenne. Depuis le quai, des voyageurs y complètent trois informations des gares françaises : numéros de quais, numéros de voies et pancartes d'arrêt. Numéros et pancartes sont **relevés sur place**. Chaque modification est **saisie et validée individuellement par une personne**, avec son propre compte OSM, gare par gare. Il n'y a **aucune édition automatisée**.

Je m'adresse notamment à l'auteur de la section « Arrêts voyageurs » de la page _OpenRailwayMap/Tagging in France_ : merci pour la refonte 2026, que nous suivons.

**1. Pancartes US/UM hors Z57, Z50 et TGV.** Comment taguer « UM1 », « UM2 » ou « 72500 US » ? Le schéma ne prévoit `for=single_unit/multiple_unit` que sous Z57, Z50 et TGV. Notre piste, à confirmer :

```
railway:signal:stop:conventional=???
railway:signal:stop:conventional:for=multiple_unit
railway:signal:stop:conventional:unit_number=2
railway:signal:stop:conventional:trainset=X72500
```

Quelle valeur principale utiliser, et dans quelle catégorie ?

**2. Pancartes nV.** Pouvez-vous confirmer cette lecture pour 3V, 4V, 5V, 6V, 8V et 10V ?

```
railway:signal:stop=FR:passenger_stop
railway:signal:stop:conventional=FR:vehicle_number
railway:signal:stop:conventional:form=sign
railway:signal:stop:conventional:for=vehicles
railway:signal:stop:conventional:number=8
```

**3. Quais et voies : vos avis sont les bienvenus.**

```
# quai
railway=platform + public_transport=platform + train=yes
ref=1;2        ← numéros des voies desservies
local_ref=A    ← lettre du quai, si elle existe
# voie
railway:track_ref=2   ← numéro affiché en gare
```

Nous n'écraserons jamais une valeur existante sans la montrer au contributeur.

Merci d'avance pour vos retours !

Loïc
