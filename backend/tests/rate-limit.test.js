process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = require('node:crypto').randomBytes(48).toString('base64');

const { RedisStore } = require('rate-limit-redis');
const request = require('supertest');
const express = require('express');
const { ipKeyGenerator } = require('express-rate-limit');
const { createRedisStore, createRateLimiters } = require('../rateLimiter');

test('adapter uses the installed named RedisStore export and raw Upstash exec', async () => {
  const commands = [];
  const client = { exec: async args => { commands.push(args); return 'ok'; } };
  const store = createRedisStore(client, 'test:');
  expect(store).toBeInstanceOf(RedisStore);
  await store.sendCommand({ command: ['PING'] });
  expect(commands).toEqual([['PING']]);
});

test('missing shared store is a visible 503 rather than silent memory fallback', async () => {
  const limits = createRateLimiters({ mode: 'redis', env: 'production',
    url: '', token: '' });
  const app = express();
  app.use(limits.gate, limits.global);
  app.get('/check', (_req, res) => res.send('ok'));
  const response = await request(app).get('/check');
  expect(response.status).toBe(503);
});

test('production refuses an explicit memory-store setting', async () => {
  const limits = createRateLimiters({ mode: 'memory', env: 'production',
    client: { exec: async () => 'ok' } });
  expect(limits.mode).toBe('unavailable');
});

test('two app instances share login attempts and return retry metadata', async () => {
  const hits = new Map();
  const client = { exec: async args => {
    if (args[0] === 'SCRIPT') return 'script-sha';
    if (args[0] === 'EVALSHA') {
      const key = args[3];
      const count = (hits.get(key) || 0) + 1;
      hits.set(key, count);
      return [count, Number(args[4])];
    }
    throw new Error('Unexpected Redis command');
  } };
  const apps = [0, 1].map(() => {
    const limits = createRateLimiters({ mode: 'redis', env: 'production', client });
    const app = express();
    app.use(limits.gate, limits.login);
    app.post('/login', (_req, res) => res.send('ok'));
    return app;
  });
  for (let n = 0; n < 10; n++) {
    expect((await request(apps[n % 2]).post('/login')).status).toBe(200);
  }
  const rejected = await request(apps[0]).post('/login');
  expect(rejected.status).toBe(429);
  expect(rejected.headers['retry-after']).toBeDefined();
});

test('store initialization and later command failures both deny admission', async () => {
  for (const failCommand of ['SCRIPT', 'EVALSHA']) {
    const client = { exec: async args => {
      if (args[0] === failCommand) throw new Error('simulated store outage');
      if (args[0] === 'SCRIPT') return 'script-sha';
      return [1, 60_000];
    } };
    const limits = createRateLimiters({ mode: 'redis', env: 'production', client });
    const app = express();
    app.use(limits.gate, limits.global);
    app.get('/check', (_req, res) => res.send('ok'));
    expect((await request(app).get('/check')).status).toBe(503);
  }
});

test('IPv6 subnet keys group nearby addresses and spoofed forwarding is ignored without trusted proxy', async () => {
  expect(ipKeyGenerator('2001:db8::1')).toBe(ipKeyGenerator('2001:db8::2'));
  const limits = createRateLimiters({ mode: 'memory', env: 'test' });
  const app = express();
  app.set('trust proxy', 0);
  app.use(limits.gate, limits.login);
  app.post('/login', (_req, res) => res.send('ok'));
  for (let n = 0; n < 10; n++) {
    expect((await request(app).post('/login')
      .set('X-Forwarded-For', `203.0.113.${n + 1}`)).status).toBe(200);
  }
  expect((await request(app).post('/login').set('X-Forwarded-For', '198.51.100.10')).status).toBe(429);
});
