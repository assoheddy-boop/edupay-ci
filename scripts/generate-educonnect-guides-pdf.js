/**
 * Guides utilisateurs EduConnect (direction, parent, enseignant).
 * Usage : node scripts/generate-educonnect-guides-pdf.js
 */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { listGuides, loadMarkdown, parseBlocks, pdfPath } = require('../src/utils/guideMarkdown');

const BLUE = '#0052CC';
const BLUE_DARK = '#003D99';
const BLUE_SOFT = '#E8F0FE';
const TEXT = '#1A1A1A';
const GRAY = '#3D3D3D';
const MUTED = '#5C5C5C';
const LINE = '#D6DEE8';
const WHITE = '#FFFFFF';
const ORANGE = '#C05621';
const ORANGE_SOFT = '#FCEEE6';

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 57; // ~20 mm — keep text clear of the page edge
const CONTENT_W = PAGE_W - MARGIN * 2;
const HEADER_H = 42;
const FOOTER_Y = PAGE_H - 36;
const BOTTOM = FOOTER_Y - 22;
const BODY_SIZE = 10.5;
const LINE_GAP = 3.6;
const BREAK_CHARS = '/-?&=._:#@+';

const SITE_URL = 'https://educonnect-ci.com';
const CONTACT = 'contact@educonnect.ci';
const DOC_DATE = 'Août 2026';

const FONT_CANDIDATES = [
  { reg: 'C:\\Windows\\Fonts\\calibri.ttf', bold: 'C:\\Windows\\Fonts\\calibrib.ttf' },
  { reg: 'C:\\Windows\\Fonts\\segoeui.ttf', bold: 'C:\\Windows\\Fonts\\segoeuib.ttf' },
  { reg: 'C:\\Windows\\Fonts\\arial.ttf', bold: 'C:\\Windows\\Fonts\\arialbd.ttf' },
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

const INLINE_RE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((?:https?:|mailto:)[^)]+\))/;

