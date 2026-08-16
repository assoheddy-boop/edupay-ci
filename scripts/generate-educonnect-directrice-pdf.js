/**
 * Présentation EduConnect à l'attention d'une directrice / d'un directeur.
 * Usage : node scripts/generate-educonnect-directrice-pdf.js
 */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const BLUE = '#0052CC';
const BLUE_DARK = '#003D99';
const BLUE_SOFT = '#E8F0FE';
const BLUE_MID = '#D0E2FF';
const TEXT = '#1A1A1A';
const GRAY = '#3D3D3D';
const MUTED = '#5C5C5C';
const LINE = '#D6DEE8';
const WHITE = '#FFFFFF';
const GREEN = '#0F7B3A';
const GREEN_SOFT = '#E6F4EA';
const ORANGE = '#C05621';
const ORANGE_SOFT = '#FCEEE6';
const AMBER = '#B45309';
const AMBER_SOFT = '#FEF3C7';

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 52;
const CONTENT_W = PAGE_W - MARGIN * 2;
const HEADER_H = 42;
const FOOTER_Y = PAGE_H - 34;
const BOTTOM = 760;

const OUTPUT = path.join(__dirname, '..', 'docs', 'EduConnect-Presentation-directrice.pdf');
const BUREAU = path.join(
  process.env.USERPROFILE || '',
  'OneDrive',
  'Bureau',
  'EduConnect-Presentation-directrice.pdf'
);
const BUREAU_V3 = BUREAU.replace(/\.pdf$/i, '-v3.pdf');

const URL = 'https://educonnect-assoheddy-boops-projects.vercel.app';
const CONTACT = 'contact@educonnect.ci';
const DOC_DATE = 'Août 2026';
const FOOTER_LABEL = 'EduConnect — Présentation à l\'attention de la direction — août 2026';

const FONT_CANDIDATES = [
  { reg: 'C:\\Windows\\Fonts\\arial.ttf', bold: 'C:\\Windows\\Fonts\\arialbd.ttf' },
  { reg: 'C:\\Windows\\Fonts\\calibri.ttf', bold: 'C:\\Windows\\Fonts\\calibrib.ttf' },
];

function asciiFallback(str) {
  return String(str)
    .replace(/[éèêë]/g, 'e')
    .replace(/[ÉÈÊË]/g, 'E')
    .replace(/[àâä]/g, 'a')
    .replace(/[ÀÂÄ]/g, 'A')
    .replace(/[ôö]/g, 'o')
    .replace(/[ÔÖ]/g, 'O')
    .replace(/[ùûü]/g, 'u')
    .replace(/[ÙÛÜ]/g, 'U')
    .replace(/[ç]/g, 'c')
    .replace(/[Ç]/g, 'C')
    .replace(/[îï]/g, 'i')
    .replace(/[ÎÏ]/g, 'I')
    .replace(/[œ]/g, 'oe')
    .replace(/[Œ]/g, 'OE')
    .replace(/[—–]/g, '-')
    .replace(/[«»]/g, '"')
    .replace(/['']/g, "'");
}

function setupFonts(doc) {
  for (const { reg, bold } of FONT_CANDIDATES) {
    if (fs.existsSync(reg) && fs.existsSync(bold)) {
      try {
        doc.registerFont('Body', reg);
        doc.registerFont('Body-Bold', bold);
        return { reg: 'Body', bold: 'Body-Bold', unicode: true, file: reg };
      } catch (_) {
        /* try next */
      }
    }
  }
  return { reg: 'Helvetica', bold: 'Helvetica-Bold', unicode: false, file: 'builtin' };
}

function t(str, fonts) {
  return fonts.unicode ? String(str) : asciiFallback(str);
}

function drawLogoMark(doc, fonts, x, y, size) {
  const r = 6;
  doc.save();
  doc.roundedRect(x, y, size, size, r).fill(BLUE);
  doc.fillColor(WHITE).font(fonts.bold).fontSize(size * 0.38);
  doc.text('EC', x, y + size * 0.28, { width: size, align: 'center', lineBreak: false });
  doc.restore();
}

function drawCover(doc, fonts) {
  doc.rect(0, 0, PAGE_W, PAGE_H).fill(WHITE);
  doc.rect(0, 0, PAGE_W, 8).fill(BLUE);
  doc.rect(0, PAGE_H - 72, PAGE_W, 72).fill(BLUE_DARK);

  drawLogoMark(doc, fonts, PAGE_W / 2 - 28, 88, 56);

  doc.fillColor(BLUE).font(fonts.bold).fontSize(11);
  doc.text(t('Côte d\'Ivoire  ·  Wave & Orange Money', fonts), MARGIN, 168, {
    width: CONTENT_W,
    align: 'center',
  });

  doc.fillColor(TEXT).font(fonts.bold).fontSize(32);
  doc.text(t('EduConnect', fonts), MARGIN, 198, { width: CONTENT_W, align: 'center' });

  doc.fillColor(BLUE).font(fonts.reg).fontSize(14);
  doc.text(t('La plateforme de gestion scolaire', fonts), MARGIN, 248, {
    width: CONTENT_W,
    align: 'center',
  });
  doc.text(t('conçue pour les établissements ivoiriens', fonts), MARGIN, doc.y + 2, {
    width: CONTENT_W,
    align: 'center',
  });

  doc.save();
  doc.roundedRect(MARGIN + 40, 318, CONTENT_W - 80, 52, 6).fill(BLUE_SOFT);
  doc.restore();
  doc.fillColor(BLUE_DARK).font(fonts.bold).fontSize(11);
  doc.text(
    t('Document à l\'attention des directrices et directeurs d\'établissement', fonts),
    MARGIN + 50,
    336,
    { width: CONTENT_W - 100, align: 'center' }
  );

  const pillars = [
    ['Paiements', 'Wave / Orange Money,\npreuve et validation'],
    ['Vie scolaire', 'Appel, notes, bulletins,\nparents informés'],
    ['Pilotage', 'RH, comptabilité,\nmulti-campus'],
  ];
  const boxW = (CONTENT_W - 24) / 3;
  let x = MARGIN;
  pillars.forEach(([title, desc], i) => {
    const bx = x + i * (boxW + 12);
    doc.save();
    doc.roundedRect(bx, 400, boxW, 92, 5).strokeColor(BLUE).lineWidth(1).stroke();
    doc.restore();
    doc.fillColor(BLUE).font(fonts.bold).fontSize(11);
    doc.text(t(title, fonts), bx + 10, 414, { width: boxW - 20, align: 'center' });
    doc.fillColor(GRAY).font(fonts.reg).fontSize(9);
    doc.text(t(desc, fonts), bx + 10, 436, { width: boxW - 20, align: 'center', lineGap: 2 });
  });

  doc.fillColor(MUTED).font(fonts.reg).fontSize(10);
  doc.text(t('Contrairement aux solutions limitées aux paiements, EduConnect relie', fonts), MARGIN, 520, {
    width: CONTENT_W,
    align: 'center',
  });
  doc.text(t('l\'encaissement, la classe, la famille et l\'administration.', fonts), MARGIN, doc.y + 2, {
    width: CONTENT_W,
    align: 'center',
  });
  doc.fillColor(BLUE_DARK).font(fonts.reg).fontSize(10);
  doc.text(t('Coupure réseau ou courant : l\'appel, les notes et les devoirs restent possibles hors ligne.', fonts), MARGIN, 568, {
    width: CONTENT_W,
    align: 'center',
  });

  doc.fillColor(WHITE).font(fonts.reg).fontSize(10);
  doc.text(t(`${URL}   ·   ${CONTACT}`, fonts), MARGIN, PAGE_H - 48, {
    width: CONTENT_W,
    align: 'center',
  });
  doc.fontSize(9);
  doc.text(t(DOC_DATE, fonts), MARGIN, PAGE_H - 32, { width: CONTENT_W, align: 'center' });
}

