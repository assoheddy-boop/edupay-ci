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
  classe: 'className',
  class: 'className',
  class_name: 'className',
  date_naissance: 'birthDate',
  birthdate: 'birthDate',
  birth_date: 'birthDate',
  naissance: 'birthDate',
};

function normalizeHeader(raw) {
  const key = raw.trim().toLowerCase().replace(/^\ufeff/, '');
  return HEADER_ALIASES[key] || key;
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

function parseBirthDate(raw) {
  if (!raw) return null;
  const s = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00`);

  const fr = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (fr) {
    const d = fr[1].padStart(2, '0');
    const m = fr[2].padStart(2, '0');
    return new Date(`${fr[3]}-${m}-${d}T12:00:00`);
  }

  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildClassMap(classes) {
  const map = new Map();
  classes.forEach((c) => {
    map.set(c.name.trim().toLowerCase(), c.id);
  });
  return map;
}

function prepareStudentRows(rows, classes, existingMatricules = new Set()) {
  const classMap = buildClassMap(classes);
  const valid = [];
  const errors = [];
  const seenMatricules = new Set();

  rows.forEach((row) => {
    const line = row.lineNumber;
    const firstName = row.firstName?.trim();
    const lastName = row.lastName?.trim();
    const className = row.className?.trim();
    const matricule = row.matricule?.trim() || null;

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
        errors.push({ line, message: `Matricule déjà utilisé : ${matricule}` });
        return;
      }
      seenMatricules.add(key);
    }

    const birthDate = parseBirthDate(row.birthDate);
    if (row.birthDate?.trim() && !birthDate) {
      errors.push({ line, message: `Date invalide : ${row.birthDate}` });
      return;
    }

    valid.push({ firstName, lastName, matricule, classId, birthDate, lineNumber: line });
  });

  return { valid, errors };
}

const CSV_TEMPLATE = '\ufeffprenom;nom;matricule;classe;date_naissance\nKofi;Koné;ETOILE-002;CM2 A;12/03/2015\nAwa;Traoré;;CM2 A;\n';

module.exports = {
  parseCsv,
  prepareStudentRows,
  CSV_TEMPLATE,
};
