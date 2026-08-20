const { renderPdfToBuffer, savePdfBuffer } = require('../utils/pdfOutput');
const { payslipPdfFilename } = require('../utils/pdfFilename');
const { drawPaySlipDocument, formatDateFr } = require('../utils/paySlipLayout');
const { computeBlockSubtotals } = require('../services/paySlipService');

async function generatePaySlipPdf({
  payslip,
  school,
  profile,
  teacher,
  payload,
  outputDir,
}) {
  const lines = payload?.lines || payslip?.lines || [];
  const blocks = payload?.blocks || computeBlockSubtotals(lines);
  const totals = payload?.totals || {
    totalGains: payslip.totalGains,
    totalDeductions: payslip.totalDeductions,
    netPay: payslip.netPay,
  };
  const employee = payload?.employee || {};
  const periodLabel = payload?.periodStart && payload?.periodEnd
    ? `${formatDateFr(payload.periodStart)} au ${formatDateFr(payload.periodEnd)}`
    : `${payslip.payrollRun?.month}/${payslip.payrollRun?.year}`;

  const filename = payslipPdfFilename({
    employee,
    profile,
    teacher,
    month: payslip.payrollRun?.month,
    year: payslip.payrollRun?.year,
  });

  const buffer = await renderPdfToBuffer((doc) => {
    drawPaySlipDocument(doc, {
      school,
      employee,
      lines,
      blocks,
      totals,
      annualCumuls: payload?.annualCumuls || payslip.annualCumuls || {},
      periodLabel,
      paymentMethod: payslip.paymentMethod || payload?.paymentMethod || 'VIREMENT',
      nextPayDate: payslip.nextPayDate || payload?.nextPayDate,
    });
  }, { margin: 40, size: 'A4' });

  return savePdfBuffer({ folder: 'payslips', filename, buffer, outputDir });
}

module.exports = { generatePaySlipPdf };
