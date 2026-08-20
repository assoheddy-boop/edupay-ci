const fs = require('fs');
const os = require('os');
const path = require('path');
const { renderPdfToBuffer, savePdfBuffer, sendPdfDownload } = require('../src/utils/pdfOutput');

describe('pdfOutput', () => {
  test('renderPdfToBuffer returns a PDF header', async () => {
    const buffer = await renderPdfToBuffer((doc) => {
      doc.fontSize(12).text('EduConnect bulletin');
    });
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(buffer.length).toBeGreaterThan(100);
  });

  test('savePdfBuffer writes to outputDir without using the app uploads folder', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'educonnect-pdf-'));
    const buffer = await renderPdfToBuffer((doc) => {
      doc.text('Ticket caisse');
    });
    const saved = await savePdfBuffer({
      folder: 'receipts',
      filename: 'recu-test.pdf',
      buffer,
      outputDir: dir,
    });
    expect(saved.filepath).toBe(path.join(dir, 'recu-test.pdf'));
    expect(fs.existsSync(saved.filepath)).toBe(true);
    expect(saved.buffer.subarray(0, 4).toString()).toBe('%PDF');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('savePdfBuffer falls back to local storage when remote upload fails', async () => {
    jest.resetModules();
    jest.doMock('../services/StorageService', () => ({
      putObject: jest.fn().mockRejectedValue(new Error('BLOB_READ_WRITE_TOKEN manquant')),
      uploadsRoot: () => path.join(os.tmpdir(), 'educonnect-pdf-fallback'),
      getDriver: () => 'blob',
    }));
    const { renderPdfToBuffer, savePdfBuffer } = require('../src/utils/pdfOutput');
    const buffer = await renderPdfToBuffer((doc) => doc.text('Bulletin fallback'));
    const saved = await savePdfBuffer({
      folder: 'bulletins',
      filename: 'bulletin-fallback.pdf',
      buffer,
    });
    expect(saved.buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(saved.pdfUrl).toBe('/uploads/bulletins/bulletin-fallback.pdf');
    expect(saved.filepath).toContain('bulletin-fallback.pdf');
    expect(require('fs').existsSync(saved.filepath)).toBe(true);
    jest.dontMock('../services/StorageService');
    jest.resetModules();
  });

  test('sendPdfDownload streams the buffer with application/pdf', () => {
    const res = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      download: jest.fn(),
    };
    const buffer = Buffer.from('%PDF-1.4 test');
    sendPdfDownload(res, { buffer, filename: 'bulletin.pdf' });
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="bulletin.pdf"');
    expect(res.send).toHaveBeenCalledWith(buffer);
    expect(res.download).not.toHaveBeenCalled();
  });
});
