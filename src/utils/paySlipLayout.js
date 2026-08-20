const { drawOfficialSchoolHeader } = require('./bulletinCiLayout');
const { DEFAULT_PAY_RUBRIQUES, PAYMENT_METHODS } = require('../config/paySlipRubriques');

const PAGE_MARGIN = 40;
const PAGE_WIDTH = 595.28;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;

function formatDateFr(date) {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR');
}

function formatMoneyCi(amount) {
  if (amount == null || !Number.isFinite(Number(amount)) || Number(amount) === 0) return '';
  // fr-FR uses U+202F (narrow no-break space); PDFKit Helvetica renders it as "/".
  return Math.round(Number(amount)).toLocaleString('fr-FR').replace(/\u202f/g, ' ');
}

function setStroke(doc, width = 0.75) {
  doc.save();
  doc.lineWidth(width).strokeColor('#000000');
}

function restoreStroke(doc) {
  doc.restore();
}

function drawHLine(doc, x1, x2, y) {
  doc.moveTo(x1, y).lineTo(x2, y).stroke();
}

function drawVLine(doc, x, y1, y2) {
  doc.moveTo(x, y1).lineTo(x, y2).stroke();
}

function drawRect(doc, x, y, w, h) {
  doc.rect(x, y, w, h).stroke();
}

function drawCellText(doc, text, x, y, w, h, {
  align = 'left',
  fontSize = 7,
  bold = false,
  numeric = false,
} = {}) {
  const padLeft = 5;
  const padRight = numeric || align === 'right' ? 8 : 5;
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize).fillColor('#000');
  doc.text(text == null ? '' : String(text), x + padLeft, y + (h - fontSize) / 2, {
    width: w - padLeft - padRight,
    align,
    lineBreak: false,
    ellipsis: true,
  });
}

function paySlipTableColumns() {
  // Widths must sum to CONTENT_WIDTH (515.28) for A4 with 40pt margins.
  return [
    { key: 'code', label: 'CODE', width: 34, align: 'center' },
    { key: 'rubrique', label: 'RUBRIQUE', width: 164, align: 'left' },
    { key: 'base', label: 'BASE', width: 68, align: 'right', numeric: true },
    { key: 'rate', label: 'NBRE/TAUX', width: 62, align: 'center' },
    { key: 'gains', label: 'GAINS', width: 68, align: 'right', numeric: true },
    { key: 'deductions', label: 'RETENUES', width: 119.28, align: 'right', numeric: true },
  ];
}

function columnOffsets(columns, startX = PAGE_MARGIN) {
  const offsets = [];
  let x = startX;
  columns.forEach((col) => {
    offsets.push({ ...col, x, right: x + col.width });
    x += col.width;
  });
  return offsets;
}

function buildDisplayLines(lines = []) {
  const byCode = new Map((lines || []).map((l) => [l.code, l]));
  return DEFAULT_PAY_RUBRIQUES.map((def) => {
    const line = byCode.get(def.code);
    return {
      code: def.code,
      rubrique: def.label,
      base: line?.base != null ? formatMoneyCi(line.base) : '',
      rate: line?.rateLabel || (line?.rate != null ? `${line.rate}%` : ''),
      gains: line?.gains ? formatMoneyCi(line.gains) : '',
      deductions: line?.deductions ? formatMoneyCi(line.deductions) : '',
      block: def.block,
      rawGains: line?.gains || 0,
      rawDeductions: line?.deductions || 0,
    };
  });
}

function drawTitleBand(doc, y) {
  const x = PAGE_MARGIN;
  setStroke(doc, 1);
  drawRect(doc, x, y, CONTENT_WIDTH, 20);
  restoreStroke(doc);
  doc.font('Helvetica-BoldOblique').fontSize(11).fillColor('#000');
  doc.text('BULLETIN DE PAIE MENSUELLE', x, y + 5, { width: CONTENT_WIDTH, align: 'center' });
  return y + 24;
}

