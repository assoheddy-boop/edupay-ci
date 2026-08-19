const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { drawDocumentHeader } = require('../utils/schoolLogo');
const {
  computeAverage,
  computeAnnuelleAverage,
  computeSubjectRows,
  computeTermAverages,
  getCoefficient,
  SUBJECT_AVERAGE_FOOTNOTE,
} = require('./gradesAverage');
const { formatTermLabel, normalizeTerm, filterGradesForBulletin } = require('./academicTerms');
const { seriesLabel } = require('./series');
const { formatClassRank, formatGenderRank } = require('./classement');

const bulletinsDir = path.join(__dirname, '../../uploads/bulletins');

function ensureDir() {
  if (!fs.existsSync(bulletinsDir)) {
    fs.mkdirSync(bulletinsDir, { recursive: true });
  }
}

function safePeriodSlug(period) {
  return String(period || 'periode').replace(/\s+/g, '-');
}

function fmtPart(n) {
  return n == null ? '—' : Number(n).toFixed(2);
}

function rowsHaveKindBreakdown(rows) {
  return (rows || []).some((row) => row.interro != null || row.composition != null);
}

function drawSubjectTable(doc, rows) {
  const showKinds = rowsHaveKindBreakdown(rows);
  const tableTop = doc.y;
  doc.fontSize(9).fillColor('#666');
  if (showKinds) {
    doc.text('Matière', 50, tableTop, { width: 110 });
    doc.text('Coef.', 165, tableTop);
    doc.text('Interro', 205, tableTop);
    doc.text('Devoir', 260, tableTop);
    doc.text('Compo', 315, tableTop);
    doc.text('Moyenne', 370, tableTop);
    doc.text('Appréciation', 440, tableTop);
  } else {
    doc.fontSize(10);
    doc.text('Matière', 50, tableTop);
    doc.text('Coef.', 220, tableTop);
    doc.text('Moyenne', 270, tableTop);
    doc.text('Appréciation', 350, tableTop);
  }
  doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke('#ddd');

  let y = tableTop + 25;
  rows.forEach((row) => {
    if (y > 720) {
      doc.addPage();
      y = 50;
    }
    if (showKinds) {
      doc.fontSize(9).fillColor('#333').text(row.subject, 50, y, { width: 110 });
      doc.text(String(row.coefficient), 165, y);
      doc.text(fmtPart(row.interro), 205, y);
      doc.text(fmtPart(row.devoir), 260, y);
      doc.text(fmtPart(row.composition), 315, y);
      doc.text(`${Number(row.average).toFixed(2)}`, 370, y);
      doc.text(row.comment || '—', 440, y, { width: 110 });
    } else {
      doc.fontSize(10).fillColor('#333').text(row.subject, 50, y, { width: 160 });
      doc.text(String(row.coefficient), 220, y);
      doc.text(`${row.average.toFixed(2)} / 20`, 270, y);
      doc.text(row.comment || '—', 350, y, { width: 200 });
    }
    y += 22;
  });
  doc.y = y + 8;
}

function drawAnnualTable(doc, grades, coeffMap) {
  const subjects = [...new Set(grades.map((g) => g.subject || '—'))].sort((a, b) => a.localeCompare(b, 'fr'));
  const tableTop = doc.y;
  doc.fontSize(10).fillColor('#666');
  doc.text('Matière', 50, tableTop);
  doc.text('Coef.', 200, tableTop);
  doc.text('T1', 250, tableTop);
  doc.text('T2', 310, tableTop);
  doc.text('T3', 370, tableTop);
  doc.text('Annuelle', 430, tableTop);
  doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke('#ddd');

  let y = tableTop + 25;
  subjects.forEach((subject) => {
    if (y > 720) {
      doc.addPage();
      y = 50;
    }
    const ofSubject = grades.filter((g) => (g.subject || '—') === subject);
    const t1 = computeAverage(filterGradesForBulletin(ofSubject, 'T1'), coeffMap);
    const t2 = computeAverage(filterGradesForBulletin(ofSubject, 'T2'), coeffMap);
    const t3 = computeAverage(filterGradesForBulletin(ofSubject, 'T3'), coeffMap);
    const present = [t1, t2, t3].filter((_, i) => (
      filterGradesForBulletin(ofSubject, ['T1', 'T2', 'T3'][i]).length
    ));
    const annual = present.length
      ? Math.round((present.reduce((s, n) => s + n, 0) / present.length) * 100) / 100
      : 0;
    const coef = getCoefficient(subject, coeffMap);
    const fmt = (n, has) => (has ? n.toFixed(2) : '—');
    doc.fillColor('#333').text(subject, 50, y, { width: 140 });
    doc.text(String(coef), 200, y);
    doc.text(fmt(t1, filterGradesForBulletin(ofSubject, 'T1').length), 250, y);
    doc.text(fmt(t2, filterGradesForBulletin(ofSubject, 'T2').length), 310, y);
    doc.text(fmt(t3, filterGradesForBulletin(ofSubject, 'T3').length), 370, y);
    doc.text(annual ? annual.toFixed(2) : '—', 430, y);
    y += 22;
  });
  doc.y = y + 8;
}