function drawInnerChrome(doc, fonts, pageNum, totalPages) {
  doc.save();
  doc.rect(0, 0, PAGE_W, HEADER_H).fill(BLUE);
  doc.fillColor(WHITE).font(fonts.bold).fontSize(10);
  doc.text(t('EduConnect', fonts), MARGIN, 15, { lineBreak: false });
  doc.font(fonts.reg).fontSize(8);
  doc.text(t('Présentation direction', fonts), MARGIN, 16, {
    width: CONTENT_W,
    align: 'right',
    lineBreak: false,
  });
  doc.restore();

  doc.save();
  doc.strokeColor(LINE).lineWidth(0.6);
  doc.moveTo(MARGIN, FOOTER_Y - 8).lineTo(PAGE_W - MARGIN, FOOTER_Y - 8).stroke();
  doc.fillColor(MUTED).font(fonts.reg).fontSize(8);
  doc.text(t(FOOTER_LABEL, fonts), MARGIN, FOOTER_Y, {
    width: CONTENT_W - 50,
    lineBreak: false,
  });
  doc.text(`${pageNum} / ${totalPages}`, MARGIN, FOOTER_Y, {
    width: CONTENT_W,
    align: 'right',
    lineBreak: false,
  });
  doc.restore();
}

function ensureSpace(ctx, needed) {
  if (ctx.y + needed > BOTTOM) {
    ctx.doc.addPage();
    ctx.page += 1;
    ctx.y = HEADER_H + 22;
  }
  return ctx.y;
}

function sectionTitle(ctx, title) {
  ensureSpace(ctx, 40);
  const { doc, fonts } = ctx;
  doc.fillColor(TEXT).font(fonts.bold).fontSize(16);
  doc.text(t(title, fonts), MARGIN, ctx.y, { width: CONTENT_W });
  ctx.y = doc.y + 5;
  doc.strokeColor(BLUE).lineWidth(2.2);
  doc.moveTo(MARGIN, ctx.y).lineTo(MARGIN + 56, ctx.y).stroke();
  ctx.y += 14;
}

function subTitle(ctx, title) {
  ensureSpace(ctx, 28);
  const { doc, fonts } = ctx;
  doc.fillColor(BLUE).font(fonts.bold).fontSize(11.5);
  doc.text(t(title, fonts), MARGIN, ctx.y, { width: CONTENT_W });
  ctx.y = doc.y + 6;
}

function para(ctx, text, opts = {}) {
  const { doc, fonts } = ctx;
  doc.font(fonts.reg).fontSize(opts.size || 10);
  const h = doc.heightOfString(t(text, fonts), {
    width: CONTENT_W - (opts.indent || 0),
    lineGap: opts.lineGap || 2.5,
  });
  ensureSpace(ctx, h + 8);
  doc.fillColor(opts.color || GRAY).font(fonts.reg).fontSize(opts.size || 10);
  doc.text(t(text, fonts), MARGIN + (opts.indent || 0), ctx.y, {
    width: CONTENT_W - (opts.indent || 0),
    lineGap: opts.lineGap || 2.5,
    align: opts.align || 'left',
  });
  ctx.y = doc.y + (opts.after ?? 8);
}

function bullet(ctx, text) {
  const { doc, fonts } = ctx;
  doc.font(fonts.reg).fontSize(10);
  const h = doc.heightOfString(t(text, fonts), { width: CONTENT_W - 18, lineGap: 2 });
  ensureSpace(ctx, h + 8);
  doc.circle(MARGIN + 4, ctx.y + 6, 2.2).fill(BLUE);
  doc.fillColor(GRAY).font(fonts.reg).fontSize(10);
  doc.text(t(text, fonts), MARGIN + 16, ctx.y, { width: CONTENT_W - 16, lineGap: 2 });
  ctx.y = doc.y + 5;
}

function numbered(ctx, num, text) {
  const { doc, fonts } = ctx;
  doc.font(fonts.reg).fontSize(10);
  const h = doc.heightOfString(t(text, fonts), { width: CONTENT_W - 22, lineGap: 2 });
  ensureSpace(ctx, h + 10);
  doc.fillColor(BLUE).font(fonts.bold).fontSize(10);
  doc.text(`${num}.`, MARGIN, ctx.y, { lineBreak: false });
  doc.fillColor(GRAY).font(fonts.reg).fontSize(10);
  doc.text(t(text, fonts), MARGIN + 20, ctx.y, { width: CONTENT_W - 20, lineGap: 2 });
  ctx.y = doc.y + 6;
}

function callout(ctx, title, text, bg = BLUE_SOFT) {
  const { doc, fonts } = ctx;
  const pad = 12;
  doc.font(fonts.bold).fontSize(10);
  const th = doc.heightOfString(t(title, fonts), { width: CONTENT_W - pad * 2 });
  doc.font(fonts.reg).fontSize(10);
  const bh = doc.heightOfString(t(text, fonts), { width: CONTENT_W - pad * 2, lineGap: 2.5 });
  const boxH = pad + th + 6 + bh + pad;
  ensureSpace(ctx, boxH + 10);
  const y = ctx.y;
  doc.save();
  doc.roundedRect(MARGIN, y, CONTENT_W, boxH, 5).fill(bg);
  doc.restore();
  doc.fillColor(BLUE_DARK).font(fonts.bold).fontSize(10);
  doc.text(t(title, fonts), MARGIN + pad, y + pad, { width: CONTENT_W - pad * 2 });
  doc.fillColor(GRAY).font(fonts.reg).fontSize(10);
  doc.text(t(text, fonts), MARGIN + pad, y + pad + th + 6, {
    width: CONTENT_W - pad * 2,
    lineGap: 2.5,
  });
  ctx.y = y + boxH + 12;
}

function twoColBoxes(ctx, left, right) {
  const { doc, fonts } = ctx;
  const gap = 10;
  const colW = (CONTENT_W - gap) / 2;
  const pad = 10;
  const innerW = colW - pad * 2;
  const titleH = 22;

  function bodyHeight(box) {
    let h = 0;
    doc.font(fonts.reg).fontSize(8.6);
    box.items.forEach((item) => {
      h += doc.heightOfString(t(item, fonts), { width: innerW - 12, lineGap: 1.6 }) + 6;
    });
    return h;
  }

  const h = titleH + pad + Math.max(bodyHeight(left), bodyHeight(right)) + pad;
  ensureSpace(ctx, h + 12);
  const y = ctx.y;

  function paint(box, x) {
    doc.save();
    doc.roundedRect(x, y, colW, h, 5).fill(box.bg || BLUE_SOFT);
    doc.restore();
    doc.save();
    doc.roundedRect(x, y, colW, titleH, 5).fill(box.head || BLUE);
    doc.rect(x, y + titleH - 6, colW, 6).fill(box.head || BLUE);
    doc.restore();
    doc.fillColor(WHITE).font(fonts.bold).fontSize(9);
    doc.text(t(box.title, fonts), x + pad, y + 6, { width: innerW, lineBreak: false });
    let ty = y + titleH + pad;
    box.items.forEach((item) => {
      doc.circle(x + pad + 3, ty + 5, 1.8).fill(box.dot || BLUE);
      doc.fillColor(GRAY).font(fonts.reg).fontSize(8.6);
      doc.text(t(item, fonts), x + pad + 12, ty, { width: innerW - 12, lineGap: 1.6 });
      ty = doc.y + 6;
    });
  }

  paint(left, MARGIN);
  paint(right, MARGIN + colW + gap);
  ctx.y = y + h + 12;
}

