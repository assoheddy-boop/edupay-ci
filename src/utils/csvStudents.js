const HEADER_ALIASES = {
  prenom: 'firstName',
  prénom: 'firstName',
  firstname: 'firstName',
  first_name: 'firstName',
  nom: 'lastName',
  lastname: 'lastName',
  last_name: 'lastName',
  matricule: 'matricule',
  code: 'matricule',
  matricule_ecole: 'matricule',
  'matricule ecole': 'matricule',
  matricule_national: 'nationalMatricule',
  'matricule national': 'nationalMatricule',
  national_matricule: 'nationalMatricule',
  'national matricule': 'nationalMatricule',
  matriculenational: 'nationalMatricule',
  classe: 'className',
  class: 'className',
  class_name: 'className',
  date_naissance: 'birthDate',
  date_de_naissance: 'birthDate',
  birthdate: 'birthDate',
  birth_date: 'birthDate',
  naissance: 'birthDate',
  genre: 'gender',
  gender: 'gender',
  sexe: 'gender',
};

const IMPORT_TEMPLATE_COLUMNS = [
  'prenom',
  'nom',
  'matricule',
  'matricule_national',
  'classe',
  'date_naissance',
  'genre',
];

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function normalizeHeader(raw) {
  const text = String(raw ?? '').replace(/^\ufeff/, '').trim();
  const key = text.toLowerCase().replace(/\s+/g, '_');
  return HEADER_ALIASES[key] || HEADER_ALIASES[text.toLowerCase()] || key;
}

function detectDelimiter(line) {
  const semi = (line.match(/;/g) || []).length;
  const comma = (line.match(/,/g) || []).length;
  return semi > comma ? ';' : ',';
}

