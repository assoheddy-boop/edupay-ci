jest.mock('@anthropic-ai/sdk', () => {
  const create = jest.fn();
  return jest.fn().mockImplementation(() => ({
    messages: { create },
  }));
});

jest.mock('../src/config/database', () => ({
  timetableGenerationSession: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
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
  ensureSubject: jest.fn(),
}));

const Anthropic = require('@anthropic-ai/sdk');
const prisma = require('../src/config/database');
const { chatWithClaude, sanitizeChatHistory } = require('../src/services/timetableClaude');
const { emptyInput } = require('../src/services/timetableAgent');

describe('timetableAgent chat', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  afterEach(() => {
    jest.clearAllMocks();
    if (originalKey) process.env.ANTHROPIC_API_KEY = originalKey;
    else delete process.env.ANTHROPIC_API_KEY;
  });

  test('sanitizeChatHistory filters invalid entries', () => {
    const result = sanitizeChatHistory([
      { role: 'user', content: 'Bonjour' },
      { role: 'bot', content: 'ignored' },
      { role: 'assistant', content: 'Salut' },
      null,
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe('user');
    expect(result[1].role).toBe('assistant');
  });

  test('chatWithClaude returns no_api_key without key', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const result = await chatWithClaude({ input: emptyInput(), message: 'Test' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('no_api_key');
    expect(result.message).toContain('Clé API');
  });

  test('chatWithClaude returns assistant reply', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key';
    const client = new Anthropic();
    client.messages.create.mockResolvedValue({
      content: [{ type: 'text', text: 'Répartissez les matières difficiles le matin.' }],
    });

    const result = await chatWithClaude({
      input: emptyInput(),
      output: null,
      message: 'Comment équilibrer le CM2 ?',
      history: [],
    });

    expect(result.ok).toBe(true);
    expect(result.reply).toContain('matières difficiles');
    expect(result.history).toHaveLength(2);
    expect(result.history[0].role).toBe('user');
    expect(result.history[1].role).toBe('assistant');
    expect(client.messages.create).toHaveBeenCalledTimes(1);
  });

  test('chatSession controller persists history', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key';
    const { chatSession } = require('../src/controllers/timetableAgentController');

    prisma.timetableGenerationSession.findFirst.mockResolvedValue({
      id: 'sess-1',
      schoolId: 'sch-demo',
      inputJson: emptyInput(),
      outputJson: null,
    });
    prisma.timetableGenerationSession.update.mockResolvedValue({});

    const client = new Anthropic();
    client.messages.create.mockResolvedValue({
      content: [{ type: 'text', text: 'Conseil emploi du temps.' }],
    });

    const req = {
      params: { id: 'sess-1' },
      body: { message: 'Aide-moi avec les contraintes' },
      user: {
        id: 'u-school',
        school: { id: 'sch-demo', name: 'École Demo' },
        staffAssignments: [],
      },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await chatSession(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      ok: true,
      reply: expect.stringContaining('Conseil'),
    }));
    expect(prisma.timetableGenerationSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sess-1' },
        data: expect.objectContaining({
          inputJson: expect.objectContaining({
            chatHistory: expect.arrayContaining([
              expect.objectContaining({ role: 'user' }),
              expect.objectContaining({ role: 'assistant' }),
            ]),
          }),
        }),
      }),
    );
  });
});