function stripInline(str) {
  return String(str)
    .replace(/\[([^\]]+)\]\((?:https?:|mailto:)[^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}

function softenInline(str) {
  return String(str || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

function lineStep(size, lineGap) {
  return size * 1.28 + (lineGap || LINE_GAP);
}

function styleRun(doc, fonts, token, size, color) {
  doc.font(token.bold ? fonts.bold : fonts.reg)
    .fontSize(token.code ? Math.max(size - 0.5, 8) : size)
    .fillColor(token.href ? BLUE : color);
}

function measureRun(doc, fonts, token, size, color) {
  styleRun(doc, fonts, token, size, color);
  return doc.widthOfString(token.text);
}

function tokenizeRich(raw, fonts) {
  const text = softenInline(raw);
  const parts = text.split(INLINE_RE);
  const tokens = [];
  parts.forEach((part) => {
    if (!part) return;
    const link = part.match(/^\[([^\]]+)\]\((https?:[^)]+|mailto:[^)]+)\)$/);
    const bold = /^\*\*[^*]+\*\*$/.test(part);
    const code = /^`[^`]+`$/.test(part);
    let value = part;
    let href = null;
    if (link) {
      value = link[1];
      href = link[2];
    } else if (bold) value = part.slice(2, -2);
    else if (code) value = part.slice(1, -1);
    value = t(value, fonts);
    String(value).split(/(\n)/).forEach((chunk) => {
      if (chunk === '\n') {
        tokens.push({
          text: '\n',
          isBreak: true,
          isSpace: false,
          bold: false,
          code: false,
          href: null,
        });
        return;
      }
      chunk.split(/([ \t]+)/).forEach((bit) => {
        if (!bit) return;
        tokens.push({
          text: bit,
          isSpace: /^[ \t]+$/.test(bit),
          bold: Boolean(bold || code),
          code: Boolean(code),
          href,
        });
      });
    });
  });
  return tokens;
}

function splitOversized(doc, fonts, token, width, size, color) {
  const chunks = [];
  let rest = token.text;
  while (rest.length) {
    styleRun(doc, fonts, token, size, color);
    if (doc.widthOfString(rest) <= width) {
      chunks.push({ ...token, text: rest, isSpace: false, w: doc.widthOfString(rest) });
      break;
    }
    let lo = 1;
    let hi = rest.length;
    let fit = 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      styleRun(doc, fonts, token, size, color);
      if (doc.widthOfString(rest.slice(0, mid)) <= width) {
        fit = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    let breakAt = fit;
    const minKeep = Math.max(1, Math.floor(fit * 0.45));
    for (let i = fit - 1; i >= minKeep; i -= 1) {
      if (BREAK_CHARS.includes(rest[i])) {
        breakAt = i + 1;
        break;
      }
    }
    const piece = rest.slice(0, breakAt);
    styleRun(doc, fonts, token, size, color);
    chunks.push({ ...token, text: piece, isSpace: false, w: doc.widthOfString(piece) });
    rest = rest.slice(breakAt);
  }
  return chunks;
}

function wrapTokens(doc, fonts, tokens, width, size, color) {
  const lines = [];
  let line = [];
  let lineW = 0;
  let pendingSpace = null;

  const flush = () => {
    while (line.length && line[line.length - 1].isSpace) line.pop();
    if (line.length) lines.push(line);
    line = [];
    lineW = 0;
    pendingSpace = null;
  };

  const pushToken = (token, w) => {
    line.push({ ...token, w });
    lineW += w;
  };

  tokens.forEach((token) => {
    if (token.isBreak) {
      flush();
      return;
    }
    if (token.isSpace) {
      if (line.length) pendingSpace = token;
      return;
    }
    const wordW = measureRun(doc, fonts, token, size, color);
    if (wordW > width) {
      flush();
      splitOversized(doc, fonts, token, width, size, color).forEach((piece) => {
        if (line.length && lineW + piece.w > width) flush();
        pushToken(piece, piece.w);
      });
      return;
    }
    const spaceW = pendingSpace ? measureRun(doc, fonts, pendingSpace, size, color) : 0;
    if (line.length && lineW + spaceW + wordW > width) {
      flush();
      pushToken(token, wordW);
      return;
    }
    if (line.length && pendingSpace) pushToken(pendingSpace, spaceW);
    pushToken(token, wordW);
    pendingSpace = null;
  });
  flush();
  return lines;
}

function drawLogoMark(doc, fonts, x, y, size) {
  const r = 6;
  doc.save();
  doc.roundedRect(x, y, size, size, r).fill(BLUE);
  doc.fillColor(WHITE).font(fonts.bold).fontSize(size * 0.38);
  doc.text('EC', x, y + size * 0.28, { width: size, align: 'center', lineBreak: false });
  doc.restore();
}

function drawInnerChrome(doc, fonts, pageNum, totalPages, footerLabel) {
  doc.save();
  doc.rect(0, 0, PAGE_W, HEADER_H).fill(BLUE);
  drawLogoMark(doc, fonts, MARGIN, 8, 26);
  doc.fillColor(WHITE).font(fonts.bold).fontSize(11);
  doc.text(t('EduConnect', fonts), MARGIN + 34, 14, { lineBreak: false });
  doc.font(fonts.reg).fontSize(8);
  doc.text(t(footerLabel, fonts), MARGIN, 16, {
    width: CONTENT_W,
    align: 'right',
    lineBreak: false,
  });
  doc.restore();

  doc.save();
  doc.strokeColor(LINE).lineWidth(0.6);
  doc.moveTo(MARGIN, FOOTER_Y - 8).lineTo(PAGE_W - MARGIN, FOOTER_Y - 8).stroke();
  doc.fillColor(MUTED).font(fonts.reg).fontSize(7.5);
  doc.text(t(`Alliance Digitale Internationale  ·  ${SITE_URL}  ·  ${DOC_DATE}`, fonts), MARGIN, FOOTER_Y, {
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

function layoutRich(ctx, raw, width, opts = {}) {
  const size = opts.size || BODY_SIZE;
  const color = opts.color || GRAY;
  const gap = opts.lineGap || LINE_GAP;
  const tokens = tokenizeRich(raw, ctx.fonts);
  const lines = wrapTokens(ctx.doc, ctx.fonts, tokens, Math.max(width - 1, 40), size, color);
  return { lines, size, color, gap, step: lineStep(size, gap) };
}

function drawRich(ctx, raw, x, y, width, opts = {}) {
  const { doc, fonts } = ctx;
  const layout = layoutRich(ctx, raw, width, opts);
  let cy = y;
  layout.lines.forEach((line) => {
    if (cy + layout.step > BOTTOM) {
      doc.addPage();
      ctx.page += 1;
      cy = HEADER_H + 22;
    }
    let cx = x;
    line.forEach((tok) => {
      const w = Number.isFinite(tok.w) ? tok.w : measureRun(doc, fonts, tok, layout.size, layout.color);
      styleRun(doc, fonts, tok, layout.size, layout.color);
      doc.text(tok.text, cx, cy, { lineBreak: false, continued: false });
      if (tok.href && w > 0) {
        doc.link(cx, cy, w, layout.size + 1, tok.href);
      }
      cx += w;
    });
    cy += layout.step;
  });
  doc.x = x;
  doc.y = cy;
  return cy;
}

function heightOfRich(ctx, raw, width, size = BODY_SIZE) {
  const layout = layoutRich(ctx, raw, width, { size });
  if (!layout.lines.length) return 0;
  return layout.lines.length * layout.step;
}

function writeBlocks(ctx, blocks) {
  const { doc, fonts } = ctx;

  blocks.forEach((block) => {
    if (block.type === 'h1') {
      ensureSpace(ctx, 96);
      ctx.y = drawRich(ctx, `**${stripInline(block.text)}**`, MARGIN, ctx.y, CONTENT_W, {
        color: TEXT,
        size: 18,
        lineGap: 2,
      }) + 6;
      doc.strokeColor(BLUE).lineWidth(2.2);
      doc.moveTo(MARGIN, ctx.y).lineTo(MARGIN + 56, ctx.y).stroke();
      ctx.y += 12;
      return;
    }

    if (block.type === 'h2') {
      ensureSpace(ctx, 88);
      ctx.y = drawRich(ctx, `**${stripInline(block.text)}**`, MARGIN, ctx.y, CONTENT_W, {
        color: TEXT,
        size: 13.5,
        lineGap: 2,
      }) + 4;
      doc.strokeColor(BLUE).lineWidth(1.8);
      doc.moveTo(MARGIN, ctx.y).lineTo(MARGIN + 44, ctx.y).stroke();
      ctx.y += 12;
      return;
    }

    if (block.type === 'h3') {
      ensureSpace(ctx, 72);
      ctx.y = drawRich(ctx, `**${stripInline(block.text)}**`, MARGIN, ctx.y, CONTENT_W, {
        color: BLUE,
        size: 11,
        lineGap: 2,
      }) + 6;
      return;
    }

    if (block.type === 'hr') {
      ensureSpace(ctx, 16);
      doc.strokeColor(LINE).lineWidth(0.7);
      doc.moveTo(MARGIN, ctx.y).lineTo(PAGE_W - MARGIN, ctx.y).stroke();
      ctx.y += 14;
      return;
    }

    if (block.type === 'p') {
      const h = heightOfRich(ctx, block.text, CONTENT_W);
      ensureSpace(ctx, Math.min(h, 80) + 8);
      ctx.y = drawRich(ctx, block.text, MARGIN, ctx.y, CONTENT_W) + 8;
      return;
    }

    if (block.type === 'ul') {
      block.items.forEach((item) => {
        const h = heightOfRich(ctx, item, CONTENT_W - 16);
        ensureSpace(ctx, Math.min(h, 80) + 8);
        doc.circle(MARGIN + 4, ctx.y + 6, 2.2).fill(BLUE);
        ctx.y = drawRich(ctx, item, MARGIN + 16, ctx.y, CONTENT_W - 16) + 5;
      });
      ctx.y += 4;
      return;
    }

    if (block.type === 'ol') {
      block.items.forEach((item, idx) => {
        const h = heightOfRich(ctx, item, CONTENT_W - 22);
        ensureSpace(ctx, Math.min(h, 80) + 10);
        doc.fillColor(BLUE).font(fonts.bold).fontSize(BODY_SIZE);
        doc.text(`${idx + 1}.`, MARGIN, ctx.y, { width: 16, lineBreak: false, continued: false });
        ctx.y = drawRich(ctx, item, MARGIN + 20, ctx.y, CONTENT_W - 20) + 6;
      });
      ctx.y += 4;
      return;
    }

    if (block.type === 'callout') {
      const pad = 12;
      const innerW = CONTENT_W - pad * 2 - 4;
      const titleH = block.title ? heightOfRich(ctx, `**${stripInline(block.title)}**`, innerW, BODY_SIZE) : 0;
      const bodyH = block.text ? heightOfRich(ctx, block.text, innerW, BODY_SIZE) : 0;
      const boxH = pad + titleH + (block.title && block.text ? 4 : 0) + bodyH + pad + 2;
      ensureSpace(ctx, boxH + 10);
      const y = ctx.y;
      doc.save();
      doc.roundedRect(MARGIN, y, CONTENT_W, boxH, 5).fill(ORANGE_SOFT);
      doc.rect(MARGIN, y, 4, boxH).fill(ORANGE);
      doc.restore();
      let ty = y + pad;
      if (block.title) {
        ty = drawRich(ctx, `**${stripInline(block.title)}**`, MARGIN + pad + 4, ty, innerW, {
          color: ORANGE,
          size: BODY_SIZE,
        });
        ty += 4;
      }
      if (block.text) {
        drawRich(ctx, block.text, MARGIN + pad + 4, ty, innerW, { color: GRAY });
      }
      ctx.y = y + boxH + 12;
    }
  });
}

function writePdf(guide) {
  const loaded = loadMarkdown(guide.slug);
  const blocks = parseBlocks(loaded.markdown);
  const outPath = pdfPath(guide.slug);
  const footerLabel = `Guide ${guide.navLabel.toLowerCase()}`;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      autoFirstPage: true,
      bufferPages: true,
      info: {
        Title: `EduConnect — ${guide.title}`,
        Author: 'EduConnect — Alliance Digitale Internationale',
        Subject: `Guide utilisateur ${guide.audience} — Côte d'Ivoire`,
        Keywords: 'EduConnect, école, Wave, Orange Money, Côte d\'Ivoire',
      },
    });

    const fonts = setupFonts(doc);
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);

    const ctx = { doc, fonts, y: HEADER_H + 22, page: 1 };

    doc.rect(0, HEADER_H, PAGE_W, 64).fill(BLUE_SOFT);
    drawLogoMark(doc, fonts, MARGIN, HEADER_H + 16, 32);
    doc.fillColor(BLUE_DARK).font(fonts.bold).fontSize(11);
    doc.text(t('EduConnect', fonts), MARGIN + 42, HEADER_H + 18, { lineBreak: false });
    doc.fillColor(MUTED).font(fonts.reg).fontSize(8.5);
    doc.text(t('Côte d\'Ivoire  ·  Wave & Orange Money  ·  FCFA', fonts), MARGIN + 42, HEADER_H + 34, {
      lineBreak: false,
    });
    doc.fillColor(BLUE).font(fonts.reg).fontSize(8.5);
    doc.text(t(SITE_URL, fonts), MARGIN, HEADER_H + 34, {
      width: CONTENT_W,
      align: 'right',
      lineBreak: false,
    });
    ctx.y = HEADER_H + 80;

    writeBlocks(ctx, blocks);

    const range = doc.bufferedPageRange();
    const total = range.count;
    for (let i = 0; i < total; i += 1) {
      doc.switchToPage(i);
      drawInnerChrome(doc, fonts, i + 1, total, footerLabel);
    }

    doc.end();
    stream.on('finish', () => resolve({ path: outPath, pages: total, fonts, size: fs.statSync(outPath).size }));
    stream.on('error', reject);
  });
}

async function main() {
  const docsDir = path.join(__dirname, '..', 'docs');
  if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

  const results = [];
  for (const guide of listGuides()) {
    const result = await writePdf(guide);
    if (result.size < 8 * 1024) {
      throw new Error(`PDF trop petit (${result.size} octets) : ${result.path}`);
    }
    console.log('Generated:', result.path, result.size, 'bytes,', result.pages, 'pages');
    results.push(result);
  }

  console.log(JSON.stringify({
    ok: true,
    fonts: results[0] && results[0].fonts,
    files: results.map((r) => ({ path: r.path, pages: r.pages, sizeBytes: r.size })),
    contact: CONTACT,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
