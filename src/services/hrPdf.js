const { drawDocumentHeader } = require('../utils/schoolLogo');
const { renderPdfToBuffer, savePdfBuffer } = require('../utils/pdfOutput');
const { monthLabel } = require('../utils/hr');
const { payslipPdfFilename } = require('../utils/pdfFilename');

async function generatePayslipPdf({ payslip, teacher, school, payrollRun, outputDir }) {
  const filename = payslipPdfFilename({
    teacher,
    month: payrollRun.month,
    year: payrollRun.year,
  });
  const period = monthLabel(payrollRun.month, payrollRun.year);

  const buffer = await renderPdfToBuffer((doc) => {
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
  });

  return savePdfBuffer({ folder: 'payslips', filename, buffer, outputDir });
}

module.exports = { generatePayslipPdf };
