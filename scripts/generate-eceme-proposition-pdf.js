const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const TEXT = '#1a1a1a';
const ORANGE = '#c45c12';
const GREEN = '#1e5631';
const GRAY = '#444444';
const LIGHT_GRAY = '#666666';

const MARGIN = 50;
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM = 720;

const OUTPUT = path.join(__dirname, '..', 'docs', 'ECEME-Proposition-refonte-site.pdf');
const BUREAU = path.join(process.env.USERPROFILE || '', 'OneDrive', 'Bureau', 'ECEME-Proposition-refonte-site.pdf');
const BUREAU_V2 = path.join(process.env.USERPROFILE || '', 'OneDrive', 'Bureau', 'ECEME-Proposition-refonte-site-v2.pdf');

const FONT_CANDIDATES = [
  { reg: 'C:\\Windows\\Fonts\\arial.ttf', bold: 'C:\\Windows\\Fonts\\arialbd.ttf', name: 'Body' },
  { reg: 'C:\\Windows\\Fonts\\calibri.ttf', bold: 'C:\\Windows\\Fonts\\calibrib.ttf', name: 'BodyBold' },
];

function asciiFallback(str) {
  return str
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
    .replace(/['']/g, "'");
}

function setupFonts(doc) {
  for (const { reg, bold, name } of FONT_CANDIDATES) {
    if (fs.existsSync(reg) && fs.existsSync(bold)) {
      try {
        doc.registerFont(name, reg);
        doc.registerFont(`${name}-Bold`, bold);
        return { reg: name, bold: `${name}-Bold`, unicode: true };
      } catch (_) {
        /* try next */
      }
    }
  }
  return { reg: 'Helvetica', bold: 'Helvetica-Bold', unicode: false };
}

function t(str, fonts) {
  return fonts.unicode ? str : asciiFallback(str);
}

function ensureSpace(doc, y, needed, fonts, pageNumRef) {
  if (y + needed > BOTTOM) {
    doc.addPage();
    pageNumRef.n += 1;
    return drawInnerPageHeader(doc, y, fonts, pageNumRef.n);
  }
  return y;
}

function drawInnerPageHeader(doc, startY, fonts, pageNum) {
  let y = 50;
  doc.save();
  doc.rect(0, 0, PAGE_W, 46).fill(GREEN);
  doc.fillColor('#ffffff').font(fonts.bold).fontSize(10);
    doc.text(t('Les Écoles ECEME — lesecoleseceme.ci', fonts), MARGIN, 16, { width: CONTENT_W, lineBreak: false });
  doc.restore();
  y = 62;
  drawPageFooter(doc, pageNum);
  return y;
}

function drawPageFooter(doc, pageNum) {
  const y = PAGE_H - 36;
  doc.save();
  doc.strokeColor('#cccccc').lineWidth(0.5);
  doc.moveTo(MARGIN, y - 6).lineTo(PAGE_W - MARGIN, y - 6).stroke();
  doc.fillColor(LIGHT_GRAY).font(fontsSafe(doc)).fontSize(8);
  doc.text(
    t('Proposition de refonte — document confidentiel — 14 août 2026', doc._fonts),
    MARGIN,
    y,
    { width: CONTENT_W - 40, align: 'left', lineBreak: false }
  );
  doc.text(String(pageNum), MARGIN, y, { width: CONTENT_W, align: 'right', lineBreak: false });
  doc.restore();
}

function fontsSafe(doc) {
  return doc._fonts ? doc._fonts.reg : 'Helvetica';
}

function sectionTitle(doc, y, title, fonts) {
  doc.fillColor(TEXT).font(fonts.bold).fontSize(20);
  doc.text(t(title, fonts), MARGIN, y, { width: CONTENT_W });
  y = doc.y + 4;
  doc.strokeColor(ORANGE).lineWidth(2.5);
  doc.moveTo(MARGIN, y).lineTo(MARGIN + 70, y).stroke();
  return doc.y + 14;
}

function label(doc, y, text, fonts, color = GREEN) {
  doc.fillColor(color).font(fonts.bold).fontSize(12);
  doc.text(t(text, fonts), MARGIN, y, { width: CONTENT_W });
  return doc.y + 8;
}

