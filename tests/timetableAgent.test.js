jest.mock('../src/config/database', () => ({
  class: { findFirst: jest.fn(), findMany: jest.fn() },
  teacher: { findMany: jest.fn() },
  timetable: { deleteMany: jest.fn(), create: jest.fn() },
  subject: { findUnique: jest.fn() },
  $transaction: jest.fn((fn) => fn({
    timetable: {
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
  })),
}));

jest.mock('../services/TimetableService', () => ({
  VALID_DAYS: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'],
  parseTime: (v) => {
    if (!v || typeof v !== 'string') return null;
    const m = v.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  },
  formatTimeFromMinutes: (t) => {
    const h = Math.floor(t / 60);
    const min = t % 60;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  },
  ensureSubject: jest.fn().mockResolvedValue({ id: 'sub-1', name: 'Maths' }),
}));

const prisma = require('../src/config/database');
const { ensureSubject } = require('../services/TimetableService');
const {
  validateInput,
  generateTimetable,
  detectConflicts,
  applyToDatabase,
  buildSlots,
  buildGridFromOutput,
  subjectColorIndex,
  parseInputFromForm,
  emptyInput,
} = require('../src/services/timetableAgent');

const SAMPLE_INPUT = {
  contraintes_ecole: {
    jours: ['Lundi', 'Mardi', 'Mercredi'],
    heure_debut: '08:00',
    heure_fin: '12:00',
    pause_debut: '12:00',
    pause_fin: '12:00',
    duree_creneau: 60,
  },
  salles: [{ nom: 'A1', type: 'classe', capacite: 30 }],
  professeurs: [
    {
      nom: 'Koné Awa',
      matieres: ['Maths'],
      disponibilites: { Lundi: ['08:00-12:00'], Mardi: ['08:00-12:00'], Mercredi: ['08:00-12:00'] },
      contraintes: '',
    },
  ],
  classes: [
    {
      nom: 'CE2 A',
      niveau: 'CE2',
      matieres: [{ matiere: 'Maths', heures_semaine: 2, professeur: 'Koné Awa' }],
    },
  ],
};

describe('timetableAgent', () => {
  beforeEach(() => jest.clearAllMocks());

  test('validateInput accepts complete sample', () => {
    const result = validateInput(SAMPLE_INPUT);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.slotCount).toBeGreaterThan(0);
  });

  test('validateInput rejects missing class name', () => {
    const bad = {
      ...SAMPLE_INPUT,
      classes: [{ nom: '', matieres: [{ matiere: 'Français', heures_semaine: 3, professeur: 'X' }] }],
    };
    const result = validateInput(bad);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /classe/i.test(e))).toBe(true);
  });

  test('buildSlots respects pause window', () => {
    const slots = buildSlots(SAMPLE_INPUT.contraintes_ecole);
    expect(slots.length).toBe(12);
    expect(slots[0]).toMatchObject({ day: 'Lundi', startTime: '08:00', endTime: '09:00' });
  });

  test('validateInput rejects empty classes', () => {
    const empty = { ...SAMPLE_INPUT, classes: [] };
    const result = validateInput(empty);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /classe/i.test(e))).toBe(true);
  });

  test('validateInput rejects class without matieres', () => {
    const bad = {
      ...SAMPLE_INPUT,
      classes: [{ nom: 'CE2 A', niveau: 'CE2', matieres: [] }],
    };
    const result = validateInput(bad);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /matière/i.test(e))).toBe(true);
  });

  test('generateTimetable rejects empty input', () => {
    const result = generateTimetable(emptyInput());
    expect(result.ok).toBe(false);
    expect(result.errors?.length).toBeGreaterThan(0);
  });

  test('parseInputFromForm returns emptyInput when inputJson missing', () => {
    const parsed = parseInputFromForm({});
    expect(parsed.ok).toBe(true);
    expect(parsed.input.classes).toEqual([]);
  });

  test('parseInputFromForm parses valid JSON body', () => {
    const parsed = parseInputFromForm({ inputJson: JSON.stringify(SAMPLE_INPUT) });
    expect(parsed.ok).toBe(true);
    expect(parsed.input.classes).toHaveLength(1);
    expect(parsed.input.classes[0].nom).toBe('CE2 A');
  });

  test('generateTimetable produces valid JSON structure', () => {
    const result = generateTimetable(SAMPLE_INPUT);
    expect(result.ok).toBe(true);
    expect(result.output.classes).toHaveLength(1);
    expect(result.output.classes[0].classe).toBe('CE2 A');
    expect(result.output.classes[0].emploi_du_temps.length).toBe(2);
    expect(result.output.professeurs[0].professeur).toBe('Koné Awa');
    expect(result.output.eleves).toHaveLength(1);
    expect(Array.isArray(result.output.conflits)).toBe(true);
    expect(Array.isArray(result.output.suggestions)).toBe(true);
  });

  test('detectConflicts finds teacher overlap', () => {
    const schedule = {
      classes: [
        {
          classe: '6A',
          emploi_du_temps: [
            { jour: 'Lundi', heure: '08:00', heure_fin: '09:00', professeur: 'Dupont', salle: 'A1', matiere: 'Maths' },
          ],
        },
        {
          classe: '6B',
          emploi_du_temps: [
            { jour: 'Lundi', heure: '08:30', heure_fin: '09:30', professeur: 'Dupont', salle: 'A2', matiere: 'Français' },
          ],
        },
      ],
    };
    const conflicts = detectConflicts(schedule);
    expect(conflicts.some((c) => c.type === 'professeur')).toBe(true);
  });

  test('applyToDatabase creates timetable rows', async () => {
    const output = generateTimetable(SAMPLE_INPUT).output;
    prisma.class.findFirst.mockResolvedValue({ id: 'class-1', name: 'CE2 A', schoolId: 'school-1' });
    prisma.teacher.findMany.mockResolvedValue([
      { id: 'teacher-1', schoolId: 'school-1', user: { firstName: 'Awa', lastName: 'Koné' } },
    ]);

    const tx = { timetable: { deleteMany: jest.fn(), create: jest.fn() } };
    prisma.$transaction.mockImplementation((fn) => fn(tx));

    const result = await applyToDatabase('school-1', output, { schoolYear: '2025-2026' });
    expect(result.ok).toBe(true);
    expect(result.created).toBe(2);
    expect(ensureSubject).toHaveBeenCalled();
    expect(tx.timetable.create).toHaveBeenCalledTimes(2);
  });

  test('applyToDatabase refuses when conflicts present', async () => {
    const output = {
      classes: [
        {
          classe: '6A',
          emploi_du_temps: [
            { jour: 'Lundi', heure: '08:00', heure_fin: '09:00', professeur: 'X', salle: 'A1', matiere: 'Maths' },
            { jour: 'Lundi', heure: '08:30', heure_fin: '09:30', professeur: 'X', salle: 'A1', matiere: 'Français' },
          ],
        },
      ],
      professeurs: [],
      eleves: [],
      conflits: [],
      suggestions: [],
    };
    const result = await applyToDatabase('school-1', output);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('conflicts');
  });

  test('buildGridFromOutput builds class grid with days and time slots', () => {
    const output = generateTimetable(SAMPLE_INPUT).output;
    const grids = buildGridFromOutput(output);
    expect(grids.hasData).toBe(true);
    expect(grids.byClass).toHaveLength(1);
    expect(grids.byClass[0].name).toBe('CE2 A');
    expect(grids.byClass[0].days).toContain('Lundi');
    expect(grids.byClass[0].timeSlots.length).toBeGreaterThan(0);
    const cellKey = `${grids.byClass[0].timeSlots[0]}|Lundi`;
    expect(grids.byClass[0].cells[cellKey]?.matiere).toBe('Maths');
  });

  test('buildGridFromOutput supports legacy eleves key', () => {
    const grids = buildGridFromOutput({
      eleves: [{
        classe: 'CM2',
        emploi_du_temps: [{
          jour: 'Lundi', heure: '07:30', heure_fin: '08:30', matiere: 'ANGLAIS', professeur: 'ASSOH', salle: 'Salle 1',
        }],
      }],
      professeurs: [],
    });
    expect(grids.byClass).toHaveLength(1);
    expect(grids.byClass[0].name).toBe('CM2');
    expect(grids.hasData).toBe(true);
  });

  test('buildGridFromOutput builds teacher view with classe in cells', () => {
    const output = generateTimetable(SAMPLE_INPUT).output;
    const grids = buildGridFromOutput(output);
    expect(grids.byTeacher).toHaveLength(1);
    expect(grids.byTeacher[0].name).toBe('Koné Awa');
    const cell = Object.values(grids.byTeacher[0].cells)[0];
    expect(cell.classe).toBe('CE2 A');
  });

  test('subjectColorIndex is stable for same matiere', () => {
    expect(subjectColorIndex('Maths')).toBe(subjectColorIndex('Maths'));
    expect(subjectColorIndex('Maths')).toBeGreaterThanOrEqual(0);
    expect(subjectColorIndex('Maths')).toBeLessThan(12);
  });
});
