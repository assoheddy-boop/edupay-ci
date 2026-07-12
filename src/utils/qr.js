const QRCode = require('qrcode');

async function generateQrDataUrl(text) {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 256,
  });
}

module.exports = { generateQrDataUrl };
