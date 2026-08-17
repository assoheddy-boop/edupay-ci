const PDFDocument = require('pdfkit');
const { formatMoney } = require('../middleware/currency');
const { COMMERCIAL_PLAN } = require('../config/plans');
const { quoteSummary } = require('../utils/quoteAnswers');

const NAVY = '#0b1f4a';
const BLUE = '#0052CC';
const ORANGE = '#e86a12';
const TEXT = '#1A1A1A';
const MUTED = '#5C5C5C';
const LINE = '#D6DEE8';

function yesNo(value) {
  return value ? 'Oui' : 'Non';
}

function historyLine(answers) {
  const h = answers.history || {};
  const years = [h.year1, h.year2, h.year3]
    .map((n, i) => (n == null ? null : `N-${3 - i} : ${n}`))
    .filter(Boolean);
  return years.length ? years.join(' · ') : 'Non renseigné';
}

function buildQuotePdf(quote) {
  const answers = quote.answers || {};
  const summary = quoteSummary(answers);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.rect(0, 0, doc.page.width, 72).fill(NAVY);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(18)
      .text('EduConnect', 50, 22, { continued: true })
      .font('Helvetica').fontSize(11).text('  ·  Alliance Digitale Internationale');
    doc.fontSize(9).fillColor('#C5D4F0').text('https://educonnect-ci.com  ·  contact@educonnect.ci', 50, 46);

    let y = 96;
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(20).text('Devis — Offre Pro', 50, y);
    y = doc.y + 6;
    doc.font('Helvetica').fontSize(11).fillColor(MUTED)
      .text(COMMERCIAL_PLAN.tagline, 50, y, { width: 495 });
    y = doc.y + 16;

    doc.roundedRect(50, y, 495, 78, 8).fill('#EEF3FC');
    doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(12).text('Un seul plan : Pro', 66, y + 14);
    doc.fillColor(NAVY).fontSize(22).text(formatMoney(quote.amount || COMMERCIAL_PLAN.amount), 66, y + 32);
    doc.font('Helvetica').fontSize(10).fillColor(MUTED).text('par an, tous modules compris', 66, y + 56);
    y += 98;

    doc.moveTo(50, y).lineTo(545, y).strokeColor(LINE).stroke();
    y += 14;

    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(13).text('Établissement', 50, y);
    y = doc.y + 6;
    doc.font('Helvetica').fontSize(10.5).fillColor(TEXT);
    doc.text(`Nom : ${answers.schoolName || quote.schoolName || '—'}`, 50, y);
    doc.text(`Ville : ${answers.city || quote.city || '—'}`);
    doc.text(`Groupe scolaire : ${answers.isGroup ? (answers.groupName || 'Oui') : 'Non'}`);
    doc.text(`Effectifs : ${answers.students ?? '—'} élèves · ${answers.teachers ?? '—'} enseignants · ${answers.classes ?? '—'} classes`);
    if (answers.contact?.name || answers.contact?.email || answers.contact?.phone) {
      doc.text(`Contact : ${[answers.contact.name, answers.contact.email, answers.contact.phone].filter(Boolean).join(' · ')}`);
    }
    y = doc.y + 12;

    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(13).text('Besoins exprimés', 50, y);
    y = doc.y + 6;
    doc.font('Helvetica').fontSize(10.5).fillColor(TEXT);
    doc.text(`Vie scolaire — cantine ${yesNo(answers.life?.canteen)}, transport ${yesNo(answers.life?.transport)}, activités ${yesNo(answers.life?.activities)}, santé ${yesNo(answers.life?.health)}`, 50, y, { width: 495 });
    doc.text(`Administration — comptabilité ${yesNo(answers.admin?.accounting)}, RH ${yesNo(answers.admin?.hr)}, multi-école ${yesNo(answers.admin?.multiSchool)}`);
    doc.text(`Communication — SMS officiel ${yesNo(answers.comm?.smsOfficial)}, notifications push / e-mail ${yesNo(answers.comm?.pushEmail)}`);
    doc.text(`Historique effectifs : ${historyLine(answers)}`);
    if (answers.history?.digitalBudget) {
      doc.text(`Budget digitalisation : ${answers.history.digitalBudget}`);
    }
    y = doc.y + 12;

    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(13).text('Modules retenus', 50, y);
    y = doc.y + 6;
    doc.font('Helvetica').fontSize(10.5).fillColor(TEXT);
    summary.core.forEach((item) => doc.text(`•  ${item}`, 50));
    summary.selected.forEach((item) => doc.text(`•  ${item}`, 50));
    y = doc.y + 12;

    doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(13).text('Inclus dans l\'offre Pro', 50, y);
    y = doc.y + 6;
    doc.font('Helvetica').fontSize(10.5).fillColor(TEXT);
    summary.included.forEach((item) => doc.text(`•  ${item}`, 50));
    y = doc.y + 16;

    doc.font('Helvetica').fontSize(9).fillColor(MUTED)
      .text('Les modules sont activés par EduConnect selon votre établissement. Ce devis ne constitue pas une facture.', 50, y, { width: 495 });
    doc.text(`Référence ${quote.id}  ·  ${new Date(quote.createdAt || Date.now()).toLocaleDateString('fr-FR')}  ·  Valable 30 jours.`);
    doc.text('Éditeur : Alliance Digitale Internationale — Côte d\'Ivoire.');

    doc.end();
  });
}

module.exports = { buildQuotePdf };
