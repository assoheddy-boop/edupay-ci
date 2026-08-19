const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { putObject, uploadsRoot, getDriver } = require('../../services/StorageService');

function renderPdfToBuffer(draw, options = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, ...options });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    Promise.resolve()
      .then(() => draw(doc))
      .then(() => doc.end())
      .catch(reject);
  });
}

async function savePdfBuffer({ folder, filename, buffer, outputDir } = {}) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 5) {
    throw new Error('PDF vide');
  }
  const name = filename || `document-${Date.now()}.pdf`;
  const dirName = folder || 'exports';

  if (outputDir) {
    await fs.promises.mkdir(outputDir, { recursive: true });
    const filepath = path.join(outputDir, name);
    await fs.promises.writeFile(filepath, buffer);
    const url = `/uploads/${dirName}/${name}`.replace(/\/{2,}/g, '/');
    return { filepath, filename: name, pdfUrl: url, url, buffer };
  }

  const stored = await putObject({
    folder: dirName,
    filename: name,
    buffer,
    contentType: 'application/pdf',
  });
  const filepath = getDriver() === 'local'
    ? path.join(uploadsRoot(), dirName, name)
    : null;
  return {
    filepath,
    filename: name,
    pdfUrl: stored.url,
    url: stored.url,
    buffer,
  };
}

function sendPdfDownload(res, result) {
  const filename = String(result?.filename || 'document.pdf').replace(/["\r\n]/g, '');
  if (result?.buffer && Buffer.isBuffer(result.buffer) && result.buffer.length) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(result.buffer);
  }
  if (result?.filepath) {
    return res.download(result.filepath, filename);
  }
  throw new Error('PDF introuvable');
}

module.exports = {
  renderPdfToBuffer,
  savePdfBuffer,
  sendPdfDownload,
};
