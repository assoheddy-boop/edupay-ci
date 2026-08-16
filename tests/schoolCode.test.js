jest.mock('../src/config/database', () => ({
  school: { findFirst: jest.fn(), findUnique: jest.fn() },
}));

const prisma = require('../src/config/database');
const { findSchoolByCode } = require('../src/utils/schoolCode');

describe('findSchoolByCode', () => {
  beforeEach(() => jest.clearAllMocks());

  test('looks up the slug only, never a raw cuid', async () => {
    prisma.school.findFirst.mockResolvedValue({ id: 'sch_1', slug: 'ecole-les-etoiles' });
    const school = await findSchoolByCode('Ecole-Les-Etoiles');
    expect(school.slug).toBe('ecole-les-etoiles');
    expect(prisma.school.findFirst).toHaveBeenCalledWith({
      where: { slug: 'ecole-les-etoiles' },
    });
  });

  test('ignores empty or oversized codes', async () => {
    expect(await findSchoolByCode('')).toBeNull();
    expect(await findSchoolByCode('x'.repeat(80))).toBeNull();
    expect(prisma.school.findFirst).not.toHaveBeenCalled();
  });
});
