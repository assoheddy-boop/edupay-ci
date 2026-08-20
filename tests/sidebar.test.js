const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const { cycleFlags } = require('../src/utils/educationCycle');
const { attachStaffContext, PERMISSIONS } = require('../src/utils/staffPermissions');

const sidebarPath = path.join(__dirname, '../views/partials/_sidebar.ejs');
const sidebar = fs.readFileSync(sidebarPath, 'utf8');

const SCHOOL_ID = 'sch-sidebar';
const SCHOOL = { id: SCHOOL_ID, name: 'Test', slug: 'test', educationCycle: 'COLLEGE', adminId: 'u-director' };

function staffUser(staffRole) {
  return {
    id: 'u-staff',
    role: 'SCHOOL_ADMIN',
    school: { ...SCHOOL, adminId: 'u-director' },
    staffAssignments: [{ schoolId: SCHOOL_ID, staffRole, school: SCHOOL }],
  };
}

function renderStaffSidebar(staffRole, cycleValue = 'COLLEGE') {
  const user = staffUser(staffRole);
  const ctx = attachStaffContext(user, SCHOOL_ID);
  return ejs.render(
    sidebar,
    {
      user,
      modules: {
        hr: { enabled: true },
        bulletins: { enabled: true },
        payments: { enabled: true },
        accounting: { enabled: true },
        absences: { enabled: true },
        canteen: { enabled: true },
        lost_items: { enabled: true },
        activities: { enabled: true },
        pickup: { enabled: true },
        chat: { enabled: true },
        sms_official: { enabled: true },
        stats: { enabled: true },
        homeworks: { enabled: true },
        marketplace: { enabled: true },
      },
      adminAssist: null,
      cycle: cycleFlags(cycleValue),
      unreadNotifications: 0,
      staffCan: ctx.staffCan,
      staffRole: ctx.staffRole,
      staffRoleLabel: ctx.staffRoleLabel,
    },
    { filename: sidebarPath },
  );
}

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

function renderTeacherSidebar(cycleValue) {
  return ejs.render(
    sidebar,
    {
      user: {
        role: 'TEACHER',
        teacher: { school: { name: 'Test', slug: 'test', educationCycle: cycleValue } },
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

  test('school nav includes public portal when marketplace is on', () => {
    expect(sidebar).toMatch(/on\('marketplace'\)[\s\S]*\/school\/portail/);
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

  test('school nav wraps the six categories as expandable buttons', () => {
    const html = renderSchoolSidebar('COLLEGE');
    expect(html.match(/class="nav-group"/g)).toHaveLength(6);
    expect(html).not.toMatch(/class="nav-group is-open"/);
    expect(html).toMatch(/<button type="button" class="nav-group-title" aria-expanded="false"/);
    expect(html).toContain('nav-group-chevron');
    expect(html).toContain('data-nav-group="administration-scolaire"');
    expect(html).toContain('data-nav-group="vie-scolaire"');
    expect(html).toContain('data-nav-group="examens"');
    expect(html).toContain('data-nav-group="finances"');
    expect(html).toContain('data-nav-group="communication"');
    expect(html).toContain('data-nav-group="rapports"');
    expect(html).toMatch(/aria-controls="nav-items-administration-scolaire"/);
    expect(html).toMatch(/id="nav-items-administration-scolaire"/);
  });

  test('teacher nav uses the same collapsible category pattern', () => {
    const html = renderTeacherSidebar('COLLEGE');
    expect(html).toMatch(/<button type="button" class="nav-group-title" aria-expanded="false"/);
    expect(html).not.toMatch(/class="nav-group is-open"/);
    expect(html).toContain('data-nav-group="administration-scolaire"');
    expect(html).toContain('data-nav-group="vie-scolaire"');
    expect(html).toContain('data-nav-group="examens"');
    expect(html).toContain('nav-group-chevron');
  });

  test('app.js uses single-open accordion and opens the active group', () => {
    const js = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');
    expect(js).toContain('educonnect.sidebar.openGroup');
    expect(js).toMatch(/closeAllNavGroups/);
    expect(js).toMatch(/openNavGroup/);
    expect(js).toMatch(/aria-expanded/);
    expect(js).toMatch(/a\.is-active/);
    expect(js).toMatch(/dataset\.navGroup/);
  });

  test('main.css hides closed group items and rotates the chevron', () => {
    const css = fs.readFileSync(path.join(__dirname, '../public/css/main.css'), 'utf8');
    expect(css).toMatch(/\.nav-group\.is-open > \.nav-group-items/);
    expect(css).toMatch(/\.nav-group-items[\s\S]*display:\s*none/);
    expect(css).toMatch(/\.nav-group\.is-open \.nav-group-chevron/);
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

describe('sidebar RBAC by staff role', () => {
  test('SECRETARIAT hides settings, HR, accounting, coefficients', () => {
    const html = renderStaffSidebar('SECRETARIAT');
    expect(html).toContain('/school/students');
    expect(html).toContain('/school/bulletins');
    expect(html).toContain('/school/caisse');
    expect(html).not.toContain('/school/settings');
    expect(html).not.toContain('/school/hr');
    expect(html).not.toContain('/school/accounting');
    expect(html).not.toContain('/school/coefficients');
    expect(html).not.toContain('/school/staff-roles');
  });

  test('ACCOUNTANT shows accounting only, hides bulletins admin and settings', () => {
    const html = renderStaffSidebar('ACCOUNTANT');
    expect(html).toContain('/school/accounting');
    expect(html).toContain('/school/fees');
    expect(html).not.toContain('/school/bulletins');
    expect(html).not.toContain('/school/settings');
    expect(html).not.toContain('/school/hr');
    expect(html).not.toContain('/school/students');
    expect(html).not.toContain('/school/coefficients');
    expect(html).not.toContain('/school/caisse');
  });

  test('EDUCATOR shows absences and social cases, hides finances and exam admin', () => {
    const html = renderStaffSidebar('EDUCATOR');
    expect(html).toContain('/school/justificatifs');
    expect(html).toContain('/school/cas-sociaux');
    expect(html).toContain('/school/students');
    expect(html).not.toContain('/school/bulletins');
    expect(html).not.toContain('/school/accounting');
    expect(html).not.toContain('/school/settings');
    expect(html).not.toContain('/school/payments');
  });

  test('LIFE_SCHOOL shows vie scolaire modules, hides admin and finances', () => {
    const html = renderStaffSidebar('LIFE_SCHOOL');
    expect(html).toContain('/school/canteen');
    expect(html).toContain('/school/activities');
    expect(html).toContain('/school/pickup');
    expect(html).toContain('/school/lost-items');
    expect(html).not.toContain('/school/settings');
    expect(html).not.toContain('/school/accounting');
    expect(html).not.toContain('/school/bulletins');
    expect(html).not.toContain('/school/fees');
  });
});
