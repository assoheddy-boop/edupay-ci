const fs = require('fs');
const os = require('os');
const path = require('path');

describe('StorageService', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edupay-storage-'));
  let prevUploads;
  let prevDriver;

  beforeAll(() => {
    prevUploads = process.env.UPLOADS_DIR;
    prevDriver = process.env.STORAGE_DRIVER;
    process.env.UPLOADS_DIR = dir;
    process.env.STORAGE_DRIVER = 'local';
  });

  afterAll(() => {
    if (prevUploads === undefined) delete process.env.UPLOADS_DIR;
    else process.env.UPLOADS_DIR = prevUploads;
    if (prevDriver === undefined) delete process.env.STORAGE_DRIVER;
    else process.env.STORAGE_DRIVER = prevDriver;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('putObject writes locally and returns /uploads URL', async () => {
    const { putObject, getDriver } = require('../services/StorageService');
    expect(getDriver()).toBe('local');
    const stored = await putObject({
      folder: 'payments',
      filename: 'proof.jpg',
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
      contentType: 'image/jpeg',
    });
    expect(stored).toEqual({
      url: '/uploads/payments/proof.jpg',
      key: 'payments/proof.jpg',
      driver: 'local',
    });
    expect(fs.existsSync(path.join(dir, 'payments', 'proof.jpg'))).toBe(true);
  });

  test('storeMulterFile attaches url on the multer file', async () => {
    const { storeMulterFile } = require('../services/StorageService');
    const file = {
      originalname: 'chat.png',
      mimetype: 'image/png',
      buffer: Buffer.from('png'),
    };
    const stored = await storeMulterFile(file, 'chat');
    expect(stored.driver).toBe('local');
    expect(file.url).toMatch(/^\/uploads\/chat\//);
    expect(file.filename).toMatch(/\.png$/);
  });

  test('getDriver prefers explicit STORAGE_DRIVER', () => {
    const { getDriver } = require('../services/StorageService');
    process.env.STORAGE_DRIVER = 'blob';
    expect(getDriver()).toBe('blob');
    process.env.STORAGE_DRIVER = 'local';
    expect(getDriver()).toBe('local');
  });
});