function statusPills(ctx, pills) {
  const { doc, fonts } = ctx;
  ensureSpace(ctx, 28);
  let x = MARGIN;
  const y = ctx.y;
  pills.forEach((pill) => {
    doc.font(fonts.bold).fontSize(8.5);
    const w = Math.min(doc.widthOfString(t(pill.label, fonts)) + 16, 170);
    doc.save();
    doc.roundedRect(x, y, w, 16, 8).fill(pill.bg);
    doc.restore();
    doc.fillColor(pill.fg).font(fonts.bold).fontSize(8.5);
    doc.text(t(pill.label, fonts), x + 8, y + 3.5, { width: w - 16, lineBreak: false });
    x += w + 8;
  });
  ctx.y = y + 24;
}

function kvLine(ctx, key, value) {
  const { doc, fonts } = ctx;
  ensureSpace(ctx, 18);
  doc.fillColor(TEXT).font(fonts.bold).fontSize(10);
  doc.text(t(`${key}  `, fonts), MARGIN, ctx.y, { continued: true, width: CONTENT_W });
  doc.fillColor(GRAY).font(fonts.reg).fontSize(10);
  doc.text(t(value, fonts), { lineGap: 2, width: CONTENT_W });
  ctx.y = doc.y + 5;
}

function moduleBlock(ctx, mod) {
  const { doc, fonts } = ctx;
  const pad = 10;
  const innerW = CONTENT_W - pad * 2;
  doc.font(fonts.bold).fontSize(11);
  const titleH = doc.heightOfString(t(mod.title, fonts), { width: innerW });
  doc.font(fonts.reg).fontSize(9.5);
  const parts = [mod.purpose, `Qui l'utilise : ${mod.who}`, `Exemple : ${mod.example}`];
  if (mod.note) parts.push(mod.note);
  const body = parts.join('\n');
  const bodyH = doc.heightOfString(t(body, fonts), { width: innerW, lineGap: 2.2 });
  const tagH = 16;
  const boxH = pad + titleH + 4 + tagH + 4 + bodyH + pad;
  ensureSpace(ctx, boxH + 8);
  const y = ctx.y;
  doc.save();
  doc.roundedRect(MARGIN, y, CONTENT_W, boxH, 5).fill(WHITE);
  doc.roundedRect(MARGIN, y, CONTENT_W, boxH, 5).strokeColor(BLUE_MID).lineWidth(1).stroke();
  doc.rect(MARGIN, y, 4, boxH).fill(BLUE);
  doc.restore();

  let ty = y + pad;
  doc.fillColor(TEXT).font(fonts.bold).fontSize(11);
  doc.text(t(mod.title, fonts), MARGIN + pad + 4, ty, { width: innerW - 4 });
  ty = doc.y + 4;

  const tag = mod.plan;
  doc.font(fonts.reg).fontSize(8);
  const tagW = Math.min(doc.widthOfString(t(tag, fonts)) + 12, innerW);
  doc.save();
  doc.roundedRect(MARGIN + pad + 4, ty, tagW, 13, 3).fill(BLUE_SOFT);
  doc.restore();
  doc.fillColor(BLUE).font(fonts.reg).fontSize(8);
  doc.text(t(tag, fonts), MARGIN + pad + 8, ty + 2, { width: tagW - 8, lineBreak: false });
  ty += tagH;

  doc.fillColor(GRAY).font(fonts.reg).fontSize(9.5);
  doc.text(t(body, fonts), MARGIN + pad + 4, ty, { width: innerW - 4, lineGap: 2.2 });
  ctx.y = y + boxH + 9;
}

function drawMatrix(ctx, rows) {
  const { doc, fonts } = ctx;
  const colW = [CONTENT_W - 168, 42, 42, 42, 42];
  const rowH = 16;
  const tableH = rows.length * rowH + 4;
  ensureSpace(ctx, tableH + 8);
  let y = ctx.y;
  rows.forEach((row, i) => {
    if (i === 0) {
      doc.save();
      doc.rect(MARGIN, y, CONTENT_W, rowH).fill(BLUE);
      doc.restore();
    } else if (i % 2 === 0) {
      doc.save();
      doc.rect(MARGIN, y, CONTENT_W, rowH).fill(BLUE_SOFT);
      doc.restore();
    }
    let x = MARGIN + 6;
    row.forEach((cell, c) => {
      const isHead = i === 0;
      doc.fillColor(isHead ? WHITE : TEXT).font(isHead || c === 0 ? fonts.bold : fonts.reg).fontSize(8);
      const label = cell === 'oui' ? 'oui' : cell;
      doc.text(t(label, fonts), x, y + 4, { width: colW[c] - 4, lineBreak: false });
      x += colW[c];
    });
    y += rowH;
  });
  ctx.y = y + 10;
}

function planCard(ctx, plan) {
  const { doc, fonts } = ctx;
  ensureSpace(ctx, 118);
  const y = ctx.y;
  const h = plan.highlight ? 128 : 118;
  doc.save();
  if (plan.highlight) {
    doc.roundedRect(MARGIN, y, CONTENT_W, h, 6).fill(BLUE_SOFT);
    doc.roundedRect(MARGIN, y, CONTENT_W, h, 6).strokeColor(BLUE).lineWidth(1.4).stroke();
  } else {
    doc.roundedRect(MARGIN, y, CONTENT_W, h, 6).strokeColor(LINE).lineWidth(1).stroke();
  }
  doc.restore();

  doc.fillColor(BLUE).font(fonts.bold).fontSize(13);
  doc.text(t(plan.name, fonts), MARGIN + 14, y + 12, { width: 220, lineBreak: false });
  if (plan.badge) {
    doc.fillColor(BLUE).font(fonts.bold).fontSize(8);
    doc.text(t(plan.badge, fonts), MARGIN, y + 14, { width: CONTENT_W - 14, align: 'right' });
  }
  doc.fillColor(TEXT).font(fonts.bold).fontSize(16);
  doc.text(t(plan.price, fonts), MARGIN + 14, y + 32, { width: CONTENT_W - 28 });
  doc.fillColor(MUTED).font(fonts.reg).fontSize(9);
  doc.text(t(plan.period, fonts), MARGIN + 14, doc.y + 1, { width: CONTENT_W - 28 });
  doc.fillColor(GRAY).font(fonts.reg).fontSize(9.5);
  doc.text(t(plan.limits, fonts), MARGIN + 14, y + 72, { width: CONTENT_W - 28 });
  doc.text(t(plan.modules, fonts), MARGIN + 14, doc.y + 3, {
    width: CONTENT_W - 28,
    lineGap: 1.5,
  });
  ctx.y = y + h + 10;
}

