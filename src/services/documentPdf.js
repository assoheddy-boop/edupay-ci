const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const receiptsDir = path.join(__dirname, '../../uploads/receipts');

function ensureDir() {
  if (!fs.existsSync(receiptsDir)) fs.mkdirSync(receiptsDir, { recursive: true });
}

function generateReceiptPdf({ payment, student, school, feeType }) {
  ensureDir();
  const filename = `recu-${payment.id}.pdf`;
  const filepath = path.join(receiptsDir, filename);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    doc.fontSize(18).fillColor('#0052CC').text('EduPay CI — Reçu de paiement', { align: 'center' });
    doc.moveDown();
    doc.fontSize(11).fillColor('#333');
    doc.text(`École : ${school.name}`);
    doc.text(`Élève : ${student.firstName} ${student.lastName}`);
    doc.text(`Classe : ${student.class?.name || '—'}`);
    doc.moveDown();
    doc.fontSize(14).fillColor('#00C853').text(`${payment.amount.toLocaleString('fr-FR')} FCFA`, { align: 'center' });
    doc.fontSize(11).fillColor('#333');
    doc.text(`Type : ${feeType?.name || 'Frais scolaires'}`);
    doc.text(`Référence : ${payment.reference || payment.id.slice(0, 12)}`);
    doc.text(`Statut : ${payment.status}`);
    doc.text(`Date validation : ${payment.validatedAt ? new Date(payment.validatedAt).toLocaleDateString('fr-FR') : '—'}`);
    doc.moveDown(2);
    doc.fontSize(9).fillColor('#999').text('Document officiel EduPay CI', { align: 'center' });

    doc.end();
    stream.on('finish', () => resolve({ pdfUrl: `/uploads/receipts/${filename}` }));
    stream.on('error', reject);
  });
}

function generateBadgePdf({ student, badge, school }) {
  ensureDir();
  const filename = `badge-${badge.id}.pdf`;
  const filepath = path.join(receiptsDir, filename);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [300, 200], margin: 20 });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    doc.fontSize(14).fillColor('#0052CC').text(school.name, { align: 'center' });
    doc.fontSize(28).text('🏅', { align: 'center' });
    doc.fontSize(16).fillColor('#333').text(badge.label, { align: 'center' });
    doc.fontSize(11).text(`${student.firstName} ${student.lastName}`, { align: 'center' });
    doc.fontSize(9).fillColor('#666').text(new Date(badge.awardedAt).toLocaleDateString('fr-FR'), { align: 'center' });

    doc.end();
    stream.on('finish', () => resolve({ pdfUrl: `/uploads/receipts/${filename}` }));
    stream.on('error', reject);
  });
}

function generateHomeworkPdf({ homework, studentClass, school }) {
  ensureDir();
  const filename = `devoir-${homework.id}.pdf`;
  const filepath = path.join(receiptsDir, filename);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    doc.fontSize(16).fillColor('#0052CC').text('Devoir — ' + school.name);
    doc.fontSize(14).text(homework.title);
    doc.moveDown();
    doc.fontSize(11).fillColor('#333');
    doc.text(`Classe : ${studentClass}`);
    doc.text(`À rendre le : ${new Date(homework.dueDate).toLocaleDateString('fr-FR')}`);
    doc.moveDown();
    if (homework.description) doc.text(homework.description);
    doc.moveDown();
    doc.fontSize(9).text('EduPay CI — Fiche pour accompagnement à la maison (sans écran)');

    doc.end();
    stream.on('finish', () => resolve({ pdfUrl: `/uploads/receipts/${filename}` }));
    stream.on('error', reject);
  });
}

module.exports = { generateReceiptPdf, generateBadgePdf, generateHomeworkPdf };