function parseCsvLine(line, delimiter) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseCsv(text) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return { headers: [], rows: [] };

  const lines = normalized.split('\n').filter((l) => l.trim());
  const delimiter = detectDelimiter(lines[0]);
  const headerFields = parseCsvLine(lines[0], delimiter);
  const headers = headerFields.map(normalizeHeader);

  const rows = lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line, delimiter);
    const row = { lineNumber: index + 2 };
    headers.forEach((h, i) => {
      row[h] = values[i]?.trim() ?? '';
    });
    return row;
  });

  return { headers, rows };
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatDayMonthYear(date) {
  return `${pad2(date.getUTCDate())}/${pad2(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}

function excelSerialToDate(serial) {
  const n = Number(serial);
  if (!Number.isFinite(n)) return null;
  const utcDays = Math.floor(n) - 25569;
  const frac = n - Math.floor(n);
  return new Date(utcDays * 86400000 + Math.round(frac * 86400000));
}

function cellToString(value, { asDate } = {}) {
  if (value == null || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDayMonthYear(value);
  }
  if (typeof value === 'number' && asDate) {
    const date = excelSerialToDate(value);
    return date && !Number.isNaN(date.getTime()) ? formatDayMonthYear(date) : String(value);
  }
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text || '').join('').trim();
    }
    if (value.result != null) return cellToString(value.result, { asDate });
    if (value.text != null) return String(value.text).trim();
    if (value.hyperlink != null && value.text == null) return String(value.hyperlink).trim();
  }
  return String(value).trim();
}

async function parseXlsx(buffer) {
  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const ws = workbook.worksheets[0];
  if (!ws) return { headers: [], rows: [] };

  const headerRow = ws.getRow(1);
  const colCount = Math.max(ws.columnCount || 0, headerRow.cellCount || 0);
  const headers = [];
  for (let c = 1; c <= colCount; c += 1) {
    headers[c] = normalizeHeader(cellToString(headerRow.getCell(c).value));
  }

  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const parsed = { lineNumber: rowNumber };
    let empty = true;
    for (let c = 1; c <= colCount; c += 1) {
      const h = headers[c];
      if (!h) continue;
      const value = cellToString(row.getCell(c).value, { asDate: h === 'birthDate' });
      parsed[h] = value;
      if (value) empty = false;
    }
    if (!empty) rows.push(parsed);
  });

  return { headers: headers.filter(Boolean), rows };
}

function detectImportKind(file = {}) {
  const name = String(file.originalname || file.filename || '').toLowerCase();
  const mime = String(file.mimetype || '').toLowerCase();
  if (name.endsWith('.xlsx') || mime.includes('spreadsheetml')) return 'xlsx';
  if (name.endsWith('.xls')) return null;
  if (name.endsWith('.csv') || mime === 'text/csv' || mime === 'text/plain') return 'csv';
  const buf = file.buffer;
  if (Buffer.isBuffer(buf) && buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b) return 'xlsx';
  if (mime === 'application/vnd.ms-excel') return 'csv';
  if (buf && buf.length) return 'csv';
  return null;
}

async function buildExcelTemplate() {
  const { buildWorkbook } = require('../services/exportExcel');
  return buildWorkbook('Élèves', IMPORT_TEMPLATE_COLUMNS.map((header) => ({
    header,
    key: header,
    width: header === 'matricule_national' ? 22 : 16,
  })), [
    {
      prenom: 'Kofi',
      nom: 'Koné',
      matricule: 'ETOILE-002',
      matricule_national: 'CI-MEN-002',
      classe: 'CM2 A',
      date_naissance: '12/03/2015',
      genre: 'M',
    },
    {
      prenom: 'Awa',
      nom: 'Traoré',
      matricule: '',
      matricule_national: '',
      classe: 'CM2 A',
      date_naissance: '',
      genre: 'F',
    },
  ]);
}

function parseBirthDate(raw) {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw;
  }
  const s = String(raw).trim();
  if (!s) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return dateFromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const fr = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (fr) return dateFromParts(Number(fr[3]), Number(fr[2]), Number(fr[1]));

  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateFromParts(year, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day, 12, 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

function normalizeImportGender(raw) {
  if (raw == null || String(raw).trim() === '') return { ok: true, gender: '' };
  const g = String(raw).trim().toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '');
  if (['M', 'G', 'GARCON', 'MASCULIN', 'HOMME', 'BOY', 'MALE'].includes(g)) {
    return { ok: true, gender: 'M' };
  }
  if (['F', 'FILLE', 'FEMININ', 'FEMME', 'GIRL', 'FEMALE'].includes(g)) {
    return { ok: true, gender: 'F' };
  }
  return { ok: false, gender: null };
}

function buildClassMap(classes) {
  const map = new Map();
  classes.forEach((c) => {
    map.set(c.name.trim().toLowerCase(), c.id);
  });
  return map;
}

function prepareStudentRows(rows, classes, existingMatricules = new Set(), existingNationalMatricules = new Set()) {
  const classMap = buildClassMap(classes);
  const valid = [];
  const errors = [];
  const seenMatricules = new Set();
  const seenNational = new Set();

  rows.forEach((row) => {
    const line = row.lineNumber;
    const firstName = row.firstName?.trim();
    const lastName = row.lastName?.trim();
    const className = row.className?.trim();
    const matricule = row.matricule?.trim() || null;
    const nationalMatricule = row.nationalMatricule?.trim() || null;
    const birthRaw = row.birthDate == null ? '' : String(row.birthDate).trim();

    if (!firstName || !lastName) {
      errors.push({ line, message: 'Prénom et nom obligatoires' });
      return;
    }
    if (!className) {
      errors.push({ line, message: 'Classe manquante' });
      return;
    }

    const classId = classMap.get(className.toLowerCase());
    if (!classId) {
      errors.push({ line, message: `Classe introuvable : « ${className} »` });
      return;
    }

    if (matricule) {
      const key = matricule.toLowerCase();
      if (seenMatricules.has(key) || existingMatricules.has(key)) {
        errors.push({ line, message: `Matricule école déjà utilisé : ${matricule}` });
        return;
      }
      seenMatricules.add(key);
    }

    if (nationalMatricule) {
      const key = nationalMatricule.toLowerCase();
      if (seenNational.has(key) || existingNationalMatricules.has(key)) {
        errors.push({ line, message: `Matricule national déjà utilisé : ${nationalMatricule}` });
        return;
      }
      seenNational.add(key);
    }

    const birthDate = parseBirthDate(birthRaw);
    if (birthRaw && !birthDate) {
      errors.push({ line, message: `Date invalide : ${birthRaw}` });
      return;
    }

    const genderResult = normalizeImportGender(row.gender);
    if (!genderResult.ok) {
      errors.push({ line, message: `Genre invalide : ${row.gender}` });
      return;
    }

    valid.push({
      firstName,
      lastName,
      matricule,
      nationalMatricule,
      classId,
      birthDate,
      gender: genderResult.gender,
      lineNumber: line,
    });
  });

  return { valid, errors };
}

const CSV_TEMPLATE = `\ufeff${IMPORT_TEMPLATE_COLUMNS.join(';')}\nKofi;Koné;ETOILE-002;CI-MEN-002;CM2 A;12/03/2015;M\nAwa;Traoré;;;CM2 A;;F\n`;

module.exports = {
  parseCsv,
  parseXlsx,
  prepareStudentRows,
  detectImportKind,
  buildExcelTemplate,
  normalizeImportGender,
  CSV_TEMPLATE,
  IMPORT_TEMPLATE_COLUMNS,
  XLSX_MIME,
};
