# EduConnect — portails écoles & marketplace

Document d’équipe. **EduConnect**, Alliance Digitale Internationale. Live : [https://educonnect-ci.com](https://educonnect-ci.com). Offre **Pro**, tarif uniquement sur `/devis`.

Ce texte décrit **ce qui est dans le code** (portail public, annuaire, cycle, menu) et ce qui reste volontairement hors du web public. Rien n’est inventé.

**Marque.** EduConnect — pas EduPay. Site : [https://educonnect-ci.com](https://educonnect-ci.com). Contact : contact@educonnect.ci.

---

## 1. Analyse Papyrus → limites

Papyrus (et les logiciels Windows du même usage) reste le réflexe de beaucoup de secrétariats ivoiriens : inscriptions, notes, bulletins, caisse espèces, listings papier. Il est efficace **dans le bureau**. Il n’aide pas l’école à **exister sur le web**, ni le parent à trouver l’établissement, ni EduConnect à référencer un réseau d’écoles.

### 1.1 Ce que Papyrus fait bien (usage type CI)

- **Inscriptions / réinscriptions**, matricules, classes (CP–CM2, 6e–3e, 2nde–Tle).
- **Notes**, coefficients, moyennes, rangs, bulletins papier, **délibérations**.
- **Caisse** espèces, restes à payer.
- **Absences**, EDT, personnel, **impressions**.

### 1.2 Limites structurelles (y compris visibilité)

| Limite | Conséquence |
| --- | --- |
| **Windows on-premise** | Pas de page école partageable. Un PC secrétariat, souvent une clé USB. |
| **Pas de vitrine web** | Le parent cherche l’école sur Google / WhatsApp. Papyrus n’a pas d’URL publique. |
| **Résultats sur listing papier** | Bulletins et classements circulent en salle des profs ou au secrétariat. Les mettre « en ligne » sans login = **IDOR** (noms, notes, rangs). |
| **Mobile money faible** | Wave / OM déjà utilisés par les familles ; Papyrus enregistre mal la preuve. Un bouton « payer » public qui ouvrirait un checkout Wave **sans compte parent** mélangerait argent et identité. |
| **Un seul PC, pas de marketplace** | Un groupe (primaire + collège) = deux fichiers. Aucun annuaire national des établissements. |
| **SEO inexistant** | Pas de `sitemap.xml`, pas de title unique par école, pas de page `/e/…`. |

### 1.3 Ce qu’une direction attend d’une page publique

1. Une **URL stable** à coller dans WhatsApp : `https://educonnect-ci.com/e/igest-yopougon-sideci`.
2. Logo, nom, ville, cycle, description, téléphone, plan.
3. Un **contact** (formulaire), pas une fuite de l’e-mail interne si on peut l’éviter.
4. Un chemin **Payer la scolarité** et **bulletins** qui **n’expose pas** les élèves.
5. Le droit de **ne pas publier** (opt-in). Défaut : page éteinte.

Papyrus ne couvre aucun de ces points. EduConnect les couvre **sans** ouvrir notes et classements au web.

---

## 2. Améliorations EduConnect → solutions

| Limite | EduConnect maintenant (code) |
| --- | --- |
| Pas d’URL école | Portail canonique **`/e/:slug`**. Alias `/:slug` **uniquement** si le segment n’est pas une route existante (`/devis`, `/guides`, `/auth`, `/school`, …) → redirection 301 vers `/e/:slug`. |
| Pas d’annuaire | **`GET /ecoles`** : écoles avec `School.publicPortalEnabled = true` (défaut **false**). Recherche **ville** et **cycle** (`PRIMAIRE` \| `COLLEGE` \| `LYCEE` \| `MIXTE`). |
| IDOR résultats | **Aucun** bulletin, note, rang, palmarès, nom d’élève sur le portail. Lien honnête « Espace parent / Connexion ». Compteur de **classes** possible (anonymisé). |
| Paiement public | Bouton **Payer la scolarité** → `/auth/login` (espace parent). **Pas** de checkout Wave/OM public. |
| Carte payante | **OpenStreetMap** (iframe + lien), champs optionnels `lat` / `lng`. Pas de Google Maps. |
| Contact spam | `POST /e/:slug/contact` limité (5 / 15 min) + CSRF + honeypot. Envoi vers **contact@educonnect.ci** et, en interne seulement, l’e-mail direction. |
| Opt-in direction | Paramètres école : **Publier la page de l’école** + description + téléphone public + GPS. |
| IGEST | Slug `igest-yopougon-sideci` : portail **activable** (catalogue + script après `db push`). |
| SEO | Title / meta uniques par école ; `sitemap.xml` inclut `/ecoles` et `/e/:slug` ; `robots.txt`. |
| Modules Papyrus-gap | **Inchangés** : caisse, délibérations, palmarès, convocations blanc/national, deux matricules, risques, justificatifs, import Excel, preuves Wave/OM, SMS officiel, multi-école, assistance admin. |
| Cycle & menu | **`School.educationCycle`** et menu **6 catégories** conservés. Voir [EduConnect-Papyrus-dashboard.md](./EduConnect-Papyrus-dashboard.md). |

**Synthèse.** La page publique est une **vitrine**. Le métier (notes, argent, vie scolaire) reste derrière login.

---

## 3. Version optimisée → modules + interface + communication

### 3.1 Modules (cœur déjà livré + vitrine courte terme)

**Cœur établissement (inchangé)**  
Élèves, classes, paiements Wave/OM (preuve), notes INTERRO/DEVOIR/COMPOSITION, bulletins PDF logo, appel, justificatifs, devoirs, messages, EDT, caisse, cas sociaux, délibérations / évaluations, palmarès, convocations, SMS officiel, RH, compta, multi-école, cycle.

**Nouveau (court terme, livré)**  
1. Portail public `/e/:slug`  
2. Marketplace `/ecoles`  
3. Opt-in direction  
4. Sitemap / robots  

**Hors scope volontaire**  
API de débit Wave, campagnes SMS génériques, classements d’élèves en page publique.

### 3.2 Interface

- **Visiteur** : page école (logo, ville, cycle, texte, OSM, contact) + annuaire filtrable.
- **Parent** : même login qu’avant (`/auth/login`) pour notes, bulletins, paiement.
- **Direction** : Paramètres — cycle d’enseignement **et** publication de la page.
- **Mixte / primaire / collège / lycée** : le **menu interne** suit le cycle ; la vitrine n’affiche que le libellé de cycle, pas les sous-menus examens.

### 3.3 Communication

| Canal | Rôle public | État |
| --- | --- | --- |
| Page `/e/:slug` | Présentation, contact, liens login | Livré |
| Formulaire contact | Message → contact@ + direction (interne) | Livré, rate-limit |
| SMS officiel / in-app | Vie scolaire, pas la vitrine | Inchangé |
| Wave / OM | Argent **après** login parent | Inchangé |

---

## 4. Roadmap court / moyen / long

### Court terme (0–3 mois) — **livré dans ce chantier**

1. Portail `/e/:slug` + alias prudent `/:slug`.  
2. Marketplace `/ecoles` (ville, cycle).  
3. Toggle direction + champs `publicDescription`, `publicPhone`, `lat`, `lng`.  
4. SEO : title/description, sitemap, robots.  
5. Confidentialité : **pas** de résultats élèves en public.  
6. IGEST publiable si slug présent.  
7. `prisma db push` local + Neon `ancient-cloud-90631299` (`NODE_OPTIONS=--use-system-ca`).

### Moyen terme (3–9 mois)

1. Photos supplémentaires (galerie) si la direction les fournit — aujourd’hui : **logo**.  
2. Filtres commune / quartier plus fins.  
3. Page groupe (plusieurs campus) sans mélanger les notes.  
4. JSON-LD `School` / `EducationalOrganization` une fois les champs stables.

### Long terme (9–18 mois)

1. Inscription en ligne **sur dossier**, toujours sans notes publiques.  
2. Badges « établissement vérifié EduConnect ».  
3. Rester **preuve Wave/OM** pour le paiement (pas de checkout anonyme).

---

## 5. Présentation du tableau de bord → arborescence (primaire vs collège)

Le **menu direction** n’est pas la page publique. Six catégories, cycle `PRIMAIRE` \| `COLLEGE` \| `LYCEE` \| `MIXTE` (défaut `COLLEGE`). Détail : [EduConnect-Papyrus-dashboard.md](./EduConnect-Papyrus-dashboard.md).

```
Accueil
Administration scolaire
  Classes · Élèves · Enseignants · RH · Année scolaire
  Transferts · Réinscriptions · Paramètres
    ↳ Cycle d’enseignement
    ↳ Publier la page de l’école (/e/:slug)   ← nouveau, tous cycles
Vie scolaire
  Emploi du temps · Justificatifs · Cantine · Objets perdus
  Activités · Sortie école
Examens & Évaluations          ← NON repris sur /e/:slug
  Bulletins · Coefficients · Émargement · Devoirs
  [PRIMAIRE] Évaluations · Convocations (blanc)
  [COLLEGE / LYCEE] Délibérations · Palmarès · Convocations (blanc + national)
  [MIXTE] ── Primaire ── / ── Secondaire ──
Finances & Comptabilité        ← paiement public = lien login seulement
  Frais · Paiements · Caisse · Cas sociaux · Comptabilité
Communication
  Messages · SMS officiels
Rapports & Statistiques        ← risques / analyse : login seulement
  Analyse · Risques · Statistiques
```

**Primaire vs collège (rappel menu interne)**

| | PRIMAIRE | COLLEGE |
| --- | --- | --- |
| Délibérations | libellé **Évaluations** | **Délibérations** |
| Palmarès | non | oui |
| Convocations | blanc seulement | blanc + **national** |
| Matricule MEN | non | oui |
| Page publique | oui si opt-in | oui si opt-in |
| Notes sur le web public | **non** | **non** |

Lycée = collège + séries A/C/D. Mixte = les deux blocs examens, séparés.

---

## 6. Architecture marketplace + SEO

### 6.1 URLs

| URL | Rôle |
| --- | --- |
| `https://educonnect-ci.com/e/:slug` | **Canonique** page école (ex. `/e/igest-yopougon-sideci`) |
| `https://educonnect-ci.com/:slug` | Alias si le slug n’entre pas en collision ; **301** vers `/e/:slug` |
| `https://educonnect-ci.com/ecoles` | Annuaire (opt-in uniquement) |
| `https://educonnect-ci.com/sitemap.xml` | Accueil, `/ecoles`, `/e/:slug`, devis, guides |
| `https://educonnect-ci.com/robots.txt` | Allow vitrine ; Disallow `/school`, `/parent`, `/teacher`, `/admin` |

Routes réservées (pas d’alias école) : `devis`, `guides`, `auth`, `school`, `parent`, `teacher`, `admin`, `group`, `api`, pages légales, etc.

### 6.2 Schéma Prisma (additif)

Sur `School` :

- `publicPortalEnabled Boolean @default(false)`
- `publicDescription String?`
- `publicPhone String?`
- `lat Float?` / `lng Float?`

Inchangé : `educationCycle`, slug, ville, logo, modules métier.

### 6.3 Données exposées vs interdites

**Oui :** nom, slug, ville, adresse, campus, cycle, logo, description publique, téléphone public, carte OSM, nombre de classes (sans noms).

**Non :** élèves, notes, moyennes, rangs, palmarès, bulletins PDF, matricules, paiements, numéros Wave/OM, e-mail direction (le formulaire n’affiche pas l’adresse interne).

### 6.4 SEO

- `<title>` et `<meta name="description">` **uniques** par école (nom + cycle + ville + extrait de description).
- `<link rel="canonical" href="https://educonnect-ci.com/e/:slug">`.
- Marketplace : title selon filtres ville/cycle.
- Sitemap généré depuis les écoles `publicPortalEnabled`.

### 6.5 Fichiers code

- `src/utils/publicPortal.js`, `src/services/marketplace.js`
- `src/controllers/portalController.js`, `src/routes/portal.js`
- `views/portal/school.ejs`, `views/portal/marketplace.ejs`
- Paramètres : `views/school/settings.ejs` + `schoolController.updateSettings`

**Contact.** [https://educonnect-ci.com](https://educonnect-ci.com) · contact@educonnect.ci  
EduConnect — Alliance Digitale Internationale — Côte d’Ivoire.
