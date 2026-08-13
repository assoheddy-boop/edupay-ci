const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { drawDocumentHeader } = require('../utils/schoolLogo');
const { monthLabel } = require('../utils/hr');

const payslipsDir = path.join(__dirname, '../../uploads/payslips');

function ensureDir() {
  if (!fs.existsSync(payslipsDir)) fs.mkdirSync(payslipsDir, { recursive: true });
}

function generatePayslipPdf({ payslip, teacher, school, payrollRun }) {
  ensureDir();
  const filename = `bulletin-paie-${payslip.id}.pdf`;
  const filepath = path.join(payslipsDir, filename);
  const period = monthLabel(payrollRun.month, payrollRun.year);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    drawDocumentHeader(doc, school, { title: `Bulletin de paie — ${period}` });

    doc.fontSize(11).fillColor('#333');
    doc.text(`Employé : ${teacher.user.lastName} ${teacher.user.firstName}`);
    doc.text(`Matière : ${teacher.subject || '—'}`);
    doc.text(`Email : ${teacher.user.email}`);
    doc.moveDown();

    const rows = [
      ['Salaire de base', payslip.baseSalary],
      ['Primes', payslip.bonuses],
      ['Retenues', -payslip.deductions],
      ['Avances déduites', -payslip.advances],
    ];
    if (payslip.hoursWorked) {
      rows.unshift(['Heures travaillées', `${payslip.hoursWorked} h`]);
    }

    rows.forEach(([label, value]) => {
      if (typeof value === 'number') {
        doc.text(`${label} : ${value.toLocaleString('fr-FR')} FCFA`);
      } else {
        doc.text(`${label} : ${value}`);
      }
    });

    doc.moveDown();
    doc.fontSize(14).fillColor('#00C853').text(`Net à payer : ${payslip.netPay.toLocaleString('fr-FR')} FCFA`, { align: 'center' });
    doc.moveDown(2);
    doc.fontSize(9).fillColor('#999').text(`Document généré le ${new Date().toLocaleDateString('fr-FR')} — ${school.name}`, { align: 'center' });

    doc.end();
    stream.on('finish', () => resolve({ pdfUrl: `/uploads/payslips/${filename}` }));
    stream.on('error', reject);
  });
}

module.exports = { generatePayslipPdf };
