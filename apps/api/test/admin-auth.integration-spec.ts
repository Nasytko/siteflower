/**
 * Spawns the compiled Nest API against real PostgreSQL.
 * Avoids loading Prisma ESM inside Jest.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import request from 'supertest';
import pg from 'pg';
import * as argon2 from 'argon2';
import { ADMIN_SESSION_COOKIE } from '@bouquet-one/contracts';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://bouquet:bouquet_dev_password@localhost:5433/bouquet_one?schema=public';
const apiPort = String(3101 + Math.floor(Math.random() * 200));
const origin = 'http://localhost:3000';
const password = 'IntegrationPass1!';

async function hashPassword(value: string): Promise<string> {
  return argon2.hash(value, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

describe('Admin auth (integration)', () => {
  let child: ChildProcessWithoutNullStreams;
  let pool: pg.Pool;
  let superEmail: string;
  let superId: string;
  const base = `http://127.0.0.1:${apiPort}`;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: databaseUrl });
    await pool.query('DELETE FROM audit_logs');
    await pool.query('DELETE FROM admin_sessions');
    await pool.query('DELETE FROM admin_users');

    superEmail = `super-${Date.now()}@example.com`;
    superId = cryptoRandomUuid();
    const passwordHash = await hashPassword(password);
    await pool.query(
      `INSERT INTO admin_users (id, email, display_name, password_hash, role, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'SUPER_ADMIN', 'ACTIVE', NOW(), NOW())`,
      [superId, superEmail, 'Super Admin', passwordHash],
    );

    child = spawn(
      process.execPath,
      [path.join(__dirname, '..', 'dist', 'main.js')],
      {
        cwd: path.join(__dirname, '..'),
        env: {
          ...process.env,
          NODE_ENV: 'test',
          API_PORT: apiPort,
          DATABASE_URL: databaseUrl,
          CORS_ORIGINS: origin,
          SWAGGER_ENABLED: 'false',
          TRUST_PROXY: 'false',
          SESSION_HMAC_SECRET: 'test-session-hmac-secret',
          LOGIN_THROTTLE_LIMIT: '1000',
          LOGIN_THROTTLE_TTL_MS: '60000',
          LOG_LEVEL: 'error',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let ready = false;
    for (let i = 0; i < 60; i += 1) {
      try {
        const res = await fetch(`${base}/api/v1/health`);
        if (res.ok) {
          ready = true;
          break;
        }
      } catch {
        // retry
      }
      await delay(500);
    }
    if (!ready) {
      const err = child.stderr.read()?.toString() ?? '';
      throw new Error(`API failed to start on :${apiPort}\n${err}`);
    }
  }, 120_000);

  afterAll(async () => {
    child?.kill('SIGTERM');
    await pool?.end();
  });

  function agent() {
    return request.agent(base);
  }

  it('logs in successfully and returns me', async () => {
    const http = agent();
    const login = await http
      .post('/api/v1/admin/auth/login')
      .set('Origin', origin)
      .send({ email: superEmail, password })
      .expect(201);

    expect(login.body.user.email).toBe(superEmail);
    expect(login.body.user.passwordHash).toBeUndefined();
    expect(login.headers['set-cookie']?.join(';')).toContain(ADMIN_SESSION_COOKIE);

    const me = await http.get('/api/v1/admin/auth/me').expect(200);
    expect(me.body.user.email).toBe(superEmail);
  });

  it('rejects bad password and unknown email with same message', async () => {
    const badPassword = await request(base)
      .post('/api/v1/admin/auth/login')
      .set('Origin', origin)
      .send({ email: superEmail, password: 'wrong-password-xx' })
      .expect(401);

    const unknown = await request(base)
      .post('/api/v1/admin/auth/login')
      .set('Origin', origin)
      .send({ email: 'nobody@example.com', password: 'wrong-password-xx' })
      .expect(401);

    expect(badPassword.body.message).toBe(unknown.body.message);
  });

  it('blocks disabled users and revokes sessions on disable', async () => {
    const http = agent();
    await http
      .post('/api/v1/admin/auth/login')
      .set('Origin', origin)
      .send({ email: superEmail, password })
      .expect(201);

    const managerEmail = `manager-${Date.now()}@example.com`;
    const created = await http
      .post('/api/v1/admin/users')
      .set('Origin', origin)
      .send({
        email: managerEmail,
        displayName: 'Manager',
        password,
        role: 'MANAGER',
      })
      .expect(201);

    const managerAgent = agent();
    await managerAgent
      .post('/api/v1/admin/auth/login')
      .set('Origin', origin)
      .send({ email: managerEmail, password })
      .expect(201);

    await http
      .post(`/api/v1/admin/users/${created.body.id}/disable`)
      .set('Origin', origin)
      .expect(201);

    await managerAgent.get('/api/v1/admin/auth/me').expect(401);
    await request(base)
      .post('/api/v1/admin/auth/login')
      .set('Origin', origin)
      .send({ email: managerEmail, password })
      .expect(401);
  });

  it('requires auth for protected endpoints', async () => {
    await request(base).get('/api/v1/admin/users').expect(401);
  });

  it('denies permission for CONTENT_MANAGER on users list', async () => {
    const http = agent();
    await http
      .post('/api/v1/admin/auth/login')
      .set('Origin', origin)
      .send({ email: superEmail, password })
      .expect(201);

    const contentEmail = `content-${Date.now()}@example.com`;
    await http
      .post('/api/v1/admin/users')
      .set('Origin', origin)
      .send({
        email: contentEmail,
        displayName: 'Content',
        password,
        role: 'CONTENT_MANAGER',
      })
      .expect(201);

    const contentAgent = agent();
    await contentAgent
      .post('/api/v1/admin/auth/login')
      .set('Origin', origin)
      .send({ email: contentEmail, password })
      .expect(201);

    await contentAgent.get('/api/v1/admin/users').expect(403);
  });

  it('logs out and logout-all', async () => {
    const http = agent();
    await http
      .post('/api/v1/admin/auth/login')
      .set('Origin', origin)
      .send({ email: superEmail, password })
      .expect(201);

    await http.post('/api/v1/admin/auth/logout').set('Origin', origin).expect(201);
    await http.get('/api/v1/admin/auth/me').expect(401);

    await http
      .post('/api/v1/admin/auth/login')
      .set('Origin', origin)
      .send({ email: superEmail, password })
      .expect(201);
    await http.post('/api/v1/admin/auth/logout-all').set('Origin', origin).expect(201);
    await http.get('/api/v1/admin/auth/me').expect(401);
  });

  it('writes audit on login success', async () => {
    await request(base)
      .post('/api/v1/admin/auth/login')
      .set('Origin', origin)
      .send({ email: superEmail, password })
      .expect(201);

    const result = await pool.query(
      `SELECT count(*)::int AS c FROM audit_logs WHERE action = 'LOGIN_SUCCESS' AND actor_admin_user_id = $1`,
      [superId],
    );
    expect(result.rows[0]?.c).toBeGreaterThan(0);
  });

  it('protects last SUPER_ADMIN from concurrent disable of different supers', async () => {
    const secondId = cryptoRandomUuid();
    const secondEmail = `super2-${Date.now()}@example.com`;
    const passwordHash = await hashPassword(password);
    await pool.query(
      `INSERT INTO admin_users (id, email, display_name, password_hash, role, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'SUPER_ADMIN', 'ACTIVE', NOW(), NOW())`,
      [secondId, secondEmail, 'Super Two', passwordHash],
    );

    const httpA = agent();
    const httpB = agent();
    await httpA
      .post('/api/v1/admin/auth/login')
      .set('Origin', origin)
      .send({ email: superEmail, password })
      .expect(201);
    await httpB
      .post('/api/v1/admin/auth/login')
      .set('Origin', origin)
      .send({ email: secondEmail, password })
      .expect(201);

    const [a, b] = await Promise.all([
      httpA.post(`/api/v1/admin/users/${superId}/disable`).set('Origin', origin),
      httpB.post(`/api/v1/admin/users/${secondId}/disable`).set('Origin', origin),
    ]);

    expect([a.status, b.status].sort()).toEqual([201, 409]);

    const result = await pool.query(
      `SELECT count(*)::int AS c FROM admin_users WHERE role = 'SUPER_ADMIN' AND status = 'ACTIVE'`,
    );
    expect(result.rows[0]?.c).toBe(1);
  });
});

function cryptoRandomUuid(): string {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
