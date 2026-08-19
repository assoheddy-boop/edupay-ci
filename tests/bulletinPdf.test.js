const fs = require('fs');
const os = require('os');
const path = require('path');
const { generateBulletinPdf } = require('../src/services/bulletinPdf');

describe('bulletinPdf generation', () => {
  test('writes a downloadable PDF with student name and average', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bulletin-'));
    const result = await generateBulletinPdf({
      student: {
        id: 'stu-1',
        firstName: 'Awa',
        lastName: 'Kouassi',
        matricule: 'IG-001',
        class: { name: '6e A', schoolYear: '2025-2026' },
      },
      school: { id: 'school-1', name: 'IGEST', currentSchoolYear: '2025-2026' },
      grades: [
        { subject: 'Mathématiques', value: 16, maxValue: 20, period: 'T1', term: 'T1' },
      ],
      period: 'Trimestre 1',
      average: 16,
      rank: 1,
      classSize: 20,
      coeffMap: { Mathématiques: 4 },
      outputDir: tmp,
    });

    expect(result.buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(result.buffer.length).toBeGreaterThan(200);
    expect(fs.existsSync(result.filepath)).toBe(true);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
