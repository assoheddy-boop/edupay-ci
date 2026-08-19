# Stratégie SEO EduConnect

Document d’équipe. **EduConnect**, Alliance Digitale Internationale. Live : [https://educonnect-ci.com](https://educonnect-ci.com).

Canonique actuel : `educonnect-ci.com` (`/`, `/ecoles`, `/e/:slug`). Un domaine `educonnect.ci` n’est pas le canonique de ce sprint.

## En production (août 2026)

- Accueil, `/ecoles`, `/e/:slug` : title, meta, canonical, Open Graph, `index, follow`
- `robots.txt` + `GET /sitemap.xml` **200** XML (`urlset`, `lastmod` ISO `YYYY-MM-DD`)
- Sitemap : pages publiques + fiches `/e/:slug` des écoles marketplace live (VIP / Premium / Standard)
- JSON-LD `School` + `EducationalOrganization` (adresse, GPS, téléphone public)
- Portail IGEST : `/e/igest-yopougon-sideci` — title/H1 sur **Yopougon-Sideci**, agrégats anonymes, pas de PII élève
- Espaces privés (`/auth`, `/school`, `/parent`, `/admin`, …) : `noindex`

## Écarts restants (hors code de ce dépôt)

1. GA4 et Search Console : à brancher côté compte Google, pas dans l’app
2. URL demandée `educonnect.ci/ecole/ville/nom-ecole` : 301 plus tard, un seul canonique à la fois

## Règles produit

Ne pas revert le marketplace ni la sidebar. Ne pas inventer RCCM, notes nominatives ou PII élève sur les pages publiques.
