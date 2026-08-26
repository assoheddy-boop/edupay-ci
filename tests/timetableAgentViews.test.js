const ejs = require('ejs');
const fs = require('fs');
const path = require('path');
const { emptyInput, buildGridFromOutput } = require('../src/services/timetableAgent');
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

  test('show.ejs script includes addSalle handler', () => {
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
      validation: { errors: [], warnings: [], slotCount: 0, totalDemand: 0 },
      step: 'contraintes',
      validDays: ['LUNDI'],
      defaultConstraints: {},
      claudeAvailable: false,
      generationMode: null,
      skipped: 0,
    });
    expect(html).toContain("getElementById('addSalle')");
    expect(html).not.toMatch(/addEventListener\('submit'[^)]*\)\s*;\s*data\.salles/);
  });

  test('preview.ejs shows insufficient data warning when empty', () => {
    const render = compileView('school/timetable-agent/preview.ejs');
    const html = render({
      ...baseLocals,
      safeJson,
      title: 'Aperçu',
      timetableAgentCss: true,
      session: { id: 'sess-1', name: 'Ma session', status: 'GENERATED', schoolYear: '2025-2026' },
      output: { classes: [], professeurs: [], eleves: [], conflits: [], suggestions: [], unplaced: [] },
      timetableGrids: buildGridFromOutput({ classes: [], professeurs: [], eleves: [] }),
      gridViewMode: 'class',
      input: emptyInput(),
    });
    expect(html).toContain('Données insuffisantes');
  });

  test('preview.ejs renders timetable grid instead of raw JSON', () => {
    const output = {
      classes: [{
        classe: 'CM2',
        emploi_du_temps: [{
          jour: 'Lundi', heure: '07:30', heure_fin: '08:30', matiere: 'ANGLAIS', professeur: 'ASSOH', salle: 'Salle 1',
        }],
      }],
      professeurs: [{
        professeur: 'ASSOH',
        emploi_du_temps: [{
          jour: 'Lundi', heure: '07:30', heure_fin: '08:30', matiere: 'ANGLAIS', professeur: 'ASSOH', salle: 'Salle 1', classe: 'CM2',
        }],
      }],
      eleves: [],
      conflits: [],
      suggestions: [],
    };
    const render = compileView('school/timetable-agent/preview.ejs');
    const html = render({
      ...baseLocals,
      safeJson,
      title: 'Emploi du temps — Ma session',
      timetableAgentCss: true,
      school: { id: 'sch-demo', name: 'École Demo' },
      session: { id: 'sess-1', name: 'Ma session', status: 'GENERATED', schoolYear: '2025-2026' },
      output,
      timetableGrids: buildGridFromOutput(output),
      gridViewMode: 'class',
      input: emptyInput(),
    });
    expect(html).toContain('Emploi du temps — CM2');
    expect(html).toContain('École Demo');
    expect(html).toContain('class="edt-grid"');
    expect(html).toContain('edt-cell-matiere');
    expect(html).toContain('ANGLAIS');
    expect(html).toContain('edt-cell-salle">Salle 1</div>');
    expect(html).not.toContain('Salle Salle');
    expect(html).toContain('Par classe');
    expect(html).toContain('timetable-agent.css?v=2');
    expect(html).toContain('Export JSON (technique)');
    expect(html).not.toMatch(/<pre[^>]*>\s*\{\s*"classes"/);
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
      claudeAvailable: false,
      generationMode: null,
      skipped: 0,
    });
    expect(html).toContain('Ma session');
  });

  test('preview.ejs renders without include errors', () => {
    const render = compileView('school/timetable-agent/preview.ejs');
    const html = render({
      ...baseLocals,
      safeJson,
      title: 'Aperçu',
      timetableAgentCss: true,
      session: { id: 'sess-1', name: 'Ma session', status: 'GENERATED', schoolYear: '2025-2026' },
      output: { classes: [], professeurs: [], slots: [] },
      timetableGrids: buildGridFromOutput({ classes: [], professeurs: [] }),
      gridViewMode: 'class',
      input: emptyInput(),
    });
    expect(html).toContain('Emploi du temps — Ma session');
  });

  test('show.ejs resultats step renders timetable grid', () => {
    const output = {
      classes: [{
        classe: 'CM2',
        emploi_du_temps: [{
          jour: 'Lundi', heure: '07:30', heure_fin: '08:30', matiere: 'ANGLAIS', professeur: 'ASSOH', salle: 'Salle 1',
        }],
      }],
      professeurs: [],
      eleves: [],
      conflits: [],
      suggestions: [],
    };
    const render = compileView('school/timetable-agent/show.ejs');
    const html = render({
      ...baseLocals,
      safeJson,
      title: 'Ma session',
      timetableAgentCss: true,
      csrfToken: 'test-csrf',
      session: { id: 'sess-1', name: 'Ma session', status: 'GENERATED', schoolYear: '2025-2026' },
      input: emptyInput(),
      output,
      timetableGrids: buildGridFromOutput(output),
      validation: { errors: [], warnings: [], slotCount: 5, totalDemand: 2 },
      step: 'resultats',
      validDays: ['Lundi', 'Mardi'],
      defaultConstraints: {},
      skipped: 0,
    });
    expect(html).toContain('class="edt-grid"');
    expect(html).toContain('Par professeur');
    expect(html).toContain('Aperçu emploi du temps');
  });
});
