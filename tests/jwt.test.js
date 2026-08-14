jest.mock('../src/config/database', () => ({
  refreshToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
}));

const jwt = require('jsonwebtoken');

describe('JWT key rotation', () => {
  const prevSecret = process.env.JWT_SECRET;
  const prevPrevious = process.env.JWT_SECRET_PREVIOUS;
  const prevSecrets = process.env.JWT_SECRETS;
  const prevTtl = process.env.JWT_ACCESS_TTL;

  beforeEach(() => {
    jest.resetModules();
    process.env.JWT_SECRET = 'current-secret';
    process.env.JWT_SECRET_PREVIOUS = 'previous-secret';
    delete process.env.JWT_SECRETS;
    process.env.JWT_ACCESS_TTL = '15m';
  });

  afterAll(() => {
    if (prevSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = prevSecret;
    if (prevPrevious === undefined) delete process.env.JWT_SECRET_PREVIOUS;
    else process.env.JWT_SECRET_PREVIOUS = prevPrevious;
    if (prevSecrets === undefined) delete process.env.JWT_SECRETS;
    else process.env.JWT_SECRETS = prevSecrets;
    if (prevTtl === undefined) delete process.env.JWT_ACCESS_TTL;
    else process.env.JWT_ACCESS_TTL = prevTtl;
  });

  test('signs with current secret and verifies', () => {
    const { signToken, verifyToken } = require('../src/utils/jwt');
    const token = signToken({ userId: 'u1', role: 'PARENT' });
    expect(verifyToken(token).userId).toBe('u1');
  });

  test('verifies tokens signed with the previous secret', () => {
    const { verifyToken } = require('../src/utils/jwt');
    const oldToken = jwt.sign({ userId: 'u2', role: 'PARENT' }, 'previous-secret', { expiresIn: '15m' });
    expect(verifyToken(oldToken).userId).toBe('u2');
  });

  test('JWT_SECRETS comma-separated list is used for verify', () => {
    process.env.JWT_SECRETS = 'alpha,beta,gamma';
    delete process.env.JWT_SECRET_PREVIOUS;
    jest.resetModules();
    const { signToken, verifyToken } = require('../src/utils/jwt');
    const token = signToken({ userId: 'u3' });
    expect(verifyToken(token).userId).toBe('u3');
    const betaToken = jwt.sign({ userId: 'u4' }, 'beta', { expiresIn: '5m' });
    expect(verifyToken(betaToken).userId).toBe('u4');
  });

  test('rejects a token signed with an unknown secret', () => {
    const { verifyToken } = require('../src/utils/jwt');
    const bad = jwt.sign({ userId: 'u5' }, 'not-a-known-secret', { expiresIn: '5m' });
    expect(() => verifyToken(bad)).toThrow();
  });

  test('access tokens expire according to JWT_ACCESS_TTL', () => {
    process.env.JWT_ACCESS_TTL = '1s';
    jest.resetModules();
    const { signToken, verifyToken } = require('../src/utils/jwt');
    const token = signToken({ userId: 'u6' });
    const decoded = jwt.decode(token);
    expect(decoded.exp - decoded.iat).toBe(1);
    expect(verifyToken(token).userId).toBe('u6');
  });
});

describe('Refresh tokens', () => {
  const prisma = require('../src/config/database');
  const {
    hashToken,
    createRefreshToken,
    findValidRefreshToken,
    rotateRefreshToken,
    revokeRefreshToken,
    revokeUserRefreshTokens,
  } = require('../src/utils/refreshToken');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('hashToken is sha256 hex', () => {
    expect(hashToken('abc')).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken('abc')).toBe(hashToken('abc'));
  });

  test('createRefreshToken stores a hash not the raw value', async () => {
    prisma.refreshToken.create.mockResolvedValue({});
    const { raw, expiresAt } = await createRefreshToken('user-1');
    expect(raw).toBeTruthy();
    expect(raw.length).toBeGreaterThan(20);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    const stored = prisma.refreshToken.create.mock.calls[0][0].data;
    expect(stored.userId).toBe('user-1');
    expect(stored.tokenHash).toBe(hashToken(raw));
    expect(stored.tokenHash).not.toBe(raw);
  });

  test('findValidRefreshToken rejects revoked and expired', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt1',
      userId: 'user-1',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(findValidRefreshToken('raw')).resolves.toBeNull();

    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt2',
      userId: 'user-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(findValidRefreshToken('raw')).resolves.toBeNull();
  });

  test('rotateRefreshToken revokes old and issues new', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-old',
      userId: 'user-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.refreshToken.update.mockResolvedValue({});
    prisma.refreshToken.create.mockResolvedValue({});

    const rotated = await rotateRefreshToken('old-raw');
    expect(rotated.userId).toBe('user-1');
    expect(rotated.raw).toBeTruthy();
    expect(prisma.refreshToken.update).toHaveBeenCalledWith({
      where: { id: 'rt-old' },
      data: { revokedAt: expect.any(Date) },
    });
  });

  test('revokeUserRefreshTokens marks all active tokens', async () => {
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });
    await revokeUserRefreshTokens('user-1');
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  test('revokeRefreshToken is a no-op without a token', async () => {
    await revokeRefreshToken(null);
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});
