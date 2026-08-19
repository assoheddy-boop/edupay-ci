const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const { cycleFlags } = require('../src/utils/educationCycle');

const sidebarPath = path.join(__dirname, '../views/partials/_sidebar.ejs');
const sidebar = fs.readFileSync(sidebarPath, 'utf8');

function renderSchoolSidebar(cycleValue) {
  return ejs.render(
    sidebar,
    {
      user: {
        role: 'SCHOOL_ADMIN',
        school: { name: 'Test', slug: 'test', educationCycle: cycleValue },
      },
      modules: {},
      adminAssist: null,
      cycle: cycleFlags(cycleValue),
      unreadNotifications: 0,
    },
    { filename: sidebarPath },
  );
}

describe('sidebar missing links (Vague 3)', () => {
  test('school nav includes lost items when the module is on', () => {
    expect(sidebar).toMatch(/on\('lost_items'\)[\s\S]*\/school\/lost-items/);
  });

  test('parent nav includes pickup when the module is on', () => {
    expect(sidebar).toMatch(/on\('pickup'\)[\s\S]*\/parent\/pickup/);
  });

  test('teacher nav includes behavior when the module is on', () => {
    expect(sidebar).toMatch(/on\('behavior'\)[\s\S]*\/teacher\/behavior/);
  });

  test('school nav includes official SMS when the module is on', () => {
    expect(sidebar).toMatch(/on\('sms_official'\)[\s\S]*\/school\/sms/);
  });

  test('parent nav includes justificatifs when absences module is on', () => {
    expect(sidebar).toMatch(/on\('absences'\)[\s\S]*\/parent\/justificatifs/);
  });

  test('school nav includes convocations next to émargement', () => {
    expect(sidebar).toMatch(/\/school\/emargements[\s\S]*\/school\/convocations/);
  });

  test('parent nav includes convocations', () => {
    expect(sidebar).toMatch(/\/parent\/convocations/);
  });

  test('school nav includes palmarès next to délibérations', () => {
    expect(sidebar).toMatch(/\/school\/deliberations[\s\S]*\/school\/palmares/);
  });

  test('teacher nav includes palmarès next to conseil de classe', () => {
    expect(sidebar).toMatch(/\/teacher\/deliberations[\s\S]*\/teacher\/palmares/);
  });
});

describe('sidebar grouped by dashboard categories', () => {
  test('school nav lists the six dashboard categories', () => {
    expect(sidebar).toMatch(/Administration scolaire/);
    expect(sidebar).toMatch(/Vie scolaire/);
    expect(sidebar).toMatch(/Examens &amp; Évaluations/);
    expect(sidebar).toMatch(/Finances &amp; Comptabilité/);
    expect(sidebar).toMatch(/Communication/);
    expect(sidebar).toMatch(/Rapports &amp; Statistiques/);
  });

  test('keeps admin-assist exits at the top of the nav', () => {
    expect(sidebar).toMatch(/assist[\s\S]*\/admin\/dashboard[\s\S]*\/admin\/assist\/exit/);
  });
});

describe('sidebar by education cycle', () => {
  test('primaire sidebar hides national exam', () => {
    const html = renderSchoolSidebar('PRIMAIRE');
    expect(html).toContain('Évaluations');
    expect(html).not.toMatch(/Délibérations/);
    expect(html).not.toMatch(/Palmarès/);
    expect(html).not.toMatch(/national/i);
    expect(html).toContain('Convocations (blanc)');
    expect(html).toContain('/school/payments');
    expect(html).toContain('/school/caisse');
    expect(html).toContain('/school/justificatifs');
    expect(html).toContain('/school/sms');
  });

  test('college sidebar shows deliberations', () => {
    const html = renderSchoolSidebar('COLLEGE');
    expect(html).toContain('Délibérations');
    expect(html).toContain('Palmarès');
    expect(html).toContain('Convocations (blanc + national)');
    expect(html).not.toContain('>Évaluations<');
    expect(html).not.toMatch(/nav-cycle-label">Primaire/);
  });

  test('mixte sidebar shows both Primaire and Secondaire sections', () => {
    const html = renderSchoolSidebar('MIXTE');
    expect(html).toMatch(/nav-cycle-label">Primaire/);
    expect(html).toMatch(/nav-cycle-label">Secondaire/);
    expect(html).toContain('Évaluations');
    expect(html).toContain('Délibérations');
    expect(html).toContain('Palmarès');
    expect(html).toContain('Convocations (blanc + national)');
  });
});