function generateBulletinPdf({
  student,
  school,
  grades,
  period,
  average,
  rank,
  classSize,
  genderRank,
  genderSize,
  genderGroup,
  coeffMap,
  termAverages,
  mention,
  decision,
  series,
}) {
  ensureDir();
  const filename = `bulletin-${student.id}-${safePeriodSlug(period)}-${Date.now()}.pdf`;
  const filepath = path.join(bulletinsDir, filename);
  const term = normalizeTerm(period);
  const periodLabel = formatTermLabel(period);
  const rows = computeSubjectRows(grades, coeffMap);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    drawDocumentHeader(doc, school, { title: 'Bulletin scolaire' });

    doc.fontSize(11).fillColor('#333');
    doc.text(`Année scolaire : ${student.class?.schoolYear || school.currentSchoolYear || '2025-2026'}`);
    doc.moveDown();

    doc.fontSize(13).fillColor('#0052CC').text('Informations élève');
    doc.fontSize(11).fillColor('#333');
    doc.text(`Nom : ${student.lastName} ${student.firstName}`);
    doc.text(`Classe : ${student.class?.name || '—'}`);
    const serieTxt = seriesLabel(series || student.series || student.class?.series);
    if (serieTxt) doc.text(`Série : ${serieTxt}`);
    doc.text(`Matricule école : ${student.matricule || '—'}`);
    doc.text(`Matricule national : ${student.nationalMatricule || '—'}`);
    doc.text(`Période : ${periodLabel}`);
    doc.moveDown();

    doc.fontSize(13).fillColor('#0052CC').text('Notes');
    doc.moveDown(0.5);

    if (!grades.length) {
      doc.fontSize(11).fillColor('#666').text('Aucune note enregistrée.');
    } else if (term === 'ANNUELLE') {
      drawAnnualTable(doc, grades, coeffMap);
    } else {
      drawSubjectTable(doc, rows);
    }

    doc.moveDown();
    doc.fontSize(12).fillColor('#0052CC');
    doc.text(`Moyenne générale : ${Number(average).toFixed(2)} / 20`);
    doc.fontSize(8).fillColor('#666');
    doc.text(SUBJECT_AVERAGE_FOOTNOTE, { width: 500 });
    doc.text('Moyenne générale = Σ (moyenne matière × coefficient) / Σ coefficients.');

    if (term === 'ANNUELLE' && termAverages) {
      doc.moveDown(0.4);
      doc.fontSize(10).fillColor('#333');
      const parts = [];
      if (termAverages.T1) parts.push(`T1 ${termAverages.T1.toFixed(2)}`);
      if (termAverages.T2) parts.push(`T2 ${termAverages.T2.toFixed(2)}`);
      if (termAverages.T3) parts.push(`T3 ${termAverages.T3.toFixed(2)}`);
      if (parts.length) doc.text(`Moyennes trimestrielles : ${parts.join('  ·  ')}`);
      doc.text('Moyenne annuelle = moyenne des trimestres renseignés.');
    }

    const classRankLine = formatClassRank({ rank, classSize });
    if (classRankLine) {
      doc.fontSize(12).fillColor('#0052CC');
      doc.text(`Rang : ${classRankLine}`);
    }
    const genderRankLine = formatGenderRank({ genderRank, genderSize, genderGroup });
    if (genderRankLine) {
      doc.fontSize(11).fillColor('#333');
      doc.text(`Rang parmi les ${genderGroup} : ${genderRankLine}`);
    }

    const hasMention = Boolean(mention);
    const hasDecision = Boolean(decision);
    if (hasMention || hasDecision) {
      doc.moveDown(1);
      doc.fontSize(13).fillColor('#0052CC').text('Conseil de classe');
      doc.fontSize(11).fillColor('#333');
      if (hasMention) doc.text(`Mention : ${mention}`);
      if (hasDecision) doc.text(`Décision : ${decision}`);
    }

    doc.moveDown(2);
    doc.fontSize(9).fillColor('#999').text(
      `Document généré le ${new Date().toLocaleDateString('fr-FR')} — ${school.name} — EduConnect`,
      { align: 'center' },
    );

    doc.end();

    stream.on('finish', () => resolve({ filepath, filename, pdfUrl: `/uploads/bulletins/${filename}` }));
    stream.on('error', reject);
  });
}

module.exports = { generateBulletinPdf, computeAverage, ensureDir, getCoefficient };
