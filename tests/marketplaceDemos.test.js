jest.mock('../src/config/database', () => ({
  organization: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  school: {
    updateMany: jest.fn(),
    findMany: jest.fn(),
  },
}));

jest.mock('../src/utils/group', () => ({
  ensureGroupForOrganization: jest.fn(async (org) => ({ ...org, groupId: 'grp-1' })),
}));

const prisma = require('../src/config/database');
const { ensureGroupForOrganization } = require('../src/utils/group');
const { ensureEpvOrganizationPortal } = require('../src/services/marketplace');
const { EPV_SCHOOLS, EPV_ORGANIZATION } = require('../src/config/epvSchools');

const samplePublishedSchool = {
  id: 's1',
  slug: 'epv-fatoumaba',
  name: 'EPV Fatoumaba',
  city: 'Abidjan',
  marketplaceTier: 'PREMIUM',
  publicPortalEnabled: true,
  publicFeatured: true,
  publicType: 'PRIVE',
};

describe('ensureEpvOrganizationPortal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('creates org, links EPV schools, and reports published campuses', async () => {
    const org = { id: 'org-1', slug: 'epv', name: 'EPV', publicPortalEnabled: true };
    prisma.organization.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(org);
    prisma.organization.create.mockResolvedValue(org);
    prisma.school.updateMany.mockResolvedValue({ count: EPV_SCHOOLS.length });
    prisma.school.findMany.mockResolvedValue([samplePublishedSchool]);

    const result = await ensureEpvOrganizationPortal();

    expect(prisma.organization.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        slug: EPV_ORGANIZATION.slug,
        name: EPV_ORGANIZATION.name,
        publicPortalEnabled: true,
      }),
    });
    expect(prisma.school.updateMany).toHaveBeenCalledWith({
      where: { slug: { in: EPV_SCHOOLS.map((s) => s.slug) } },
      data: { organizationId: 'org-1' },
    });
    expect(ensureGroupForOrganization).toHaveBeenCalledWith(org);
    expect(result).toMatchObject({
      ok: true,
      slug: 'epv',
      created: true,
      linked: EPV_SCHOOLS.length,
      publishedSchools: 1,
    });
  });

  test('updates existing org idempotently', async () => {
    const existing = { id: 'org-1', slug: 'epv', name: 'EPV', publicPortalEnabled: false, city: 'Abidjan' };
    const updated = { ...existing, publicPortalEnabled: true };
    prisma.organization.findFirst
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(updated);
    prisma.organization.update.mockResolvedValue(updated);
    prisma.school.updateMany.mockResolvedValue({ count: EPV_SCHOOLS.length });
    prisma.school.findMany.mockResolvedValue([samplePublishedSchool]);

    const result = await ensureEpvOrganizationPortal();

    expect(prisma.organization.create).not.toHaveBeenCalled();
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: expect.objectContaining({ publicPortalEnabled: true }),
    });
    expect(result).toMatchObject({ ok: true, created: false, linked: EPV_SCHOOLS.length });
  });
});
