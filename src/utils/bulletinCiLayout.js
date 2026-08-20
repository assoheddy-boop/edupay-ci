const { ordinalFr } = require('../services/classement');
const { round2 } = require('../services/gradesAverage');

const PAGE_MARGIN = 36;
const PAGE_WIDTH = 595.28;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;

const TRIMESTRE_TITLES = {
  T1: 'BULLETIN DE NOTES DU PREMIER TRIMESTRE',
  T2: 'BULLETIN DE NOTES DU DEUXIEME TRIMESTRE',
  T3: 'BULLETIN DE NOTES DU TROISIEME TRIMESTRE',
  ANNUELLE: 'BULLETIN DE NOTES — BILAN ANNUEL',
};

/** Comma decimal like official CI bulletins (12,50). */
function formatGradeCi(value, { decimals = 2, pad = false } = {}) {
  if (value == null || !Number.isFinite(Number(value))) return '';
  let n = round2(Number(value));
  let str = n.toFixed(decimals).replace('.', ',');
  if (pad && decimals === 2) {
    const [intPart, decPart = '00'] = str.split(',');
    str = `${intPart},${decPart.padEnd(2, '0')}`;
  }
  return str;
}

function formatGradeCiOrDash(value, opts) {
  const s = formatGradeCi(value, opts);
  return s || '—';
}

function termTitleCi(term) {
  return TRIMESTRE_TITLES[term] || 'BULLETIN DE NOTES';
}

