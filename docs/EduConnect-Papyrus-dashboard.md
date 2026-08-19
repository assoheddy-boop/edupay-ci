# EduConnect — tableau de bord Papyrus (Côte d’Ivoire)

Document d’équipe. **EduConnect**, Alliance Digitale Internationale. Live : [https://educonnect-ci.com](https://educonnect-ci.com). Offre **Pro**, tarif uniquement sur `/devis`.

Ce texte décrit **ce qui est dans le code** (pas des intentions) et l’arborescence réelle du menu direction. Cycle d’enseignement : `School.educationCycle` = `PRIMAIRE` | `COLLEGE` | `LYCEE` | `MIXTE` (défaut `COLLEGE`, IGEST compris).

Voir aussi : [EduConnect-Papyrus-roadmap.md](./EduConnect-Papyrus-roadmap.md).

---

## 1. Analyse Papyrus → limites

Papyrus (et les logiciels Windows du même usage) reste le réflexe de beaucoup de secrétariats de collèges, lycées et primaires ivoiriens : inscriptions, notes, bulletins, caisse espèces, listings papier. Il est efficace **dans le bureau**, sur un PC formé depuis des années. Il devient un frein dès que l’on sort de cette pièce.

### 1.1 Ce que Papyrus fait bien (usage type CI)

- **Inscriptions / réinscriptions** : fiches, matricules, classes (CP–CM2, 6e–3e, 2nde–Tle), passages d’année.
- **Notes** : saisie par matière, coefficients, moyennes, rangs, bulletins papier, **délibérations** (conseil de classe). C’est souvent **le** argument pour rester.
- **Scolarité / caisse** : encaissement au guichet, reçus, restes à payer — surtout **espèces**.
- **Absences**, **emploi du temps**, **personnel**, **statistiques** et **impressions** (beaucoup de PDF / listing imprimante).
- **Examens** : listes d’appel, convocations, parfois émargement papier pour blanc et national (BEPC / BAC).

### 1.2 Limites structurelles (pas des défauts de « version »)

| Limite | Conséquence pour un établissement CI |
| --- | --- |
| **Windows on-premise** | Un PC secrétariat, souvent une clé USB pour la sauvegarde. Coupure, vol, panne = arrêt de l’école. Pas d’accès directeur depuis le téléphone à Yopougon, Bouaké ou Korhogo. |
| **Caisse cash-first, mobile money faible** | Les familles paient déjà en **Wave / Orange Money**. Papyrus enregistre mal (ou pas) la preuve. Impayés difficiles à relancer hors du bureau. |
| **Peu ou pas d’espace parent** | Le parent vient chercher le bulletin, appelle le censeur, ou reçoit un SMS d’un add-on. |
| **SMS en option, pas natif** | Coût et paramétrage à part. Souvent un numéro générique, pas l’identité de l’école. |
| **Quasi pas de multi-campus cloud** | Un groupe (primaire + collège, ou deux collèges) = deux installations, pas de tableau de bord consolidé. |
| **Interface datée, PC-centrique** | Le professeur ne saisit pas l’appel en classe ; il remet une feuille. Inutilisable sur téléphone. |
| **Hors-ligne = le logiciel local** | Papyrus « marche sans internet » parce qu’il est installé. Il ne synchronise rien vers les parents ni vers un second campus. |
| **Peu de vie scolaire moderne** | Transport, cantine, santé, sortie QR, devoirs notifiés : hors périmètre ou bricolés. |
| **Compta limitée au journal de caisse** | Rarement Wave + OM + banque + caisse dans le même plan de comptes, avec RH / paie. |
| **Un seul « collège/lycée » dans la tête du logiciel** | Primaire, collège et lycée mélangés ou absents. Séries A/C/D et examen national collés même quand l’école est un primaire. |
| **Statistiques = listings** | Beaucoup d’impressions, peu de **pilotage** (genre, causes de redoublement, élèves à risque). |

### 1.3 Ce qu’une direction attend (primaire, collège, lycée, mixte)

1. **Tenir l’année** : inscriptions, classes, EDT, affectations.
2. **Tenir les notes** jusqu’au bulletin **et** jusqu’à la délibération (collège/lycée) ou aux évaluations (primaire).
3. **Voir l’argent** : Wave, OM, espèces, banque — le soir, sur téléphone.
4. **Parler aux parents** sans convoquer tout le monde au secrétariat.
5. **Ne pas dépendre d’un seul PC Windows.**
6. **Voir le bon menu** : un primaire ne doit pas afficher BEPC / séries lycée ; un collège doit garder délibérations, palmarès et convocations nationales.

Papyrus couvre surtout (1) et (2) dans le bureau. Il lâche (3), (4), (5) et (6).

---

## 2. Améliorations EduConnect → solutions

Chaque limite Papyrus est mappée sur **le code actuel**. Rien n’est inventé.

| Limite Papyrus | EduConnect maintenant (code) |
| --- | --- |
| Un PC Windows, pas de cloud | Application web, comptes direction / enseignant / parent / super-admin / admin de groupe. **Prise en main** super-admin (`adminAssist`) pour dépanner une école sans casser son menu. PWA, menu hamburger déjà en place. |
| Mobile money faible | **Preuves Wave / Orange Money** : numéros dans les paramètres (`waveNumber`, `omNumber`). Le parent envoie une **capture**. Statuts PENDING / VALIDATED / REJECTED. Reçu PDF. **Pas d’API Wave qui débite le parent.** Validation **en ligne**. Relances métier. |
| Pas d’app parent | Espace parent : paiements, notes, absences/retards, **justificatifs**, convocations, devoirs, messages, suivi, confidentialité. Lien par **code école + matricule + nom**. |
| SMS add-on | Module **`sms_official`** : file d’attente, identifiant expéditeur (`smsSenderId`), tableau de bord. Agrégateur Orange SMS CI (ou Twilio). **Wave/OM ≠ SMS.** Push + e-mail en parallèle. |
| Pas de multi-campus | Organisation / groupe : campus, finance consolidée, RH, comparatif, circulaires. Super-admin : assistance école ou groupe. |
| UI PC 2000 | Français, FCFA, mobile first. Menu direction **groupé en 6 catégories** (voir §5), filtré par cycle. |
| Appel sur papier | Appel Présent / Retard / Absent, **hors-ligne** (file locale), notif parent + SMS si module. **Justificatifs** d’absence (certificat) côté parent et direction. |
| Notes / rangs / bulletins | Notes enseignant (lot). Types **INTERRO / DEVOIR / COMPOSITION**. Trimestres **T1 / T2 / T3** (+ annuelle). **Coefficients** par matière (grille établissement). Moyenne pondérée réelle dans le bulletin. Rang. PDF **logo école**, génération de masse. |
| Délibérations Papyrus | Module **délibérations / conseil de classe** : session par classe et trimestre, mentions, décisions, PV PDF. Libellé **Évaluations** en primaire. |
| Palmarès | Classement de classe (palmarès) direction + enseignant, impression PDF. Masqué en primaire. |
| Convocations / émargement | **Émargement** d’examen. **Convocations** blanc et **national**, une feuille par élève. Primaire : blanc seulement (compositions conservées). |
| Deux matricules | **Matricule école** (`Student.matricule`, liaison parent) et **matricule national MEN** (`nationalMatricule`). Affichés sur convocations / bulletins. Masqué en primaire. |
| Séries lycée | Enum `SchoolSeries` A / C / D / AUTRE. Visible seulement si cycle **LYCEE** ou **MIXTE**. Collège : pas de série. |
| Caisse espèces | **Caisse secrétariat** : encaissement espèces / chèque, ticket, compte CASH, même élève que le flux Wave/OM. Comptabilité : Wave, OM, caisse, banque. |
| Cas sociaux | Dossier **direction** : remise, échéancier, suivi — distinct des bourses super-admin. |
| Risques / stats | Page **Risques** (score explicable : notes + absences/retards). **Analyse** (genre, réussite, redoublement descriptif). Stats + exports Excel/PDF. |
| Import rentrée | Élèves en **CSV et Excel (.xlsx)**. Colonnes matricule école + matricule national, classe, genre, etc. |
| Inscriptions | Élèves, photos, réinscriptions, promotions, transferts parent → école → admin. |
| Sauvegarde USB | Cloud. Plus de clé USB comme système d’enregistrement. |

**Synthèse.** Sur Wave/OM (preuves), parent, mobile, SMS officiel, compta 4 comptes, multi-école, hors-ligne ciblé, RH, vie scolaire, **délibérations, palmarès, convocations, coefficients T1/T2/T3, kinds INTERRO/DEVOIR/COMPOSITION, justificatifs, caisse, cas sociaux, risques, import Excel**, EduConnect couvre le métier que Papyrus tenait au secrétariat — et ce que Papyrus ne tenait pas. Le différenciateur restant est **l’habitude du PC Windows** et la formation secrétariat, pas un trou fonctionnel majeur sur le secondaire.

---

## 3. Version optimisée → modules + interface + communication

Cible : primaire, collège, lycée ou **mixte** ivoirien. Direction + censeur + secrétariat + professeurs + parents. Offre **Pro** unique, chiffrage au devis.

### 3.1 Modules (ce que l’école active)

**Cœur (toujours pertinent)**

1. Élèves, classes, enseignants, année scolaire, réinscriptions, transferts  
2. Paiements Wave / Orange Money (preuve + validation)  
3. Notes (INTERRO / DEVOIR / COMPOSITION) + bulletins PDF au logo  
4. Appel absences / retards + justificatifs  
5. Devoirs & contrôles  
6. Messages in-app  
7. Emploi du temps  

**Pilotage direction**

8. Statistiques & exports  
9. Analyse (genre, réussite, redoublement descriptif)  
10. **Risques** (élèves à suivre)  
11. Comptabilité Wave / OM / caisse / banque  
12. **Caisse** secrétariat  
13. **Cas sociaux**  
14. RH & paie  
15. SMS officiel (file d’attente)  
16. Multi-école / groupe si pertinent  
17. Coefficients T1/T2/T3  
18. Délibérations / évaluations, palmarès, émargement, convocations blanc ± national  

**Vie scolaire (selon établissement)**

19. Cantine, transport, santé, sortie QR, activités, comportement, objets perdus  

**Réglage transversal**

20. **Cycle d’enseignement** (`PRIMAIRE` / `COLLEGE` / `LYCEE` / `MIXTE`) — ne crée pas un nouveau plan : il **montre ou masque** les sous-menus (séries, examen national, libellés).

### 3.2 Interface

- **Direction** : menu hamburger (déjà là), 6 catégories, cycle appliqué tout de suite. Tableau de bord « aujourd’hui » (paiements, absences, risques).  
- **Secrétariat** : listes (élèves, caisse, bulletins de masse, convocations, import Excel).  
- **Professeur** : appel 3 tapotements, notes en lot, conseil de classe / évaluations, palmarès si secondaire.  
- **Parent** : un enfant = une page. Wave/OM d’abord, puis notes, absences, justificatifs, convocations. Pas d’espace élève.  
- **Mixte** : séparateurs visuels **Primaire** / **Secondaire** dans Examens.  
- **Super-admin** : cycle par école (tableau de bord + page modules) **et** prise en main sans casser le menu.

### 3.3 Communication

| Canal | Rôle | État |
| --- | --- | --- |
| **Application** | Fil de vérité (notes, paiements, messages) | Existe |
| **SMS officiel** | Absences, retards, paiements, devoirs, EDT — **au nom de l’école** | Existe. Jamais le n° Wave/OM |
| **Push / e-mail** | Mêmes événements, sans coût SMS | Existe |
| **Wave / OM** | Argent uniquement (preuve) | Existe |
| **Circulaires groupe** | Consigne multi-campus | Existe |
| **Convocations d’examen** | Blanc / national (selon cycle), deux matricules | Existe |

---

## 4. Roadmap court / moyen / long

### Court terme (0–3 mois) — ancrer ce qui est livré

1. **Régler le cycle** de chaque école (super-admin ou Paramètres école). IGEST → `COLLEGE` (rien ne disparaît). Primaires EPV → `PRIMAIRE` quand la direction le confirme. Groupes primaire+collège → `MIXTE`.  
2. **Démo par cycle** : primaire (évaluations, blanc, caisse, SMS, parents) ; collège (délibérations, palmarès, national, matricule MEN) ; mixte (séparateurs).  
3. **Rentrée** : import CSV/Excel, codes école, Wave/OM, logo, identifiant SMS.  
4. **Formation secrétariat** : le vrai concurrent de Papyrus, c’est l’habitude. Guides direction / enseignant / parent déjà rédigés.  
5. Hors scope court : API de débit Wave, campagnes SMS génériques « réunion », prédictif opaque (le score **Risques** existe déjà, règles explicites).

### Moyen terme (3–9 mois)

1. Affiner le mixte **primaire+collège sans lycée** (séries A/C/D optionnelles même en MIXTE si aucun lycée).  
2. Listings secrétariat encore plus denses (listes d’appel papier type inspection).  
3. Campagnes SMS / e-mail « conseil de classe / réunion parents ».  
4. Indicateurs pédagogiques consolidés au niveau **groupe** (moyennes, délibérations), comme la finance aujourd’hui.  
5. Liaison retards cumulés → convocation vie scolaire.

### Long terme (9–18 mois)

1. Délibérations avancées : signatures, rattrapages, jurys, exports inspection (à spécifier avec des établissements).  
2. Prédictif v2 toujours explicable (tendances intra-trimestre, comparaison campus).  
3. Rester **preuve Wave/OM** tant que les API paiement CI ne sont pas stables pour les écoles.  
4. Hors-ligne élargi avec prudence : ne pas promettre la validation de paiement hors-ligne.

---

## 5. Présentation du tableau de bord → arborescence

Le menu direction n’est plus une liste plate. Six catégories, toujours dans cet ordre. **Accueil** reste hors catégorie (premier lien). Les modules optionnels n’apparaissent que s’ils sont activés (`payments`, `bulletins`, `sms_official`, etc.).

**Comment régler le cycle**

- Direction : **Paramètres école** → *Cycle d’enseignement*.  
- Super-admin : tableau de bord (colonne Cycle, enregistrement immédiat) ou **Modules de l’école** → bloc Cycle.  
- Champ Prisma : `School.educationCycle`. Défaut **`COLLEGE`**. IGEST = collège.

`MIXTE` = primaire + collège, **ou** primaire + collège + lycée : les deux ensembles, avec séparation claire **Primaire** / **Secondaire**.

### 5.1 Les 6 catégories (tous cycles, sauf mention)

#### Administration scolaire

| Sous-module | PRIMAIRE | COLLEGE | LYCEE | MIXTE |
| --- | --- | --- | --- | --- |
| Classes | oui | oui | oui | oui |
| Élèves | oui (matricule **école** seulement) | oui (école + **national MEN**) | oui (école + national) | oui (école + national) |
| Enseignants | oui | oui | oui | oui |
| RH | si module | si module | si module | si module |
| Année scolaire | oui | oui | oui | oui |
| Transferts | oui | oui | oui | oui |
| Réinscriptions | oui | oui | oui | oui |
| Paramètres (dont cycle) | oui | oui | oui | oui |
| Séries A / C / D | **non** | **non** | **oui** (fiches classe / élève) | **oui** (fiches) |

#### Vie scolaire

| Sous-module | PRIMAIRE | COLLEGE | LYCEE | MIXTE |
| --- | --- | --- | --- | --- |
| Emploi du temps | oui | oui | oui | oui |
| Justificatifs d’absence | oui | oui | oui | oui |
| Cantine | si module | si module | si module | si module |
| Objets perdus | si module | si module | si module | si module |
| Activités | si module | si module | si module | si module |
| Sortie école | si module | si module | si module | si module |

Paiements, absences, caisse, SMS, parents : **conservés dans tous les cycles** (finances / communication / espace parent).

#### Examens & Évaluations

| Sous-module | PRIMAIRE | COLLEGE | LYCEE | MIXTE |
| --- | --- | --- | --- | --- |
| Bulletins | oui | oui | oui | oui (partagé) |
| Coefficients T1 / T2 / T3 | oui | oui | oui | oui (partagé) |
| Émargement | oui | oui | oui | oui (partagé) |
| Devoirs & contrôles (INTERRO / DEVOIR / COMPOSITION) | oui | oui | oui | oui (partagé) |
| Évaluations (lien délibérations, libellé simplifié) | **oui** | non | non | **bloc Primaire** |
| Délibérations (conseil / BEPC-style) | non | **oui** | **oui** | **bloc Secondaire** |
| Palmarès | **non** | **oui** | **oui** | **bloc Secondaire** |
| Convocations blanc | **oui** | oui | oui | **bloc Primaire** |
| Convocations national (BEPC / BAC) | **non** | **oui** | **oui** | **bloc Secondaire** |
| Matricule national (fiches élèves) | **non** | **oui** | **oui** | **oui** |

En **MIXTE**, sous Examens :

```
── Primaire ──
  Évaluations
  Convocations (blanc)
── Secondaire ──
  Délibérations
  Palmarès
  Convocations (blanc + national)
```

#### Finances & Comptabilité

Toujours : Frais, Paiements (Wave/OM), **Caisse**, Cas sociaux, Comptabilité. Tous cycles.

#### Communication

Toujours : Messages, **SMS officiels** (si module). Tous cycles.

#### Rapports & Statistiques

Toujours : Analyse, **Risques**, Statistiques. Tous cycles.

### 5.2 Arbre direction (vue condensée)

```
Accueil
Administration scolaire
  Classes · Élèves · Enseignants · RH · Année scolaire
  Transferts · Réinscriptions · Paramètres
Vie scolaire
  Emploi du temps · Justificatifs · Cantine · Objets perdus
  Activités · Sortie école
Examens & Évaluations
  Bulletins · Coefficients · Émargement · Devoirs & contrôles
  [PRIMAIRE] Évaluations · Convocations (blanc)
  [COLLEGE / LYCEE] Délibérations · Palmarès · Convocations (blanc + national)
  [MIXTE] ── Primaire ── / ── Secondaire ──
Finances & Comptabilité
  Frais · Paiements · Caisse · Cas sociaux · Comptabilité
Communication
  Messages · SMS officiels
Rapports & Statistiques
  Analyse · Risques · Statistiques
```

### 5.3 Enseignant et parent (même 6 familles, plus court)

**Enseignant** — Administration (notifications, élèves, RH) · Vie scolaire (appel, transport, cantine, comportement, santé, EDT) · Examens (notes, devoirs ; Évaluations **ou** Conseil de classe + palmarès selon cycle ; MIXTE : séparateurs) · Communication (messages) · Rapports (risques).

**Parent** — Finances (payer) · Examens (notes, convocations, devoirs) · Vie scolaire (suivi, justificatifs, sortie, transport, cantine, santé, activités) · Communication (historique, notifications, messages) · Administration (transfert, confidentialité).

**Groupe / super-admin** : menus propres (pilotage campus, plans, modules, finance plateforme). La prise en main d’une école réutilise **le menu de cette école** + liens « Espace Super Admin » / « Quitter la prise en main ».

---

**Contact.** [https://educonnect-ci.com](https://educonnect-ci.com) · contact@educonnect.ci  
EduConnect — Alliance Digitale Internationale — Côte d’Ivoire.
