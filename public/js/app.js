document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('navToggle');
  const nav = document.getElementById('mainNav');
  const navOverlay = document.getElementById('navOverlay');
  const setPublicNavOpen = (open) => {
    if (!nav || !toggle) return;
    nav.classList.toggle('nav-open', open);
    toggle.classList.toggle('nav-toggle-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (navOverlay) navOverlay.hidden = !open;
    document.body.classList.toggle('menu-open', open);
  };
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      setPublicNavOpen(!nav.classList.contains('nav-open'));
    });
    navOverlay?.addEventListener('click', () => setPublicNavOpen(false));
    nav.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', () => setPublicNavOpen(false));
    });
  }

  const sidebar = document.getElementById('appSidebar');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const overlay = document.getElementById('sidebarOverlay');
  const sidebarClose = document.getElementById('sidebarClose');
  const closeSidebar = () => {
    sidebar?.classList.remove('is-open');
    sidebarToggle?.classList.remove('nav-toggle-open');
    sidebarToggle?.setAttribute('aria-expanded', 'false');
    if (overlay) overlay.hidden = true;
    document.body.classList.remove('sidebar-open');
  };
  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener('click', () => {
      const open = sidebar.classList.toggle('is-open');
      sidebarToggle.classList.toggle('nav-toggle-open', open);
      sidebarToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (overlay) overlay.hidden = !open;
      document.body.classList.toggle('sidebar-open', open);
    });
    overlay?.addEventListener('click', closeSidebar);
    sidebarClose?.addEventListener('click', closeSidebar);
    sidebar.querySelectorAll('a').forEach((a) => a.addEventListener('click', closeSidebar));
  }

  const homeToggle = document.getElementById('homeNavToggle');
  const homeNav = document.getElementById('homeNav');
  const homeOverlay = document.getElementById('homeNavOverlay');
  const setHomeNavOpen = (open) => {
    if (!homeNav || !homeToggle) return;
    homeNav.classList.toggle('is-open', open);
    homeToggle.classList.toggle('nav-toggle-open', open);
    homeToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (homeOverlay) homeOverlay.hidden = !open;
    document.body.classList.toggle('menu-open', open);
  };
  if (homeToggle && homeNav) {
    homeToggle.addEventListener('click', () => {
      setHomeNavOpen(!homeNav.classList.contains('is-open'));
    });
    homeOverlay?.addEventListener('click', () => setHomeNavOpen(false));
    homeNav.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', () => setHomeNavOpen(false));
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    setPublicNavOpen(false);
    setHomeNavOpen(false);
    closeSidebar();
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth >= 768) {
      setHomeNavOpen(false);
    }
    if (window.innerWidth >= 1024) {
      setPublicNavOpen(false);
      closeSidebar();
    }
  });

  document.querySelectorAll('table.table').forEach((table) => {
    if (table.closest('.table-scroll, .compare-wrap')) return;
    const wrap = document.createElement('div');
    wrap.className = 'table-scroll';
    table.parentNode.insertBefore(wrap, table);
    wrap.appendChild(table);
  });

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

  const groupStorageKey = 'educonnect.sidebar.groups';
  const readGroupPrefs = () => {
    try {
      return JSON.parse(localStorage.getItem(groupStorageKey) || '{}') || {};
    } catch (_err) {
      return {};
    }
  };
  const writeGroupPref = (id, open) => {
    if (!id) return;
    try {
      const prefs = readGroupPrefs();
      prefs[id] = open;
      localStorage.setItem(groupStorageKey, JSON.stringify(prefs));
    } catch (_err) {
      /* ignore quota / private mode */
    }
  };
  const setNavGroupOpen = (group, open) => {
    group.classList.toggle('is-open', open);
    const btn = group.querySelector(':scope > .nav-group-title');
    btn?.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  const groupPrefs = readGroupPrefs();
  document.querySelectorAll('.app-sidebar-nav .nav-group').forEach((group) => {
    const id = group.dataset.navGroup;
    const hasActive = Boolean(group.querySelector('a.is-active'));
    const stored = id && Object.prototype.hasOwnProperty.call(groupPrefs, id)
      ? Boolean(groupPrefs[id])
      : null;
    setNavGroupOpen(group, hasActive || stored === true);
    const btn = group.querySelector(':scope > .nav-group-title');
    btn?.addEventListener('click', () => {
      const open = !group.classList.contains('is-open');
      setNavGroupOpen(group, open);
      writeGroupPref(id, open);
    });
  });

  const userId = document.body?.dataset?.userId;
  if (userId) {
    const script = document.createElement('script');
    script.src = '/socket.io/socket.io.js';
    script.onerror = () => {};
    script.onload = () => {
      if (typeof io !== 'function') return;
      const socket = io({ withCredentials: true });
      socket.emit('subscribe', userId);
      socket.on('notification', (payload) => {
        const text = [payload?.title, payload?.message].filter(Boolean).join(' — ');
        if (!text) return;
        const banner = document.createElement('div');
        banner.className = 'alert alert-success';
        banner.setAttribute('role', 'status');
        banner.textContent = text;
        const main = document.querySelector('.app-content') || document.body;
        main.prepend(banner);
        setTimeout(() => banner.remove(), 8000);
      });
    };
    document.head.appendChild(script);
  }
});