function body(doc, y, text, fonts, opts = {}) {
  doc.fillColor(opts.color || GRAY).font(fonts.reg).fontSize(opts.size || 10);
  doc.text(t(text, fonts), MARGIN + (opts.indent || 0), y, {
    width: CONTENT_W - (opts.indent || 0),
    lineGap: opts.lineGap || 3,
  });
  return doc.y + (opts.after || 6);
}

function bullet(doc, y, text, fonts, pageNumRef) {
  y = ensureSpace(doc, y, 20, fonts, pageNumRef);
  doc.fillColor(ORANGE).font(fonts.bold).fontSize(10);
  doc.text('•', MARGIN + 4, y, { lineBreak: false });
  doc.fillColor(GRAY).font(fonts.reg).fontSize(10);
  doc.text(t(text, fonts), MARGIN + 16, y, { width: CONTENT_W - 16, lineGap: 3 });
  return doc.y + 4;
}

function numbered(doc, y, num, text, fonts, pageNumRef) {
  y = ensureSpace(doc, y, 24, fonts, pageNumRef);
  doc.fillColor(ORANGE).font(fonts.bold).fontSize(10);
  doc.text(`${num}.`, MARGIN, y, { lineBreak: false });
  doc.fillColor(GRAY).font(fonts.reg).fontSize(10);
  doc.text(t(text, fonts), MARGIN + 20, y, { width: CONTENT_W - 20, lineGap: 3 });
  return doc.y + 4;
}

function callout(doc, y, title, text, fonts, pageNumRef, bg = '#fff3e6') {
  y = ensureSpace(doc, y, 60, fonts, pageNumRef);
  const boxY = y;
  doc.fillColor(TEXT).font(fonts.bold).fontSize(10);
  doc.text(t(title, fonts), MARGIN + 12, boxY + 10, { width: CONTENT_W - 24 });
  const titleEnd = doc.y;
  doc.fillColor(GRAY).font(fonts.reg).fontSize(10);
  doc.text(t(text, fonts), MARGIN + 12, titleEnd + 4, { width: CONTENT_W - 24, lineGap: 3 });
  const boxH = doc.y - boxY + 10;
  doc.save();
  doc.roundedRect(MARGIN, boxY, CONTENT_W, boxH, 4).fill(bg);
  doc.restore();
  doc.fillColor(TEXT).font(fonts.bold).fontSize(10);
  doc.text(t(title, fonts), MARGIN + 12, boxY + 10, { width: CONTENT_W - 24 });
  doc.fillColor(GRAY).font(fonts.reg).fontSize(10);
  doc.text(t(text, fonts), MARGIN + 12, boxY + 26, { width: CONTENT_W - 24, lineGap: 3 });
  return boxY + boxH + 12;
}

function scenarioBlock(doc, y, letter, title, weeks, principle, rows, effort, fonts, pageNumRef) {
  y = ensureSpace(doc, y, 100, fonts, pageNumRef);
  doc.fillColor(ORANGE).font(fonts.bold).fontSize(13);
  doc.text(t(`Scénario ${letter} — ${title}`, fonts), MARGIN, y, { width: CONTENT_W });
  y = doc.y + 4;
  y = body(doc, y, `Durée estimée : ${weeks}`, fonts);
  doc.fillColor(TEXT).font(fonts.bold).fontSize(10);
  doc.text(t('Principe', fonts), MARGIN, y, { width: CONTENT_W });
  y = body(doc, doc.y + 2, principle, fonts);
  for (const [k, v] of rows) {
    y = ensureSpace(doc, y, 18, fonts, pageNumRef);
    doc.fillColor(TEXT).font(fonts.bold).fontSize(10);
    doc.text(t(`${k} : `, fonts), MARGIN, y, { continued: true });
    doc.fillColor(GRAY).font(fonts.reg).fontSize(10);
    doc.text(t(v, fonts), { lineGap: 3 });
    y = doc.y + 2;
  }
  y = ensureSpace(doc, y, 16, fonts, pageNumRef);
  doc.fillColor(TEXT).font(fonts.bold).fontSize(10);
  doc.text(t(`Effort : ${effort}`, fonts), MARGIN, y, { width: CONTENT_W });
  return doc.y + 10;
}

