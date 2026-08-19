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
    expect(res.send).toHaveBeenCalledWith(buffer);
    expect(res.download).not.toHaveBeenCalled();
  });
});
