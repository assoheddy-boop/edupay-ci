jest.mock('../src/config/database', () => ({
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn((ops) => Promise.all(ops)),
  payment: { findMany: jest.fn() },
  absenceJustification: { findMany: jest.fn() },
}));

jest.mock('../src/utils/refreshToken', () => ({
  revokeUserRefreshTokens: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/ConsentService', () => ({
  listConsents: jest.fn().mockResolvedValue([{ type: 'DATA_PROCESSING', status: 'GRANTED' }]),
}));

const prisma = require('../src/config/database');
const { revokeUserRefreshTokens } = require('../src/utils/refreshToken');
const {
  exportParentAccountData,
  requestAccountDeletion,
} = require('../src/services/accountGdpr');

describe('accountGdpr', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('exportParentAccountData returns structured JSON', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'p@test.ci',
      role: 'PARENT',
      firstName: 'Marie',
      lastName: 'K',
      phone: '0700000000',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      parentProfile: {
        id: 'pp1',
        children: [{
          relation: 'parent',
          studentId: 's1',
          student: {
            id: 's1',
            firstName: 'Jean',
            lastName: 'K',
            matricule: 'MAT-1',
            class: { id: 'c1', name: '6e A', schoolYear: '2025-2026', schoolId: 'sch1' },
            school: { id: 'sch1', name: 'Lycée', city: 'Abidjan' },
          },
        }],
      },
      consents: [],
      notifications: [],
      sentMessages: [],
      receivedMessages: [],
    });
    prisma.payment.findMany.mockResolvedValue([]);
    prisma.absenceJustification.findMany.mockResolvedValue([]);

    const data = await exportParentAccountData('u1');
    expect(data.ok).toBe(true);
    expect(data.profile.email).toBe('p@test.ci');
    expect(data.children).toHaveLength(1);
  });

  test('requestAccountDeletion requires SUPPRIMER confirmation', async () => {
    const result = await requestAccountDeletion('u1', { confirmation: 'non' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('confirmation');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test('requestAccountDeletion deactivates and revokes sessions', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', isActive: true, email: 'p@test.ci' });
    prisma.user.update.mockResolvedValue({});

    const result = await requestAccountDeletion('u1', { confirmation: 'SUPPRIMER' });
    expect(result.ok).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'u1' },
      data: expect.objectContaining({ isActive: false }),
    }));
    expect(revokeUserRefreshTokens).toHaveBeenCalledWith('u1');
  });
});
