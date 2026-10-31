# Parrainage LRT

Plateforme de parrainage scolaire de l'association LRT : elle relie des parrains et marraines en France à des enfants scolarisés au Togo, par l'intermédiaire de relais locaux, sous le contrôle du bureau de l'association.

Cinq espaces : parrain, relais (web et mobile), enfant (session sécurisée à l'école) et bureau.

## Architecture

Monorepo npm (workspaces) :

| Dossier | Rôle | Technologies |
|---|---|---|
| `apps/web` | Interface utilisateur | Next.js 16 (App Router), React 19, Tailwind CSS 4 |
| `apps/api` | API REST | NestJS 12, Prisma 7, PostgreSQL |
| `packages/` | Code partagé entre le web et l'API | TypeScript, zod |
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
| `npm run dev` | lance l'API et le web en parallèle |
| `npm run verify` | lint, vérification des types, tests et builds des deux applications |
| `npm run test` | tests unitaires (Vitest) |
| `npm run test:e2e -w @parrainage/api` | tests e2e de l'API (services Docker démarrés) |
| `npm run format` | formatage (Prettier) |
| `npm run db:migrate` / `db:seed` / `db:reset` / `db:studio` | base de données (Prisma) |

## Branches

- `main` : version stable.
- `develop` : développement en cours, une étape livrée par commit.
