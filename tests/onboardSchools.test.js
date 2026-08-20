const fs = require('fs');
const path = require('path');
const {
  EPV_SCHOOLS,
  EPV_ORGANIZATION,
  validateEpvCatalog,
  pickSchoolFields,
  generateTempPassword,
} = require('../src/config/epvSchools');
const { IGEST_SCHOOL } = require('../src/config/igestSchool');
const { EXTRA_SCHOOLS } = require('../src/config/extraSchools');

describe('Catalogue EPV', () => {
  test('contient les 6 écoles en contact', () => {
    expect(EPV_SCHOOLS).toHaveLength(6);
    const names = EPV_SCHOOLS.map((s) => s.name);
    expect(names).toEqual(expect.arrayContaining([
      'EPV Fatoumaba',
      'EPV Graine de la Réussite',
      "EPV L'Effort",
      'EPV ECEME',
      'EPV La Bonne Main de Dieu',
      'EPV Datro Zahui',
    ]));
  });

  test('slugs et emails sont uniques et renseignés', () => {
    const result = validateEpvCatalog();
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.count).toBe(6);
  });

  test('utilise des identifiants @educonnect.ci', () => {
    expect(EPV_SCHOOLS.every((s) => /@educonnect\.ci$/i.test(s.admin.email))).toBe(true);
  });

  test('organisation EPV expose /e/groupe/epv', () => {
    expect(EPV_ORGANIZATION.slug).toBe('epv');
    expect(EPV_ORGANIZATION.name).toBe('EPV');
    expect(EPV_ORGANIZATION.city).toBe('Abidjan');
    expect(EPV_ORGANIZATION.publicDescription).toMatch(/Réseau d'établissements EPV/);
  });

  test('reprend Bingerville et Yopougon depuis les infos déjà connues', () => {
    const eceme = EPV_SCHOOLS.find((s) => s.slug === 'epv-eceme');
    const bonneMain = EPV_SCHOOLS.find((s) => s.slug === 'epv-la-bonne-main-de-dieu');
    expect(eceme.city).toBe('Bingerville');
    expect(bonneMain.campusLabel).toBe('Yopougon Académie');
    expect(bonneMain.city).toBe('Abidjan');
    expect(bonneMain.address).toBe('Fin goudron, Portail Laurier 14, Yopougon');
    expect(bonneMain.admin.phone).toContain('07 87 78 11 12');
    expect(bonneMain.logoFile).toBe('public/img/schools/epv-la-bonne-main-de-dieu.png');
    expect(fs.existsSync(path.join(__dirname, '..', bonneMain.logoFile))).toBe(true);
  });
});

describe('pickSchoolFields', () => {
  test('garde les champs déjà en base si le catalogue n’a pas encore l’info', () => {
    const fields = pickSchoolFields(
      { name: 'EPV Fatoumaba', city: 'Abidjan', campusLabel: null, address: null },
      { city: 'Abidjan', address: 'Cocody', waveNumber: '07 00 00 00 00', currentSchoolYear: '2025-2026', publicPortalEnabled: true },
    );
    expect(fields.address).toBe('Cocody');
    expect(fields.waveNumber).toBe('07 00 00 00 00');
    expect(fields.currentSchoolYear).toBe('2025-2026');
    expect(fields.publicPortalEnabled).toBe(true);
  });

  test('utilise 2026-2027 par défaut pour une nouvelle école', () => {
    const fields = pickSchoolFields({ name: 'EPV Fatoumaba', city: 'Abidjan' });
    expect(fields.currentSchoolYear).toBe('2026-2027');
    expect(fields.city).toBe('Abidjan');
  });
});

describe('generateTempPassword', () => {
  const previous = process.env.ONBOARD_TEMP_PASSWORD;

  afterEach(() => {
    if (previous === undefined) delete process.env.ONBOARD_TEMP_PASSWORD;
    else process.env.ONBOARD_TEMP_PASSWORD = previous;
  });

  test('respecte ONBOARD_TEMP_PASSWORD si défini', () => {
    process.env.ONBOARD_TEMP_PASSWORD = 'Bienvenue2026!';
    expect(generateTempPassword('epv-fatoumaba')).toBe('Bienvenue2026!');
  });

  test('génère un mot de passe distinct par défaut', () => {
    delete process.env.ONBOARD_TEMP_PASSWORD;
    const a = generateTempPassword('epv-fatoumaba');
    const b = generateTempPassword('epv-fatoumaba');
    expect(a).toMatch(/^Epv-fatoumaba-.+!$/);
    expect(a).not.toBe(b);
  });

  test('préfixe IGEST pour un slug hors EPV', () => {
    delete process.env.ONBOARD_TEMP_PASSWORD;
    expect(generateTempPassword('igest-yopougon-sideci')).toMatch(/^Igest-.+!$/);
  });
});

describe('Catalogue IGEST', () => {
  test('reste hors du catalogue EPV (toujours 6 écoles EPV)', () => {
    expect(EPV_SCHOOLS).toHaveLength(6);
    expect(EPV_SCHOOLS.some((s) => s.slug === IGEST_SCHOOL.slug)).toBe(false);
    expect(EXTRA_SCHOOLS).toEqual([IGEST_SCHOOL]);
  });

  test('définit le nom, le slug, le téléphone, le logo et l’identité bulletin IGES', () => {
    expect(IGEST_SCHOOL.name).toBe('IGEST');
    expect(IGEST_SCHOOL.officialName).toBe('COMPLEXE SCOLAIRE IGES');
    expect(IGEST_SCHOOL.legalName).toContain('Institut Général d\'Enseignement Secondaire');
    expect(IGEST_SCHOOL.slug).toBe('igest-yopougon-sideci');
    expect(IGEST_SCHOOL.city).toBe('Abidjan');
    expect(IGEST_SCHOOL.campusLabel).toBe('Yopougon-Sideci');
    expect(IGEST_SCHOOL.menetAgrement).toBe('89 0459/MENSS/DESEC/SDE/CAB-1');
    expect(IGEST_SCHOOL.nccNumber).toBe('9329192D');
    expect(IGEST_SCHOOL.postalAddress).toBe('10 BP 776 Abj. 10');
    expect(IGEST_SCHOOL.dren).toBe('DREN Abidjan 3');
    expect(IGEST_SCHOOL.admin.email).toBe('igest@educonnect.ci');
    expect(IGEST_SCHOOL.admin.firstName).toBe('Affoua Valentine');
    expect(IGEST_SCHOOL.admin.lastName).toBe('Dongo');
    expect(IGEST_SCHOOL.admin.phone).toBe('05 45 47 48 29');
    expect(IGEST_SCHOOL.publicPortalEnabled).toBe(true);
    expect(IGEST_SCHOOL.marketplaceTier).toBe('VIP');
    expect(IGEST_SCHOOL.logoFile).toBe('public/img/schools/igest-yopougon-sideci.png');
    expect(fs.existsSync(path.join(__dirname, '..', IGEST_SCHOOL.logoFile))).toBe(true);
  });
});