function writeContent(ctx) {
  const { fonts } = ctx;

  // —— 2. Sommaire ——
  ctx.doc.addPage();
  ctx.page += 1;
  ctx.y = HEADER_H + 22;
  sectionTitle(ctx, 'Sommaire');
  para(ctx, 'Ce document décrit EduConnect tel qu\'il fonctionne aujourd\'hui — modules réellement en service, pas une liste de souhaits. Il s\'adresse à une direction d\'école primaire, collège ou groupe scolaire en Côte d\'Ivoire.');

  const toc = [
    '1.  Ce que cela change pour une directrice',
    '2.  Les cinq espaces (école, enseignant, parent, groupe, administration)',
    '3.  Tous les modules, un par un',
    '4.  L\'appel numérique (Présent / Retard / Absent)',
    '5.  Les paiements Wave et Orange Money',
    '6.  Mode hors-ligne — coupures réseau et courant',
    '7.  Les offres (Essentiel, Premium, Pro, Groupe)',
    '8.  Sécurité et données',
    '9.  Comment démarrer',
  ];
  toc.forEach((line) => bullet(ctx, line));

  callout(
    ctx,
    'En une phrase',
    'EduConnect relie ce que les familles paient déjà (Wave, Orange Money) à ce que la direction doit suivre au quotidien : présence, notes, bulletins, équipe et trésorerie — dans un seul espace, en français, en FCFA.'
  );

  // —— 3. Ce que ça change ——
  ctx.doc.addPage();
  ctx.page += 1;
  ctx.y = HEADER_H + 22;
  sectionTitle(ctx, '1.  Ce que cela change pour une directrice');
  para(ctx, 'Une direction d\'école ivoirienne passe souvent la journée entre le cahier d\'appel, les messages WhatsApp des parents, les reçus Wave et un tableur de caisse. EduConnect rassemble ces fils sans imposer un logiciel pensé pour un autre pays.');

  subTitle(ctx, 'Trois questions, une réponse le jour même');
  bullet(ctx, 'Qui a payé la scolarité de septembre ? Le parent envoie la capture ; vous validez. Le statut n\'est plus « on verra demain ».');
  bullet(ctx, 'Qui était en retard ce matin en CM2 A ? L\'enseignant a marqué Retard. Le parent est notifié. Vous le voyez sans ouvrir un cahier.');
  bullet(ctx, 'Qui de l\'équipe est en congé, et la paie du mois ? Le module RH (plan Pro) tient dossiers, congés et bulletins de salaire.');
  bullet(ctx, 'Le réseau tombe ou le courant saute pendant l\'appel ? L\'enseignant enregistre sur le téléphone ; dès que la 4G revient, tout part tout seul (détail en section 6).');

  subTitle(ctx, 'Ce que les outils de paiement seuls ne font pas');
  para(ctx, 'Un portail qui ne fait qu\'encaisser les frais laisse la vie scolaire ailleurs : notes sur papier, absences dans un cahier, RH dans un classeur. EduConnect part du paiement mobile que les familles utilisent déjà, et y ajoute la classe, la famille et l\'administration.');

  callout(
    ctx,
    'Ce que nous ne promettons pas',
    'Pas de chiffres d\'écoles « déjà connectées » gonflés, pas de taux de disponibilité inventé. Le produit est en déploiement, notamment auprès d\'établissements EPV à Abidjan et Bingerville. L\'intérêt est le quotidien : moins de relances, plus de visibilité.'
  );

  para(ctx, 'L\'enfant n\'a pas de compte ni d\'écran. La famille reçoit l\'essentiel (notes, absences, paiements). L\'enseignant a trois gros boutons pour l\'appel. La directrice pilote depuis un tableau de bord : classes, élèves, enseignants, paiements en attente.');

  // —— 4. Espaces ——
  ctx.doc.addPage();
  ctx.page += 1;
  ctx.y = HEADER_H + 22;
  sectionTitle(ctx, '2.  Cinq espaces, un même établissement');

  subTitle(ctx, 'Directrice / administration de l\'école');
  para(ctx, 'Après connexion, le tableau de bord affiche le nombre de classes, d\'élèves, d\'enseignants et les paiements en attente de validation. Vous créez les classes (CP, CE1, CM2, 6e…), importez les élèves (fichier CSV), invitez les enseignants avec un code école, renseignez vos numéros Wave et Orange Money, définissez les types de frais, validez les preuves de paiement, générez les bulletins, consultez statistiques et comptabilité selon le plan.');

  subTitle(ctx, 'Enseignant');
  para(ctx, 'L\'enseignant voit ses classes, saisit les notes (y compris en lot), fait l\'appel du jour, publie les devoirs, signale un incident de santé ou un point de comportement, note le transport ou la cantine, et — en plan Pro — consulte son espace RH (congés, pointage, fiches de paie).');

  subTitle(ctx, 'Parent');
  para(ctx, 'Le parent crée un compte, lie ses enfants, paie en envoyant une capture Wave ou Orange Money, consulte notes, absences, devoirs, menus, santé et autorisations de sortie. Il gère aussi ses consentements (données, photos, santé, communications). Pas d\'application séparée pour « juste les notes ».');

  subTitle(ctx, 'Groupe scolaire');
  para(ctx, 'Pour plusieurs campus : tableau de bord consolidé (élèves, recettes, absences), vue par établissement, circulars internes, finance et RH de groupe, comparaison entre campus, export. Les modules peuvent être activés campus par campus.');

  subTitle(ctx, 'Administration EduConnect (super admin)');
  para(ctx, 'Espace interne : écoles, organisations, plans d\'abonnement, activation des modules école par école, reporting, audit. Ce n\'est pas l\'espace de la directrice au quotidien ; il garantit que votre établissement n\'a que les modules de votre offre.');

  // —— 5. Modules ——
  ctx.doc.addPage();
  ctx.page += 1;
  ctx.y = HEADER_H + 22;
  sectionTitle(ctx, '3.  Tous les modules');
  para(ctx, 'Chaque module ci-dessous existe dans la plateforme et peut être activé ou désactivé pour votre école. L\'offre Essentiel en couvre déjà six. Les autres s\'ajoutent en Premium, Pro ou Groupe.');

  const modules = [
    {
      title: 'Paiements Wave / Orange Money',
      plan: 'Essentiel · cœur de l\'offre',
      purpose: 'Encaisser scolarité, cantine ou autres frais sans API bancaire : le parent paie sur son téléphone, envoie la preuve, l\'école valide.',
      who: 'Parent (déclare et téléverse) ; direction (valide ou refuse).',
      example: 'Scolarité de septembre, 45 000 FCFA, payée par Wave vers le numéro de l\'école. Capture envoyée le soir ; validation le lendemain matin.',
      note: 'Il ne s\'agit pas d\'un prélèvement automatique Wave. Le flux réel est décrit en section 5.',
    },
    {
      title: 'Notes',
      plan: 'Essentiel · cœur de l\'offre',
      purpose: 'Saisir les notes par matière et les rendre visibles aux parents, sans attendre la réunion de fin de trimestre.',
      who: 'Enseignant (saisie unitaire ou en lot) ; parent (consultation).',
      example: 'Composition de français en CM2 A : 14/20 pour Aya Kouassi. Le parent le voit dans son espace, pas dans un cahier ramené le vendredi.',
    },
    {
      title: 'Absences et retards',
      plan: 'Essentiel',
      purpose: 'Suivre Présent, Retard et Absent. Les retards et absences notifient les parents.',
      who: 'Enseignant (appel et signalements) ; parent (suivi) ; direction (vue d\'ensemble).',
      example: 'Jean Yao arrive à 7 h 40 en CE2. L\'enseignante marque Retard. Le parent reçoit l\'alerte dans l\'application (et par SMS si le canal est configuré).',
      note: 'L\'appel à trois boutons est détaillé en section 4.',
    },
    {
      title: 'Bulletins PDF',
      plan: 'Essentiel',
      purpose: 'Générer les bulletins au format PDF, élève par élève ou pour toute une classe.',
      who: 'Direction (génération et export) ; familles (remise papier ou fichier).',
      example: 'Fin du premier trimestre, bulletins de la 6e A produits en lot, au nom de l\'école, prêts à imprimer ou à transmettre.',
    },
    {
      title: 'Messages',
      plan: 'Essentiel',
      purpose: 'Échanger entre école, enseignants et parents, avec pièces jointes (document ou audio).',
      who: 'Direction, enseignant, parent — chacun dans son espace.',
      example: 'La maîtresse de CP envoie un message aux parents : réunion mercredi 16 h, pièce jointe le mot d\'ordre.',
    },
    {
      title: 'Devoirs',
      plan: 'Essentiel',
      purpose: 'Publier les devoirs pour que les parents les voient, avec pièce jointe si besoin.',
      who: 'Enseignant (publication) ; parent (consultation).',
      example: 'Devoir de mathématiques CE1 : exercices 4 et 5, photo du tableau jointe. Visible le soir sur le téléphone du parent.',
    },
    {
      title: 'Transport',
      plan: 'Premium',
      purpose: 'Enregistrer les étapes du trajet : monté dans le bus, arrivé à l\'école, sorti, récupéré. Le parent suit ces événements.',
      who: 'Personnel / enseignant (saisie) ; parent (consultation).',
      example: 'Le car de Yopougon : « Monté dans le bus » à 6 h 45, « Arrivé à l\'école » à 7 h 20. Ce n\'est pas un suivi GPS en direct, mais un journal d\'événements fiable.',
    },
    {
      title: 'Cantine',
      plan: 'Premium',
      purpose: 'Publier les menus et noter les présences au repas.',
      who: 'Direction (menus) ; enseignant (présences repas) ; parent (consultation du menu).',
      example: 'Menu du mardi : riz-sauce graine. La cantine marque les élèves présents ; le parent sait ce qui est servi.',
    },
    {
      title: 'Badges et comportement',
      plan: 'Premium',
      purpose: 'Noter le positif et le négatif, attribuer des badges (ponctualité, travail, participation, propreté, comportement).',
      who: 'Enseignant (saisie) ; parent (information).',
      example: 'Badge « Travail bien fait » pour Fatou Diallo en CM1, visible par la famille — pas seulement un mot dans le carnet.',
    },
    {
      title: 'Santé',
      plan: 'Premium',
      purpose: 'Signaler un incident de santé à l\'école ; les parents sont alertés.',
      who: 'Enseignant (signalement) ; parent (consultation).',
      example: 'Fièvre en classe de CP. Le signalement part ; le parent peut venir chercher l\'enfant. Les données de santé relèvent d\'un consentement parent dédié.',
    },
    {
      title: 'Sortie d\'école (QR)',
      plan: 'Premium',
      purpose: 'Le parent autorise une personne à récupérer l\'enfant ; un code QR est généré. L\'école le scanne / le saisit à la sortie.',
      who: 'Parent (autorisation) ; direction / accueil (validation).',
      example: 'La tante vient chercher l\'élève à 16 h. Le parent a créé l\'autorisation. À la grille, le QR est validé une fois, puis il n\'est plus réutilisable.',
    },
    {
      title: 'Activités extrascolaires',
      plan: 'Premium',
      purpose: 'Créer des activités (danse, football, soutien) et inscrire les enfants depuis l\'espace parent.',
      who: 'Direction (offre) ; parent (inscription).',
      example: 'Club football du mercredi, 5 000 FCFA le mois. Le parent inscrit son fils de CE2 depuis son téléphone.',
    },
    {
      title: 'Objets perdus',
      plan: 'Premium',
      purpose: 'Photographier un objet trouvé et le marquer comme réclamé.',
      who: 'Direction / vie scolaire ; familles informées via l\'école.',
      example: 'Gourde bleue trouvée en cour de CM2, photo enregistrée. Le parent la reconnaît et l\'école la restitue.',
    },
    {
      title: 'Statistiques et exports',
      plan: 'Premium',
      purpose: 'Tableaux de bord (paiements, notes, absences, répartition filles/garçons) et exports Excel.',
      who: 'Direction.',
      example: 'Export des paiements du mois en Excel pour le commissaire aux comptes, ou PDF de la répartition par sexe d\'une classe.',
    },
    {
      title: 'Analyse redoublement',
      plan: 'Premium',
      purpose: 'Suivre réinscriptions, redoublements et causes déclarées, y compris en comparatif selon la formule d\'abonnement.',
      who: 'Direction ; vue groupe pour plusieurs campus.',
      example: 'Sur l\'année 2025-2026, voir combien d\'élèves redoublent et pour quels motifs (assiduité, résultats, autre) — pour agir, pas pour afficher un taux magique.',
    },
    {
      title: 'Comptabilité avancée',
      plan: 'Pro',
      purpose: 'Comptes (Wave, Orange Money, caisse, banque), recettes, dépenses, catégories et rapports.',
      who: 'Direction / intendance.',
      example: 'Dépense 80 000 FCFA de fournitures, compte caisse. Recette scolarité Wave. Rapport de période pour le conseil de gestion.',
    },
    {
      title: 'Ressources humaines',
      plan: 'Pro',
      purpose: 'Dossiers du personnel (CDI, CDD, vacataire), documents, congés, présence, avances, évaluations, génération de paie et fiches PDF.',
      who: 'Direction (pilotage) ; enseignant (demandes de congé, pointage, consultation des fiches).',
      example: 'Mme Koné, enseignante de CM1, pose un congé annuel. La direction l\'approuve. En fin de mois, la paie est générée et la fiche exportée en PDF.',
    },
    {
      title: 'Multi-campus',
      plan: 'Groupe scolaire',
      purpose: 'Une direction de groupe, plusieurs établissements : consolidé, comparaison, circulaires, finance et RH de groupe.',
      who: 'Administrateur de groupe / organisation.',
      example: 'Deux campus (Cocody et Yopougon) : mêmes indicateurs, modules activables séparément, facturation unique ou par site.',
    },
  ];

  modules.forEach((mod) => moduleBlock(ctx, mod));

  subTitle(ctx, 'Fonctions complémentaires (hors liste des modules tarifaires)');
  para(ctx, 'Elles sont bien en service, même si elles n\'apparaissent pas comme une case à cocher dans le catalogue d\'offres :');
  bullet(ctx, 'Emploi du temps : calendrier (FullCalendar), création de créneaux, vues classe / enseignant / élève, notification, export PDF et Excel.');
  bullet(ctx, 'Classes, élèves, enseignants : création, photos, import CSV des élèves, code école pour l\'inscription des professeurs.');
  bullet(ctx, 'Année scolaire : paramétrage de l\'année en cours et passage / promotion de classe.');
  bullet(ctx, 'Réinscription : suivi des réinscriptions et causes de redoublement, exports PDF / Excel.');
  bullet(ctx, 'Transferts : un parent demande le transfert ; l\'école d\'origine approuve ou refuse ; l\'administration EduConnect clôture le dossier.');
  bullet(ctx, 'Bourses (espace super admin) : création et suivi de dossiers de bourse.');
  bullet(ctx, 'Mode hors-ligne : enregistrement sur le téléphone (appel, notes, devoirs, créations, preuve de paiement) puis synchronisation automatique — voir section 6.');

  subTitle(ctx, 'Récapitulatif : quel module dans quelle offre ?');
  para(ctx, 'Point = inclus. Essentiel convient pour démarrer. Premium couvre la vie scolaire. Pro ajoute le pilotage (compta, RH). Groupe ajoute le multi-campus.');

  const matrix = [
    ['Module', 'Ess.', 'Prem.', 'Pro', 'Grp.'],
    ['Paiements Wave / OM', 'oui', 'oui', 'oui', 'oui'],
    ['Notes', 'oui', 'oui', 'oui', 'oui'],
    ['Absences / appel', 'oui', 'oui', 'oui', 'oui'],
    ['Devoirs', 'oui', 'oui', 'oui', 'oui'],
    ['Messages', 'oui', 'oui', 'oui', 'oui'],
    ['Bulletins PDF', 'oui', 'oui', 'oui', 'oui'],
    ['Transport', '—', 'oui', 'oui', 'oui'],
    ['Cantine', '—', 'oui', 'oui', 'oui'],
    ['Comportement', '—', 'oui', 'oui', 'oui'],
    ['Santé', '—', 'oui', 'oui', 'oui'],
    ['Sortie QR', '—', 'oui', 'oui', 'oui'],
    ['Activités', '—', 'oui', 'oui', 'oui'],
    ['Objets perdus', '—', 'oui', 'oui', 'oui'],
    ['Statistiques / Excel', '—', 'oui', 'oui', 'oui'],
    ['Analyse redoublement', '—', 'oui', 'oui', 'oui'],
    ['Comptabilité', '—', '—', 'oui', 'oui'],
    ['Ressources humaines', '—', '—', 'oui', 'oui'],
    ['Multi-campus', '—', '—', '—', 'oui'],
  ];
  drawMatrix(ctx, matrix);

  // —— 6. Appel ——
  ctx.doc.addPage();
  ctx.page += 1;
  ctx.y = HEADER_H + 22;
  sectionTitle(ctx, '4.  L\'appel numérique');
  para(ctx, 'Sur le terrain, l\'enseignant n\'a souvent qu\'une main libre. L\'appel du jour, à l\'adresse /teacher/attendance, tient en trois choix par élève : Présent, Retard, Absent. Une ligne, un geste, un enregistrement.');

  subTitle(ctx, 'Déroulement type — lundi 7 h 25, classe de CM2 A');
  numbered(ctx, 1, 'L\'enseignant ouvre l\'appel du jour. La liste de la classe s\'affiche, lisible, un élève par ligne.');
  numbered(ctx, 2, 'Pour chaque enfant : Présent (par défaut), Retard ou Absent. Pas de menu à chercher.');
  numbered(ctx, 3, 'Il enregistre. Les absences et retards sont stockés (type ABSENCE ou LATE).');
  numbered(ctx, 4, 'Les parents concernés sont notifiés dans l\'application. Si le téléphone est renseigné et qu\'un canal SMS / WhatsApp est configuré, le message part aussi sur le mobile.');

  callout(
    ctx,
    'Ce que voit la famille',
    'Le même statut : pas un cahier que l\'enfant a oublié. Un parent à Abobo sait dès le matin si son enfant a été marqué en retard. La direction n\'a plus à recouper WhatsApp et le registre.'
  );

  para(ctx, 'Un signalement d\'absence hors appel reste possible (motif saisi par l\'enseignant). L\'espace parent « suivi » reprend absences et retards. Les statistiques peuvent croiser assiduité et genre, pour un pilotage plus fin — pas pour un affichage public.');
  para(ctx, 'Sans réseau, l\'appel du jour peut quand même être enregistré sur le téléphone, puis envoyé automatiquement au retour de la connexion (section 6). Les notifications aux parents partent au moment de cette synchronisation, pas pendant la coupure.');

  // —— 7. Paiements ——
  ctx.doc.addPage();
  ctx.page += 1;
  ctx.y = HEADER_H + 22;
  sectionTitle(ctx, '5.  Les paiements, tels qu\'ils fonctionnent');
  para(ctx, 'EduConnect s\'appuie sur Wave et Orange Money parce que c\'est ainsi que les familles paient déjà. Il n\'y a pas, à ce jour, de connexion technique directe à l\'API Wave qui débiterait le parent toute seule. Le flux est volontairement simple et contrôlé par l\'école.');

  subTitle(ctx, 'Le parcours réel');
  numbered(ctx, 1, 'L\'école renseigne, dans ses paramètres, le numéro Wave et le numéro Orange Money que les parents doivent créditer.');
  numbered(ctx, 2, 'Le parent ouvre son espace Paiements. Il voit ces numéros, choisit le montant en FCFA (par exemple 25 000), éventuellement une référence, et joint la capture d\'écran du transfert.');
  numbered(ctx, 3, 'Le paiement est enregistré au statut « en attente » (PENDING). La direction est notifiée.');
  numbered(ctx, 4, 'La directrice (ou la personne habilitée) ouvre la liste des paiements, consulte la preuve, et valide ou refuse.');
  numbered(ctx, 5, 'Si le paiement est validé, le parent est informé. L\'historique reste visible des deux côtés.');

  callout(
    ctx,
    'Pourquoi ce choix',
    'Valider une preuve évite de dépendre d\'une API mobile-money encore instable pour les écoles, et laisse à la direction le dernier mot — y compris pour un paiement partiel, un doublon ou une capture illisible. C\'est plus lent qu\'un prélèvement automatique ; c\'est plus sûr pour une caisse d\'établissement.'
  );

  para(ctx, 'Vous définissez aussi les types de frais (scolarité, cantine, transport, inscription…). Les exports Excel des paiements servent à la comptabilité. En plan Pro, les recettes peuvent rejoindre la comptabilité interne (comptes Wave, Orange Money, caisse, banque).');
  para(ctx, 'Le parent paie toujours dans Wave ou Orange Money, sur son téléphone (ces applications ont leur propre réseau). Ce qu\'EduConnect peut enregistrer hors ligne, c\'est l\'envoi de la capture d\'écran — détail en section 6.');

  // —— 8. Hors-ligne ——
  ctx.doc.addPage();
  ctx.page += 1;
  ctx.y = HEADER_H + 22;
  sectionTitle(ctx, '6.  Mode hors-ligne — coupures réseau et courant');
  para(ctx, 'En Côte d\'Ivoire, la 4G tombe et le courant saute. EduConnect est conçu pour ça. Après une première connexion en ligne, les gestes du quotidien — appel, notes, devoirs, créations, preuve de paiement — peuvent être enregistrés sur le téléphone, même sans internet. Dès que le réseau revient, tout part tout seul. Rien n\'est perdu sur l\'appareil, à condition de ne pas vider les données du navigateur.');

  subTitle(ctx, 'Comment s\'y préparer (une fois, avec du réseau)');
  numbered(ctx, 1, `Ouvrir ${URL} et se connecter (direction, enseignant ou parent). Cette première visite en ligne est indispensable.`);
  numbered(ctx, 2, 'Sur le téléphone : menu du navigateur, puis « Ajouter à l\'écran d\'accueil » (Safari sur iPhone, Chrome sur Android). L\'icône EduConnect reste sur le bureau, comme une petite application.');
  numbered(ctx, 3, 'Le jour de la coupure : continuer sur le même téléphone, dans le même navigateur (ou l\'icône d\'accueil). Ne pas effacer l\'historique du site.');
  numbered(ctx, 4, 'Quand la 4G revient — même sur batterie, même ailleurs que dans l\'école — les saisies en attente se synchronisent automatiquement. Un bouton « Synchroniser » permet aussi de forcer l\'envoi.');

  subTitle(ctx, 'Avec connexion  ·  Sans connexion');
  para(ctx, '« Sans connexion » suppose que la personne s\'est déjà connectée une fois en ligne, sur cet appareil. Ce qui n\'est pas dans la colonne de gauche exige internet.');

  twoColBoxes(ctx, {
    title: 'Sans connexion',
    head: ORANGE,
    bg: ORANGE_SOFT,
    dot: ORANGE,
    items: [
      'Appel du jour : Présent, Retard, Absent',
      'Notes, y compris la saisie en lot pour toute la classe',
      'Devoirs, avec pièce jointe (photo du tableau, fichier)',
      'Créer une classe, un élève, un enseignant (compte direction déjà ouvert)',
      'Parent : envoyer la capture Wave / Orange Money',
      'Enregistrement sur le téléphone ; bandeau « en attente de synchronisation »',
    ],
  }, {
    title: 'Avec connexion',
    head: GREEN,
    bg: GREEN_SOFT,
    dot: GREEN,
    items: [
      'Tout ce qui précède, enregistré tout de suite sur le serveur',
      'Première inscription, création d\'école, première connexion',
      'Modifier ou supprimer une fiche, import CSV, affecter un prof à une classe',
      'Messages, bulletins PDF, stats en direct, autre campus',
      'Valider ou refuser un paiement (côté direction)',
      'Les alertes parents (retard, absence, devoir) partent à la synchronisation',
    ],
  });

  ctx.doc.addPage();
  ctx.page += 1;
  ctx.y = HEADER_H + 22;

  callout(
    ctx,
    'Coupure de courant à l\'école',
    'Le téléphone tient la file d\'attente. Le serveur EduConnect est dans le cloud : il n\'a pas besoin de l\'électricité de l\'établissement. Exemple : l\'enseignante de CM2 fait l\'appel à 7 h 20, bandeau « en attente ». À 9 h la 4G revient, les statuts partent, les parents sont notifiés. Rien à retaper.'
  );

  callout(
    ctx,
    'Paiements : ce qui est hors ligne, ce qui ne l\'est pas',
    'Le parent paie dans Wave ou Orange Money, comme aujourd\'hui : ces applications ont leur propre réseau opérateur. EduConnect n\'envoie pas l\'argent à sa place. Ce qui peut attendre le retour d\'internet, c\'est l\'envoi de la capture d\'écran dans l\'espace parent. La direction valide ensuite, une fois en ligne.'
  );

  subTitle(ctx, 'Ce que chacun voit à l\'écran');
  para(ctx, 'Après une saisie hors ligne, un bandeau apparaît : « Données enregistrées localement, en attente de synchronisation ». Une icône flottante rappelle l\'état. Quand le réseau revient, l\'envoi est automatique (un essai a aussi lieu en rouvrant l\'application).');

  statusPills(ctx, [
    { label: 'En attente', bg: ORANGE_SOFT, fg: ORANGE },
    { label: 'Envoyé — synchronisé', bg: GREEN_SOFT, fg: GREEN },
    { label: 'À traiter', bg: AMBER_SOFT, fg: AMBER },
  ]);

  bullet(ctx, 'En attente (sablier) : la saisie est sur l\'appareil, pas encore sur le serveur. L\'enseignant peut continuer ; la directrice n\'a pas encore la donnée.');
  bullet(ctx, 'Envoyé (coche verte, quelques secondes) : la synchro a réussi. Le bandeau disparaît.');
  bullet(ctx, 'À traiter (triangle d\'alerte) : une erreur, ou un professeur dont l\'e-mail existe déjà. Toucher l\'icône pour réessayer.');

  subTitle(ctx, 'Conflit d\'e-mail enseignant : Fusionner ou Annuler');
  para(ctx, 'Si vous invitez un enseignant hors ligne et que, à la synchro, cet e-mail (ou ce téléphone) existe déjà, le bandeau affiche : « Professeur déjà existant, fusionner ou annuler ».');
  bullet(ctx, 'Fusionner : rattacher le compte déjà existant à votre école, sans doublon. Annuler : abandonner l\'invitation locale.');
  para(ctx, 'Ces deux boutons ont besoin d\'internet — ce n\'est pas un blocage pendant la coupure, c\'est un choix une fois le réseau revenu.');

  subTitle(ctx, 'Limites honnêtes — pour ne pas trop promettre');
  bullet(ctx, 'Première connexion et création d\'école : internet obligatoire. Un établissement ne se crée pas « dans le noir ».');
  bullet(ctx, 'Modifications, suppressions, import CSV, affectation des classes : pas de file d\'attente. Idem pour messages, bulletins PDF serveur, autre campus en direct.');
  bullet(ctx, 'Fermer complètement le navigateur puis le rouvrir sans réseau — surtout sur iPhone — peut afficher « Vous êtes hors ligne » plutôt que la dernière liste. Gardez l\'onglet ouvert, ou reconnectez-vous en ligne.');
  bullet(ctx, '4G instable : si le téléphone croit encore être en ligne, le formulaire part tout de suite. S\'il échoue, réessayez quand c\'est stable.');
  bullet(ctx, 'Pièces jointes : 5 Mo max. Ne pas vider les données du site ni changer de téléphone au milieu d\'une file : l\'enregistrement est sur cet appareil-là.');

  // —— 9. Offres ——
  ctx.doc.addPage();
  ctx.page += 1;
  ctx.y = HEADER_H + 22;
  sectionTitle(ctx, '7.  Offres, en FCFA');
  para(ctx, 'Les tarifs ci-dessous sont ceux publiés sur la plateforme. Ils peuvent évoluer ; un devis groupe se discute selon le nombre de campus. Il n\'existe pas d\'essai de 14 jours : l\'offre Essentiel est gratuite, sans limite de durée, dans la limite indiquée.');

  planCard(ctx, {
    name: 'Essentiel',
    badge: '',
    price: 'Gratuit',
    period: 'pour toujours',
    highlight: false,
    limits: 'Jusqu\'à 150 élèves · 1 campus',
    modules: 'Paiements, notes, absences, devoirs, messages, bulletins PDF. Suffisant pour démarrer une école primaire sans frais d\'abonnement.',
  });
  planCard(ctx, {
    name: 'Premium',
    badge: 'Le plus choisi',
    price: '15 000 FCFA / mois',
    period: 'élèves illimités · 1 campus',
    highlight: true,
    limits: 'Tout Essentiel, plus la vie scolaire élargie.',
    modules: 'Transport, cantine, comportement, santé, sortie QR, activités, objets perdus, statistiques & exports, analyse redoublement.',
  });
  planCard(ctx, {
    name: 'Pro',
    badge: '',
    price: '35 000 FCFA / mois',
    period: 'élèves illimités · 1 campus',
    highlight: false,
    limits: 'Pilotage administratif en plus de la vie scolaire.',
    modules: 'Tout Premium, plus comptabilité avancée et ressources humaines. Tous les modules sauf le multi-campus.',
  });
  planCard(ctx, {
    name: 'Groupe scolaire',
    badge: '',
    price: 'Sur devis',
    period: 'à partir de 50 000 FCFA / mois',
    highlight: false,
    limits: '2 campus et plus · tarif dégressif',
    modules: 'Tous les modules, tableau de bord consolidé, modules activables par campus, facturation unique ou par établissement, accompagnement au déploiement.',
  });

  para(ctx, `Pour un groupe : écrire à ${CONTACT}. Pour une école seule : créer le compte sur le site, choisir l'offre, ou demander une démonstration.`);

  // —— 9. Sécurité ——
  ctx.doc.addPage();
  ctx.page += 1;
  ctx.y = HEADER_H + 22;
  sectionTitle(ctx, '8.  Sécurité et données');
  para(ctx, 'EduConnect traite des données d\'élèves, de familles et de personnel. La conception vise un usage professionnel, pas une vitrine ouverte.');

  bullet(ctx, 'Connexion par identifiants personnels. Les sessions s\'appuient sur des jetons d\'accès de courte durée (JWT) et un jeton de renouvellement, stockés dans des cookies protégés — pas dans l\'adresse du navigateur.');
  bullet(ctx, 'Mots de passe chiffrés (jamais stockés en clair). Limitation des tentatives de connexion.');
  bullet(ctx, 'Rôles séparés : direction d\'école, enseignant, parent, administrateur de groupe, super administrateur. Chacun ne voit que son périmètre.');
  bullet(ctx, 'Modules activables école par école : une fonction absente de votre offre n\'apparaît pas « par erreur ».');
  bullet(ctx, 'Journal d\'audit des actions sensibles (connexion, validation de paiement, modification d\'élève, etc.).');
  bullet(ctx, 'Hébergement de l\'application sur infrastructure cloud (Vercel), accès HTTPS.');
  bullet(ctx, 'Saisies hors ligne : elles restent sur le téléphone de la personne jusqu\'à la synchronisation. Elles ne transitent pas par un autre établissement.');

  subTitle(ctx, 'Consentement des parents');
  para(ctx, 'Dès la première connexion, le parent se prononce : données scolaires, photos, santé, communications. Il peut modifier ensuite. Un signalement santé s\'inscrit dans ce cadre.');

  subTitle(ctx, 'Comptes de démonstration');
  para(ctx, 'La vitrine de production n\'affiche pas de mots de passe de démo. Pour une directrice : inscription école, ou démo avec nos équipes — pas un identifiant générique sur la page d\'accueil.');

  callout(
    ctx,
    'Données et contact',
    `Pour toute demande relative aux données d'un établissement : ${CONTACT}. EduConnect n'est pas un réseau social d'élèves. L'enfant n'a pas de compte.`
  );

  ctx.doc.addPage();
  ctx.page += 1;
  ctx.y = HEADER_H + 22;
  sectionTitle(ctx, '9.  Comment démarrer');
  para(ctx, 'Vous pouvez créer votre école en quelques minutes, ou nous écrire pour une démonstration accompagnée.');

  numbered(ctx, 1, `Ouvrir ${URL} et choisir « Demander une démo » / inscription école — ou écrire à ${CONTACT}.`);
  numbered(ctx, 2, 'Renseigner le nom de l\'établissement, la ville (Abidjan par défaut), les numéros Wave et Orange Money.');
  numbered(ctx, 3, 'Créer les classes (CP, CE1… ou 6e, 5e…), importer les élèves, inviter les enseignants avec le code école.');
  numbered(ctx, 4, 'Informer les parents : ils s\'inscrivent, lient leurs enfants, paient et suivent la scolarité.');
  numbered(ctx, 5, 'Sur chaque téléphone utilisé hors ligne : se connecter une première fois avec du réseau, puis « Ajouter à l\'écran d\'accueil ». Rester sur Essentiel (gratuit, jusqu\'à 150 élèves) ou passer à Premium / Pro ; un groupe se discute à part.');

  callout(
    ctx,
    'Nous sommes à votre disposition',
    `Une démonstration, un devis pour plusieurs campus, ou simplement une question. ${CONTACT}  ·  ${URL}`
  );

  para(
    ctx,
    'EduConnect — simple, professionnel, ivoirien. Document établi en août 2026 à partir des fonctions réellement en service.',
    { size: 9, color: MUTED, after: 4 }
  );
}

