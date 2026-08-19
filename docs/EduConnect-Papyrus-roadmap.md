# EduConnect vs Papyrus — stratégie collèges et lycées (Côte d’Ivoire)

Document d’équipe (cinq regards : Papyrus, examens & statistiques, vie scolaire & professeurs, finance & comptabilité, UX/UI).

**Marque.** EduConnect, Alliance Digitale Internationale, Côte d’Ivoire, FCFA, Wave et Orange Money. Site live : [https://educonnect-ci.com](https://educonnect-ci.com). Offre commerciale unique **Pro** ; le tarif n’apparaît qu’à l’issue du devis (`/devis`), pas sur la page d’accueil.

Ce texte ne décrit **que ce qui existe dans le code** d’EduConnect, puis ce qu’il faut construire. Rien n’est inventé.

**Tableau de bord (6 catégories, cycle primaire / collège / lycée / mixte).** Voir [EduConnect-Papyrus-dashboard.md](./EduConnect-Papyrus-dashboard.md) — arborescence, champ `School.educationCycle`, ce qui s’affiche selon le cycle.

---

## État réel d’EduConnect (inventaire)

### Ce qui existe aujourd’hui

| Domaine | Ce qui est en production |
| --- | --- |
| **Identités** | Direction, enseignant, parent, super-admin, admin de groupe. L’élève n’a pas de compte. Lien parent par **code école + matricule + nom**. |
| **Paiements Wave / OM** | Numéros Wave et OM dans les paramètres. Le parent paie dans Wave ou Orange Money, envoie une **capture**. Statuts PENDING / VALIDATED / REJECTED. Reçu PDF possible. **Pas d’API Wave qui débite le parent.** Validation **en ligne**. |
| **Notes** | Saisie unitaire et **en lot**. Types **INTERRO / DEVOIR / COMPOSITION**. Périodes **T1 / T2 / T3** (+ annuelle). |
| **Bulletins PDF** | Génération élève ou **classe entière**. En-tête avec **logo de l’école**. Moyenne **pondérée** (coefficients établissement), **rang**, deux matricules. |
| **Coefficients** | Grille par matière, page direction. Utilisés dans la moyenne du bulletin. |
| **Délibérations** | Conseil de classe par classe / trimestre : mentions, décisions, PV PDF. Libellé **Évaluations** en primaire. |
| **Palmarès** | Classement de classe, direction + enseignant, impression. Masqué en primaire. |
| **Convocations / émargement** | Émargement. Convocations **blanc** et **national** (primaire : blanc seulement). |
| **Matricules** | Matricule **école** + matricule **national MEN**. |
| **Absences & retards** | Appel du jour : Présent / **Retard (LATE)** / Absent. Signalement hors appel. **Justificatifs** parent → direction. Parents notifiés. |
| **Caisse** | Encaissement secrétariat (espèces / chèque), ticket, compte CASH. Complète Wave/OM. |
| **Cas sociaux** | Dossier direction (remise, échéancier). Distinct des bourses super-admin. |
| **Risques** | Liste « élèves à suivre » (notes + absences/retards, règles explicites). |
| **Import** | Élèves **CSV et Excel (.xlsx)**. |
| **Cycle** | `PRIMAIRE` \| `COLLEGE` \| `LYCEE` \| `MIXTE`. Défaut COLLEGE (IGEST). Menu à 6 catégories. |
| **Devoirs & contrôles** | Publication enseignant (Devoir ou Contrôle), calendrier, pièce jointe, rappels (veille 18 h Abidjan ou horaire choisi). Vue direction + exports. |
| **Messages** | Chat école ↔ parents ↔ enseignants (texte, fichier, vocal). Ce n’est **pas** un SMS. |
| **Emploi du temps** | Créneaux classe / enseignant / élève, PDF et Excel, notification parents si modification. Affectation enseignant ↔ classe. |
| **Vie scolaire** | Transport, cantine, badges & comportement, santé, sortie QR, activités extrascolaires, objets perdus — **si le module est activé**. |
| **SMS officiel** | Module distinct (pas les numéros Wave/OM). File d’attente, identifiant expéditeur, tableau de bord des envois. Agrégateur Orange SMS CI (ou Twilio). |
| **Notifications** | In-app + e-mail + **web push** + SMS officiel si le module est on. Absences, retards, paiements, devoirs, EDT. |
| **Comptabilité** | Comptes **Wave, Orange Money, caisse, banque**. Recettes / dépenses, catégories, rapport de période, Excel / PDF. Recettes liées aux paiements validés. |
| **RH** | Dossiers, congés, présence (pointeuse enseignant), paie, avances, évaluations, bulletins de salaire PDF. |
| **Stats & analyse** | Tableau de bord, moyennes par classe, exports élèves / paiements / notes. Page **Analyse** : genre, absences, taux de réussite, réinscriptions, **causes de redoublement** (seuils absences / notes). API reporting. |
| **Réinscriptions** | Promotion de classe, redoublement, causes, exports. Année scolaire. Transferts d’élèves (parent → école → admin). |
| **Multi-école** | Organisation, campus, finance consolidée, RH, comparatif, circulaires, classement recettes. Super-admin : **assistance** (entrer dans une école ou un groupe pour aider). |
| **Hors-ligne** | PWA. File locale : appel, notes (lot), devoirs, création élève/classe/enseignant, envoi de capture parent. Sync au retour réseau. **Pas** la validation de paiement ni le chat. |
| **Devis** | Formulaire `/devis` (établissement, effectifs, vie scolaire, admin, communication, historique). Tarif **Pro** uniquement sur le **résultat** du devis + PDF. |
| **Guides** | Direction, enseignant, parent — français, collège/lycée et primaire. |

### Ce qui n’existe pas (écarts honnêtes)

- **API Wave / OM de débit automatique** : volontairement absent. Le flux est **preuve + validation**.
- **Campagnes SMS génériques** type « réunion parents » hors événements métier (absence, retard, paiement, devoir, EDT).
- **Prédictif opaque / machine learning** : la page **Risques** existe (règles explicites). Pas de boîte noire.
- **Listings inspection MEN** très denses (papier type Papyrus historique) : partiels (PV, palmarès, convocations, émargement, bulletins) mais pas toute la batterie Windows.
- **Validation de paiement hors-ligne** : volontairement en ligne.

Les délibérations, coefficients pondérés, trimestres T1/T2/T3, kinds INTERRO/DEVOIR/COMPOSITION, cas sociaux, caisse secrétariat, palmarès, convocations blanc/national, deux matricules, justificatifs et import Excel **sont dans le code**. Le document tableau de bord détaille qui les voit selon le cycle.

---

## 1. Analyse Papyrus → limites

Papyrus (et les logiciels Windows du même usage) est le **réflexe** de beaucoup de collèges et lycées ivoiriens : secrétariat, caisse, notes, bulletins, impressions. Il est bon là où la secrétaire est formée depuis des années. Il devient un frein dès que l’on sort du bureau.

### 1.1 Ce que Papyrus fait bien (usage type CI)

- **Inscriptions / réinscriptions** : fiches, matricules, classes (6e à Tle), passages d’année.
- **Notes** : saisie par matière, coefficients, moyennes, **rangs**, bulletins papier, **délibérations** (conseil de classe : mentions, décisions, listes à imprimer). C’est souvent **le** argument pour rester.
- **Scolarité / caisse** : encaissement au guichet, reçus, restes à payer — surtout **espèces**.
- **Absences**, **emploi du temps**, **personnel**, **statistiques** et **impressions** (beaucoup de PDF / listing imprimante).

### 1.2 Limites structurelles (pas des défauts de « version »)

| Limite | Conséquence pour un collège / lycée CI |
| --- | --- |
| **Windows on-premise** | Un PC secrétariat, souvent une clé USB pour la sauvegarde. Coupure, vol, panne = arrêt de l’école. Pas d’accès directeur depuis le téléphone à Yopougon, Bouaké ou Korhogo. |
| **Caisse cash-first, mobile money faible** | Les familles paient déjà en **Wave / Orange Money**. Papyrus enregistre mal (ou pas) la preuve. La caisse et le téléphone du parent ne se parlent pas. Impayés difficiles à relancer hors du bureau. |
| **Peu ou pas d’espace parent** | Le parent vient chercher le bulletin, appelle le censeur, ou reçoit un SMS d’un add-on. Pas de suivi notes / absences / devoirs / paiements sur mobile. |
| **SMS en option, pas natif** | Coût et paramétrage à part. Souvent un numéro générique, pas l’identité de l’école. Pas de file d’attente unifiée avec l’app. |
| **Quasi pas de multi-campus cloud** | Un groupe (deux collèges, un lycée) = deux installations, deux fichiers, pas de tableau de bord consolidé (effectifs, recettes, absences). |
| **Interface datée, PC-centrique** | Formulaires denses, peu utilisables sur téléphone. Le professeur ne saisit pas l’appel en classe ; il remet une feuille. |
| **Hors-ligne = le logiciel local** | Paradoxalement Papyrus « marche sans internet » parce qu’il est installé. Mais il ne synchronise rien vers les parents, ni vers un second campus. |
| **Peu de vie scolaire moderne** | Transport, cantine, santé, sortie QR, devoirs notifiés : hors périmètre ou bricolés. |
| **Compta limitée au journal de caisse** | Rarement Wave + OM + banque + caisse dans le même plan de comptes, avec RH / paie. |
| **Statistiques = listings** | Beaucoup d’impressions, peu de **pilotage** (genre, causes de redoublement, campus comparés). Aucune **prédiction**. |

### 1.3 Ce qu’un directeur de collège / lycée attend (besoins type IGEST, sans limiter le document à IGEST)

Une direction d’enseignement secondaire (6e–Tle, souvent plusieurs séries, trimestres, conseil de classe, caisse de scolarité, parents Wave/OM) a besoin de :

1. **Tenir l’année** : inscriptions, classes, EDT, affectations profs.
2. **Tenir les notes** jusqu’au bulletin **et** jusqu’à la délibération (c’est là que Papyrus rassure encore).
3. **Voir l’argent** : qui a payé, en Wave, OM, espèces ou banque — le soir, sur téléphone.
4. **Parler aux parents** sans convoquer tout le monde au secrétariat.
5. **Ne pas dépendre d’un seul PC Windows.**

Papyrus couvre surtout (1) et (2) dans le bureau. Il lâche (3), (4) et (5).

---

## 2. Améliorations EduConnect → solutions

Chaque limite Papyrus est mappée : **déjà là** ou **à construire**. Pas de promesse sur ce qui n’est pas dans le code.

| Limite Papyrus | EduConnect maintenant | À construire |
| --- | --- | --- |
| Un PC Windows, pas de cloud | Application web live, comptes direction / prof / parent, assistance super-admin pour dépanner une école | Continuer le déploiement + formation secrétariat (le vrai concurrent de Papyrus, c’est l’habitude) |
| Mobile money faible | **Wave + OM** : numéros école, preuve, validation, relances cron, recettes en compta | API de débit automatique : **non**, et ce n’est pas le sujet court terme. Améliorer le rapprochement preuve ↔ compte |
| Pas d’app parent | Espace parent : paiements, notes, absences/retards, **justificatifs**, convocations, devoirs, messages, suivi | Bulletin encore plus visible côté parent (la notif à la génération existe) |
| SMS add-on | **SMS officiel** (module + file + tableau de bord + sender école). Push + e-mail. Wave/OM **≠** SMS | Campagnes SMS de masse type « réunion parents » |
| Pas de multi-campus | Groupe : campus, finance, RH, comparatif, circulaires | Indicateurs pédagogiques consolidés au niveau groupe |
| UI PC 2000 | Mobile : hamburger, PWA, **menu 6 catégories** filtré par cycle (primaire / collège / lycée / mixte) | Affiner les listings secrétariat type inspection |
| Appel sur papier | Appel Présent / Retard / Absent, **hors-ligne**, notif + SMS. **Justificatifs** | Récap mensuel type vie scolaire encore plus dense |
| Notes / rangs / bulletins | INTERRO / DEVOIR / COMPOSITION, T1/T2/T3, **moyenne à coefficients**, rang, PDF logo | Listings papier inspection |
| Délibérations Papyrus | Conseil de classe : PV, mentions, décisions. Palmarès. Primaire : libellé **Évaluations** | Signatures / jurys avancés (long terme) |
| Convocations | Blanc + national, deux matricules, émargement. Primaire : blanc seulement | — |
| Caisse espèces | **Caisse secrétariat** (espèces/chèque, ticket) + Wave/OM + compta 4 comptes | Rapprochement bancaire éventuel |
| Cas sociaux | Dossier **direction** (remise, échéancier) | — |
| Stats listings | Analyse + page **Risques** (règles explicites) + exports | Prédictif v2 (tendances), toujours explicable |
| Inscriptions | Élèves, **CSV + Excel**, photos, réinscriptions, transferts | Parcours rentrée encore plus proche du secrétariat |
| Sauvegarde USB | Cloud + job de backup | Communication « plus de clé USB » |

**Synthèse honnête.** Le cœur examens du secondaire (coefficients, trimestres, délibérations, palmarès, convocations) **est dans le code**. EduConnect est devant Papyrus sur Wave/OM, parent, mobile, SMS, multi-école, caisse mixte, cycle primaire/collège/lycée. Le chantier prioritaire n’est plus « rattraper les délibérations » : c’est **former le secrétariat** et **régler le cycle** de chaque école. Détail du menu : [EduConnect-Papyrus-dashboard.md](./EduConnect-Papyrus-dashboard.md).

---

## 3. Version optimisée → modules + interface + communication

Cible : collège ou lycée ivoirien (6e–Tle), direction + censeur + secrétariat + professeurs + parents. Un campus ou un petit groupe. Offre **Pro** unique, chiffrage au devis.

### 3.1 Modules (ce que l’école active, sans multiplier les plans)

**Cœur (déjà livré, à mettre en avant en démo collège)**

1. Élèves, classes, enseignants, affectations, année scolaire, réinscriptions  
2. Paiements Wave / Orange Money (preuve + validation)  
3. Notes + bulletins PDF au **logo de l’école**  
4. Appel absences / **retards**  
5. Devoirs & contrôles  
6. Messages in-app  
7. Emploi du temps  

**Pilotage direction (déjà livré)**

8. Statistiques & exports  
9. Analyse (genre, réussite, redoublement descriptif)  
10. Comptabilité Wave / OM / caisse / banque  
11. RH & paie  
12. SMS officiel (file d’attente)  
13. Multi-école / groupe si pertinent  

**Vie scolaire (déjà livré, à activer selon l’établissement)**

14. Cantine, transport, santé, sortie QR, activités, comportement, objets perdus  

**À ajouter (plus tard, pas un trou bloquant)**

15. Campagnes SMS « réunion / conseil »  
16. Indicateurs pédagogiques consolidés **groupe**  
17. Prédictif v2 (tendances), toujours explicable — la page **Risques** existe déjà  
18. Listings inspection MEN très denses  

**Déjà livré (ne plus les vendre comme « à venir »)** : trimestres & coefficients, délibérations / évaluations, palmarès, convocations blanc/national, cas sociaux, caisse secrétariat, justificatifs, import Excel, cycle d’enseignement.

### 3.2 Interface (UX/UI)

Principes déjà dans le produit : français, FCFA, mobile first, tableaux de bord par rôle, PWA, peu de jargon.

**À optimiser pour remplacer Papyrus sans perdre la secrétaire :**

- **Direction (téléphone et bureau)** : un écran « aujourd’hui » — paiements en attente, absences du jour, devoirs publiés, SMS en échec. C’est déjà l’esprit du dashboard ; le collège a besoin que **caisse + vie scolaire + notes** soient au même niveau visuel.
- **Secrétariat** : listes denses mais lisibles (élèves, impayés, bulletins de masse). Moins de « cartes modernes » ici, plus de tableaux comme Papyrus, mais dans le navigateur.
- **Professeur** : appel en 3 tapotements (Présent / Retard / Absent), notes en lot, hors-ligne. Ne pas alourdir.
- **Parent** : un enfant = une page. Wave/OM d’abord, puis notes et absences. Pas d’espace élève.
- **Groupe** : comparatif campus (déjà là) + plus tard moyennes et délibérations.

Dashboards : Chart.js déjà utilisé (stats, analyse, groupe). Garder des graphiques **lisibles en 4G** (peu de librairies, déjà le cas).

### 3.3 Communication

| Canal | Rôle | État |
| --- | --- | --- |
| **Application** | Fil de vérité (notes, paiements, messages) | Existe |
| **SMS officiel** | Absences, retards, paiements, devoirs, EDT — **au nom de l’école** | Existe (module + queue). À ne jamais confondre avec le n° Wave/OM |
| **Push / e-mail** | Même événements, sans coût SMS | Existe (SMTP et VAPID selon config serveur) |
| **Wave / OM** | Argent uniquement | Existe (preuve). Pas un canal de message |
| **Circulaires groupe** | Consigne multi-campus | Existe |
| **Campagnes SMS / e-mail « conseil de classe / réunion »** | Convocation familles | **À construire** (aujourd’hui pas d’outil campagne générique) |

Multi-école et bulletins logo : **déjà en place**. Le commercial Pro les inclut ; on ne les vend pas comme des options séparées sur la landing.

---

## 4. Roadmap → court / moyen / long terme

Pas de slogans. Des pas concrets pour un collège/lycée qui compare à Papyrus.

### Court terme (0–3 mois) — vendre et ancrer ce qui existe

Objectif : qu’une direction **arrête le PC Papyrus** pour le quotidien **et** le conseil de classe. Les délibérations, le palmarès, la caisse et les convocations sont livrés.

1. **Régler le cycle** de chaque école (`PRIMAIRE` / `COLLEGE` / `LYCEE` / `MIXTE`). IGEST → `COLLEGE`. Voir [EduConnect-Papyrus-dashboard.md](./EduConnect-Papyrus-dashboard.md).  
2. **Démo par cycle** : primaire (évaluations, blanc, caisse, SMS, parents) ; collège (délibérations, palmarès, national, matricule MEN) ; mixte (séparateurs Primaire / Secondaire).  
3. **Paramétrage Pro via `/devis`** : un seul plan, tarif **uniquement sur le résultat**. Formation secrétariat + 2 profs + 1 parent témoin.  
4. **Rentrée** : import **CSV / Excel**, codes école, Wave/OM, logo, identifiant SMS.  
5. **Run** : file SMS, hors-ligne appel/notes, assistance super-admin. Guides déjà rédigés.

Hors scope court : API Wave, campagnes SMS génériques, prédictif opaque.

### Moyen terme (3–9 mois) — confort secrétariat et groupe

1. Affiner MIXTE primaire+collège **sans** séries lycée si l’établissement n’a pas de lycée.  
2. UX secrétariat : listings d’appel et notes pleine largeur, impressions inspection.  
3. Campagnes SMS / e-mail « conseil de classe / réunion ».  
4. Indicateurs pédagogiques consolidés au **groupe**.  
5. Liaison retards cumulés → convocation vie scolaire.

### Long terme (9–18 mois) — dépasser Papyrus

1. **Délibérations avancées** : signatures, rattrapages, jurys, exports inspection (à spécifier avec des établissements).  
2. **Prédictif v2** : tendances intra-trimestre, comparaison campus. Toujours explicable. La page Risques (v1) existe.  
3. **Intégrations** : rester **preuve Wave/OM** tant que les API paiement CI ne sont pas stables.  
4. **Hors-ligne élargi** avec prudence : ne pas promettre la validation de paiement hors-ligne.

---

## Position commerciale (rappel)

- Une offre : **Pro**.  
- Entrée par **https://educonnect-ci.com/devis**.  
- Le prix se lit **sur le devis généré**, pas en vitrine.  
- Face à Papyrus, le pitch : **Wave/OM + parents + mobile + SMS officiel + compta + caisse + délibérations / palmarès / convocations + cycle primaire-collège-lycée dès maintenant**.

**Contact.** [https://educonnect-ci.com](https://educonnect-ci.com) · contact@educonnect.ci  
EduConnect — Alliance Digitale Internationale — Côte d’Ivoire.
