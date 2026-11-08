# Parrainage LRT

Plateforme de parrainage scolaire de l'association LRT : elle relie des parrains et marraines en France à des enfants scolarisés au Togo, par l'intermédiaire de relais locaux, sous le contrôle du bureau de l'association.

Cinq espaces : parrain, relais (web et mobile), enfant (session sécurisée à l'école) et bureau.

## Architecture

Monorepo npm (workspaces) :

| Dossier | Rôle | Technologies |
|---|---|---|
| `apps/web` | Interface utilisateur | Next.js 16 (App Router), React 19, Tailwind CSS 4 |
| `apps/api` | API REST | NestJS 12, Prisma 7, PostgreSQL |
| `packages/contracts` | Schémas et types partagés entre le web et l'API (compilés dans `dist`) | TypeScript, zod |
| `docker-compose.yml` | Services locaux | PostgreSQL, stockage S3 (RustFS), e-mails (Mailpit) |

Le navigateur ne parle qu'au web (`http://localhost:3000`) : les appels `/api/*` sont réécrits par Next.js vers l'API (`http://localhost:4000`), ce qui garde une seule origine pour les cookies de session.

## Prérequis

- Node.js 22.12 ou plus récent (22.22 ou plus recommandé pour la CLI NestJS)
- npm 11
- Docker Desktop

## Démarrage

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
npm install
npm run db:up      # PostgreSQL, RustFS, Mailpit
npm run db:reset   # migrations + données de démonstration
npm run dev        # API (port 4000) et web (port 3000)
```

| Service | Adresse |
|---|---|
| Application | http://localhost:3000 |
| API | http://localhost:4000/api (santé : `/api/health`) |
| E-mails (Mailpit) | http://localhost:8025 |
| Console du stockage (RustFS) | http://localhost:9001 (identifiants `S3_ACCESS_KEY` / `S3_SECRET_KEY`) |
| PostgreSQL | `localhost:5433` |

## Scripts

| Commande | Effet |
|---|---|
| `npm run dev` | compile les contrats puis lance, en parallèle, leur compilation continue, l'API et le web |
| `npm run verify` | lint, vérification des types, tests et builds de tous les paquets (contrats, API, web) |
| `npm run test` | tests unitaires (Vitest) |
| `npm run test:e2e -w @parrainage/api` | tests e2e de l'API (services Docker démarrés) ; rejoue le seed avant la suite et efface les messages ajoutés à la main dans les conversations de démonstration, rien d'autre |
| `npm run test:e2e -w @parrainage/web` | tests Playwright du web : authentification et rôles, espace parrain, débordement horizontal (360 → 1440 px) et accessibilité (axe). **Remet à zéro la base de développement** (voir ci-dessous) |
| `npm run format` | formatage (Prettier) |
| `npm run db:migrate` / `db:seed` / `db:reset` / `db:studio` | base de données (Prisma) |

## Comptes de démonstration

Créés par `npm run db:reset` (ou `npm run db:seed`, idempotent). Mot de passe commun : `motdepasse` (variable `SEED_DEFAULT_PASSWORD`, développement uniquement). Les dates du seed partent de `SEED_TODAY` (AAAA-MM-JJ, voir l'horloge de démonstration ci-dessous).

| Compte | Rôle |
|---|---|
| `claire.m@exemple.fr` | parrain (Aïcha et Kofi) |
| `paul.d@exemple.fr`, `helene.r@exemple.fr`, `marc.p@exemple.fr`, `sophie.l@exemple.fr`, `sophie.l2@exemple.fr`, `parrain1@exemple.fr` … `parrain25@exemple.fr` | parrain |
| `koffi@relais.exemple.tg` (Lomé), `diallo@relais.exemple.tg` (Kara), `agbeko@relais.exemple.tg` (Kpalimé) | relais |
| `bureau@exemple.fr` | bureau |

Les liens de connexion et de réinitialisation du mot de passe arrivent dans Mailpit (http://localhost:8025).

Le seed crée aussi les contenus du design : nouvelles des relais, échanges Claire ↔ Aïcha, résultats scolaires (Aïcha : 11,8 puis 13,4 / 20), versements simulés depuis janvier 2024 et un vrai bulletin PDF déposé dans le stockage (sans stockage démarré, il reste un emplacement réservé). Les autres médias sont des emplacements réservés (`PLACEHOLDER`).

Côté relais : chez M. Koffi, **7 bulletins du 1er trimestre à saisir** (dont Esther, Yao et Mariam), 12 enfants à l'EPP Bè et le code image d'Aïcha (Soleil, Arbre, Poisson).

Côté modération : **12 messages en attente**, dont 3 avec un média (Paul → Kofi avec un numéro WhatsApp fictif, Mariam → Hélène avec une vidéo signalée, Aïcha → Claire avec une page de bulletin, Yao → Marc, et 8 messages des binômes de Kara et Kpalimé). L'historique de Paul ↔ Kofi compte 23 messages, dont 1 retenu en mars 2025.

Côté messagerie : Claire ↔ M. Koffi (demande d'appel, puis « Créneau proposé pour l'appel »), Paul ↔ M. Koffi, Hélène ↔ M. Koffi, M. Koffi ↔ bureau (« Reçus d'octobre ») et la lettre d'information du bureau à Claire. Claire a **2 messages non lus** (le message d'Aïcha d'hier et le créneau proposé par M. Koffi), M. Koffi **1** (la demande de Claire).

**Horloge de démonstration.** L'API calcule ses dates à partir d'`APP_NOW` (instant ISO 8601, dans `apps/api/.env`) quand il est défini, sinon de l'heure réelle ; le seed part de `SEED_TODAY`, sinon du jour d'`APP_NOW`, sinon d'aujourd'hui. Avec `APP_NOW=2026-10-31T10:00:00Z` puis `npm run db:seed`, l'espace parrain reproduit la maquette.

## Authentification

- **Connexion** sur `/connexion` : e-mail et mot de passe, ou lien de connexion reçu par e-mail (valable 10 minutes, une seule fois). Chaque rôle arrive dans son espace : `/parrain`, `/relais` ou `/bureau`. `?next=` ramène vers la page demandée et `?espace=relais|bureau` adapte le sous-titre.
- **Mot de passe oublié** sur `/mot-de-passe-oublie` : le lien reçu (valable 1 heure) ouvre `/reinitialiser-mot-de-passe` ; la confirmation ne révèle pas si l'adresse a un compte.
- **Protection** : `apps/web/src/proxy.ts` renvoie vers `/connexion?next=…` un visiteur sans cookie de session ; chaque layout et chaque page d'espace vérifie ensuite la session et le rôle auprès de l'API (`GET /api/me`). Un rôle étranger arrive sur `/interdit`.
- **Comptes** : pas d'inscription libre. Une adresse inconnue n'obtient ni compte ni e-mail, avec la même réponse dans le même délai. `/api/auth/update-user` est fermé (ni nom ni photo modifiables par soi-même) et `/api/auth/admin/*` est réservé au bureau. En production, l'API refuse le `BETTER_AUTH_SECRET` d'exemple.
- **Déconnexion** : formulaire `POST /deconnexion` (sans JavaScript), qui révoque la session côté API puis efface les cookies.
- Les connexions, liens et réinitialisations passent par le client Better Auth **dans le navigateur** (`/api/auth/*` réécrit vers l'API), pour que le cookie de session soit posé sur l'origine du web.

## Messagerie et fichiers joints

- **Modération** : un message à un enfant part en relecture (`PENDING`, avec les alertes du détecteur `detectAlerts` de `@parrainage/contracts`) et n'est remis qu'une fois approuvé ; entre adultes, il est remis aussitôt. Aucun e-mail ne contient le texte d'un message : seulement un lien vers la page Messages.
- **Envoi d'un fichier** : `POST /api/uploads` renvoie une URL présignée (PUT simple jusqu'à 5 Mo, multipart par parts de 5 Mo au-delà, reprenable via `GET /api/uploads/:id/parts`) ; le navigateur dépose le fichier **directement dans le stockage**, puis `POST /api/uploads/:id/complete` vérifie le contenu réel (magic bytes), retire les métadonnées (EXIF et GPS, lieu des vidéos, auteur des PDF) et rend le média joignable. Plafonds : `UPLOAD_MAX_PHOTO_MB`, `UPLOAD_MAX_VIDEO_MB`, `UPLOAD_MAX_DOC_MB`, `VIDEO_MAX_SECONDS` (`apps/api/.env`).
- **CORS du stockage** : les origines autorisées sont lues par docker compose dans `S3_CORS_ORIGINS` (`.env` racine : 3000 et 3100 pour les tests). Après un changement, `docker compose up -d storage` recrée le conteneur (les fichiers sont conservés).
- **Limite d'envoi** : `MESSAGE_RATE_LIMIT_MAX` messages par `MESSAGE_RATE_LIMIT_WINDOW_SECONDS` et par utilisateur (429 au-delà). Le seed remet ces compteurs à zéro pour les comptes de démonstration.
- **Côté web** (`apps/web/src/components/messaging`, `src/lib/upload.ts`) : `/parrain/messages` et `/relais/messages?onglet=parrains|bureau` (liste et conversation la plus récente à partir de md, liste seule en dessous), `/…/messages/[id]` pour une conversation. Les photos sont compressées dans le navigateur (`browser-image-compression` : 1 600 px, 1 Mo, EXIF retiré) avant l'envoi ; un envoi multipart interrompu reprend au nouvel essai (état gardé en `sessionStorage`, seules les parts manquantes repartent). Le message vidéo utilise `MediaRecorder` (mp4 si le navigateur sait l'enregistrer, sinon webm ; 2 minutes, environ 1 Mb/s). Avant l'envoi à un enfant, le détecteur prévient quand le texte semble contenir des coordonnées ; le message reste envoyable.

## Espace relais

Toutes les routes `/api/relais/*` sont bornées aux enfants du relais connecté : l'enfant d'un autre relais répond 404, et un parrain n'y apparaît que par son nom.

- **Accueil** (`/relais`) : indicateurs calculés, enfants suivis (tableau à partir de md, cartes en dessous) et fraîcheur de la dernière nouvelle ou du dernier résultat envoyé (moins de 30 jours : vert ; jusqu'à 59 : ambre ; 60 et plus : rouge).
- **Dossier d'un enfant** (`/relais/enfants/nouveau`, `/relais/enfants/[id]`) : un brouillon n'exige que l'identité ; l'envoi au bureau exige le dossier complet et l'accord de parrainage. Le consentement photos et vidéos reste facultatif : sans lui, le parrain lit le texte des nouvelles sans en voir les médias. Chaque accord donné ou retiré est tracé (`ConsentRecord`) et chaque modification auditée.
- **Code image** : 3 images ordonnées parmi 6, tirées par le serveur et hachées en Argon2id avec le poivre `CHILD_CODE_PEPPER`. Il s'affiche une seule fois, sur une carte à imprimer, et ne peut ensuite qu'être remplacé. Le navigateur ne peut pas imposer un code : la proposition est signée.
- **Nouvelles** (`/relais/publier`) : un enfant, plusieurs, ou « Vie du relais » (tous). Chaque parrain concerné reçoit un seul e-mail, avec un lien et sans le texte. Une publication rejouée (même clé) ne double rien.
- **Publication programmée** : le planificateur (`@nestjs/schedule`, `SCHEDULER_ENABLED`) publie chaque minute les nouvelles dont l'heure est venue et purge chaque heure les fichiers sans usage. Une nouvelle programmée s'annule depuis la page de publication.
- **Résultats** (`/relais/resultats?periode=&ecole=`) : une ligne par enfant, enregistrée d'elle-même 800 ms après la dernière frappe. Une donnée plus ancienne que l'enregistrée est refusée (409). Rien n'est visible des parrains avant « Envoyer aux parrains », et un résultat envoyé garde sa moyenne.
- **Écoles** : ajoutées depuis le formulaire d'un enfant (`POST /api/relais/schools`).

## Relais sur téléphone et hors ligne

L'espace relais s'installe comme une application (`public/relais.webmanifest`, annoncé par le seul layout du relais). Sous md, l'accueil et la publication suivent les maquettes mobiles (`Relais`, `RM-Publier`) ; à partir de md, les maquettes web. Les deux variantes partagent le même état : seul le CSS choisit.

- **Service worker** (`src/sw/sw.ts`, assemblé par `serwist build` après `next build`) : enregistré depuis le layout du relais, en production seulement, avec la portée `/relais`. Il précache les fichiers statiques et garde **deux pages seulement**, `/relais` et `/relais/publier`. Toute autre page du relais répond hors ligne par `/hors-ligne`. L'API, les médias et les autres espaces n'entrent jamais dans un cache.
- **File d'attente** (`src/lib/outbox`, IndexedDB) : les publications et les saisies de résultats attendent le réseau, dans l'ordre, pour le compte connecté seulement. Une saisie remplace celle du même enfant encore en attente. Une publication garde sa clé d'idempotence : rejouée, elle n'est créée qu'une fois. L'envoi reprend au retour du réseau, à l'ouverture, au retour sur l'onglet et sur réponse de la sonde `/api/health?light`, un seul à la fois entre onglets (Web Locks).
- **Déconnexion** : les caches, la file d'attente et le service worker sont effacés (avec un avertissement si des envois attendent). Le serveur demande aussi cet effacement (`Clear-Site-Data: "storage"`), même sans JavaScript.
- **Saisie sur téléphone** : prise de vue directe (`capture`), photos allégées dans le navigateur, dictée par la Web Speech API en français ; sans elle, le micro du clavier est proposé.
- **Test sur un vrai téléphone** : caméra, service worker et dictée exigent le HTTPS hors de `localhost`, donc un tunnel (`ngrok http 3000` par exemple), avec `NEXT_PUBLIC_APP_URL` et `APP_URL` réglés sur son adresse.

## Sessions élèves

Un enfant n'a pas de compte : il se connecte pendant une session que son relais ouvre, sur un poste précis (`/relais/sessions`, puis `/eleve`).

- **Ouverture** : le relais choisit les enfants, la durée (30, 45 min ou 1 h) et ce qu'ils peuvent faire. Les droits sont figés. L'ouverture est refusée si des envois attendent sur le poste. Le relais y est déconnecté, côté serveur et dans le navigateur, et l'espace relais hors ligne est effacé. Sur téléphone, il le confirme d'abord. Une session se planifie aussi à l'avance : ses enfants sont déjà cochés le jour venu.
- **Deux cookies** (`kd_device`, `kd_child`, jose, httpOnly, `SameSite=Strict`, signés par `CHILD_SESSION_SECRET`) : l'un ne vaut rien sans l'autre, et ils ne servent que pendant la session. L'API les vérifie à chaque requête, en base : une session fermée, expirée ou suspendue refuse l'enfant dès sa requête suivante. La base ne garde que l'empreinte du jeton du poste.
- **Code image** : 3 images parmi 6, dans l'ordre. L'ordre d'affichage change à chaque essai. Le compteur est en base et chaque essai réserve sa place par un seul `UPDATE` avant Argon2 : des requêtes parallèles ne testent pas plus de codes que le plafond. Verrou au 3e échec (`CHILD_CODE_MAX_ATTEMPTS`), levé par le relais ou par un nouveau code. La session est suspendue au 15e échec (`CHILD_SESSION_MAX_FAILURES`), jusqu'à sa reprise par le relais.
- **Ce que voit l'enfant** : le prénom de son parrain et leur fil, jamais son nom ni son adresse. Ses messages et fichiers passent en relecture, et la conversation ne remonte chez le parrain qu'une fois approuvés. Sans consentement médias : ni photo ni vidéo. La caméra ne s'allume qu'après un appui, une vidéo dure 60 s au plus (`CHILD_VIDEO_MAX_SECONDS`).
- **Bulletin** : ses pages partent comme un message relu. Si le relais a coché « Laisser l'enfant envoyer son bulletin », elles remplissent aussi sa ligne dans les résultats une fois approuvées.
- **Fin** : « J'ai fini » ne retire que l'enfant, le poste reste ouvert pour le suivant. Une session fermée par le relais renvoie l'enfant à la connexion en moins de 30 s, même sans action de sa part. Aucune page d'enfant n'est gardée en cache.
- **Relais** : il suit la session en cours (qui est là, qui est bloqué), peut débloquer, reprendre ou fermer, et suit les conversations de ses enfants dans l'onglet « Enfants » de ses messages. Il ne lit pas un message en relecture, mais peut le signaler au bureau.

Dans la démonstration, tous les enfants de M. Koffi ont un code image. Celui d'Aïcha est celui du design : Soleil, Arbre, Poisson. Pour essayer : connectez-vous avec `koffi@relais.exemple.tg`, ouvrez la session sur `/relais/sessions`, puis choisissez Aïcha.

## Appels vidéo

Le relais publie des créneaux (`/relais/appels`, heure de Lomé). Le parrain en demande un pour un filleul (`/parrain/appels`, P-Video), avec une durée de 15 ou 30 minutes et un mot facultatif.

- **Réponse du relais** : depuis la conversation (« Réponse rapide » de RW-Messages) ou sa page Appels, il confirme le créneau ou en propose jusqu'à 3 autres. Le parrain choisit directement dans le message ou sur P-Video, et l'appel est confirmé aussitôt.
- **Une demande à la fois** par binôme, et pas de nouvelle demande avant l'appel prévu. Les réponses sont atomiques : deux confirmations simultanées n'en donnent qu'une.
- **E-mails** : un lien seulement. La confirmation joint le fichier agenda (`.ics`, sans nom d'enfant), aussi téléchargeable depuis l'application (`GET /api/calls/:id/ics`).
- **Heures** : enregistrées en UTC, affichées à Paris et à Lomé (« 11 h Paris · 10 h Lomé »), en heure de Lomé côté enfant.
- **Salle** : ouverte 10 minutes avant l'appel (`VISIO_JOIN_EARLY_MINUTES`) et jusqu'à 15 minutes après la fin prévue, pour le parrain du binôme et le relais seulement. Le parrain n'entre qu'après l'arrivée du relais : en attendant, il voit « En attente de M. Koffi ». Aucun enregistrement.
- **`VISIO_PROVIDER=link`** (par défaut, et dans les tests) : la salle est une salle Jitsi publique au nom imprévisible, ouverte dans un nouvel onglet.
- **`VISIO_PROVIDER=jaas`** : salle 8x8.vc intégrée à la page. Il faut un compte JaaS (https://jaas.8x8.vc), son App ID, l'identifiant et la clé privée de la clé API (`JAAS_APP_ID`, `JAAS_API_KEY_ID`, `JAAS_PRIVATE_KEY`). Le jeton RS256 est limité à la salle et à la fenêtre de l'appel, seul le relais est modérateur, et l'enregistrement, la diffusion, la transcription et les appels sortants sont coupés. Dans la salle, seuls micro, caméra, mosaïque et raccrocher restent. Si la salle ne s'affiche pas en 10 secondes, la page propose de l'ouvrir dans un onglet ou de réessayer.

Dans la démonstration : créneaux des 14, 18 et 21 novembre, la demande de Claire pour Aïcha (le 14, à confirmer par M. Koffi), l'appel confirmé avec Kofi le 5 novembre, et deux appels passés.

## Modération

Le bureau relit chaque message échangé avec un enfant, sur `/bureau` (file et approbation sur place) et `/bureau/moderation` (file et message relu).

- **Ordre de la file** : les messages avec une alerte du détecteur d'abord, puis du plus ancien au plus récent. Filtres `?filtre=enfant|parrain|signales` sur la vue d'ensemble.
- **Décisions** (`POST /api/moderation/messages/:id/decision`), atomiques et auditées : une seule s'applique si deux membres décident en même temps (l'autre reçoit 409). Après une décision, la page passe au message suivant.
  - **Approuver** : le message est remis tel quel. Une alerte demande confirmation.
  - **Masquer** : motif obligatoire, texte proposé puis corrigeable, pièces jointes retirables. Le destinataire ne reçoit que cette version, et un fichier retiré est effacé du stockage.
  - **Retenir** : motif obligatoire, le message n'est pas remis.
- **E-mails** : un lien, jamais une ligne du message. Le parrain d'un enfant est prévenu d'un message remis, sauf s'il a déjà des non-lus dans cette conversation. Message retenu ou masqué : l'auteur adulte reçoit le motif et la règle de la charte ; pour un message d'enfant, c'est son relais qui est prévenu. Un enfant ne reçoit jamais d'e-mail.
- **Signalements** : le bureau pose ou retire un signalement manuel (`POST /api/moderation/messages/:id/flag`). Le relais signale un message de ses enfants depuis leur conversation (`POST /api/relais/messages/:id/flag`).

## Tests de bout en bout du web

`npm run test:e2e -w @parrainage/web` construit puis lance l'API (port 4100) et le web (port 3100), à côté d'un éventuel `npm run dev` (3000 et 4000). Les services Docker doivent tourner (PostgreSQL et Mailpit).

- Par défaut (`E2E_DB=seed`), la base de développement n'est **pas effacée** : les migrations en attente sont appliquées (`db:deploy`) puis le seed est rejoué (idempotent : comptes et mots de passe de démonstration rétablis, sessions et compteurs de tentatives conservés). Seuls les messages ajoutés à la main dans les conversations de démonstration sont effacés (`SEED_RESET_MESSAGES=1`), car les tests comparent ces conversations à la maquette ; `npm run db:seed` seul les conserve. Relancer la suite moins de 5 minutes plus tard peut donc atteindre la limite d'envoi de liens magiques.
- `E2E_DB=reset` efface d'abord la base (`npm run db:reset`) pour repartir de zéro.
- Horloge figée sur le jour du design (`apps/web/e2e/clock.ts`) : l'API de test démarre avec `APP_NOW=2026-10-31T10:00:00Z` et le seed est rejoué avec `SEED_TODAY=2026-10-31`. Après la suite, les dates de la base de développement partent donc du 31 octobre 2026 ; `npm run db:seed` les recale sur aujourd'hui.
- `E2E_PORT` et `E2E_API_PORT` changent les ports si 3100 ou 4100 sont pris.
- Le service worker est bloqué dans les tests (`serviceWorkers: "block"`), sauf dans `e2e/offline.spec.ts`, qui coupe réellement le réseau.
- `e2e/moderation.spec.ts` et `e2e/relais.spec.ts` écrivent vraiment : ils rejouent le seed avant et après chaque projet. Ce que les tests créent porte un marqueur (enfants et écoles « E2e… », clés « e2e-… ») : le seed le retire.
- `e2e/messaging.spec.ts` rejoue le seed avant chaque projet (non-lus de la maquette) et préfixe ses clés d'envoi par `e2e-` : le seed supprime ces messages au lancement suivant. La caméra et le micro sont simulés par Chromium (`--use-fake-device-for-media-stream`).
- Le build du web est construit pour l'origine des tests (`NEXT_PUBLIC_APP_URL=http://localhost:3100`) : relancez `npm run build` avant un `npm run start` sur le port 3000.

## Branches

- `main` : version stable.
- `develop` : développement en cours, une étape livrée par commit.