function drawEmployeeBlock(doc, y, { employee, periodLabel }) {
  const x = PAGE_MARGIN;
  const h = 64;
  setStroke(doc);
  drawRect(doc, x, y, CONTENT_WIDTH, h);
  drawVLine(doc, x + CONTENT_WIDTH * 0.55, y, y + h);
  restoreStroke(doc);

  const leftW = CONTENT_WIDTH * 0.55 - 10;
  const rightX = x + CONTENT_WIDTH * 0.55 + 6;
  const rightW = CONTENT_WIDTH * 0.45 - 10;
  let ly = y + 6;

  const leftRows = [
    ['MATRICULE', employee.matricule],
    ['DATE DE NAISSANCE', formatDateFr(employee.birthDate)],
    ['N° CNPS', employee.cnpsNumber],
    ['NBRE. DE PARTS', String(employee.taxParts ?? '—')],
    ['NATIONALITE', employee.nationality],
    ['SITUATION MATRIMONI.', employee.maritalStatus],
  ];
  leftRows.forEach(([label, value]) => {
    doc.font('Helvetica-Bold').fontSize(6.5).text(`${label} :`, x + 6, ly, { continued: true, width: leftW });
    doc.font('Helvetica').fontSize(6.5).text(` ${value || '—'}`);
    ly += 10;
  });

  let ry = y + 6;
  const rightRows = [
    ['PERIODE DE PAIE', periodLabel],
    ["Date d'embauche", formatDateFr(employee.hireDate)],
    ['NOM', employee.lastName],
    ['PRENOMS', employee.firstName],
    ['FONCTION', employee.jobTitle],
  ];
  rightRows.forEach(([label, value]) => {
    doc.font('Helvetica-Bold').fontSize(6.5).text(`${label} :`, rightX, ry, { continued: true, width: rightW });
    doc.font('Helvetica').fontSize(6.5).text(` ${value || '—'}`);
    ry += 11;
  });

  return y + h + 6;
}

function drawRubriqueTable(doc, y, { lines, blocks }) {
  const x = PAGE_MARGIN;
  const cols = columnOffsets(paySlipTableColumns(), x);
  const headerH = 18;
  const rowH = 15;
  const displayLines = buildDisplayLines(lines);

  setStroke(doc);
  drawRect(doc, x, y, CONTENT_WIDTH, headerH);
  cols.forEach((col, i) => {
    if (i > 0) drawVLine(doc, col.x, y, y + headerH);
    drawCellText(doc, col.label, col.x, y, col.width, headerH, { align: col.align, fontSize: 6.5, bold: true });
  });
  restoreStroke(doc);
  y += headerH;

  let currentBlock = 1;
  displayLines.forEach((row) => {
    if (row.block !== currentBlock) {
      y = drawSubtotalRow(doc, y, cols, blocks[currentBlock], currentBlock);
      currentBlock = row.block;
    }
    setStroke(doc);
    drawRect(doc, x, y, CONTENT_WIDTH, rowH);
    cols.forEach((col, i) => {
      if (i > 0) drawVLine(doc, col.x, y, y + rowH);
      drawCellText(doc, row[col.key], col.x, y, col.width, rowH, {
        align: col.align,
        fontSize: col.numeric ? 7 : 7,
        numeric: col.numeric,
      });
    });
    restoreStroke(doc);
    y += rowH;
  });

  y = drawSubtotalRow(doc, y, cols, blocks[currentBlock], currentBlock);
  return y + 4;
}

function drawSubtotalRow(doc, y, cols, blockTotals = {}, blockNum) {
  const x = PAGE_MARGIN;
  const rowH = 16;
  setStroke(doc);
  drawRect(doc, x, y, CONTENT_WIDTH, rowH);
  cols.forEach((col, i) => {
    if (i > 0) drawVLine(doc, col.x, y, y + rowH);
  });
  restoreStroke(doc);

  const spanW = cols[3].right - cols[0].x;
  drawCellText(doc, 'SOUS-TOTAL', cols[0].x, y, spanW, rowH, {
    align: 'center',
    bold: true,
    fontSize: 7,
  });

  if (blockNum === 1 || blockNum === 3) {
    drawCellText(doc, formatMoneyCi(blockTotals.gains), cols[4].x, y, cols[4].width, rowH, {
      align: 'right',
      bold: true,
      fontSize: 7,
      numeric: true,
    });
  }
  if (blockNum === 2 || blockNum === 3) {
    drawCellText(doc, formatMoneyCi(blockTotals.deductions), cols[5].x, y, cols[5].width, rowH, {
      align: 'right',
      bold: true,
      fontSize: 7,
      numeric: true,
    });
  }

  setStroke(doc);
  cols.forEach((col, i) => {
    if (i > 0) drawVLine(doc, col.x, y, y + rowH);
  });
  restoreStroke(doc);

  return y + rowH;
}

function drawTotalsBlock(doc, y, { totalGains, totalDeductions, netPay }) {
  const x = PAGE_MARGIN;
  const boxW = 200;
  const boxX = x + CONTENT_WIDTH - boxW;
  const labelW = 108;
  const valueW = boxW - labelW;
  const valueX = boxX + labelW;
  const rowH = 18;
  const rows = [
    ['TOTAL GAINS', formatMoneyCi(totalGains)],
    ['TOTAL RETENUES', formatMoneyCi(totalDeductions)],
    ['NET A PAYER', formatMoneyCi(netPay)],
  ];

  setStroke(doc);
  rows.forEach((row, i) => {
    const rowY = y + i * rowH;
    drawRect(doc, boxX, rowY, boxW, rowH);
    drawVLine(doc, valueX, rowY, rowY + rowH);
    drawCellText(doc, row[0], boxX, rowY, labelW, rowH, { bold: true, fontSize: 7 });
    drawCellText(doc, row[1], valueX, rowY, valueW, rowH, {
      align: 'right',
      bold: i === 2,
      fontSize: i === 2 ? 8 : 7,
      numeric: true,
    });
  });
  restoreStroke(doc);
  return y + rows.length * rowH + 8;
}

