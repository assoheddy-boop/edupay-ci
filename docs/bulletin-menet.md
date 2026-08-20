# Bulletin MENET-FP — EduConnect

Documentation du bulletin officiel ivoirien (format MENET-FP) intégré à EduConnect.

## Vue d'ensemble

EduConnect génère des **bulletins PDF** conformes au modèle collège/lycée Côte d'Ivoire :

- En-tête : logo, nom, adresse, code MENET, DREN, statut (Privé/Public/Confessionnel)
- Identité élève : matricule DREN, matricule établissement, classe, effectif, redoublement
- Tableau des notes : discipline, moyenne/20, coefficient, moy. coef., rang, professeurs, appréciation
- Synthèse : moyenne trimestre, rang, moyennes classe/élève, absences, bilans Lettres / Sciences / Autres
- Pied de page : professeur principal, visa directeur (signature + cachet), distinction/sanction

## Prérequis

- Module **Bulletins PDF** activé (plan Pro)
- Notes saisies par les enseignants (Interro / Devoir / Composition)
- Coefficients matières configurés dans **Paramètres → Coefficients**

## Configuration école

**Menu : Paramètres école → Bulletin MENET-FP**

| Champ | Usage |
|-------|--------|
| Logo | Déjà géré (apparaît en en-tête PDF) |
| Code MENET | Code établissement officiel |
| DREN | Ex. « DREN Abidjan 3 » |
| Professeur principal | Libellé sous « PROFESSEUR PRINCIPAL » |
| Signature directeur | Image PNG/JPG pour le visa |
| Cachet établissement | Image PNG/JPG pour le cachet |

Ces champs sont **par établissement** : chaque école du réseau conserve son propre branding.

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
| `prisma/schema.prisma` | Champs `menetCode`, `dren`, signatures bulletin sur `School` |
| `src/services/bulletinService.js` | Agrégation notes, absences, rangs |
| `src/services/bulletinPdf.js` | Génération PDF (pdfkit) |
| `src/utils/bulletinCiLayout.js` | Mise en page grille officielle |
| `src/utils/bulletinMenet.js` | Bilans domaines, libellés MENET |
| `src/utils/bulletinBranding.js` | Upload signature / cachet |
| `views/bulletin/menet-fp.ejs` | Aperçu HTML imprimable |

## Schéma (ajouts School)

```prisma
menetCode              String?
dren                   String?
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
