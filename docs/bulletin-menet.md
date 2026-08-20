# Bulletin MENET-FP — EduConnect

Documentation du bulletin officiel ivoirien (format MENET-FP) intégré à EduConnect.

## Vue d'ensemble

EduConnect génère des **bulletins PDF** conformes au modèle collège/lycée Côte d'Ivoire (en-tête type IGES) :

- En-tête encadré : logo(s), nom officiel (bleu), agrément MENAPLN, niveaux, N°CC / BP / téléphones, DREN
- Identité élève : matricule DREN, matricule établissement, classe, effectif, redoublement
- Tableau des notes : discipline, moyenne/20, coefficient, moy. coef., rang, professeurs, appréciation
- Synthèse : moyenne trimestre, rang, moyennes classe/élève, absences, bilans Lettres / Sciences / Autres
- Pied de page : professeur principal, visa directeur (nom, signature + cachet), distinction/sanction

## Prérequis

- Module **Bulletins PDF** activé (plan Pro)
- Notes saisies par les enseignants (Interro / Devoir / Composition)
- Coefficients matières configurés dans **Paramètres → Coefficients**

## Configuration école

### Inscription (`/auth/register?role=SCHOOL_ADMIN`)

Lors de la création du compte école, la direction peut renseigner dès l'inscription :

- Nom officiel en-tête bulletin
- N° agrément MENAPLN, code MENET, niveaux enseignés
- N°CC / RCCM, boîte postale BP, téléphones publics
- DREN, directeur / fondateur
- Logo principal et logo secondaire (optionnel, ex. IGES + IGEST)

Ces champs sont enregistrés sur la fiche `School` et réutilisés automatiquement sur chaque bulletin.

### Paramètres après inscription

**Menu : Paramètres école → Identité officielle — Bulletin MENET-FP**

| Champ | Usage |
|-------|--------|
| Logo principal | Colonne gauche de l'en-tête |
| Logo secondaire | Colonne droite (optionnel — dual logo IGES/IGEST) |
| Nom officiel en-tête | Ex. « COMPLEXE SCOLAIRE IGES » (sinon nom école) |
| N° agrément MENAPLN | Ligne agrément italique |
| Code MENET | Code établissement (repli si agrément absent) |
| Niveaux enseignés | Ex. Maternelle – Primaire – Secondaire… |
| N°CC / RCCM | Ligne contact |
| Boîte postale BP | Adresse postale bulletin (distincte de l'adresse physique) |
| Téléphones publics | Un ou plusieurs numéros, séparés par « / » |
| DREN | Sous l'encadré en-tête |
| Directeur / fondateur | Visa bulletin |
| Professeur principal | Libellé sous « PROFESSEUR PRINCIPAL » |
| Signature directeur | Image PNG/JPG pour le visa |
| Cachet établissement | Image PNG/JPG pour le cachet |

### Onboarding partenaires (IGEST / EPV)

Le catalogue `src/config/igestSchool.js` et `pickSchoolFields()` dans `epvSchools.js` préremplissent les valeurs IGES de démonstration pour IGEST (agrément, N°CC, BP, téléphones, DREN, niveaux).

## Génération

### Direction / Secrétariat / Fondateur

1. **Bulletins** → choisir élève + trimestre (T1, T2, T3 ou Annuelle)
2. **Générer le PDF** — calcule moyennes pondérées, rangs, enregistre le bulletin
3. **Génération en masse** — toute une classe en une fois

**Téléchargement direct (sans enregistrement)** :

```
GET /school/bulletins/download/:studentId?period=T1
```

**Aperçu HTML (impression navigateur)** :

```
GET /school/bulletins/preview/:studentId?period=T1
```

### Parents et élèves

- **Parent** : Notes & bulletins → lien PDF par bulletin enregistré  
  `GET /parent/bulletins/:bulletinId/pdf`
- **Élève** : Notes & bulletins →  
  `GET /student/bulletins/:bulletinId/pdf`

## Calcul des moyennes

1. **Moyenne matière** = moyenne arithmétique des types renseignés (Interro, Devoir, Composition) sur /20
2. **Moyenne générale** = moyenne pondérée par les coefficients école
3. **Rangs** : par matière et général (classe entière)
4. **Bilans domaines** : Lettres (FR, LV, HG…), Sciences (Maths, SVT, PC…), Autres (EPS, TICE…)
5. **Mention / décision** : issues des délibérations conseil de classe si enregistrées

## Fichiers techniques

| Fichier | Rôle |
|---------|------|
| `prisma/schema.prisma` | Champs identité officielle sur `School` |
| `src/utils/schoolOfficialIdentity.js` | Agrégation en-tête bulletin depuis `School` |
| `src/services/bulletinService.js` | Agrégation notes, absences, rangs |
| `src/services/bulletinPdf.js` | Génération PDF (pdfkit) |
| `src/utils/bulletinCiLayout.js` | Mise en page grille officielle + en-tête IGES |
| `src/utils/bulletinMenet.js` | Bilans domaines, libellés MENET |
| `src/utils/bulletinBranding.js` | Upload signature / cachet |
| `views/bulletin/menet-fp.ejs` | Aperçu HTML imprimable |

## Schéma (ajouts School)

```prisma
officialName           String?
menetCode              String?
menetAgrement          String?
nccNumber              String?
postalAddress          String?
publicPhones           String?
educationLevels        String?
dren                   String?
directorName           String?
secondaryLogoUrl       String?
secondaryLogoBase64    String? @db.Text
directorSignatureUrl   String?
directorSignatureBase64 String? @db.Text
directorStampUrl       String?
directorStampBase64    String? @db.Text
homeroomTeacherName    String?
```

Appliquer en production :

```bash
npm run db:push:prod
```

## RBAC

| Rôle | Générer | Télécharger | Paramètres MENET |
|------|---------|-------------|------------------|
| Direction / Fondateur | ✓ | ✓ | ✓ |
| Secrétariat | ✓ | ✓ | ✗ |
| Enseignant | notes seulement | ✗ | ✗ |
| Parent / Élève | ✗ | ses bulletins | ✗ |

Permissions : `bulletins:read`, `bulletins:write`, module `bulletins` + premium « Bulletins PDF ».

## Tests

```bash
npm test -- bulletinMenet bulletinCiLayout bulletinPdf bulletinService
```