function writePdf(filePath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      autoFirstPage: true,
      bufferPages: true,
      info: {
        Title: 'EduConnect — Présentation à l\'attention de la direction',
        Author: 'EduConnect',
        Subject: 'Plateforme de gestion scolaire — Côte d\'Ivoire',
        Keywords: 'EduConnect, école, Wave, Orange Money, hors-ligne, Côte d\'Ivoire',
      },
    });

    const fonts = setupFonts(doc);
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    drawCover(doc, fonts);

    const ctx = { doc, fonts, y: HEADER_H + 22, page: 1 };
    writeContent(ctx);

    const range = doc.bufferedPageRange();
    const total = range.count;
    for (let i = 0; i < total; i++) {
      doc.switchToPage(i);
      if (i === 0) continue;
      drawInnerChrome(doc, fonts, i + 1, total);
    }

    doc.end();
    stream.on('finish', () => resolve({ path: filePath, pages: total, fonts }));
    stream.on('error', reject);
  });
}

function verifyPdf(filePath) {
  const { execSync } = require('child_process');
  const scriptPath = path.join(__dirname, '_verify-educonnect-pdf-temp.py');
  const escaped = filePath.replace(/\\/g, '\\\\');
  fs.writeFileSync(
    scriptPath,
    [
      'from pypdf import PdfReader',
      `r = PdfReader(r'''${escaped}''')`,
      'texts = []',
      'for i, p in enumerate(r.pages):',
      '    t = (p.extract_text() or "").strip()',
      '    texts.append(t)',
      '    if i == 0 and "EduConnect" not in t:',
      '        raise SystemExit("page1 missing EduConnect")',
      'joined = "\\n".join(texts)',
      'plain = " ".join(joined.split())',
      'if len(plain) < 800:',
      '    raise SystemExit("too little text: %d" % len(plain))',
      'if "IndexedDB" in joined:',
      '    raise SystemExit("IndexedDB jargon leaked into PDF")',
      'needles = ["hors-ligne", "Sans connexion", "attente de synchronisation", "Fusionner"]',
      'missing = [n for n in needles if n.lower() not in plain.lower()]',
      'if missing:',
      '    raise SystemExit("missing: " + ", ".join(missing))',
      'print(len(r.pages))',
      'print(len(joined))',
      'print(texts[0][:240].replace("\\n", " | "))',
      'hl = [str(i+1) for i, t in enumerate(texts) if "hors-ligne" in t.lower() or "hors ligne" in t.lower()]',
      'print("hors-ligne pages: " + ",".join(hl))',
    ].join('\n')
  );
  try {
    const out = execSync(`python "${scriptPath}"`, { encoding: 'utf8' });
    const lines = out.trim().split(/\r?\n/);
    return {
      pages: parseInt(lines[0], 10),
      chars: parseInt(lines[1], 10),
      preview: lines[2] || '',
      horsLignePages: (lines[3] || '').replace('hors-ligne pages: ', ''),
    };
  } finally {
    try {
      fs.unlinkSync(scriptPath);
    } catch (_) {
      /* ignore */
    }
  }
}

