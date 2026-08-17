jest.mock('../src/config/database', () => ({
  school: { findUnique: jest.fn(), findMany: jest.fn() },
  organization: { findMany: jest.fn() },
  user: { findUnique: jest.fn(), count: jest.fn() },
  schoolModule: { findMany: jest.fn() },
  student: { count: jest.fn() },
  transferRequest: { count: jest.fn() },
  refreshToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
}));

jest.mock('../src/services/sms', () => ({
  sendSms: jest.fn(),
  sendWhatsApp: jest.fn(),
  sendConnectivityTestSms: jest.fn(),
  orangeConfigured: jest.fn().mockReturnValue(true),
  TEST_SMS_TEXT: 'EduConnect : test SMS Orange.',
}));

jest.mock('../services/ClassService', () => ({
  getGenderStatsBySchool: jest.fn().mockResolvedValue({ schools: [] }),
}));

const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/database');
const { sendConnectivityTestSms } = require('../src/services/sms');
const { sendTestSms } = require('../src/controllers/adminController');

function mockRes() {
  return {
    redirectTo: null,
    redirect(url) { this.redirectTo = url; return this; },
  };
}

describe('admin Orange SMS test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('POST /admin/sms-test is not a public send endpoint', async () => {
    const res = await request(app)
      .post('/admin/sms-test')
      .type('form')
      .send({ phone: '0700000000' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/auth\/login/);
    expect(sendConnectivityTestSms).not.toHaveBeenCalled();
  });

  test('GET /admin/sms-test is not an unauthenticated send route', async () => {
    const res = await request(app).get('/admin/sms-test');
    expect(res.status).not.toBe(200);
    expect(sendConnectivityTestSms).not.toHaveBeenCalled();
  });

  test('Super Admin test SMS is sent even without a school module check', async () => {
    sendConnectivityTestSms.mockResolvedValue({ ok: true, provider: 'orange', sender: 'EduConnect' });
    const req = { body: { phone: '0700000000' }, user: { role: 'SUPER_ADMIN' } };
    const res = mockRes();
    await sendTestSms(req, res);
    expect(sendConnectivityTestSms).toHaveBeenCalledWith('0700000000', { school: null });
    expect(res.redirectTo).toMatch(/smsTest=sent/);
    expect(prisma.school.findUnique).not.toHaveBeenCalled();
  });

  test('optional school supplies the sender snapshot', async () => {
    prisma.school.findUnique.mockResolvedValue({
      id: 'clxyzschool0001',
      name: 'Sainte Marie',
      smsSenderId: 'SteMarie',
    });
    sendConnectivityTestSms.mockResolvedValue({ ok: true, provider: 'orange', sender: 'SteMarie' });
    const req = {
      body: { phone: '+2250700000000', schoolId: 'clxyzschool0001' },
      user: { role: 'SUPER_ADMIN' },
    };
    const res = mockRes();
    await sendTestSms(req, res);
    expect(prisma.school.findUnique).toHaveBeenCalledWith({
      where: { id: 'clxyzschool0001' },
      select: { id: true, name: true, smsSenderId: true },
    });
    expect(sendConnectivityTestSms).toHaveBeenCalledWith('+2250700000000', {
      school: { id: 'clxyzschool0001', name: 'Sainte Marie', smsSenderId: 'SteMarie' },
    });
    expect(res.redirectTo).toMatch(/smsTest=sent/);
    expect(res.redirectTo).toMatch(/smsSender=SteMarie/);
  });

  test('missing Orange config redirects as skipped without leaking secrets', async () => {
    sendConnectivityTestSms.mockResolvedValue({ ok: false, reason: 'not_configured' });
    const req = { body: { phone: '0700000000' }, user: { role: 'SUPER_ADMIN' } };
    const res = mockRes();
    await sendTestSms(req, res);
    expect(res.redirectTo).toMatch(/smsTest=skipped/);
    expect(res.redirectTo).toMatch(/smsReason=not_configured/);
    expect(res.redirectTo).not.toMatch(/Bearer|token|secret/i);
  });

  test('Orange HTTP failure redirects as error with a safe reason', async () => {
    sendConnectivityTestSms.mockResolvedValue({
      ok: false,
      reason: 'Orange HTTP 401 (Expired credentials)',
    });
    const req = { body: { phone: '0700000000' }, user: { role: 'SUPER_ADMIN' } };
    const res = mockRes();
    await sendTestSms(req, res);
    expect(res.redirectTo).toMatch(/smsTest=error/);
    expect(res.redirectTo).toMatch(/Orange(\+|%20)HTTP(\+|%20)401/);
    expect(res.redirectTo).not.toMatch(/super-secret|access_token/i);
  });
});
