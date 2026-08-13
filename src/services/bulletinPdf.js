const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { drawDocumentHeader } = require('../utils/schoolLogo');

const bulletinsDir = path.join(__dirname, '../../uploads/bulletins');

function ensureDir() {
  if (!fs.existsSync(bulletinsDir)) {
    fs.mkdirSync(bulletinsDir, { recursive: true });
  }
}

function computeAverage(grades) {
  if (!grades.length) return 0;
  const total = grades.reduce((sum, g) => sum + (g.value / g.maxValue) * 20, 0);
  return Math.round((total / grades.length) * 100) / 100;
}

const DEFAULT_COEFFICIENTS = {
  'Mathématiques': 3,
  'Français': 3,
  'Sciences': 2,
  'Histoire-Géo': 2,
  'Anglais': 2,
  'EPS': 1,
};

function getCoefficient(subject) {
  return DEFAULT_COEFFICIENTS[subject] || 1;
}

function generateBulletinPdf({ student, school, grades, period, average, rank, classSize }) {
  ensureDir();
  const filename = `bulletin-${student.id}-${period.replace(/\s+/g, '-')}-${Date.now()}.pdf`;
  const filepath = path.join(bulletinsDir, filename);

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
    doc.text(`Matricule : ${student.matricule || '—'}`);
    doc.text(`Période : ${period}`);
    doc.moveDown();

    doc.fontSize(13).fillColor('#0052CC').text('Notes');
    doc.moveDown(0.5);

    const tableTop = doc.y;
    doc.fontSize(10).fillColor('#666');
    doc.text('Matière', 50, tableTop);
    doc.text('Coef.', 200, tableTop);
    doc.text('Note', 250, tableTop);
    doc.text('Appréciation', 320, tableTop);
    doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke('#ddd');

    let y = tableTop + 25;
    grades.forEach((g) => {
      const coef = getCoefficient(g.subject);
      doc.fillColor('#333').text(g.subject, 50, y);
      doc.text(String(coef), 200, y);
      doc.text(`${g.value} / ${g.maxValue}`, 250, y);
      doc.text(g.comment || '—', 320, y, { width: 220 });
      y += 22;
    });

    doc.moveDown(2);
    doc.fontSize(12).fillColor('#0052CC');
    doc.text(`Moyenne générale : ${average.toFixed(2)} / 20`);
    if (rank && classSize) {
      doc.text(`Rang : ${rank}e / ${classSize}`);
    }

    doc.moveDown(2);
    doc.fontSize(9).fillColor('#999').text(
      `Document généré le ${new Date().toLocaleDateString('fr-FR')} — ${school.name}`,
      { align: 'center' },
    );

    doc.end();

    stream.on('finish', () => resolve({ filepath, filename, pdfUrl: `/uploads/bulletins/${filename}` }));
    stream.on('error', reject);
  });
}

module.exports = { generateBulletinPdf, computeAverage, ensureDir, getCoefficient };
