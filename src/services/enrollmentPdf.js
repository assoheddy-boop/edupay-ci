const { renderPdfToBuffer } = require('../utils/pdfOutput');
const {
  formatBirthDate,
  formatGenderShort,
  formatRepeatStatus,
} = require('../utils/bulletinCiLayout');
const {
  ENROLLMENT_DOCUMENTS,
  ENROLLMENT_STATUS_OPTIONS,
} = require('../utils/enrollmentForm');
const { seriesLabel } = require('./series');

const M = 40;
const W = 595.28 - M * 2;
const LABEL_W = 118;

function enrollmentStatusLabel(value) {
  const opt = ENROLLMENT_STATUS_OPTIONS.find((o) => o.value === value);
  return opt?.label || value || '—';
}

function dash(v) {
  if (v == null || v === '') return '—';
  return String(v);
}

function drawFieldRow(doc, y, label, value, x = M, width = W - 100) {
  doc.fontSize(9).fillColor('#333');
  doc.text(label, x, y, { width: LABEL_W });
  doc.font('Helvetica-Bold').text(dash(value), x + LABEL_W, y, { width: width - LABEL_W });
  doc.font('Helvetica');
  return y + 14;
}

function drawChecklist(doc, startY, documents) {
  doc.fontSize(10).fillColor('#0052CC').text('DOSSIER — PIÈCES FOURNIES', M, startY);
  let y = startY + 16;
  const colW = W / 2;
  ENROLLMENT_DOCUMENTS.forEach((docItem, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = M + col * colW;
    const yy = y + row * 13;
    const mark = documents[docItem.key] ? '[X]' : '[ ]';
    doc.fontSize(8).fillColor('#333').text(`${mark}  ${docItem.label}`, x, yy, { width: colW - 8 });
  });
  const rows = Math.ceil(ENROLLMENT_DOCUMENTS.length / 2);
  return y + rows * 13 + 8;
}

