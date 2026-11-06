# Message aux administrateurs de l'API OSM (OSMF Operations)

La politique d'usage de l'API demande d'en parler aux administrateurs avant de lancer une application qui l'utilise. Deux possibilités :

- en ouvrant un ticket sur https://github.com/openstreetmap/operations/issues (public, avec votre compte GitHub) : **recommandé**, car l'adresse contact@stationcomplete.org ne fait que recevoir (redirection) et ne peut pas envoyer ;
- ou par courriel à **operations@osmfoundation.org**, depuis votre boîte habituelle (les administrateurs verront alors cette adresse).

À envoyer **avant le début du pilote** (la politique demande d'en parler avant de commencer) : remplacez les éléments entre crochets. Le texte est en anglais, la langue de l'équipe. À la fin du pilote, une courte réponse sur le même fil donnera les volumes mesurés.

---

**Objet :** New editing app "stationcomplete" (French railway stations) – API usage

Hello,

I am about to open **stationcomplete** (https://stationcomplete.org), a free and open-source (GPL-3.0) mobile web app that helps volunteers complete railway station data in France: platform numbers, local track numbers, train stop signs, and missing platforms. Source code: https://github.com/loic-hamelin/stationcomplete. Documentation: https://wiki.openstreetmap.org/wiki/User:LoicHam/Stationcomplete

Following the API usage policy, here is how it uses the API:

- **Reading:** one `GET /api/0.6/map` per station, on a tight bounding box computed in advance (station area + 100 m), at most once a day per station and per device; results are cached on the device. Before uploading, only the edited elements are re-read (`/nodes`, `/ways`, `/relations`). At most 2 parallel requests. No Overpass, no tiles from openstreetmap.org (the background imagery comes from the French IGN).
- **Writing:** OAuth 2 (PKCE, public client, scopes `read_prefs write_api`), one small changeset per station after the user reviews it, tagged `created_by=stationcomplete <version>` and `hashtags=#stationcomplete`. No deletions. Every change is an explicit action by a human user, so it is not an automated edit.
- **Identification:** it runs in the browser, so the User-Agent is the browser's; requests carry `Referer: https://stationcomplete.org/`.
- **Expected volume:** a pilot with [N] testers starts on [date], for about two weeks: a few dozen `map` calls a day at most. I will reply to this message with the measured volumes before the public opening. After the public opening I expect at most a few hundred users across France; at, say, 300 active users opening 2 stations a day, that would be about 600 `map` calls a day.
- **Kill switch:** a static file on the site lets me suspend all uploads within minutes if something goes wrong.

The French community is informed on the forum: [link to the forum topic].

If you see anything you would like me to change, or if these volumes are a concern, please let me know: contact@stationcomplete.org.

Best regards,
Loïc Hamelin
