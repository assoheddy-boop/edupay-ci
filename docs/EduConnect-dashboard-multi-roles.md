# EduConnect — tableaux de bord multi-rôles (RBAC)

Document d’équipe · **EduConnect**, Alliance Digitale Internationale · [educonnect-ci.com](https://educonnect-ci.com)

**Artefact interactif (source de vérité)** : ouvrir le canvas  
[`educonnect-dashboard-multi-roles.canvas.tsx`](file:///C:/Users/assoh/.cursor/projects/c-Users-assoh-edupay-ci/canvases/educonnect-dashboard-multi-roles.canvas.tsx)  
dans Cursor (7 onglets : synthèse, rôles, RBAC, navigation, écarts, roadmap, KPIs).

## Résumé

- **5 rôles Prisma** aujourd’hui : `SUPER_ADMIN`, `ORGANIZATION_ADMIN`, `SCHOOL_ADMIN`, `TEACHER`, `PARENT`.
- **9 rôles métier** visés (fondateur, direction, secrétariat, compta, enseignant, éducateur, vie scolaire, parent, élève).
- **Gap principal** : secrétariat, compta, éducateur, vie scolaire et élève n’ont pas de rôle dédié ; tout le staff école partage `SCHOOL_ADMIN`.
- Le **contexte ivoirien** (T1-T3, délibérations, caisse, Wave/OM, bulletins CI, marketplace IGEST/EPV) est déjà couvert fonctionnellement.
- Recommandation : couche **`SchoolStaffRole` + permissions** sans casser l’enum de connexion ni `adminAssist`.

Voir aussi : [EduConnect-Papyrus-dashboard.md](./EduConnect-Papyrus-dashboard.md) (arborescence sidebar existante).
