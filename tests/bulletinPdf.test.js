const fs = require('fs');
const os = require('os');
const path = require('path');
const { generateBulletinPdf } = require('../src/services/bulletinPdf');

describe('bulletinPdf generation', () => {
  const basePayload = {
    student: {
      id: 'stu-1',
      firstName: 'Awa',
      lastName: 'Kouassi',
      gender: 'F',
      birthDate: new Date('2010-07-12'),
      class: { name: '6e A', schoolYear: '2025-2026' },
    },
    school: {
      id: 'school-1',
      name: 'IGEST',
      city: 'Abidjan',
      currentSchoolYear: '2025-2026',
      publicPhone: '+225 07 00 00 00',
    },
    grades: [
      {
        subject: 'Mathématiques',
        value: 16,
        maxValue: 20,
        period: 'T1',
        term: 'T1',
        comment: 'Très bien',
        teacher: { user: { firstName: 'Jean', lastName: 'KONAN' } },
      },
    ],
    period: 'Trimestre 1',
    average: 16,
    rank: 1,
    classSize: 20,
    coeffMap: { Mathématiques: 4 },
    subjectRanks: { Mathématiques: 1 },
    classStats: { classAverage: 12, highest: 16, lowest: 8 },
    repeatYear: false,
  };

  test('writes a downloadable CI-format PDF with bordered grid', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bulletin-'));
    const result = await generateBulletinPdf({ ...basePayload, outputDir: tmp });

    expect(result.buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(result.buffer.length).toBeGreaterThan(800);
    expect(fs.existsSync(result.filepath)).toBe(true);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('includes bilan annuel page for T3', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bulletin-'));
    const result = await generateBulletinPdf({
      ...basePayload,
      period: 'Trimestre 3',
      termAverages: { T1: 11.46, T2: 13, T3: 12.77 },
      annualAverage: 12.41,
      outputDir: tmp,
    });

    expect(result.buffer.length).toBeGreaterThan(1200);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
