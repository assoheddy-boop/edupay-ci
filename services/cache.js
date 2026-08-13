const { createClient } = require('redis');

const memory = new Map();
const DEFAULT_TTL = 300;
const FAIL_COOLDOWN_MS = 15000;
const redisEnabled = process.env.NODE_ENV !== 'test' && process.env.DISABLE_REDIS !== 'true';

let client = null;
let connecting = null;
let lastFailAt = 0;

function memorySet(key, value, ttl) {
  memory.set(key, {
    value,
    expires: Date.now() + ttl * 1000,
  });
}

function memoryGet(key) {
  const entry = memory.get(key);
  if (!entry) return null;
  if (entry.expires <= Date.now()) {
    memory.delete(key);
    return null;
  }
  return entry.value;
}

async function getRedis() {
  if (!redisEnabled) return null;
  if (client?.isOpen) return client;
  if (connecting) return connecting;
  if (Date.now() - lastFailAt < FAIL_COOLDOWN_MS) return null;

  connecting = (async () => {
    const redis = createClient({
      url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
      socket: { connectTimeout: 1500, reconnectStrategy: false },
    });
    redis.on('error', () => {});
    try {
      await redis.connect();
      if (!redis.isOpen) throw new Error('redis_closed');
      client = redis;
      return client;
    } catch {
      lastFailAt = Date.now();
      try {
        redis.disconnect();
      } catch {
        // ignore
      }
      client = null;
      return null;
    } finally {
      connecting = null;
    }
  })();

  return connecting;
}

async function setCache(key, value, ttl = DEFAULT_TTL) {
  if (!key) return false;
  const seconds = Number(ttl);
  const expire = Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_TTL;
  const payload = JSON.stringify(value);
  memorySet(key, payload, expire);

  let redis = null;
  try {
    redis = await getRedis();
  } catch {
    redis = null;
  }
  if (!redis) return true;
  try {
    await redis.set(key, payload, { EX: expire });
  } catch {
    // mémoire locale déjà à jour
  }
  return true;
}

async function getCache(key) {
  if (!key) return null;

  let redis = null;
  try {
    redis = await getRedis();
  } catch {
    redis = null;
  }
  if (redis) {
    try {
      const raw = await redis.get(key);
      if (raw != null) {
        memorySet(key, raw, DEFAULT_TTL);
        return JSON.parse(raw);
      }
    } catch {
      // fallback mémoire
    }
  }

  const raw = memoryGet(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function delCache(key) {
  if (!key) return;
  memory.delete(key);
  let redis = null;
  try {
    redis = await getRedis();
  } catch {
    redis = null;
  }
  if (!redis) return;
  try {
    await redis.del(key);
  } catch {
    // ignore
  }
}

module.exports = {
  setCache,
  getCache,
  delCache,
};