function drawAnnualCumuls(doc, y, cumuls = {}) {
  const x = PAGE_MARGIN;
  doc.font('Helvetica-Bold').fontSize(7).text('CUMULS ANNUELS BASE CONGES', x, y);
  y += 10;

  const cols = [
    { label: 'Brut imposable', value: cumuls.brutImposable },
    { label: 'Régime Général (CNPS)', value: cumuls.cnps },
    { label: 'Impôt sur salaire (IS)', value: cumuls.is },
    { label: 'Contribution Nationale (CN)', value: cumuls.cn },
    { label: 'Impôt Général sur le Revenu (IGR)', value: cumuls.igr },
  ];
  const rowH = 15;
  const labelW = CONTENT_WIDTH * 0.68;
  const valueW = CONTENT_WIDTH - labelW;
  const valueX = x + labelW;
  setStroke(doc);
  cols.forEach((row, i) => {
    const rowY = y + i * rowH;
    drawRect(doc, x, rowY, CONTENT_WIDTH, rowH);
    drawVLine(doc, valueX, rowY, rowY + rowH);
    drawCellText(doc, row.label, x, rowY, labelW, rowH, { fontSize: 7 });
    drawCellText(doc, formatMoneyCi(row.value), valueX, rowY, valueW, rowH, {
      align: 'right',
      fontSize: 7,
      numeric: true,
    });
  });
  const totalY = y + cols.length * rowH;
  drawRect(doc, x, totalY, CONTENT_WIDTH, rowH);
  drawVLine(doc, valueX, totalY, totalY + rowH);
  drawCellText(doc, 'TOTAL CUMULS ANNUELS', x, totalY, labelW, rowH, { bold: true, fontSize: 7 });
  drawCellText(doc, formatMoneyCi(cumuls.netPay), valueX, totalY, valueW, rowH, {
    align: 'right',
    bold: true,
    fontSize: 7,
    numeric: true,
  });
  restoreStroke(doc);
  return totalY + rowH + 10;
}

function drawPaySlipFooter(doc, y, { school, paymentMethod, nextPayDate }) {
  const x = PAGE_MARGIN;
  const colW = CONTENT_WIDTH / 3;
  const h = 48;

  setStroke(doc);
  drawRect(doc, x, y, CONTENT_WIDTH, h);
  drawVLine(doc, x + colW, y, y + h);
  drawVLine(doc, x + colW * 2, y, y + h);
  restoreStroke(doc);

  doc.font('Helvetica-Bold').fontSize(7).text('REGLEMENT en Francs CFA', x + 4, y + 4, { width: colW - 8 });
  const methods = ['ESPECE', 'CHEQUE', 'VIREMENT'];
  let my = y + 16;
  methods.forEach((key) => {
    const checked = paymentMethod === key ? '☑' : '☐';
    doc.font('Helvetica').fontSize(7).text(`${checked} ${PAYMENT_METHODS[key]}`, x + 8, my);
    my += 10;
  });

  doc.font('Helvetica-Bold').fontSize(7).text("L' EMPLOYE", x + colW, y + 4, { width: colW, align: 'center' });
  doc.font('Helvetica-Oblique').fontSize(6).text('Signature', x + colW, y + 30, { width: colW, align: 'center' });

  doc.font('Helvetica-Bold').fontSize(7).text("L' EMPLOYEUR", x + colW * 2, y + 4, { width: colW, align: 'center' });
  doc.font('Helvetica').fontSize(7).text(String(school?.directorName || '—').toUpperCase(), x + colW * 2, y + 28, {
    width: colW,
    align: 'center',
  });

  y += h + 6;
  doc.font('Helvetica-Bold').fontSize(7).text(`PROCHAIN SALAIRE : ${formatDateFr(nextPayDate)}`, x, y);
  return y + 12;
}

function drawPaySlipDocument(doc, { school, employee, lines, blocks, totals, annualCumuls, periodLabel, paymentMethod, nextPayDate }) {
  let y = drawOfficialSchoolHeader(doc, school);
  y = drawTitleBand(doc, y);
  y = drawEmployeeBlock(doc, y, { employee, periodLabel });
  y = drawRubriqueTable(doc, y, { lines, blocks });
  y = drawTotalsBlock(doc, y, totals);
  y = drawAnnualCumuls(doc, y, annualCumuls);
  drawPaySlipFooter(doc, y, { school, paymentMethod, nextPayDate });
}

module.exports = {
  PAGE_MARGIN,
  CONTENT_WIDTH,
  formatMoneyCi,
  formatDateFr,
  paySlipTableColumns,
  buildDisplayLines,
  drawPaySlipDocument,
  drawOfficialSchoolHeader,
};
