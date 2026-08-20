# Bulletin de paie — EduConnect

Documentation du **bulletin de paie mensuel officiel** (format CI : CNPS + fiscalité), calqué sur le modèle IGES.

## Vue d'ensemble

EduConnect génère des bulletins PDF conformes au modèle ivoirien :

- En-tête : logo, nom officiel (`schoolOfficialIdentity`), agrément, BP, téléphones
- Titre : **BULLETIN DE PAIE MENSUELLE**
- Bloc employé : matricule, CNPS, parts, nationalité, situation matrimoniale, période, embauche, nom, fonction
- Tableau rubriques : CODE | RUBRIQUE | BASE | NBRE/TAUX | GAINS | RETENUES
- Blocs 1 (gains), 2 (CNPS/IS/CN/IGR), 3 (transport, avances, CMU)
- Totaux : GAINS, RETENUES, NET A PAYER
- Cumuls annuels
- Pied : règlement (Espèce/Chèque/Virement), signatures employé / employeur, prochain salaire

## Prérequis

- Module **RH / Paie** activé
- Fiche personnel (`StaffProfile`) avec salaire de base renseigné
- Identité officielle école configurée (réutilisée depuis le bulletin MENET-FP)

## Rubriques configurables

**Menu : RH → Rubriques paie** (`/school/hr/rubriques-paie`)

| Code | Libellé | Défaut |
|------|---------|--------|
| 100 | Salaire de base | profil personnel |
| 110 | Sursalaire | profil |
| 210 | Prime responsabilité | primes manuelles |
| 211 | Prime ancienneté | 4 % |
| 810 | CNPS | 6,3 % |
| 820 | IS | 1,2 % |
| 835 | CN | barème simplifié ou montant fixe |
| 840 | IGR | barème simplifié ou montant fixe |
| 204 | Indemnité transport | 30 000 FCFA |
| 453 | Avances | avances approuvées |
| 512 | CMU | 2 000 FCFA |

## Génération

### Direction / Comptabilité / Secrétariat (RH)

1. **RH → Paie** → choisir mois/année
2. **Générer la paie** — calcule rubriques, cumuls, PDF officiel
3. **PDF** : `GET /school/hr/payslip/:id/pdf`
4. **Aperçu HTML** : `GET /school/hr/payslip/:id/preview`

### Employé (enseignant)

- **Mes bulletins** → `GET /teacher/hr/payslips/:id/pdf`

## Calculs

- **Gains** = somme des lignes positives (blocs 1 et 3)
- **Retenues** = CNPS, IS, CN, IGR, avances, CMU…
- **Net à payer** = Gains − Retenues (≥ 0)
- **Cumuls annuels** : agrégation des bulletins de l'année civile en cours

## Schéma Prisma

Extensions :

- `StaffProfile` : `staffMatricule`, `birthDate`, `cnpsNumber`, `taxParts`, `nationality`, `maritalStatus`, `sursalaire`, `transportAllowance`
- `Payslip` : `periodStart`, `periodEnd`, `paymentMethod`, `totalGains`, `totalDeductions`, `nextPayDate`, `annualCumuls`
- `PayslipLine` : lignes rubriques détaillées
- `SchoolPayRubrique` : surcharges taux/montants par école

Appliquer en production :

```bash
npm run db:push:prod
```

## Fichiers techniques

| Fichier | Rôle |
|---------|------|
| `src/config/paySlipRubriques.js` | Catalogue rubriques CI |
| `src/services/paySlipService.js` | Calculs et persistance |
| `src/services/paySlipPdf.js` | Génération PDF (pdfkit) |
| `src/utils/paySlipLayout.js` | Mise en page officielle |
| `src/utils/schoolOfficialIdentity.js` | En-tête école partagé |
| `views/compta/bulletin-paie.ejs` | Aperçu HTML |

## RBAC

| Rôle | Générer | Voir PDF | Rubriques |
|------|---------|----------|-----------|
| Direction | ✓ | ✓ | ✓ |
| Comptabilité | ✓ | ✓ | ✓ |
| Secrétariat (RH) | ✓ | ✓ | ✗ |
| Employé | ✗ | le sien | ✗ |

Permissions : `hr:read`, `hr:write`, `accounting:write` (rubriques).

## Tests

```bash
npm test -- paySlip
```
