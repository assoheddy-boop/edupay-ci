# EduConnect vs Papyrus — stratégie collèges et lycées (Côte d’Ivoire)

Document d’équipe (cinq regards : Papyrus, examens & statistiques, vie scolaire & professeurs, finance & comptabilité, UX/UI).

**Marque.** EduConnect, Alliance Digitale Internationale, Côte d’Ivoire, FCFA, Wave et Orange Money. Site live : [https://educonnect-ci.com](https://educonnect-ci.com). Offre commerciale unique **Pro** ; le tarif n’apparaît qu’à l’issue du devis (`/devis`), pas sur la page d’accueil.

Ce texte ne décrit **que ce qui existe dans le code** d’EduConnect, puis ce qu’il faut construire. Rien n’est inventé.

---

## État réel d’EduConnect (inventaire)

### Ce qui existe aujourd’hui

| Domaine | Ce qui est en production |
| --- | --- |
| **Identités** | Direction, enseignant, parent, super-admin, admin de groupe. L’élève n’a pas de compte. Lien parent par **code école + matricule + nom**. |
| **Paiements Wave / OM** | Numéros Wave et OM dans les paramètres. Le parent paie dans Wave ou Orange Money, envoie une **capture**. Statuts PENDING / VALIDATED / REJECTED. Reçu PDF possible. **Pas d’API Wave qui débite le parent.** Validation **en ligne**. |
| **Notes** | Saisie unitaire et **en lot** (enseignant). Matière (texte), période (texte libre), note / barème, commentaire. |
| **Bulletins PDF** | Génération élève ou **classe entière**. En-tête avec **logo de l’école**. Moyenne, **rang** dans la classe, coefficients affichés sur le PDF. |
| **Absences & retards** | Appel du jour : Présent / **Retard (LATE)** / Absent. Signalement hors appel avec motif. Parents notifiés. |
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

- **Délibérations / conseil de classe** : pas de module (pas de PV, pas de mentions « Assez bien / Bien / Très bien », pas de décision Admis / Ajourné / Redouble, pas de vote).
- **Moyenne pondérée réelle** : les coefficients (ex. Maths 3, Français 3) sont **affichés** sur le bulletin, mais la moyenne calculée est une **moyenne arithmétique** des notes, pas une moyenne à coefficients. Pas de grille MEN par établissement, pas de séries (A, C, D) ni de classement par genre.
- **Périodes** : champ texte, pas un trimestres T1 / T2 / T3 structuré avec moyenne annuelle.
- **Compositions vs interrogations** : les devoirs distinguent Devoir / Contrôle ; les **notes du bulletin** n’ont pas ce découpage (interro, devoir, composition).
- **Cas sociaux** : des **bourses** existent côté super-admin plateforme, pas un dossier « cas social » géré par la direction (remise, échelonnement, suivi social).
- **Analytique prédictive** : **non construite**. L’analyse redoublement est **descriptive** (causes a posteriori), pas un score de risque.
- **Caisse secrétariat Papyrus-like** : pas de ticket caisse espèces au guichet, pas de journal de caisse « secretaria » avec numérotation type logiciel Windows. La caisse existe dans la compta, le flux parent est Wave/OM + preuve.
- **Impressions secrétariat** : bulletins, EDT, stats, devoirs, compta, RH — oui. Pas la batterie de listings Papyrus (listes d’appel papier, récapitulatifs de délibération, états MEN très denses).

Ces écarts orientent le moyen et le long terme. Ils ne doivent pas masquer l’avance déjà réelle sur le cloud, le parent, Wave/OM et le mobile.

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
| Mobile money faible | **Wave + OM** : numéros école, preuve, validation, relances cron, recettes en compta | API de débit automatique : **non**, et ce n’est pas le sujet court terme. Améliorer le rapprochement preuve ↔ compte (Wave/OM/caisse/banque) |
| Pas d’app parent | Espace parent : paiements, notes, absences/retards, devoirs, messages, suivi, confidentialité. Multi-enfants, multi-écoles | Bulletin consultable côté parent de façon plus visible (notification existe déjà à la génération) |
| SMS add-on | **SMS officiel** (module + file + tableau de bord + sender école). Push + e-mail en parallèle. Wave/OM **≠** SMS | Campagnes SMS de masse type « réunion parents » (aujourd’hui surtout événements métier : absence, retard, paiement, devoir, EDT) |
| Pas de multi-campus | Groupe : campus, finance, RH, comparatif, circulaires, classement recettes | Indicateurs pédagogiques consolidés (moyennes, délibérations) quand le module notes sera plus riche |
| UI PC 2000 | Mobile : menu hamburger, PWA, dashboards direction / prof / parent / groupe | Affiner les écrans **secrétariat collège** (listes d’appel, saisie notes par matière/trimestre) pour que la secrétaire Papyrus s’y retrouve |
| Appel sur papier | Appel Présent / Retard / Absent, **hors-ligne**, notif parent + SMS si module | Justificatifs d’absence (certificat) et récap mensuel type vie scolaire |
| Notes / rangs / bulletins | Notes, rang de classe, bulletin PDF **avec logo**, génération de masse | **Moyenne à coefficients réelle**, trimestres structurés, compositions, **délibérations** |
| Délibérations Papyrus | **Absent** | Conseil de classe : PV, mentions, décisions, listes à imprimer / PDF |
| Caisse espèces | Compte **caisse** en compta + flux parent Wave/OM | Guichet secrétariat : encaissement espèces / chèque avec reçu immédiat (complément, pas remplacement de Wave/OM) |
| Cas sociaux | Bourses **plateforme** (super-admin), pas l’école | Dossier cas social direction : remise, échéancier, suivi |
| Stats listings | Analyse genre, réussite, absences, réinscriptions, causes de redoublement, exports Excel/PDF | Prédictif léger (risque d’échec / décrochage) — **pas encore là** |
| Personnel | RH : dossiers, congés, présence, paie, évaluations | Lier plus fort EDT ↔ affectation matière/classe (aujourd’hui classe + créneaux) |
| Inscriptions | Élèves, CSV, photos, réinscriptions, promotions, transferts | Parcours « rentrée » plus proche du secrétariat (lots, impressions listes) |
| Sauvegarde USB | Cloud + job de backup | Communication claire aux directions : « plus de clé USB » |

**Synthèse honnête.** Sur Wave/OM, parent, mobile, SMS en file, compta 4 comptes, multi-école, hors-ligne ciblé, RH et vie scolaire, **EduConnect est déjà devant Papyrus**. Sur le **cœur examens du secondaire** (coefficients vrais, trimestres, conseil de classe), **Papyrus reste plus complet**. C’est le chantier prioritaire pour convaincre un collège qui « ne peut pas quitter Papyrus à cause des délibérations ».

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

**À ajouter pour coller à Papyrus sur le secondaire (pas encore dans le code)**

15. **Trimestres & coefficients** configurables (grille établissement)  
16. **Conseil de classe / délibérations** (PV, mentions, décisions)  
17. **Cas sociaux** (direction, pas seulement super-admin)  
18. **Prédictif** (moyen/long) : risque d’échec à partir des notes, absences, retards — aujourd’hui **inexistant**

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

Objectif : qu’une direction puisse **arrêter le PC Papyrus pour le quotidien** (caisse Wave/OM, parents, appel, bulletins simples) tout en gardant Papyrus **un trimestre** pour les délibérations si besoin. Double saisie temporaire assumée.

1. **Démo collège type** (6e–3e ou 2nde–Tle) : classes, profs, appel LATE, notes en lot, bulletin PDF **avec le logo de l’école**, paiement Wave/OM parent, validation direction, SMS officiel sur une absence test.
2. **Paramétrage Pro via `/devis`** : un seul plan, tarif **uniquement sur le résultat**. Formation secrétariat + 2 profs + 1 parent témoin.
3. **Rentrée** : import CSV élèves, codes école, numéros Wave/OM, logo, identifiant SMS. Réinscriptions pour ceux qui y passent déjà.
4. **Petits écarts utiles (code mince, gros effet)**  
   - Afficher le **bulletin** plus clairement côté parent.  
   - Expliquer sur le bulletin que la moyenne actuelle est **non pondérée** (honnêteté) **ou** corriger le calcul pour utiliser les coefficients déjà affichés (correctif ciblé, pas un nouveau module).  
   - Périodes proposées : T1 / T2 / T3 (liste, le champ existe déjà).  
   - Écran secrétariat « paiements du jour » + « bulletins de la classe ».
5. **Run** : file SMS, hors-ligne appel/notes, assistance super-admin si l’école bloque. Guides direction / enseignant / parent déjà rédigés : les donner papier + lien.

Hors scope court : prédictif, conseil de classe complet, API Wave.

### Moyen terme (3–9 mois) — rattraper Papyrus sur le secondaire

Objectif : le censeur n’a plus besoin de Papyrus pour le **conseil de classe**.

1. **Coefficients et trimestres**  
   - Grille de coefficients par matière et par niveau (6e, 3e, 1re, Tle…), éditable par l’école.  
   - Moyenne trimestrielle **pondérée**, moyenne annuelle.  
   - Classement de classe (déjà un rang) + éventuellement par genre (les stats genre existent).  
2. **Saisie notes « collège »**  
   - Types : interrogation, devoir, composition (aligné sur Devoir/Contrôle déjà présents côté homework).  
   - Barème 20 par défaut, périodes T1/T2/T3.  
3. **Délibérations (MVP)**  
   - Session conseil par classe et trimestre.  
   - Liste élèves : moyenne, rang, absences/retards, appréciation direction.  
   - Décision : Admis / Ajourné / Redouble / Conditionnel (valeurs à figer avec des chefs d’établissement).  
   - Mentions simples.  
   - PV PDF + listes imprimables (c’est ce que Papyrus imprime le jour J).  
4. **Cas sociaux (direction)**  
   - Dossier élève : motif, remise %, échéancier, lien avec la scolarité. Les bourses super-admin restent un autre niveau (bourses institutionnelles).  
5. **Prédictif léger (v1)**  
   - **Pas de machine learning opaque.** Un score simple : moyenne basse + absences/retards au-dessus des seuils **déjà** utilisés pour les causes de redoublement. Liste « élèves à suivre » pour le censeur.  
6. **Caisse secrétariat**  
   - Encaissement espèces/chèque → compte CASH/BANK, reçu PDF, même élève que le flux Wave/OM.  
7. **UX secrétariat** : tableaux d’appel et de notes pleine largeur ; dashboards direction inchangés (modernes).

### Long terme (9–18 mois) — dépasser Papyrus

Objectif : Papyrus n’a plus d’argument « métier » ; EduConnect devient le système d’enregistrement.

1. **Délibérations avancées** : historique des conseils, signatures, rattrapages, séries (A/C/D), jurys de fin d’année, exports type inspection (à spécifier avec des établissements, pas à deviner).  
2. **Prédictif v2** : tendances intra-trimestre, alerte précoce, comparaison campus (groupe). Toujours explicable (règles + historique), pas une boîte noire.  
3. **Vie scolaire secondaire** : retards cumulés → convocation ; liaison comportement (badges déjà là) ↔ conseil de classe.  
4. **Groupe scolaire** : mêmes indicateurs pédagogiques consolidés que la finance aujourd’hui.  
5. **Intégrations** : rester **preuve Wave/OM** tant que les API paiement CI ne sont pas stables pour les écoles ; éventuellement rapprochement bancaire. SMS : campagnes et modèles (réunion, conseil).  
6. **Hors-ligne élargi** avec prudence : ne pas promettre la validation de paiement hors-ligne (volontairement en ligne aujourd’hui).

---

## Position commerciale (rappel)

- Une offre : **Pro**.  
- Entrée par **https://educonnect-ci.com/devis**.  
- Le prix se lit **sur le devis généré**, pas en vitrine.  
- Face à Papyrus, le pitch n’est pas « on a plus de listings » : c’est **Wave/OM + parents + mobile + SMS officiel + compta + multi-école dès maintenant**, et **délibérations dans les 3–9 mois** pour ne plus laisser le censeur sur Windows.

**Contact.** [https://educonnect-ci.com](https://educonnect-ci.com) · contact@educonnect.ci  
EduConnect — Alliance Digitale Internationale — Côte d’Ivoire.
