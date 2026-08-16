# EduConnect

Gestion scolaire moderne pour la Côte d'Ivoire — Node/Express, EJS, Prisma, PostgreSQL.

## Prérequis

- Node.js 20+
- PostgreSQL 16+ (ou Docker)

## Installation

```bash
npm install
cp .env.example .env
# Éditez DATABASE_URL et JWT_SECRET dans .env

npm run db:push
npm run db:seed
npm run dev
```

Application (local) : http://localhost:3000  
Production : https://educonnect-assoheddy-boops-projects.vercel.app

`npm run db:seed` ne crée **pas** les comptes `@demo.ci` par défaut. En local / tests :

```bash
# PowerShell
$env:SEED_DEMO='true'; npm run db:seed
```

## Comptes démo (uniquement si `SEED_DEMO=true`, mot de passe : `demo1234`)

| Rôle | Email |
|------|-------|
| Super admin | admin@educonnect.ci |
| Admin groupe | groupe@demo.ci |
| Admin école | ecole@demo.ci |
| Parent | parent@demo.ci |
| Enseignant | prof@demo.ci |

**Code école (enseignant / parent)** : affiché dans Paramètres école (ex. `ecole-les-etoiles`)  
**Matricule élève démo** : `ETOILE-001`

## Scripts

| Commande | Description |
|----------|-------------|
| `npm run dev` | Serveur avec nodemon |
| `npm test` | Tests Jest |
| `npm run verify` | Vérification routes + DB (serveur requis) |
| `npm run db:push` | Sync schéma Prisma |
| `npm run db:seed` | Seed (comptes `@demo.ci` seulement si `SEED_DEMO=true`) |
| `npm run db:migrate` | Migrations Prisma |

## API REST (`/api/v1`)

Authentification : cookie JWT ou header `Authorization: Bearer <token>`

- `GET /api/v1/students` — liste élèves (école / prof)
- `GET /api/v1/classes` — liste classes
- `GET /api/v1/notifications` — notifications utilisateur
- `POST /api/v1/notifications/:id/read` — marquer comme lu

## Docker

```bash
docker compose up --build
docker compose exec app npm run db:push
docker compose exec app npm run db:seed
```

## Variables d'environnement

Voir `.env.example` — notamment `JWT_SECRET`, `DATABASE_URL`, `SOCKET_CORS_ORIGIN`, `DISABLE_CRON`.
