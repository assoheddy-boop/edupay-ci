# Menu accordéon — sidebar EduConnect

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

- **`data-nav-group`** : identifiant stable pour mémoriser l’état (localStorage).
- **`aria-expanded` / `aria-controls`** : accessibilité clavier et lecteurs d’écran.
- Par défaut **fermé** (pas de classe `is-open` dans le HTML).

## Comportement (JavaScript)

Fichier : `public/js/app.js`

1. Au chargement, la catégorie contenant le lien actif (`.is-active`) s’ouvre.
2. Les préférences utilisateur sont lues dans `localStorage` (`educonnect.sidebar.groups`).
3. Clic sur `.nav-group-title` → toggle classe `is-open` + mise à jour `aria-expanded`.
4. L’état ouvert/fermé est enregistré par `data-nav-group`.

## Style & animation (CSS)

Fichier : `public/css/main.css`

- `.nav-group-items` : `max-height: 0`, `opacity: 0` (fermé).
- `.nav-group.is-open > .nav-group-items` : `max-height: 1200px`, `opacity: 1` (ouvert).
- Transition ~0,3 s (effet slide).
- Sous-liens indentés (`padding-left`) + bordure gauche légère.
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
