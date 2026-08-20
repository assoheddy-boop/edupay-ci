jest.mock('../src/config/database', () => ({
  student: { findFirst: jest.fn() },
  bulletin: { findUnique: jest.fn() },
  parentStudent: { findFirst: jest.fn() },
}));

jest.mock('../src/services/bulletinService', () => ({
  streamBulletinPdf: jest.fn(),
}));

const prisma = require('../src/config/database');
const { streamBulletinPdf } = require('../src/services/bulletinService');
const schoolController = require('../src/controllers/schoolController');
const parentController = require('../src/controllers/parentController');

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    redirected: null,
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    send(buf) { this.body = buf; return this; },
    redirect(url) { this.redirected = url; return this; },
    render() { return this; },
  };
  return res;
}

describe('bulletin download routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('school download streams PDF for authenticated school user', async () => {
    prisma.student.findFirst.mockResolvedValue({ id: 'stu-1' });
    streamBulletinPdf.mockResolvedValue({
      ok: true,
      buffer: Buffer.from('%PDF-1.4'),
      filename: 'bulletin-t1-kouame-mohamed.pdf',
    });

    const req = {
      params: { studentId: 'stu-1' },
      query: { period: 'T1' },
      user: { school: { id: 'school-1' } },
    };
    const res = mockRes();

    await schoolController.downloadBulletinPdf(req, res);

    expect(streamBulletinPdf).toHaveBeenCalledWith({
      studentId: 'stu-1',
      period: 'T1',
      school: req.user.school,
    });
    expect(res.headers['Content-Type']).toBe('application/pdf');
    expect(res.headers['Content-Disposition']).toBe('attachment; filename="bulletin-t1-kouame-mohamed.pdf"');
    expect(res.body).toEqual(Buffer.from('%PDF-1.4'));
  });

  test('school download redirects when period is missing', async () => {
    prisma.student.findFirst.mockResolvedValue({ id: 'stu-1' });
    const req = {
      params: { studentId: 'stu-1' },
      query: {},
      user: { school: { id: 'school-1' } },
    };
    const res = mockRes();

    await schoolController.downloadBulletinPdf(req, res);

    expect(res.redirected).toBe('/school/bulletins?error=generation');
    expect(streamBulletinPdf).not.toHaveBeenCalled();
  });

  test('parent download checks parent link then streams PDF', async () => {
    prisma.bulletin.findUnique.mockResolvedValue({
      id: 'bul-1',
      studentId: 'stu-1',
      period: 'T1',
      student: {
        id: 'stu-1',
        class: { school: { id: 'school-1', name: 'IGEST' } },
      },
    });
    prisma.parentStudent.findFirst.mockResolvedValue({ id: 'link-1' });
    streamBulletinPdf.mockResolvedValue({
      ok: true,
      buffer: Buffer.from('%PDF-parent'),
      filename: 'bulletin-t1-kouame-mohamed.pdf',
    });

    const req = {
      params: { bulletinId: 'bul-1' },
      user: { parentProfile: { id: 'par-1' } },
    };
    const res = mockRes();

    await parentController.downloadBulletinPdf(req, res);

    expect(streamBulletinPdf).toHaveBeenCalledWith({
      studentId: 'stu-1',
      period: 'T1',
      school: { id: 'school-1', name: 'IGEST' },
    });
    expect(res.headers['Content-Type']).toBe('application/pdf');
  });
});
