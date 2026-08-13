const fs = require('fs');
const path = require('path');
const {
  EPV_SCHOOLS,
  validateEpvCatalog,
  pickSchoolFields,
  generateTempPassword,
} = require('../src/config/epvSchools');

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
      { city: 'Abidjan', address: 'Cocody', waveNumber: '07 00 00 00 00', currentSchoolYear: '2025-2026' },
    );
    expect(fields.address).toBe('Cocody');
    expect(fields.waveNumber).toBe('07 00 00 00 00');
    expect(fields.currentSchoolYear).toBe('2025-2026');
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
});
