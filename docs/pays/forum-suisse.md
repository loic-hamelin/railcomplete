# Message au forum OSM suisse

À publier sur https://community.openstreetmap.org, catégorie **Switzerland**, sous votre compte, **avant** tout envoi en Suisse (sur le serveur de test, aucun problème). Laissez au moins deux à trois semaines aux réponses.

Le texte est en anglais, avec un résumé en allemand et en français, comme le font souvent les fils de cette catégorie. Le forum lit le Markdown.

Avant de publier :

- remplacez `[lien wiki]` par l'adresse de la page wiki de stationcomplete ;
- relisez le résumé allemand : il ne doit dire que ce que vous savez vrai.

---

**Titre :** stationcomplete: a mobile web app to complete platform/track numbers and train stop signs — plans for Switzerland, feedback welcome

**Message :**

Hello everyone,

I'm Loïc (LoicHam), a French railway engineer. I develop **stationcomplete** (https://stationcomplete.org), a free and open-source (GPL-3.0) mobile web app that helps people complete railway station data in OSM: platform numbers, local track numbers, train stop signs, and the shape of platforms. It has been running in France since November 2026, in a small pilot, with a page on the wiki: [lien wiki].

I would like to open it in **Switzerland** (whole country; German, French and Italian interface), and I'd rather ask you first how you want things done here. Nothing will be uploaded in Switzerland before this discussion.

**What the app would write**

- On platforms (`railway=platform`): `ref` = the track numbers along the platform, separated by `;` (e.g. `ref=4;5`), as in the German wiki page for `railway=platform_edge`. The sectors A–D are never written into `ref` or `local_ref`.
- On tracks (`railway=rail`): `railway:track_ref` (local track number in the station).
- Train stop signs (FDV R 300.2 § 5.5.7), as new nodes on the track: `railway=signal`, `railway:signal:direction`, `railway:signal:position`, `railway:signal:stop=CH-FDV:577` … `CH-FDV:580`, `railway:signal:stop:form=sign`, `railway:signal:stop:caption` (e.g. `2`, `A 48`, `120 m`), following DE:OpenRailwayMap/Tagging in Switzerland.
- Platform shape: users can fix the outline of a platform or draw a missing one on SWISSIMAGE. A node shared with other objects (platform edge, roof, station area…) can be moved, and those objects follow, since it is the same node. Nodes are never deleted if they are used elsewhere. Platforms modelled as multipolygons are not edited.
- `uic_ref` and `ref:sloid` are read only, never changed. Track geometry and infrastructure tags (signalling, ETCS, speeds…) are never touched.

**How edits are made**

- Numbers can only be entered **on site** (position checked on the phone, never sent). Remotely, users can only place or check objects on the aerial imagery.
- **One changeset per station**, reviewed by the user before upload, under their own account, tagged `created_by=stationcomplete <version>`, `hashtags=#stationcomplete`, `source=survey` for on-site data, `imagery_used=swissimage (swisstopo)` when imagery was used.
- Before uploading, the app re-reads the current data; if something changed meanwhile, the edit is put aside instead of overwriting someone else's work.
- A kill switch lets me suspend all uploads within minutes.

**Questions for you**

1. Are `ref` on platforms and `railway:track_ref` on tracks the right keys in Switzerland? Is `local_ref` useful here at all?
2. Stop signs: is the `CH-FDV:577–580` + `caption` scheme the one you want new contributors to use?
3. Anything else the app should not do here (local defaults, sensitive keys, areas to avoid)?
4. Would some of you like to join a **closed pilot** before any public opening? Uploads would first go to the OSM test server.

---

**Kurz auf Deutsch:** stationcomplete ist eine freie Web-App für Mobilgeräte, mit der man Gleisnummern (`railway:track_ref`), Bahnsteignummern (`ref`) und Halteorttafeln (`CH-FDV:577–580`) in Bahnhöfen erfassen kann. Nummern werden nur vor Ort erfasst, ein Changeset pro Bahnhof, nichts wird ohne Prüfung hochgeladen. Bevor die App in der Schweiz Daten hochlädt, möchte ich eure Meinung zum Tagging einholen und einen geschlossenen Pilotversuch vorschlagen. Rückmeldungen gerne auch auf Deutsch.

**En bref en français :** stationcomplete est une appli libre pour téléphone qui aide à compléter les numéros de quais et de voies et les pancartes d'arrêt (`CH-FDV:577–580`) dans les gares. Avant tout envoi en Suisse, je souhaite votre avis sur le balisage et vous propose un pilote fermé. Réponses bienvenues en français.

Thanks!
Loïc
