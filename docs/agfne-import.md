# Import AGFNE / SIGFNE — EduConnect

Connecteur d’import des fichiers officiels du Ministère de l’Éducation Nationale (AGFNE / SIGFNE) vers les fiches élèves EduConnect.

## Accès

- **URL** : `/school/enrollment/agfne-import`
- **Rôles** : direction / secrétariat avec permission `enrollments:read` (consultation) et `enrollments:write` (import)
- **Menu** : Administration scolaire → Import AGFNE

## Formats acceptés

| Format | Extension | Bibliothèque |
|--------|-----------|--------------|
| CSV | `.csv` | parseur interne (séparateur `;` ou `,`) |
| Excel | `.xlsx` | ExcelJS |
| XML SIGFNE | `.xml` | parseur XML léger intégré |

## Colonnes (en-têtes français MEN)

| Colonne AGFNE / SIGFNE | Champ Prisma `Student` | Alias acceptés |
|------------------------|------------------------|----------------|
| Matricule national | `nationalMatricule` | `matricule national`, `matricule_men`, `men`, `id_national` |
| Nom | `lastName` | `nom`, `nom_eleve` |
| Prénoms | `firstName` | `prénom`, `prenoms`, `prénoms` |
| Date naissance | `birthDate` | `date_naissance`, `date de naissance` |
| Sexe | `gender` | `genre`, `sexe` (M/F) |
| Nationalité | `nationality` | `nationalite` (défaut : Ivoirienne) |
| Classe | relation `Class` | `classe`, `libellé classe`, `niveau` |
| Matricule école | `matricule` | optionnel, pour liaison parent |
| École | — | ignoré ; l’établissement actif (`req.user.school`) est utilisé |

## Comportement

1. **Téléversement** → analyse du fichier et prévisualisation
2. **Prévisualisation** → tableau avec action prévue (création / mise à jour)
3. **Valider import** → upsert en base

### Doublons

- Si un élève existe déjà dans l’établissement avec le même **matricule national** ou **matricule école** → **mise à jour** (pas de doublon)
- Sinon → **création**

### Classes

- Si la classe n’existe pas, elle est **créée automatiquement** (niveau déduit du libellé, ex. « 6ème A » → niveau « 6ème »)

### Journal (`AgfneImportLog`)

Chaque import est tracé : date, utilisateur, nom de fichier, nombre de lignes, statut (`PREVIEW`, `COMPLETED`, `FAILED`, `CANCELLED`), statistiques.

### Audit GDPR

Action `agfne_import` enregistrée dans le journal d’audit (utilisateur, IP, compteurs).

## Routes API

| Méthode | Route | Action |
|---------|-------|--------|
| GET | `/school/enrollment/agfne-import` | Page upload + historique |
| POST | `/school/enrollment/agfne-import/preview` | Analyse fichier (multipart `file`) |
| POST | `/school/enrollment/agfne-import/confirm` | Validation import (`importId`) |
| POST | `/school/enrollment/agfne-import/cancel` | Annulation prévisualisation |

Toutes les routes POST sont protégées par **CSRF** (`_csrf`).

## Fichiers source

- `src/services/agfneImport.js` — parsing CSV / Excel / XML
- `src/services/agfneMapper.js` — mapping et upsert
- `src/controllers/agfneImportController.js` — contrôleur HTTP
- `views/school/agfne-import.ejs` — interface française
- `tests/agfneImport.test.js` — tests unitaires
- `tests/fixtures/agfne-sample.csv` — fixture de test

## Tests

```bash
npm test -- tests/agfneImport.test.js
```

## Schéma Prisma

```prisma
model AgfneImportLog {
  id          String   @id @default(cuid())
  filename    String
  rowCount    Int      @default(0)
  status      String   @default("PREVIEW")
  format      String?
  previewData Json?
  stats       Json?
  createdAt   DateTime @default(now())
  completedAt DateTime?
  schoolId    String
  userId      String
}
```
