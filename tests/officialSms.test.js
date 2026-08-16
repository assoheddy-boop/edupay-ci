const {
  SMS_OFFICIAL_MODULE,
  sanitizeSmsSenderId,
  prefixSmsBody,
  resolveSmsSender,
  canAccessSchoolJobs,
  smsPreviewExample,
} = require('../src/utils/officialSms');
const { MODULES } = require('../src/config/modules');
const { smsDashboard } = require('../src/controllers/schoolController');

describe('official SMS helpers', () => {
  test('module key is registered for super admin toggles', () => {
    expect(SMS_OFFICIAL_MODULE).toBe('sms_official');
    expect(MODULES.sms_official.label).toBe('SMS officiel');
    expect(MODULES.sms_official.default).toBe(false);
  });

  test('prefixes parent SMS with the school name', () => {
    expect(prefixSmsBody('ECEME', "votre enfant est absent aujourd'hui.")).toBe(
      "École ECEME : votre enfant est absent aujourd'hui.",
    );
    expect(prefixSmsBody('ECEME', "École ECEME : déjà préfixé.")).toBe('École ECEME : déjà préfixé.');
  });

  test('uses smsSenderId, never Wave/OM payment wallets', () => {
    const school = {
      smsSenderId: 'ECEME',
      waveNumber: '07 00 00 00 01',
      omNumber: '07 00 00 00 02',
    };
    expect(resolveSmsSender({ school })).toBe('ECEME');
    expect(resolveSmsSender({ school: { ...school, smsSenderId: null }, snapshot: null })).not.toBe(school.waveNumber);
    expect(resolveSmsSender({ school: { ...school, smsSenderId: null }, snapshot: null })).not.toBe(school.omNumber);
  });

  test('job snapshot wins over school sender, then env', () => {
    const prev = process.env.ORANGE_SMS_SENDER;
    process.env.ORANGE_SMS_SENDER = 'EduConnect';
    expect(resolveSmsSender({ snapshot: 'ECOLE1', school: { smsSenderId: 'ECEME' } })).toBe('ECOLE1');
    expect(resolveSmsSender({ school: { smsSenderId: null } })).toBe('EduConnect');
    if (prev === undefined) delete process.env.ORANGE_SMS_SENDER;
    else process.env.ORANGE_SMS_SENDER = prev;
  });

  test('sanitizes sender IDs', () => {
    expect(sanitizeSmsSenderId('  ECEME  ')).toBe('ECEME');
    expect(sanitizeSmsSenderId('')).toBeNull();
    expect(sanitizeSmsSenderId('<script>')).toBeNull();
  });

  test('preview example is French and school-prefixed', () => {
    expect(smsPreviewExample('ECEME')).toContain('École ECEME');
    expect(smsPreviewExample('ECEME')).not.toMatch(/Wave|Orange Money/i);
  });
});

describe('school SMS dashboard auth', () => {
  test('director of another school is denied', () => {
    const user = { role: 'SCHOOL_ADMIN', school: { id: 'sch-a', name: 'A' } };
    expect(canAccessSchoolJobs(user, 'sch-b')).toBe(false);
    expect(canAccessSchoolJobs(user, 'sch-a')).toBe(true);
  });

  test('parent cannot list another school SMS jobs', () => {
    expect(canAccessSchoolJobs({ role: 'PARENT', parentProfile: { id: 'p1' } }, 'sch-a')).toBe(false);
  });

  test('super admin assist on the school is allowed', () => {
    const user = {
      role: 'SUPER_ADMIN',
      school: { id: 'sch-a' },
      adminAssist: { type: 'school', schoolId: 'sch-a' },
    };
    expect(canAccessSchoolJobs(user, 'sch-a')).toBe(true);
    expect(canAccessSchoolJobs(user, 'sch-b')).toBe(false);
  });

  test('GET dashboard returns 403 when query schoolId is another school', async () => {
    const req = {
      user: { role: 'SCHOOL_ADMIN', school: { id: 'sch-a', name: 'A' } },
      query: { schoolId: 'sch-b' },
      headers: {},
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      render: jest.fn(),
      json: jest.fn(),
    };
    await smsDashboard(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.render).toHaveBeenCalledWith('error', expect.objectContaining({ message: 'Accès refusé' }));
  });
});