function writePdf(filePath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true });
    const fonts = setupFonts(doc);
    doc._fonts = fonts;
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const pageNumRef = { n: 1 };

    // —— Page 1 : Couverture ——
    doc.rect(0, 0, PAGE_W, PAGE_H).fill('#ffffff');
    doc.rect(0, 0, PAGE_W, 8).fill(ORANGE);
    doc.rect(0, PAGE_H - 8, PAGE_W, 8).fill(GREEN);

    doc.fillColor(GREEN).font(fonts.bold).fontSize(16);
    doc.text(t('Les Écoles ECEME', fonts), MARGIN, 130, { width: CONTENT_W, align: 'center' });
    doc.fillColor(LIGHT_GRAY).font(fonts.reg).fontSize(11);
    doc.text(t('Bingerville — Ayopoumin', fonts), MARGIN, doc.y + 6, { width: CONTENT_W, align: 'center' });

    doc.fillColor(TEXT).font(fonts.bold).fontSize(28);
    doc.text(t('Proposition de refonte', fonts), MARGIN, 260, { width: CONTENT_W, align: 'center' });
    doc.fillColor(ORANGE).font(fonts.bold).fontSize(24);
    doc.text(t('Site Les Écoles ECEME', fonts), MARGIN, doc.y + 10, { width: CONTENT_W, align: 'center' });

    doc.fillColor(LIGHT_GRAY).font(fonts.reg).fontSize(12);
    doc.text(t('lesecoleseceme.ci — document de présentation', fonts), MARGIN, doc.y + 16, {
      width: CONTENT_W,
      align: 'center',
    });

    doc.roundedRect(MARGIN + 30, 420, CONTENT_W - 60, 56, 6).strokeColor(ORANGE).lineWidth(1).stroke();
    doc.fillColor(GREEN).font(fonts.bold).fontSize(15);
    doc.text(t('Transformer le site en vitrine d\'école', fonts), MARGIN + 30, 438, {
      width: CONTENT_W - 60,
      align: 'center',
    });

    doc.fillColor(LIGHT_GRAY).font(fonts.reg).fontSize(10);
    doc.text('14 août 2026', MARGIN, PAGE_H - 80, { width: CONTENT_W, align: 'center' });
    drawPageFooter(doc, pageNumRef.n);

    // —— Page 2 : Constat ——
    doc.addPage();
    pageNumRef.n = 2;
    let y = drawInnerPageHeader(doc, 0, fonts, pageNumRef.n);
    y = sectionTitle(doc, y, 'Constat — où en est le site aujourd\'hui ?', fonts);

    y = label(doc, y, 'Ce qui fonctionne déjà', fonts);
    y = bullet(doc, y, 'Le portail de paiement est opérationnel. Les parents habitués peuvent payer scolarité et cantine en ligne.', fonts, pageNumRef);
    y = bullet(doc, y, 'Les coordonnées essentielles sont présentes : Bingerville, Ayopoumin, téléphones, e-mail, carte et page Facebook.', fonts, pageNumRef);
    y = bullet(doc, y, 'Le site est sécurisé (HTTPS) et se charge correctement.', fonts, pageNumRef);

    y = label(doc, y + 6, 'Ce qui freine aujourd\'hui', fonts);
    y = bullet(doc, y, 'Le site est surtout un portail de paiement. La première impression n\'est pas celle d\'une école où inscrire un enfant.', fonts, pageNumRef);
    y = bullet(doc, y, 'Plusieurs pages affichent « Aucune information » : accueil, Informations, Notre histoire, Mot du proviseur.', fonts, pageNumRef);
    y = bullet(doc, y, 'Le menu Inscription est masqué. La page inscription ne sert qu\'à rechercher un élève déjà enregistré.', fonts, pageNumRef);
    y = bullet(doc, y, 'Aucun tarif, aucun formulaire de contact, pas de galerie ni d\'actualités.', fonts, pageNumRef);
    y = bullet(doc, y, 'Le domaine lesecoleseceme.net renvoie une erreur 500. Les familles peuvent tomber sur un site cassé.', fonts, pageNumRef);
    y = bullet(doc, y, 'Fautes visibles (CONNECTER VOUS, élève sans accent). La recherche publique d\'élèves expose des données sensibles.', fonts, pageNumRef);

    y = callout(
      doc,
      y + 4,
      'En résumé',
      'Le site remplit bien son rôle de caisse en ligne. Il ne joue pas encore celui de vitrine d\'école pour recruter de nouvelles familles.',
      fonts,
      pageNumRef
    );
    drawPageFooter(doc, pageNumRef.n);

    // —— Page 3 : Objectifs ——
    doc.addPage();
    pageNumRef.n = 3;
    y = drawInnerPageHeader(doc, 0, fonts, pageNumRef.n);
    y = sectionTitle(doc, y, 'Objectifs de la refonte', fonts);

    const objectives = [
      ['Recruter des familles', 'Montrer en quelques secondes qui vous êtes, vos cycles (maternelle, primaire, secondaire) et pourquoi choisir ECEME.'],
      ['Crédibiliser l\'établissement', 'Afficher les agréments MEN, l\'équipe, l\'adresse précise et des photos réelles de la vie scolaire.'],
      ['Faciliter les inscriptions', 'Proposer un parcours clair : intérêt, contact ou WhatsApp, dossier, paiement.'],
      ['Communiquer au quotidien', 'Publier actualités, horaires, calendrier et communiqués de rentrée.'],
      ['Conserver le paiement en ligne', 'Garder l\'espace parents / paiements déjà en ligne, accessible en un clic depuis le site.'],
    ];
    for (let i = 0; i < objectives.length; i++) {
      y = ensureSpace(doc, y, 40, fonts, pageNumRef);
      doc.fillColor(ORANGE).font(fonts.bold).fontSize(11);
      doc.text(t(`${i + 1}. ${objectives[i][0]}`, fonts), MARGIN, y, { width: CONTENT_W });
      y = body(doc, doc.y + 2, objectives[i][1], fonts, { after: 10 });
    }
    y = callout(
      doc,
      y,
      'Vision',
      'Un site qui accueille les familles, rassure et oriente vers l\'inscription — tout en conservant le confort du paiement en ligne pour les parents actuels.',
      fonts,
      pageNumRef,
      '#e8f5e9'
    );
    drawPageFooter(doc, pageNumRef.n);

    // —— Page 4 : Scenarios A & B ——
    doc.addPage();
    pageNumRef.n = 4;
    y = drawInnerPageHeader(doc, 0, fonts, pageNumRef.n);
    y = sectionTitle(doc, y, 'Trois scénarios possibles', fonts);
    y = scenarioBlock(
      doc, y, 'A', 'Refonte légère', '2 à 4 semaines',
      'Garder le site actuel, corriger le contenu et réorganiser l\'accueil pour accueillir aussi les nouvelles familles.',
      [
        ['Contenu', 'Remplir les pages vides, réactiver le menu Inscription, corriger le français'],
        ['Contact', 'Formulaire simple, bouton WhatsApp, publication des agréments MEN'],
        ['Limite', 'Design vieillissant ; peu de marge pour galerie et actualités'],
      ],
      'Faible — surtout rédaction et paramétrage',
      fonts, pageNumRef
    );
    y = scenarioBlock(
      doc, y, 'B', 'Site vitrine moderne', '6 à 10 semaines',
      'Nouveau site public professionnel. Le .ci devient la vitrine ; le paiement reste via un bouton « Espace parents ».',
      [
        ['Design', 'Mobile-first, photos réelles, couleurs orange et vert ECEME'],
        ['Pages', 'Cycles, pédagogie, inscriptions, tarifs, actualités, galerie, contact'],
        ['Avantage', 'Image professionnelle et autonomie pour publier des actualités'],
      ],
      'Moyen — refonte complète du site public',
      fonts, pageNumRef
    );
    drawPageFooter(doc, pageNumRef.n);

    // —— Page 5 : Scenario C ——
    doc.addPage();
    pageNumRef.n = 5;
    y = drawInnerPageHeader(doc, 0, fonts, pageNumRef.n);
    y = sectionTitle(doc, y, 'Scénario recommandé', fonts);
    y = scenarioBlock(
      doc, y, 'C', 'Site vitrine + espace parents', '10 à 16 semaines',
      'Scénario B enrichi : connexion parents vers un outil moderne (EduConnect en option), avec paiements, reçus et évolutions possibles (notes, absences).',
      [
        ['Site public', 'Identique au scénario B — vitrine complète et autonome'],
        ['Espace parents', 'Bouton permanent « Connexion parents » — paiements déjà en ligne'],
        ['Migration', 'Basculer progressivement les parents ; conserver l\'ancien portail une rentrée si besoin'],
        ['Avantage', 'Une vitrine crédible et un seul écosystème de gestion à terme'],
      ],
      'Élevé — site + intégration + formation équipe',
      fonts, pageNumRef
    );
    y = callout(
      doc,
      y,
      'Recommandation',
      'Nous recommandons le scénario C pour une solution durable. En attendant, démarrer immédiatement le Sprint 1 sur le site actuel pour un effet visible en 2 à 3 semaines.',
      fonts,
      pageNumRef
    );
    drawPageFooter(doc, pageNumRef.n);

    // —— Page 6 : Sprint 1 ——
    doc.addPage();
    pageNumRef.n = 6;
    y = drawInnerPageHeader(doc, 0, fonts, pageNumRef.n);
    y = sectionTitle(doc, y, 'Sprint 1 — actions immédiates (2 à 3 semaines)', fonts);
    const sprintActions = [
      'Remplir la page d\'accueil : présentation ECEME, les 3 cycles, quartier Ayopoumin, agréments MEN (150 mots).',
      'Réactiver le menu Inscription : rendre visibles Procédure et S\'inscrire ; ajouter « Demander une inscription » sur l\'accueil.',
      'Ajouter un bouton WhatsApp flottant vers le 07 68 03 33 33 avec message pré-rempli.',
      'Créer une page FAQ Frais : inscription, mensualité par cycle, cantine, transport, modes de paiement.',
      'Corriger la page Contact : formulaire minimal (nom, téléphone, cycle, message).',
      'Publier les agréments MEN : décisions n° 2751 (maternelle) et n° 2809 (primaire), adresse Féh Kessé, Cité Colombe 1.',
      'Intégrer 5 à 8 photos réelles (classes, cour, équipe) avec autorisations parents.',
      'Réparer ou rediriger lesecoleseceme.net pour éviter l\'erreur 500.',
      'Sécuriser la recherche d\'élèves : ne plus exposer matricule, classe et date de naissance sans connexion.',
      'Corriger le français visible : CONNECTEZ-VOUS, COMMENCER, élève, Contactez-nous.',
    ];
    for (let i = 0; i < sprintActions.length; i++) {
      y = numbered(doc, y, i + 1, sprintActions[i], fonts, pageNumRef);
    }
    drawPageFooter(doc, pageNumRef.n);

    // —— Page 7 : Arborescence ——
    doc.addPage();
    pageNumRef.n = 7;
    y = drawInnerPageHeader(doc, 0, fonts, pageNumRef.n);
    y = sectionTitle(doc, y, 'Arborescence de pages recommandee', fonts);
    const tree = `Accueil
|
+-- L'ecole
|   +-- Qui sommes-nous ?
|   +-- Notre histoire & valeurs
|   +-- Mot de la fondatrice / direction
|   +-- Equipe pedagogique
|   +-- Agrements & documents officiels (MEN)
|
+-- Nos cycles
|   +-- Maternelle — Le Petit Prince ECEME
|   +-- Primaire — Le Petit Prince ECEME 2
|   +-- Secondaire (statut : ouverture / agrement)
|
+-- Inscriptions
|   +-- Pourquoi choisir ECEME ?
|   +-- Procedure & documents requis
|   +-- Tarifs & FAQ frais
|   +-- Demande d'inscription (formulaire)
|   +-- Calendrier rentree
|
+-- Vie scolaire
|   +-- Actualites & communiques
|   +-- Galerie photos & videos
|   +-- Cantine, transport, activites
|   +-- Resultats & reussite aux examens
|
+-- Contact
|   +-- Coordonnees & plan d'acces
|   +-- Formulaire de contact
|   +-- WhatsApp direct
|   +-- Horaires d'accueil
|
+-- Espace parents (header / footer permanent)
    +-- Connexion -> paiements deja en ligne`;
    y = body(doc, y, tree, fonts, { size: 9, lineGap: 1, after: 10 });
    y = label(doc, y, 'Boutons permanents sur toutes les pages :', fonts);
    y = bullet(doc, y, '« Demander une inscription » (formulaire ou WhatsApp)', fonts, pageNumRef);
    y = bullet(doc, y, '« Espace parents » (connexion paiement)', fonts, pageNumRef);
    drawPageFooter(doc, pageNumRef.n);

    // —— Page 8 : Risques ——
    doc.addPage();
    pageNumRef.n = 8;
    y = drawInnerPageHeader(doc, 0, fonts, pageNumRef.n);
    y = sectionTitle(doc, y, 'Risques et prochaine étape', fonts);
    y = label(doc, y, 'Risques à anticiper', fonts);
    const risks = [
      ['Contenu non mis à jour', 'Désigner une référente site ; viser une actualité par mois minimum.'],
      ['Double domaine (.ci et .net)', 'Choisir un domaine principal et rediriger l\'autre.'],
      ['Données élèves exposées', 'Restreindre la recherche aux utilisateurs connectés.'],
      ['Parents habitués au portail actuel', 'Communication progressive, tutoriel, support WhatsApp la première rentrée.'],
      ['Photos sans autorisation', 'Obtenir les accords écrits avant toute publication.'],
      ['Tarifs absents', 'Publier au minimum une fourchette ou « nous contacter » avec réponse sous 24 h.'],
    ];
    for (const [r, m] of risks) {
      y = ensureSpace(doc, y, 20, fonts, pageNumRef);
      doc.fillColor(TEXT).font(fonts.bold).fontSize(10);
      doc.text(t(`${r} — `, fonts), MARGIN, y, { continued: true });
      doc.fillColor(GRAY).font(fonts.reg).fontSize(10);
      doc.text(t(m, fonts), { lineGap: 3 });
      y = doc.y + 4;
    }
    y = label(doc, y + 6, 'Prochaine étape', fonts);
    y = bullet(doc, y, 'Valider le scénario retenu (A, B ou C) avec la direction.', fonts, pageNumRef);
    y = bullet(doc, y, 'Fournir les tarifs par cycle et les photos autorisées pour publication.', fonts, pageNumRef);
    y = bullet(doc, y, 'Désigner une référente contenu (rédaction, actualités, réponses aux demandes).', fonts, pageNumRef);
    y = bullet(doc, y, 'Lancer le Sprint 1 dès validation pour un premier résultat visible rapidement.', fonts, pageNumRef);

    y = ensureSpace(doc, y, 50, fonts, pageNumRef);
    doc.roundedRect(MARGIN, y, CONTENT_W, 44, 4).fill(GREEN);
    doc.fillColor('#ffffff').font(fonts.bold).fontSize(11);
    doc.text(
      t('Nous restons à votre disposition pour avancer ensemble sur cette refonte.', fonts),
      MARGIN + 14,
      y + 14,
      { width: CONTENT_W - 28, align: 'center', lineGap: 4 }
    );
    drawPageFooter(doc, pageNumRef.n);

    doc.end();
    stream.on('finish', () => resolve({ path: filePath, pages: pageNumRef.n, fonts }));
    stream.on('error', reject);
  });
}

