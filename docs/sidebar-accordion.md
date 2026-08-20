# Menu accordéon — sidebar EduConnect

## Comportement (type e-commerce)

- Au chargement : **toutes les catégories sont fermées**, sauf celle de la page en cours.
- **Un seul panneau ouvert à la fois** : cliquer sur « Finances » ferme « Vie scolaire », etc.
- Re-cliquer sur la catégorie ouverte la **referme**.
- Les catégories sans lien visible (RBAC) sont **masquées**.

## Structure (EJS)

Chaque catégorie du tableau de bord est un bloc `.nav-group` dans `views/partials/_sidebar.ejs` :

```html
<div class="nav-group" data-nav-group="vie-scolaire">
  <button type="button" class="nav-group-title"
          aria-expanded="false"
          aria-controls="nav-items-vie-scolaire">
    Vie scolaire
    <span class="nav-group-chevron" aria-hidden="true"></span>
  </button>
  <div class="nav-group-items" id="nav-items-vie-scolaire">
    <a href="/timetable">Emploi du temps</a>
    <!-- … -->
  </div>
</div>
```

- **`data-nav-group`** : identifiant stable pour mémoriser la dernière catégorie ouverte.
- **`aria-expanded` / `aria-controls`** : accessibilité clavier et lecteurs d’écran.
- Par défaut **fermé** (pas de classe `is-open` dans le HTML).

## JavaScript

Fichier : `public/js/app.js`

1. Fermeture de tous les groupes, puis ouverture de celui contenant le lien actif (`.is-active`).
2. Sinon, réouverture de la dernière catégorie mémorisée (`localStorage` : `educonnect.sidebar.openGroup`).
3. Clic sur `.nav-group-title` → accordéon strict (ferme les autres) + toggle.
4. Clic sur l’icône d’aide (`.hint-tip`) ne déclenche pas l’accordéon.

## CSS

Fichier : `public/css/main.css`

- Catégories en **cartes** avec bordure (style menu boutique).
- `.nav-group-items` : `display: none` quand fermé (aucun lien visible).
- `.nav-group.is-open > .nav-group-items` : `display: flex`.
- Chevron pivoté quand le groupe est ouvert.

## Ajouter une catégorie

1. Copier un bloc `.nav-group` existant dans `_sidebar.ejs`.
2. Choisir un `data-nav-group` unique (ex. `mon-module`).
3. Renseigner `id` / `aria-controls` cohérents.
4. Placer les liens dans `.nav-group-items` avec les conditions RBAC (`can()`, `on()`).

Aucun changement JS/CSS supplémentaire n’est requis.

## Tests

```bash
npm test -- tests/sidebar.test.js
```