function formatBirthDate(date) {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd} / ${mm} / ${yyyy}`;
}

function formatGenderShort(gender) {
  const g = String(gender || '').trim().toUpperCase();
  if (g === 'M' || g === 'F') return g;
  return '—';
}

function formatRepeatStatus(repeatYear) {
  if (repeatYear === true) return 'redoublant';
  if (repeatYear === false) return 'non redoublant';
  return 'redoublant / non redoublant';
}

function formatTeacherName(teacher) {
  if (!teacher) return '';
  const user = teacher.user || teacher;
  const last = String(user.lastName || '').trim().toUpperCase();
  const first = String(user.firstName || '').trim();
  const initial = first ? `${first.charAt(0).toUpperCase()}.` : '';
  if (!last && !initial) return '';
  const prefix = user.gender === 'F' ? 'Mme' : 'M.';
  return `${prefix} ${last}${initial ? ` ${initial}` : ''}`.trim();
}

function formatRankCi(rank) {
  if (!rank || rank < 1) return '';
  return ordinalFr(rank);
}

/** Trimestre column widths for the grades grid (sum = CONTENT_WIDTH). */
function gradesTableColumns() {
  return [
    { key: 'discipline', label: 'DISCIPLINE', width: 128, align: 'left' },
    { key: 'moy', label: 'MOY/20', width: 44, align: 'center' },
    { key: 'coef', label: 'Coef', width: 36, align: 'center' },
    { key: 'moyCoef', label: 'Moy Coef', width: 54, align: 'center' },
    { key: 'rang', label: 'Rang', width: 40, align: 'center' },
    { key: 'teacherNom', label: 'NOM', width: 48, align: 'left', parent: 'PROFESSEURS' },
    { key: 'teacherPrenom', label: 'PRENOMS', width: 48, align: 'left', parent: 'PROFESSEURS' },
    { key: 'appreciation', label: 'Appréciations et signature', width: 125.28, align: 'left' },
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

/**
 * Draw text centered vertically in a cell (approximate).
 */
function drawCellText(doc, text, x, y, w, h, { align = 'left', fontSize = 8, bold = false } = {}) {
  const pad = 3;
  const content = text == null || text === '' ? '' : String(text);
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize).fillColor('#000000');
  const textY = y + Math.max(pad, (h - fontSize) / 2 - 1);
  doc.text(content, x + pad, textY, {
    width: w - pad * 2,
    align,
    lineBreak: false,
  });
}

/**
 * Excel-like grid: draw outer border + all internal horizontal and vertical lines.
 */
function drawGrid(doc, x, y, width, height, colWidths, rowHeights) {
  setStroke(doc);
  drawRect(doc, x, y, width, height);

  let cy = y;
  for (let i = 0; i < rowHeights.length - 1; i += 1) {
    cy += rowHeights[i];
    drawHLine(doc, x, x + width, cy);
  }

  let cx = x;
  for (let i = 0; i < colWidths.length - 1; i += 1) {
    cx += colWidths[i];
    drawVLine(doc, cx, y, y + height);
  }

  restoreStroke(doc);
}

/**
 * Draw merged header for PROFESSEURS spanning teacher sub-columns.
 */
function drawGradesTableHeader(doc, x, y, cols, headerHeight) {
  const subHeaderHeight = 14;
  const totalHeight = headerHeight + subHeaderHeight;
  const colWidths = cols.map((c) => c.width);
  const rowHeights = [headerHeight, subHeaderHeight];

  drawGrid(doc, x, y, CONTENT_WIDTH, totalHeight, colWidths, rowHeights);

  setStroke(doc);
  // Vertical spans for columns that merge over 2 header rows
  const spanKeys = ['discipline', 'moy', 'coef', 'moyCoef', 'rang', 'appreciation'];
  spanKeys.forEach((key) => {
    const col = cols.find((c) => c.key === key);
    if (!col) return;
    drawVLine(doc, col.x, y, y + totalHeight);
    drawVLine(doc, col.right, y, y + totalHeight);
  });

  // Horizontal line between header rows — skip merged span columns interior
  const profStart = cols.find((c) => c.key === 'teacherNom');
  const profEnd = cols.find((c) => c.key === 'teacherPrenom');
  const midY = y + headerHeight;
  drawHLine(doc, x, profStart.x, midY);
  drawHLine(doc, profEnd.right, x + CONTENT_WIDTH, midY);

  // PROFESSEURS merged top cell border cleanup
  drawRect(doc, profStart.x, y, profEnd.right - profStart.x, headerHeight);
  restoreStroke(doc);

  // Header labels
  cols.forEach((col) => {
    if (col.key === 'teacherNom' || col.key === 'teacherPrenom') return;
    if (col.key === 'appreciation') {
      drawCellText(doc, col.label, col.x, y, col.width, totalHeight, { align: 'center', fontSize: 7, bold: true });
      return;
    }
    drawCellText(doc, col.label, col.x, y, col.width, totalHeight, { align: 'center', fontSize: 7, bold: true });
  });

  drawCellText(doc, 'PROFESSEURS', profStart.x, y, profEnd.right - profStart.x, headerHeight, {
    align: 'center',
    fontSize: 7,
    bold: true,
  });
  drawCellText(doc, 'NOM', profStart.x, y + headerHeight, profStart.width, subHeaderHeight, {
    align: 'center',
    fontSize: 7,
    bold: true,
  });
  drawCellText(doc, 'PRENOMS', profEnd.x, y + headerHeight, profEnd.width, subHeaderHeight, {
    align: 'center',
    fontSize: 7,
    bold: true,
  });

  return totalHeight;
}

function splitTeacherName(fullName) {
  if (!fullName) return { nom: '', prenom: '' };
  const parts = String(fullName).trim().split(/\s+/);
  if (parts.length <= 1) return { nom: parts[0] || '', prenom: '' };
  return { nom: parts.slice(0, -1).join(' '), prenom: parts[parts.length - 1] };
}

function buildTableRowValues(row, subjectRanks = {}) {
  const moyCoef = row.average != null && row.coefficient != null
    ? round2(row.average * row.coefficient)
    : null;
  const teacherFull = row.teacherName || '';
  const { nom, prenom } = splitTeacherName(teacherFull);

  return {
    discipline: row.subject || '',
    moy: formatGradeCiOrDash(row.average),
    coef: row.coefficient != null ? String(row.coefficient) : '',
    moyCoef: moyCoef != null ? formatGradeCi(moyCoef) : '',
    rang: formatRankCi(subjectRanks[row.subject]),
    teacherNom: nom,
    teacherPrenom: prenom,
    appreciation: row.comment || '',
  };
}

function computeTotalsRow(rows, average, rank) {
  const sumCoef = rows.reduce((s, r) => s + (Number(r.coefficient) || 0), 0);
  const sumMoyCoef = rows.reduce((s, r) => {
    if (r.average == null) return s;
    return s + round2(r.average * (Number(r.coefficient) || 0));
  }, 0);

  return {
    discipline: 'TOTAUX TRIMESTRE',
    moy: formatGradeCiOrDash(average),
    coef: sumCoef ? String(sumCoef) : '',
    moyCoef: sumMoyCoef ? formatGradeCi(sumMoyCoef) : '',
    rang: formatRankCi(rank),
    teacherNom: '',
    teacherPrenom: '',
    appreciation: '',
  };
}

function drawGradesDataRow(doc, x, y, cols, values, rowHeight, { bold = false } = {}) {
  const colWidths = cols.map((c) => c.width);
  drawGrid(doc, x, y, CONTENT_WIDTH, rowHeight, colWidths, [rowHeight]);

  cols.forEach((col) => {
    drawCellText(doc, values[col.key] ?? '', col.x, y, col.width, rowHeight, {
      align: col.align,
      fontSize: 8,
      bold: bold || col.key === 'discipline',
    });
  });

  return rowHeight;
}

function drawGradesTable(doc, {
  rows,
  subjectRanks,
  average,
  rank,
  conductGrade,
  conductComment,
}) {
  const cols = columnOffsets(gradesTableColumns());
  const x = PAGE_MARGIN;
  let y = doc.y;
  const headerHeight = 16;
  const rowHeight = 18;

  const headerH = drawGradesTableHeader(doc, x, y, cols, headerHeight);
  y += headerH;

  const dataRows = [...rows];
  dataRows.push({
    subject: 'CONDUITE',
    coefficient: null,
    average: conductGrade,
    comment: conductComment || '',
    teacherName: 'LE DIRECTEUR',
  });

  dataRows.forEach((row) => {
    if (y + rowHeight > doc.page.height - PAGE_MARGIN) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
    const values = buildTableRowValues(row, subjectRanks);
    if (row.subject === 'CONDUITE') {
      values.teacherNom = 'LE DIRECTEUR';
      values.teacherPrenom = '';
      if (conductGrade != null) {
        values.moyCoef = formatGradeCi(conductGrade);
        values.moy = '';
        values.coef = '';
      }
    }
    drawGradesDataRow(doc, x, y, cols, values, rowHeight);
    y += rowHeight;
  });

  if (y + rowHeight > doc.page.height - PAGE_MARGIN) {
    doc.addPage();
    y = PAGE_MARGIN;
  }
  const totals = computeTotalsRow(rows, average, rank);
  drawGradesDataRow(doc, x, y, cols, totals, rowHeight, { bold: true });
  y += rowHeight;

  doc.y = y + 8;
  return y;
}

function drawDoubleBox(doc, x, y, w, h) {
  setStroke(doc, 1);
  drawRect(doc, x, y, w, h);
  drawRect(doc, x + 2, y + 2, w - 4, h - 4);
  restoreStroke(doc);
}

function drawHeaderBlock(doc, { school, student, classSize, repeatYear, term }) {
  const x = PAGE_MARGIN;
  let y = PAGE_MARGIN;

  // Title
  const title = termTitleCi(term);
  setStroke(doc, 1);
  const titleH = 22;
  drawDoubleBox(doc, x, y, CONTENT_WIDTH, titleH);
  restoreStroke(doc);
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#000');
  doc.text(title, x, y + 6, { width: CONTENT_WIDTH, align: 'center' });
  y += titleH + 6;

  // School + class row
  const blockH = 52;
  setStroke(doc, 0.75);
  drawRect(doc, x, y, CONTENT_WIDTH * 0.62, blockH);
  drawRect(doc, x + CONTENT_WIDTH * 0.62, y, CONTENT_WIDTH * 0.38, blockH);
  restoreStroke(doc);

  const schoolName = String(school.name || '').toUpperCase();
  const location = [school.campusLabel, school.city, school.address].filter(Boolean).join(' — ') || school.city || '';
  const phone = school.publicPhone || school.waveNumber || school.omNumber || '';
  const infoline = phone ? `Infoline : ${phone}` : '';

  doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
  doc.text(schoolName, x + 6, y + 6, { width: CONTENT_WIDTH * 0.58 });
  doc.font('Helvetica').fontSize(8);
  doc.text(location, x + 6, y + 20, { width: CONTENT_WIDTH * 0.58 });
  if (infoline) doc.text(infoline, x + 6, y + 32, { width: CONTENT_WIDTH * 0.58 });

  const className = student.class?.name || '—';
  doc.font('Helvetica-Bold').fontSize(9);
  doc.text(`Classe : ${className}`, x + CONTENT_WIDTH * 0.62 + 6, y + 8);
  doc.font('Helvetica').fontSize(8);
  doc.text(`statut : ${formatRepeatStatus(repeatYear)}`, x + CONTENT_WIDTH * 0.62 + 6, y + 24, {
    width: CONTENT_WIDTH * 0.36,
  });

  y += blockH + 4;

  // Student info block
  const studentH = 36;
  setStroke(doc, 1);
  drawRect(doc, x, y, CONTENT_WIDTH, studentH);
  restoreStroke(doc);

  const fullName = `${String(student.lastName || '').toUpperCase()} ${String(student.firstName || '').toUpperCase()}`.trim();
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#000');
  doc.text(`Nom et Prénoms : ${fullName}`, x + 6, y + 4);
  doc.font('Helvetica').fontSize(8);
  doc.text(`Sexe : ${formatGenderShort(student.gender)}`, x + 6, y + 16);
  doc.text(
    `Né le : ${formatBirthDate(student.birthDate)}    à : ${student.birthPlace || '—'}`,
    x + 6,
    y + 26,
  );
  doc.text(`Nationalité : ${student.nationality || '—'}`, x + CONTENT_WIDTH * 0.55, y + 16);
  doc.text(`Effectif : ${classSize || '—'}`, x + CONTENT_WIDTH * 0.55, y + 26);

  doc.y = y + studentH + 8;
}

function drawBilanAnnuel(doc, {
  classStats,
  termAverages,
  annualAverage,
  rank,
  appreciation,
}) {
  if (doc.y > doc.page.height - 200) {
    doc.addPage();
  }

  const x = PAGE_MARGIN;
  let y = doc.y + 10;
  const w = CONTENT_WIDTH;
  const leftW = w * 0.38;
  const midW = w * 0.31;
  const rightW = w - leftW - midW;
  const topH = 70;
  const bottomH = 36;
  const totalH = topH + bottomH;

  setStroke(doc, 0.75);
  drawRect(doc, x, y, w, totalH);
  drawVLine(doc, x + leftW, y, y + totalH);
  drawVLine(doc, x + leftW + midW, y, y + topH);
  drawHLine(doc, x, x + w, y + topH);
  drawHLine(doc, x + leftW, x + w, y + topH / 2);
  restoreStroke(doc);

  doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
  doc.text('BILAN ANNUEL', x, y - 14, { width: w, align: 'center' });

  doc.font('Helvetica-BoldOblique').fontSize(8);
  doc.text(
    `Moyenne de la classe : ${formatGradeCiOrDash(classStats?.classAverage)}`,
    x + 6,
    y + 6,
    { width: leftW - 12 },
  );
  doc.font('Helvetica').fontSize(8);
  doc.text(`Plus forte moyenne : ${formatGradeCiOrDash(classStats?.highest)}`, x + 6, y + 20);
  doc.text(`Plus faible moyenne : ${formatGradeCiOrDash(classStats?.lowest, { pad: true })}`, x + 6, y + 32);

  const midX = x + leftW;
  const rightX = x + leftW + midW;

  doc.font('Helvetica-Bold').fontSize(7);
  doc.text('MOYENNE', midX, y + 4, { width: midW + rightW, align: 'center' });

  doc.font('Helvetica').fontSize(8);
  doc.text(
    `1er TRIMESTRE : ${formatGradeCiOrDash(termAverages?.T1)}/20`,
    midX + 4,
    y + topH / 2 + 6,
    { width: midW - 8 },
  );
  doc.text(
    `2e TRIMESTRE : ${formatGradeCiOrDash(termAverages?.T2)}/20`,
    midX + 4,
    y + topH / 2 + 22,
    { width: midW - 8 },
  );
  doc.text(
    `3e TRIMESTRE : ${formatGradeCiOrDash(termAverages?.T3)}`,
    rightX + 4,
    y + topH / 2 + 14,
    { width: rightW - 8, align: 'center' },
  );

  // Appréciation box (left bottom)
  setStroke(doc, 0.75);
  drawRect(doc, x + 4, y + topH + 4, leftW - 8, bottomH - 8);
  restoreStroke(doc);
  doc.font('Helvetica-Bold').fontSize(8);
  doc.text('Appréciation', x + 8, y + topH + 8);
  if (appreciation) {
    doc.font('Helvetica').fontSize(7).text(appreciation, x + 8, y + topH + 18, { width: leftW - 16 });
  }

  // Annual average + rank (bottom spanning mid+right)
  doc.font('Helvetica-Bold').fontSize(9);
  doc.text(
    `MOYENNE ANNUELLE : ${formatGradeCiOrDash(annualAverage)}/20`,
    midX + 6,
    y + topH + 10,
    { width: midW + rightW - 12 },
  );
  doc.text(`RANG : ${formatRankCi(rank) || '—'}`, midX + 6, y + topH + 24, { width: midW + rightW - 12 });

  // Signatures
  y += totalH + 24;
  doc.font('Helvetica').fontSize(9);
  doc.text('Le Professeur P.', x, y, { width: w / 2, align: 'center', underline: true });
  doc.text('Le Directeur', x + w / 2, y, { width: w / 2, align: 'center', underline: true });

  doc.y = y + 24;
}

function computeClassStats(classAverages) {
  const avgs = (classAverages || [])
    .map((e) => Number(e.avg))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!avgs.length) {
    return { classAverage: null, highest: null, lowest: null };
  }
  return {
    classAverage: round2(avgs.reduce((s, n) => s + n, 0) / avgs.length),
    highest: round2(Math.max(...avgs)),
    lowest: round2(Math.min(...avgs)),
  };
}

module.exports = {
  PAGE_MARGIN,
  CONTENT_WIDTH,
  formatGradeCi,
  formatGradeCiOrDash,
  termTitleCi,
  formatBirthDate,
  formatGenderShort,
  formatRepeatStatus,
  formatTeacherName,
  formatRankCi,
  gradesTableColumns,
  columnOffsets,
  drawGrid,
  drawGradesTableHeader,
  buildTableRowValues,
  computeTotalsRow,
  drawGradesTable,
  drawHeaderBlock,
  drawBilanAnnuel,
  computeClassStats,
  splitTeacherName,
};
