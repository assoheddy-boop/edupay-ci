const {
  isLegacyBulletinUploadUrl,
  schoolBulletinDownloadUrl,
  parentBulletinDownloadUrl,
  resolveSchoolBulletinHref,
  resolveParentBulletinHref,
} = require('../src/utils/bulletinLinks');

describe('bulletinLinks', () => {
  test('detects legacy upload URLs', () => {
    expect(isLegacyBulletinUploadUrl('/uploads/bulletins/x.pdf')).toBe(true);
    expect(isLegacyBulletinUploadUrl('/school/bulletins/download/stu-1')).toBe(false);
    expect(isLegacyBulletinUploadUrl(null)).toBe(false);
  });

  test('builds school download route with period', () => {
    expect(schoolBulletinDownloadUrl('stu-1', 'T1')).toBe('/school/bulletins/download/stu-1?period=T1');
    expect(schoolBulletinDownloadUrl('stu-1', 'Trimestre 1')).toBe(
      '/school/bulletins/download/stu-1?period=Trimestre%201',
    );
  });

  test('builds parent download route from bulletin id', () => {
    expect(parentBulletinDownloadUrl('bul-1')).toBe('/parent/bulletins/bul-1/pdf');
  });

  test('resolveSchoolBulletinHref rewrites legacy uploads to route', () => {
    expect(resolveSchoolBulletinHref({
      pdfUrl: '/uploads/bulletins/old.pdf',
      studentId: 'stu-1',
      period: 'T1',
    })).toBe('/school/bulletins/download/stu-1?period=T1');
  });

  test('resolveParentBulletinHref prefers bulletin id route', () => {
    expect(resolveParentBulletinHref({
      pdfUrl: '/uploads/bulletins/old.pdf',
      bulletinId: 'bul-9',
      studentId: 'stu-1',
      period: 'T2',
    })).toBe('/parent/bulletins/bul-9/pdf');
  });

  test('legacy bulletin uploads return 410 on Vercel', async () => {
    const request = require('supertest');
    const prev = process.env.VERCEL;
    process.env.VERCEL = '1';
    jest.resetModules();
    const vercelApp = require('../src/app');
    const res = await request(vercelApp).get('/uploads/bulletins/bulletin-old.pdf');
    process.env.VERCEL = prev;
    jest.resetModules();
    expect(res.status).toBe(410);
    expect(res.text).toMatch(/Connectez-vous à EduConnect/);
  });
});
