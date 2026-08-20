const { drawDocumentHeader } = require('../utils/schoolLogo');
const { renderPdfToBuffer } = require('../utils/pdfOutput');
const { formatBirthDate } = require('../utils/bulletinCiLayout');
const { enrollmentStatusLabel } = require('./enrollmentPdf');

function cityLine(school) {
  return [school.address, school.city].filter(Boolean).join(', ') || school.city || 'Côte d\'Ivoire';
}

function generateCertificatScolaritePdf({ school, schoolYear, student }) {
  const filename = `certificat-scolarite-${student.id}.pdf`;
  const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  return renderPdfToBuffer((doc) => {
    drawDocumentHeader(doc, school, { title: 'CERTIFICAT DE SCOLARITÉ' });

    doc.moveDown();
    doc.fontSize(11).fillColor('#333');
    doc.text(`Année scolaire : ${schoolYear}`, { align: 'center' });
    doc.moveDown(1.5);

    const body = [
      'Je soussigné(e), Directeur(trice) de l\'établissement ci-dessus, certifie que :',
      '',
      `Nom et prénoms : ${student.lastName} ${student.firstName}`,
      student.nationalMatricule ? `Matricule national (MEN) : ${student.nationalMatricule}` : null,
      student.matricule ? `Matricule établissement : ${student.matricule}` : null,
      student.birthDate ? `Né(e) le : ${formatBirthDate(student.birthDate)}${student.birthPlace ? ` à ${student.birthPlace}` : ''}` : null,
      student.gender ? `Sexe : ${student.gender === 'F' ? 'Féminin' : 'Masculin'}` : null,
      '',
      `Est régulièrement inscrit(e) en classe de ${student.class?.name || '—'} pour l'année scolaire ${schoolYear}.`,
      '',
      'En foi de quoi, le présent certificat est délivré pour servir et valoir ce que de droit.',
    ].filter((line) => line !== null);

    body.forEach((line) => {
      if (line === '') doc.moveDown(0.5);
      else doc.text(line, { align: 'justify', lineGap: 2 });
    });

    doc.moveDown(2);
    doc.text(`Fait à ${school.city || 'Abidjan'}, le ${today}`, { align: 'right' });
    doc.moveDown(3);
    doc.text('Le Directeur', { align: 'right' });
    doc.fontSize(9).fillColor('#999').text(`${cityLine(school)}`, { align: 'center' });
  }).then((buffer) => ({ buffer, filename }));
}

function generateAttestationInscriptionPdf({ school, schoolYear, student, enrollment }) {
  const filename = `attestation-inscription-${student.id}.pdf`;
  const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const enrolledAt = enrollment?.enrolledAt
    ? new Date(enrollment.enrolledAt).toLocaleDateString('fr-FR')
    : today;

  return renderPdfToBuffer((doc) => {
    drawDocumentHeader(doc, school, { title: 'ATTESTATION D\'INSCRIPTION' });

    doc.moveDown();
    doc.fontSize(11).fillColor('#333');
    doc.text(`Année scolaire : ${schoolYear}`, { align: 'center' });
    doc.moveDown(1.5);

    const status = enrollmentStatusLabel(enrollment?.enrollmentStatus);
    const lines = [
      'Je soussigné(e), Directeur(trice) de l\'établissement ci-dessus, atteste que :',
      '',
      `L'élève ${student.lastName} ${student.firstName}`,
      student.nationalMatricule ? `(Matricule national : ${student.nationalMatricule})` : null,
      '',
      `A été inscrit(e) au titre de : ${status}`,
      `En classe de : ${student.class?.name || '—'}`,
      `Date d'inscription : ${enrolledAt}`,
      enrollment?.previousSchool ? `Provenance : ${enrollment.previousSchool}` : null,
      '',
      'La présente attestation est délivrée à la demande de l\'intéressé(e) pour les usages administratifs.',
    ].filter(Boolean);

    lines.forEach((line) => {
      if (line === '') doc.moveDown(0.5);
      else doc.text(line, { align: 'justify', lineGap: 2 });
    });

    doc.moveDown(2);
    doc.text(`Fait à ${school.city || 'Abidjan'}, le ${today}`, { align: 'right' });
    doc.moveDown(3);
    doc.text('Le Secrétariat', { align: 'right' });
  }).then((buffer) => ({ buffer, filename }));
}

module.exports = {
  generateCertificatScolaritePdf,
  generateAttestationInscriptionPdf,
};
