const ejs = require('ejs');
const fs = require('fs');
const path = require('path');
const { emptyInput } = require('../src/services/timetableAgent');
const { safeJson } = require('../src/utils/safeJson');

const viewsDir = path.join(__dirname, '../views');

function compileView(relativePath, extraLocals = {}) {
  const filename = path.join(viewsDir, relativePath);
  return ejs.compile(fs.readFileSync(filename, 'utf8'), { filename, views: viewsDir, ...extraLocals });
}

const baseLocals = {
  sessions: [],
  statusLabels: { DRAFT: 'Brouillon', GENERATED: 'Généré', APPLIED: 'Appliqué' },
  success: null,
  error: null,
  school: { id: 'sch-demo', name: 'École Demo' },
  user: { role: 'SCHOOL_ADMIN', school: { id: 'sch-demo', name: 'École Demo' } },
  modules: {},
  staffCan: () => true,
};

describe('timetable-agent views', () => {
  test('index.ejs renders without include errors', () => {
    const render = compileView('school/timetable-agent/index.ejs');
    const html = render({ ...baseLocals, title: 'Assistant emploi du temps', timetableAgentCss: true });
    expect(html).toContain('Assistant emploi du temps');
    expect(html).toContain('Nouvelle session');
  });

  test('show.ejs renders without include errors', () => {
    const render = compileView('school/timetable-agent/show.ejs');
    const html = render({
      ...baseLocals,
      safeJson,
      title: 'Ma session',
      timetableAgentCss: true,
      csrfToken: 'test-csrf',
      session: { id: 'sess-1', name: 'Ma session', status: 'DRAFT', schoolYear: '2025-2026' },
      input: emptyInput(),
      output: null,
      validation: { errors: [], warnings: [] },
      step: 'contraintes',
      validDays: ['LUNDI'],
      defaultConstraints: {},
      skipped: 0,
    });
    expect(html).toContain('Ma session');
  });

  test('preview.ejs renders without include errors', () => {
    const render = compileView('school/timetable-agent/preview.ejs');
    const html = render({
      ...baseLocals,
      title: 'Aperçu',
      timetableAgentCss: true,
      session: { id: 'sess-1', name: 'Ma session', status: 'GENERATED' },
      output: { slots: [] },
      input: emptyInput(),
    });
    expect(html).toContain('Aperçu');
  });
});