function generateEnrollmentFichePdf({ school, schoolYear, student, enrollment, yearRecord, classStats, documents }) {
  const filename = `fiche-inscription-${student.id}-${schoolYear.replace(/\//g, '-')}.pdf`;

  return renderPdfToBuffer((doc) => {
    doc.rect(M, M, W, 752).stroke('#333');

    doc.fontSize(14).fillColor('#0052CC').text('FICHE D\'INSCRIPTION', M, M + 10, { width: W, align: 'center' });
    doc.fontSize(11).fillColor('#333').text(`Année scolaire ${schoolYear}`, M, M + 28, { width: W, align: 'center' });

    doc.fontSize(9).text(school.name, M + 8, M + 48);
    if (school.address || school.city) {
      doc.text([school.address, school.city].filter(Boolean).join(' — '), M + 8, M + 60);
    }
    if (school.publicPhone) doc.text(`Infoline : ${school.publicPhone}`, M + 8, M + 72);

    const enrolledAt = enrollment?.enrolledAt ? formatBirthDate(enrollment.enrolledAt) : formatBirthDate(new Date());
    doc.text(`Date inscription : ${enrolledAt}`, M + W - 180, M + 48, { width: 172, align: 'right' });

    const stats = classStats || { male: 0, female: 0, total: 0 };
    doc.rect(M + W - 120, M + 62, 112, 36).stroke('#666');
    doc.fontSize(8).text('Effectif classe', M + W - 116, M + 66);
    doc.fontSize(9).text(`M: ${stats.male}   F: ${stats.female}   T: ${stats.total}`, M + W - 116, M + 80);

    doc.rect(M + W - 95, M + 102, 85, 95).stroke('#999');
    doc.fontSize(8).fillColor('#666').text('PHOTO', M + W - 90, M + 138, { width: 75, align: 'center' });

    let y = M + 108;
    const leftW = W - 110;
    doc.fontSize(10).fillColor('#0052CC').text('IDENTITÉ & SCOLARITÉ', M + 8, y);
    y += 16;

    y = drawFieldRow(doc, y, 'Mle étab.', student.matricule, M + 8, leftW);
    y = drawFieldRow(doc, y, 'Mle nat. (MEN)', student.nationalMatricule, M + 8, leftW);
    y = drawFieldRow(doc, y, 'Nom', student.lastName, M + 8, leftW);
    y = drawFieldRow(doc, y, 'Prénoms', student.firstName, M + 8, leftW);
    y = drawFieldRow(doc, y, 'Né(e) le', formatBirthDate(student.birthDate), M + 8, leftW);
    y = drawFieldRow(doc, y, 'À', student.birthPlace, M + 8, leftW);
    y = drawFieldRow(doc, y, 'Sexe', formatGenderShort(student.gender), M + 8, leftW);
    y = drawFieldRow(doc, y, 'Nationalité', student.nationality, M + 8, leftW);
    y = drawFieldRow(doc, y, 'Extrait N°', enrollment?.birthCertNumber, M + 8, leftW);
    y = drawFieldRow(doc, y, 'Date déli.', formatBirthDate(enrollment?.birthCertDate), M + 8, leftW);
    y = drawFieldRow(doc, y, 'Lieu déli.', enrollment?.birthCertPlace, M + 8, leftW);
    y = drawFieldRow(doc, y, 'Classe', student.class?.name, M + 8, leftW);
    y = drawFieldRow(doc, y, 'Statut', enrollmentStatusLabel(enrollment?.enrollmentStatus), M + 8, leftW);
    y = drawFieldRow(doc, y, 'LV2', enrollment?.lv2, M + 8, leftW);
    y = drawFieldRow(doc, y, 'Série', seriesLabel(student.series || student.class?.series), M + 8, leftW);
    y = drawFieldRow(doc, y, 'Redoublant', formatRepeatStatus(yearRecord?.repeatYear), M + 8, leftW);
    y = drawFieldRow(doc, y, 'Boursier', enrollment?.isScholarship ? 'Oui' : 'Non', M + 8, leftW);

    y += 8;
    doc.fontSize(10).fillColor('#0052CC').text('FAMILLE & PARCOURS', M + 8, y);
    y += 16;
    y = drawFieldRow(doc, y, 'Père', student.fatherName, M + 8, leftW);
    y = drawFieldRow(doc, y, 'Mère', student.motherName, M + 8, leftW);
    y = drawFieldRow(doc, y, 'Tuteur', student.guardianName, M + 8, leftW);
    y = drawFieldRow(doc, y, 'Tél. tuteur', student.guardianPhone, M + 8, leftW);
    y = drawFieldRow(doc, y, 'Contact', student.contactPhone, M + 8, leftW);
    y = drawFieldRow(doc, y, 'E-mail', student.contactEmail, M + 8, leftW);
    y = drawFieldRow(doc, y, 'N° décision', enrollment?.decisionNumber, M + 8, leftW);
    y = drawFieldRow(doc, y, 'N° transfert', enrollment?.transferRef, M + 8, leftW);
    y = drawFieldRow(doc, y, 'Étab. origine', enrollment?.previousSchool, M + 8, leftW);
    y = drawFieldRow(doc, y, 'Classe suivie', enrollment?.previousClass, M + 8, leftW);

    y = drawChecklist(doc, y + 6, documents || {});

    if (enrollment?.notes) {
      doc.fontSize(9).fillColor('#333').text(`Observations : ${enrollment.notes}`, M + 8, y, { width: W - 16 });
      y += 24;
    }

    y = Math.max(y + 10, M + 680);
    doc.fontSize(9).text('Le Secrétariat', M + 40, y);
    doc.text('Le Directeur', M + W - 120, y);
    doc.fontSize(7).fillColor('#999').text(
      `Document généré par EduConnect — ${school.name} — ${new Date().toLocaleDateString('fr-FR')}`,
      M,
      M + 730,
      { width: W, align: 'center' },
    );
  }).then((buffer) => ({ buffer, filename }));
}

module.exports = {
  generateEnrollmentFichePdf,
  enrollmentStatusLabel,
};
