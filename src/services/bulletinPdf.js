const { renderPdfToBuffer, savePdfBuffer } = require('../utils/pdfOutput');
const { bulletinPdfFilename } = require('../utils/pdfFilename');
const {
  computeSubjectRows,
  computeAverage,
  getCoefficient,
} = require('./gradesAverage');
const { normalizeTerm } = require('./academicTerms');
const {
  formatTeacherName,
  drawHeaderBlock,
  drawGradesTable,
  drawBilanAnnuel,
  drawTrimestreSummary,
  drawFooterBlock,
} = require('../utils/bulletinCiLayout');

function ensureDir() {
  // Persistence goes through StorageService (/tmp on Vercel, Blob when configured).
}

function enrichRowsWithTeachers(rows, grades) {
  const teacherBySubject = new Map();
  (grades || []).forEach((g) => {
    const subject = String(g.subject || '').trim();
    if (!subject || teacherBySubject.has(subject)) return;
    const name = formatTeacherName(g.teacher);
    if (name) teacherBySubject.set(subject, name);
  });

  return (rows || []).map((row) => ({
    ...row,
    teacherName: teacherBySubject.get(row.subject) || '',
  }));
}

function extractConduct(grades, rows) {
  const conductRow = (rows || []).find((r) => /conduite/i.test(r.subject));
  if (conductRow) {
    return {
      grade: conductRow.average,
      comment: conductRow.comment,
      rows: rows.filter((r) => !/conduite/i.test(r.subject)),
    };
  }
  const conductGrades = (grades || []).filter((g) => /conduite/i.test(g.subject || ''));
  if (!conductGrades.length) return { grade: null, comment: null, rows };
  const conductRows = computeSubjectRows(conductGrades, {});
  return {
    grade: conductRows[0]?.average ?? null,
    comment: conductRows[0]?.comment ?? null,
    rows,
  };
}

async function generateBulletinPdf({
  student,
  school,
  grades,
  period,
  average,
  rank,
  classSize,
  coeffMap,
  termAverages,
  mention,
  decision,
  subjectRanks,
  classStats,
  repeatYear,
  annualAverage,
  domainBilans,
  absencesSummary,
  homeroomTeacherName,
  outputDir,
}) {
  const filename = bulletinPdfFilename({ student, period });
  const term = normalizeTerm(period);

  let rows = computeSubjectRows(grades, coeffMap);
  rows = enrichRowsWithTeachers(rows, grades);
  const conduct = extractConduct(grades, rows);
  rows = conduct.rows;

  const showBilan = term === 'T3' || term === 'ANNUELLE';
  const appreciation = [mention, decision].filter(Boolean).join(' — ') || '';

  const buffer = await renderPdfToBuffer((doc) => {
    drawHeaderBlock(doc, {
      school,
      student,
      classSize,
      repeatYear,
      term: term === 'ANNUELLE' ? 'T3' : term,
    });

    if (!grades.length) {
      doc.font('Helvetica').fontSize(10).fillColor('#666').text('Aucune note enregistrée.');
    } else {
      drawGradesTable(doc, {
        rows,
        subjectRanks: subjectRanks || {},
        average,
        rank,
        conductGrade: conduct.grade,
        conductComment: conduct.comment,
      });
    }

    if (term !== 'ANNUELLE') {
      drawTrimestreSummary(doc, {
        term,
        average,
        rank,
        classSize,
        classStats,
        domainBilans,
        absencesSummary,
      });
    }

    if (showBilan && termAverages) {
      drawBilanAnnuel(doc, {
        classStats,
        termAverages,
        annualAverage: annualAverage ?? average,
        rank,
        appreciation,
      });
    }

    drawFooterBlock(doc, {
      school,
      homeroomTeacherName,
      mention,
      decision,
      city: school?.city,
    });
  }, { margin: 0 });

  return savePdfBuffer({ folder: 'bulletins', filename, buffer, outputDir });
}

module.exports = {
  generateBulletinPdf,
  computeAverage,
  ensureDir,
  getCoefficient,
  enrichRowsWithTeachers,
  extractConduct,
};
