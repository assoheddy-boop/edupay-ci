const { drawDocumentHeader, drawSchoolLogo } = require('../utils/schoolLogo');
const { renderPdfToBuffer, savePdfBuffer } = require('../utils/pdfOutput');
const { formatMoney } = require('../middleware/currency');

const METHOD_LABELS = {
  CASH: 'Espèces',
  WAVE: 'Wave',
  ORANGE_MONEY: 'Orange Money',
  BANK: 'Banque',
};

function generateReceiptPdf({ payment, student, school, feeType, outputDir }) {
  const filename = `recu-${payment.id}.pdf`;

  return renderPdfToBuffer((doc) => {
    drawDocumentHeader(doc, school, { title: 'Reçu de paiement' });

    doc.fontSize(11).fillColor('#333');
    doc.text(`Élève : ${student.firstName} ${student.lastName}`);
    if (student.matricule) doc.text(`Matricule : ${student.matricule}`);
    doc.text(`Classe : ${student.class?.name || '—'}`);
    doc.moveDown();
    doc.fontSize(14).fillColor('#00C853').text(formatMoney(payment.amount), { align: 'center' });
    doc.fontSize(11).fillColor('#333');
    doc.text(`Type : ${feeType?.name || 'Frais scolaires'}`);
    if (payment.method) {
      doc.text(`Mode : ${METHOD_LABELS[payment.method] || payment.method}`);
    }
    doc.text(`Référence : ${payment.reference || payment.id.slice(0, 12)}`);
    doc.text(`Statut : ${payment.status}`);
    doc.text(`Date validation : ${payment.validatedAt ? new Date(payment.validatedAt).toLocaleDateString('fr-FR') : '—'}`);
    doc.moveDown(2);
    doc.fontSize(9).fillColor('#999').text(`Document officiel — ${school.name} — EduConnect`, { align: 'center' });
  }).then((buffer) => savePdfBuffer({ folder: 'receipts', filename, buffer, outputDir }));
}

function generateBadgePdf({ student, badge, school, outputDir }) {
  const filename = `badge-${badge.id}.pdf`;

  return renderPdfToBuffer((doc) => {
    drawSchoolLogo(doc, school, { x: 110, y: 15, width: 40 });
    doc.fontSize(12).fillColor('#0052CC').text(school.name, { align: 'center' });
    doc.fontSize(16).fillColor('#333').text(badge.label, { align: 'center' });
    doc.fontSize(11).text(`${student.firstName} ${student.lastName}`, { align: 'center' });
    doc.fontSize(9).fillColor('#666').text(new Date(badge.awardedAt).toLocaleDateString('fr-FR'), { align: 'center' });
  }, { size: [300, 200], margin: 20 }).then((buffer) => savePdfBuffer({ folder: 'receipts', filename, buffer, outputDir }));
}

function generateHomeworkPdf({ homework, studentClass, school, outputDir }) {
  const filename = `devoir-${homework.id}.pdf`;

  return renderPdfToBuffer((doc) => {
    drawDocumentHeader(doc, school, { title: `${homework.kind === 'TEST' ? 'Contrôle' : 'Devoir'} — ${homework.title}` });

    doc.fontSize(11).fillColor('#333');
    doc.text(`Classe : ${studentClass}`);
    if (homework.subject) doc.text(`Matière : ${homework.subject}`);
    doc.text(`${homework.kind === 'TEST' ? 'Date' : 'À rendre le'} : ${new Date(homework.dueDate).toLocaleDateString('fr-FR')}`);
    doc.moveDown();
    if (homework.description) doc.text(homework.description);
    doc.moveDown();
    doc.fontSize(9).fillColor('#999').text(`Fiche pour accompagnement à la maison — ${school.name}`, { align: 'center' });
  }).then((buffer) => savePdfBuffer({ folder: 'receipts', filename, buffer, outputDir }));
}

module.exports = { generateReceiptPdf, generateBadgePdf, generateHomeworkPdf };
