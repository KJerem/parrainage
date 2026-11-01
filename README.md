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
| `npm run test:e2e -w @parrainage/api` | tests e2e de l'API (services Docker démarrés) |
| `npm run test:e2e -w @parrainage/web` | tests Playwright du web : authentification et rôles, débordement horizontal (360 → 1440 px) et accessibilité (axe). **Remet à zéro la base de développement** (voir ci-dessous) |
| `npm run format` | formatage (Prettier) |
| `npm run db:migrate` / `db:seed` / `db:reset` / `db:studio` | base de données (Prisma) |

## Comptes de démonstration

Créés par `npm run db:reset` (ou `npm run db:seed`, idempotent). Mot de passe commun : `motdepasse` (variable `SEED_DEFAULT_PASSWORD`, développement uniquement). Les dates du seed partent de `SEED_TODAY` (AAAA-MM-JJ, aujourd'hui par défaut).

| Compte | Rôle |
|---|---|
| `claire.m@exemple.fr` | parrain (Aïcha et Kofi) |
| `paul.d@exemple.fr`, `helene.r@exemple.fr`, `marc.p@exemple.fr`, `sophie.l@exemple.fr`, `sophie.l2@exemple.fr`, `parrain1@exemple.fr` … `parrain25@exemple.fr` | parrain |
| `koffi@relais.exemple.tg` (Lomé), `diallo@relais.exemple.tg` (Kara), `agbeko@relais.exemple.tg` (Kpalimé) | relais |
| `bureau@exemple.fr` | bureau |

Les liens de connexion et de réinitialisation du mot de passe arrivent dans Mailpit (http://localhost:8025).

## Authentification

- **Connexion** sur `/connexion` : e-mail et mot de passe, ou lien de connexion reçu par e-mail (valable 10 minutes, une seule fois). Chaque rôle arrive dans son espace : `/parrain`, `/relais` ou `/bureau`. `?next=` ramène vers la page demandée et `?espace=relais|bureau` adapte le sous-titre.
- **Mot de passe oublié** sur `/mot-de-passe-oublie` : le lien reçu (valable 1 heure) ouvre `/reinitialiser-mot-de-passe` ; la confirmation ne révèle pas si l'adresse a un compte.
- **Protection** : `apps/web/src/proxy.ts` renvoie vers `/connexion?next=…` un visiteur sans cookie de session ; chaque layout et chaque page d'espace vérifie ensuite la session et le rôle auprès de l'API (`GET /api/me`). Un rôle étranger arrive sur `/interdit`.
- **Comptes** : pas d'inscription libre. Une adresse inconnue n'obtient ni compte ni e-mail, avec la même réponse dans le même délai. `/api/auth/update-user` est fermé (ni nom ni photo modifiables par soi-même) et `/api/auth/admin/*` est réservé au bureau. En production, l'API refuse le `BETTER_AUTH_SECRET` d'exemple.
- **Déconnexion** : formulaire `POST /deconnexion` (sans JavaScript), qui révoque la session côté API puis efface les cookies.
- Les connexions, liens et réinitialisations passent par le client Better Auth **dans le navigateur** (`/api/auth/*` réécrit vers l'API), pour que le cookie de session soit posé sur l'origine du web.

## Tests de bout en bout du web

`npm run test:e2e -w @parrainage/web` construit puis lance l'API (port 4100) et le web (port 3100), à côté d'un éventuel `npm run dev` (3000 et 4000). Les services Docker doivent tourner (PostgreSQL et Mailpit).

- Par défaut (`E2E_DB=seed`), la base de développement n'est **pas effacée** : les migrations en attente sont appliquées (`db:deploy`) puis le seed est rejoué (idempotent : comptes et mots de passe de démonstration rétablis, sessions et compteurs de tentatives conservés). Relancer la suite moins de 5 minutes plus tard peut donc atteindre la limite d'envoi de liens magiques.
- `E2E_DB=reset` efface d'abord la base (`npm run db:reset`) pour repartir de zéro.
- `E2E_PORT` et `E2E_API_PORT` changent les ports si 3100 ou 4100 sont pris.
- Le build du web est construit pour l'origine des tests (`NEXT_PUBLIC_APP_URL=http://localhost:3100`) : relancez `npm run build` avant un `npm run start` sur le port 3000.

## Branches

- `main` : version stable.
- `develop` : développement en cours, une étape livrée par commit.
