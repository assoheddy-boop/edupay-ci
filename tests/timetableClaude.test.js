jest.mock('@anthropic-ai/sdk', () => {
  const create = jest.fn();
  return jest.fn().mockImplementation(() => ({
    messages: { create },
  }));
});

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
  ensureSubject: jest.fn(),
}));

const Anthropic = require('@anthropic-ai/sdk');
const {
  isClaudeAvailable,
  extractJsonText,
  validateClaudeOutput,
  generateTimetableWithClaude,
} = require('../src/services/timetableClaude');
const { generateTimetable } = require('../src/services/timetableAgent');

const SAMPLE_INPUT = {
  contraintes_ecole: {
    jours: ['Lundi', 'Mardi'],
    heure_debut: '08:00',
    heure_fin: '10:00',
    pause_debut: '12:00',
    pause_fin: '12:00',
    duree_creneau: 60,
  },
  salles: [{ nom: 'A1', type: 'classe', capacite: 30 }],
  professeurs: [
    {
      nom: 'Koné Awa',
      matieres: ['Maths'],
      disponibilites: { Lundi: ['08:00-12:00'], Mardi: ['08:00-12:00'] },
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

const VALID_CLAUDE_JSON = {
  classes: [{
    classe: 'CE2 A',
    emploi_du_temps: [
      { jour: 'Lundi', heure: '08:00', heure_fin: '09:00', matiere: 'Maths', professeur: 'Koné Awa', salle: 'A1' },
      { jour: 'Mardi', heure: '08:00', heure_fin: '09:00', matiere: 'Maths', professeur: 'Koné Awa', salle: 'A1' },
    ],
  }],
  professeurs: [],
  eleves: [],
  conflits: [],
  suggestions: ['Répartir les matières difficiles le matin.'],
};

describe('timetableClaude', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  afterEach(() => {
    jest.clearAllMocks();
    if (originalKey) process.env.ANTHROPIC_API_KEY = originalKey;
    else delete process.env.ANTHROPIC_API_KEY;
  });

  test('isClaudeAvailable returns false without API key', () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(isClaudeAvailable()).toBe(false);
  });

  test('isClaudeAvailable returns true with API key', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key';
    expect(isClaudeAvailable()).toBe(true);
  });

  test('extractJsonText strips markdown fences', () => {
    const raw = '```json\n{"classes":[]}\n```';
    expect(extractJsonText(raw)).toBe('{"classes":[]}');
  });

  test('validateClaudeOutput rejects invented class', () => {
    const bad = {
      ...VALID_CLAUDE_JSON,
      classes: [{ classe: 'Inventée', emploi_du_temps: VALID_CLAUDE_JSON.classes[0].emploi_du_temps }],
    };
    const result = validateClaudeOutput(bad, SAMPLE_INPUT);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /inventée/i.test(e))).toBe(true);
  });

  test('validateClaudeOutput accepts valid response', () => {
    const result = validateClaudeOutput(VALID_CLAUDE_JSON, SAMPLE_INPUT);
    expect(result.ok).toBe(true);
  });

  test('generateTimetableWithClaude returns no_api_key without key', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const result = await generateTimetableWithClaude(SAMPLE_INPUT);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('no_api_key');
  });

  test('generateTimetableWithClaude parses Claude response', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key';
    const client = new Anthropic();
    client.messages.create.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(VALID_CLAUDE_JSON) }],
    });

    const result = await generateTimetableWithClaude(SAMPLE_INPUT);
    expect(result.ok).toBe(true);
    expect(result.generationMode).toBe('claude');
    expect(result.output.classes[0].emploi_du_temps).toHaveLength(2);
    expect(result.output.suggestions).toContain('Répartir les matières difficiles le matin.');
    expect(client.messages.create).toHaveBeenCalledTimes(1);
  });

  test('generateTimetableWithClaude retries once on invalid JSON', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key';
    const client = new Anthropic();
    client.messages.create
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'not json at all' }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: JSON.stringify(VALID_CLAUDE_JSON) }] });

    const result = await generateTimetableWithClaude(SAMPLE_INPUT);
    expect(result.ok).toBe(true);
    expect(client.messages.create).toHaveBeenCalledTimes(2);
  });

  test('deterministic fallback works when Claude unavailable', () => {
    const result = generateTimetable(SAMPLE_INPUT);
    expect(result.ok).toBe(true);
    expect(result.output.classes[0].classe).toBe('CE2 A');
  });
});
