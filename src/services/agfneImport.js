const { parseCsv, parseXlsx, detectImportKind } = require('../utils/csvStudents');
const { normalizeAgfneHeaders, normalizeAgfneRow } = require('./agfneMapper');

const AGFNE_XML_MIME = ['application/xml', 'text/xml'];

function detectAgfneFormat(file = {}) {
  const name = String(file.originalname || file.filename || '').toLowerCase();
  const mime = String(file.mimetype || '').toLowerCase();
  if (name.endsWith('.xml') || AGFNE_XML_MIME.includes(mime)) return 'xml';
  return detectImportKind(file);
}

async function parseAgfneXml(buffer) {
  const text = buffer.toString('utf-8').replace(/^\ufeff/, '');
  const eleveBlocks = text.match(/<eleve\b[^>]*>([\s\S]*?)<\/eleve>/gi)
    || text.match(/<student\b[^>]*>([\s\S]*?)<\/student>/gi)
    || [];

  const rows = eleveBlocks.map((block, index) => {
    const fields = {};
    const tagRe = /<([a-zA-Z0-9_-]+)(?:\s[^>]*)?>([^<]*)<\/\1>/g;
    let match;
    while ((match = tagRe.exec(block)) !== null) {
      fields[match[1]] = match[2].trim();
    }
    return normalizeAgfneRow(fields, index + 1);
  });

  if (!rows.length) {
    const err = new Error('Aucun élément <eleve> trouvé dans le XML');
    err.code = 'XML_EMPTY';
    throw err;
  }

  return { headers: Object.keys(rows[0] || {}), rows };
}

async function parseAgfneFile(file) {
  const kind = detectAgfneFormat(file);
  if (!kind) {
    return {
      ok: false,
      error: 'file',
      status: 400,
      message: 'Format non pris en charge. Utilisez CSV, Excel (.xlsx) ou XML AGFNE/SIGFNE.',
    };
  }

  if (!file?.buffer?.length) {
    return {
      ok: false,
      error: 'file',
      status: 400,
      message: 'Fichier requis (CSV, Excel ou XML).',
    };
  }

  try {
    let raw;
    if (kind === 'xml') {
      raw = await parseAgfneXml(file.buffer);
    } else if (kind === 'xlsx') {
      raw = await parseXlsx(file.buffer);
    } else {
      raw = parseCsv(file.buffer.toString('utf-8'));
    }

    const rows = (raw.rows || []).map((row) => normalizeAgfneRow(row, row.lineNumber));
    return {
      ok: true,
      kind,
      filename: file.originalname || 'import',
      rows,
      headers: normalizeAgfneHeaders(raw.headers || []),
    };
  } catch (err) {
    console.error('[agfneImport] parse error', err);
    return {
      ok: false,
      error: 'file',
      status: 400,
      message: kind === 'xml'
        ? 'Fichier XML illisible. Vérifiez le format SIGFNE/AGFNE.'
        : kind === 'xlsx'
          ? 'Fichier Excel illisible.'
          : 'Fichier CSV illisible.',
    };
  }
}

module.exports = {
  detectAgfneFormat,
  parseAgfneFile,
  parseAgfneXml,
};