async function main() {
  const docsDir = path.dirname(OUTPUT);
  if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

  const { pages, fonts } = await writePdf(OUTPUT);
  const stat = fs.statSync(OUTPUT);
  console.log('Fonts:', fonts.reg, fonts.file, 'unicode=', fonts.unicode);
  console.log('Generated:', OUTPUT, stat.size, 'bytes, buffered pages:', pages);

  if (stat.size < 20 * 1024) {
    throw new Error(`PDF trop petit (${stat.size} octets) — génération probablement vide`);
  }

  const copies = [];
  const bureauDir = path.dirname(BUREAU);
  const bureauV2 = BUREAU.replace(/\.pdf$/i, '-v2.pdf');
  const bureauV4 = BUREAU.replace(/\.pdf$/i, '-v4.pdf');
  const bureauV5 = BUREAU.replace(/\.pdf$/i, '-v5.pdf');
  if (fs.existsSync(bureauDir)) {
    const dests = [BUREAU, BUREAU_V3, bureauV2, bureauV4, bureauV5];
    let copied = false;
    for (const dest of dests) {
      try {
        fs.copyFileSync(OUTPUT, dest);
        copies.push(dest);
        console.log('Copied:', dest);
        copied = true;
        break;
      } catch (err) {
        console.warn('Copie Bureau échouée:', dest, err.code || err.message);
      }
    }
    if (!copied) console.warn('Impossible de copier sur le Bureau (fichier ouvert ?). PDF dans docs/.');
  } else {
    console.warn('Bureau introuvable, copie ignorée:', bureauDir);
  }

  const verification = verifyPdf(OUTPUT);
  console.log(JSON.stringify({
    ok: true,
    pages: verification.pages,
    chars: verification.chars,
    preview: verification.preview,
    horsLignePages: verification.horsLignePages,
    sizeBytes: stat.size,
    output: OUTPUT,
    copies,
    fonts,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
