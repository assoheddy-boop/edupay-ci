document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('navToggle');
  const nav = document.getElementById('mainNav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('nav-open');
      toggle.classList.toggle('nav-toggle-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', () => {
        nav.classList.remove('nav-open');
        toggle.classList.remove('nav-toggle-open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  const sidebar = document.getElementById('appSidebar');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const overlay = document.getElementById('sidebarOverlay');
  const closeSidebar = () => {
    sidebar?.classList.remove('is-open');
    sidebarToggle?.classList.remove('nav-toggle-open');
    sidebarToggle?.setAttribute('aria-expanded', 'false');
    if (overlay) overlay.hidden = true;
  };
  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener('click', () => {
      const open = sidebar.classList.toggle('is-open');
      sidebarToggle.classList.toggle('nav-toggle-open', open);
      sidebarToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (overlay) overlay.hidden = !open;
    });
    overlay?.addEventListener('click', closeSidebar);
    sidebar.querySelectorAll('a').forEach((a) => a.addEventListener('click', closeSidebar));
  }

  const path = window.location.pathname;
  let best = null;
  document.querySelectorAll('.app-sidebar-nav a').forEach((a) => {
    const href = a.getAttribute('href');
    if (!href) return;
    if (path === href || (href !== '/' && path.startsWith(`${href}/`)) || path === href) {
      if (!best || href.length > best.href.length) best = { el: a, href };
    }
  });
  best?.el.classList.add('is-active');
});