function verifyPdf(filePath) {
  const { execSync } = require('child_process');
  const scriptPath = path.join(__dirname, '_verify-pdf-temp.py');
  fs.writeFileSync(
    scriptPath,
    `from pypdf import PdfReader\nr = PdfReader(r'''${filePath}''')\nt = (r.pages[0].extract_text() or '').strip()\nprint(len(r.pages))\nprint(t[:200])\nif not t:\n    raise SystemExit(1)\n`
  );
  try {
    const out = execSync(`python "${scriptPath}"`, { encoding: 'utf8' });
    const lines = out.trim().split(/\r?\n/);
    return { pages: parseInt(lines[0], 10), preview: lines.slice(1).join('\n') };
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
  console.log('Fonts:', fonts);
  const stat = fs.statSync(OUTPUT);
  console.log('Generated:', OUTPUT, stat.size, 'bytes');

  const copies = [];
  for (const dest of [BUREAU, BUREAU_V2]) {
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(OUTPUT, dest);
    copies.push(dest);
    console.log('Copied:', dest);
  }

  const verification = verifyPdf(OUTPUT);
  if (!verification.preview) {
    throw new Error('Verification FAILED: extract_text is empty on page 1');
  }

  console.log(JSON.stringify({
    ok: true,
    pages: verification.pages,
    preview: verification.preview,
    sizeBytes: stat.size,
    output: OUTPUT,
    copies,
    open: BUREAU_V2,
    fonts,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
