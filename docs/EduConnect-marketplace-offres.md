# EduConnect — Marketplace, offres de visibilité

Document commercial et produit. **EduConnect**, Alliance Digitale Internationale. Site : [https://educonnect-ci.com](https://educonnect-ci.com). Portails canoniques : `https://educonnect-ci.com/e/:slug` (pas de domaine educonnect.ci).

La **gestion interne** de l’école reste un plan unique **Pro** (devis — le tarif n’est pas affiché sur l’accueil). Le **Marketplace** est une **option payante séparée** : une école peut utiliser EduConnect sans apparaître sur Google / `/ecoles`, ou acheter de la visibilité.

Contact : contact@educonnect.ci

---

## 1. Architecture — indépendant des modules internes

Le Marketplace **n’est pas** un module de vie scolaire. Il ne remplace pas Pro, ne s’active pas avec les notes, la caisse ou les SMS, et la direction **ne peut pas** l’allumer elle-même.

| Couche | Rôle | Clé |
| --- | --- | --- |
| **Pro (gestion)** | Élèves, notes, bulletins, Wave/OM, absences, SMS officiel, RH, etc. | Plan unique, devis |
| **Marketplace (visibilité)** | Page publique `/e/:slug`, annuaire `/ecoles`, badges, SEO | Module `marketplace` + palier `School.marketplaceTier` |

**Règles techniques**

1. Module `marketplace` dans `src/config/modules.js`, **défaut off**, `addon: true`.
2. Super-admin : `/admin/modules` (matrice ou fiche école) et palier sur le tableau de bord / fiche modules.
3. `planIncludesFeature` ignore ce module : attribuer Pro **n’active pas** la vitrine.
4. Portail public **uniquement** si les trois conditions sont vraies :
   - module `marketplace` activé ;
   - palier `STANDARD`, `PREMIUM` ou `VIP` (pas `NONE`) ;
   - case « Publier la page » cochée par la direction (`publicPortalEnabled`).
5. Sinon, `GET /e/:slug` → **404**, même si le slug existe. Aucune donnée élève n’est exposée.
6. Paramètres école : module off → pas de « Publier la page », message **Contactez EduConnect pour le Marketplace**. Module on → CMS actuel (actualité, bannière, galerie, GPS).

```
EduConnect
├── Gestion interne (Pro)          ← secrétariat, parents connectés
│     notes, caisse, bulletins…
└── Marketplace (add-on)           ← visiteur, Google, WhatsApp
      /e/:slug  ·  /ecoles
      Gratuit = pas de portail
      Standard / Premium / VIP
```

---

## 2. Tableau Gratuit vs Standard vs Premium vs VIP

Les prix ci-dessous sont des **propositions commerciales** pour la visibilité. Ils **ne remplacent pas** le devis Pro de gestion.

| | **Gratuit** | **Standard** | **Premium** | **VIP** |
| --- | --- | --- | --- | --- |
| **Prix proposé** | 0 FCFA | **50 000 FCFA / an** (~4 200 / mois) | **150 000 FCFA / an** (~12 500 / mois) | **300 000 FCFA / an** (~25 000 / mois) |
| Palier technique | `NONE` | `STANDARD` | `PREMIUM` | `VIP` |
| Module `marketplace` | off | on | on | on |
| Page `/e/:slug` | Non (404) | Oui, si la direction publie | Oui | Oui |
| Listing `/ecoles` | Non | Oui | Oui, mise en avant | Oui, **en tête** |
| Badge | — | Partenaire | Premium | VIP |
| `publicFeatured` | non | non | oui | oui |
| Actualités, bannière, galerie, OSM | — | Oui | Oui | Oui |
| Notes, bulletins, matricules | Jamais publics | Jamais | Jamais | Jamais |
| Activation | — | Super-admin EduConnect | Super-admin | Super-admin |

**Rappel.** Une école Pro sans Marketplace fonctionne normalement (parents, profs, caisse). Elle n’apparaît simplement pas sur l’annuaire.

---

## 3. Tarifs FCFA proposés (visibilité uniquement)

Proposition honnête pour le marché ivoirien des établissements privés, **en plus** du plan Pro (gestion, devis).

| Offre | Par an | Équivalent mensuel | Positionnement |
| --- | --- | --- | --- |
| Gratuit | 0 | 0 | EduConnect sans vitrine web |
| Standard | 50 000 FCFA | ~4 200 FCFA | URL WhatsApp + fiche `/ecoles` |
| Premium | 150 000 FCFA | ~12 500 FCFA | Mise en avant, badge Premium |
| VIP | 300 000 FCFA | ~25 000 FCFA | Première place, badge VIP |

Facturation annuelle de préférence (alignée sur l’année scolaire). Mensuel possible en 12 × l’équivalent, sans rabais implicite.

Ces montants restent **modifiables** par la direction commerciale. Ils ne s’affichent pas sur la page d’accueil.

---

## 4. Comment le super-admin active une école

1. Ouvrir [https://educonnect-ci.com/admin/modules](https://educonnect-ci.com/admin/modules) (ou `/admin/dashboard`).
2. Cocher **Marketplace** pour l’école (la direction ne voit pas ce toggle).
3. Choisir le palier : **Standard**, **Premium** ou **VIP**.  
   - Standard : si le palier était `NONE`, il passe automatiquement à Standard.  
   - Premium / VIP : `publicFeatured` passe à vrai.
4. La **direction** publie ensuite la page dans **Paramètres école** (« Publier la page de l’école ») et gère actualités / bannière.
5. Vérifier `https://educonnect-ci.com/e/:slug` et le tri sur `/ecoles`.

Sans palier (`NONE`) ou sans module, la page reste introuvable.

---

## 5. Roadmap

### Court terme (0–3 mois)

- Module + paliers livrés, 404 si non payé.
- IGEST en **VIP**, écoles EPV en **Premium** (démo partenaires).
- Argumentaire directeur : « Vos notes restent privées ; votre école devient trouvable. »

### Moyen terme (3–9 mois)

- Devis Marketplace distinct du devis Pro (même formulaire, ligne visibilité).
- Page « établissements vérifiés » et filtres quartier.
- Relance annuelle à J-30 avant l’échéance.

### Long terme (9–18 mois)

- Pack « Pro + Premium » avec remise, sans fusionner les produits.
- Campagnes SEO locales (ville + cycle) sans jamais publier de résultats d’élèves.
- Tableau super-admin : échéances et écoles sans vitrine.

---

## 6. Stratégie marketing — directeurs

**Promesse.** EduConnect gère l’école. Le Marketplace **fait trouver** l’école. Ce n’est pas la même facture.

**Phrases utiles**

- « Vous pouvez rester 100 % interne : aucun parent ne voit vos notes en ligne. »
- « Pour WhatsApp et Google, une URL stable : `educonnect-ci.com/e/votre-ecole`. »
- « Standard = exister. Premium = être vu. VIP = être en tête. »
- « Ce n’est pas le plan Pro : la gestion continue même sans Marketplace. »

**Objections**

| Objection | Réponse |
| --- | --- |
| « On n’a pas besoin d’être sur Google. » | Gratuit = pas de page. L’outil de gestion reste. |
| « Les résultats vont fuiter. » | Interdit dans le code : pas de notes, rangs, matricules, listes d’élèves. |
| « C’est déjà dans les 500 000. » | Non. Pro = secrétariat. Marketplace = vitrine. Deux lignes. |
| « On activera tout seuls. » | Impossible : seul EduConnect allume le module (option payante). |

**Cible prioritaire.** Directeurs d’écoles privées déjà Pro (IGEST, EPV, nouveaux devis) qui collent déjà le nom de l’école dans WhatsApp.

---

**Contact.** [https://educonnect-ci.com](https://educonnect-ci.com) · contact@educonnect.ci  
EduConnect — Alliance Digitale Internationale — Côte d’Ivoire.
