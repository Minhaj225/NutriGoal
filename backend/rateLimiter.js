const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { Redis } = require('@upstash/redis');

const unavailable = (_req, res) => res.status(503).json({ error: 'Rate limiting unavailable' });

function bounded(operation, timeoutMs = 2000) {
  let timer;
  return Promise.race([
    Promise.resolve().then(operation),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Redis command timed out')), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

function createRedisStore(client, prefix) {
  return new RedisStore({ sendCommand: (...args) => bounded(() => client.exec(args)), prefix });
}

function createRateLimiters({ mode = process.env.RATE_LIMIT_MODE,
  env = process.env.NODE_ENV || 'development',
  namespace = process.env.RATE_LIMIT_NAMESPACE || env,
  url = process.env.UPSTASH_REDIS_REST_URL,
  token = process.env.UPSTASH_REDIS_REST_TOKEN,
  client } = {}) {
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(namespace)) throw new Error('Invalid rate-limit namespace');
  const memory = env === 'test' && !mode || mode === 'memory' && env !== 'production';
  if (!memory && ((mode && mode !== 'redis') ||
      (!mode && env !== 'production') || !client && (!url || !token))) {
    return { gate: unavailable, global: unavailable, login: unavailable, feedback: unavailable,
      ready: () => Promise.reject(new Error('Shared rate limiter is not configured')),
      mode: 'unavailable' };
  }
  const redis = memory ? null : client || new Redis({ url, token });
  const ready = [];
  const makeStore = policy => {
    if (memory) return undefined;
    const store = createRedisStore(redis, `rl:${namespace}:${policy}:`);
    const initialize = store.init.bind(store);
    store.init = options => {
      const task = bounded(() => initialize(options));
      ready.push(task);
      return task;
    };
    return store;
  };
  const makeLimit = (policy, windowMs, limit, keyGenerator) => {
    const middleware = rateLimit({ windowMs, limit, store: makeStore(policy),
      ...(keyGenerator ? { keyGenerator } : {}),
      standardHeaders: 'draft-6', legacyHeaders: false,
      message: { error: 'Too many requests' },
      logger: { error: () => console.error('Shared rate limiter unavailable'),
        warn: message => console.warn(message) } });
    return (req, res, next) => middleware(req, res, error => {
      if (error) {
        console.error('Shared rate limiter command failed');
        return unavailable(req, res);
      }
      next();
    });
  };
  const global = makeLimit('public', 15 * 60_000, 100);
  const login = makeLimit('login', 15 * 60_000, 10,
    req => ipKeyGenerator(req.ip));
  const feedback = makeLimit('feedback', 60_000, 30,
    req => req.user.id);
  const initialization = Promise.all(ready);
  return {
    mode: memory ? 'memory' : 'redis', global, login, feedback,
    ready: () => initialization,
    gate: (req, res, next) => initialization.then(() => next(), () => unavailable(req, res)),
  };
}

module.exports = { createRedisStore, createRateLimiters };
