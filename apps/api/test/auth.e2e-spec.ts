import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';

/**
 * Registration and login both return an `accessToken`. Login must never
 * create a user — it only looks one up — while registration must always
 * create one and reject a duplicate email.
 */
describe('Auth (e2e)', () => {
  let app: INestApplication<Server>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  function uniqueEmail(): string {
    return `${randomUUID()}@example.com`;
  }

  function decodeJwtPayload(token: string): Record<string, unknown> {
    const parts = token.split('.');
    expect(parts).toHaveLength(3);
    const [, payload] = parts;
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
  }

  function register(email: string, password: string) {
    return request(app.getHttpServer()).post('/auth/register').send({ email, password });
  }

  function login(email: string, password: string) {
    return request(app.getHttpServer()).post('/auth/login').send({ email, password });
  }

  describe('POST /auth/register', () => {
    it('creates a new user and returns a JWT access token', async () => {
      const email = uniqueEmail();

      const response = await register(email, 'correct-password').expect(201);

      expect(response.body).toHaveProperty('accessToken');
      expect(typeof response.body.accessToken).toBe('string');
      expect(response.body).not.toHaveProperty('password');

      const payload = decodeJwtPayload(response.body.accessToken as string);
      expect(payload).toMatchObject({ email });
    });

    it('rejects registering an email that already exists', async () => {
      const email = uniqueEmail();

      await register(email, 'correct-password').expect(201);

      await register(email, 'another-password').expect(409);
    });

    it('rejects a missing email', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ password: 'correct-password' })
        .expect(400);
    });

    it('rejects an invalid email format', async () => {
      await register('not-an-email', 'correct-password').expect(400);
    });

    it('rejects a missing password', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: uniqueEmail() })
        .expect(400);
    });

    it('rejects a password shorter than 6 characters', async () => {
      await register(uniqueEmail(), 'shor').expect(400);
    });
  });

  describe('POST /auth/login', () => {
    it('logs in an existing user and returns a JWT access token', async () => {
      const email = uniqueEmail();
      const password = 'correct-password';
      await register(email, password).expect(201);

      const response = await login(email, password).expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(typeof response.body.accessToken).toBe('string');

      const payload = decodeJwtPayload(response.body.accessToken as string);
      expect(payload).toMatchObject({ email });
    });

    it('does not create a user when logging in with an unknown email', async () => {
      const email = uniqueEmail();

      await login(email, 'whatever-password').expect(401);

      // Registering the same email afterwards must still succeed, proving
      // the failed login above did not create a user.
      await register(email, 'correct-password').expect(201);
    });

    it('rejects a wrong password for an existing user', async () => {
      const email = uniqueEmail();
      await register(email, 'correct-password').expect(201);

      await login(email, 'wrong-password').expect(401);
    });

    it('rejects a missing email', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ password: 'correct-password' })
        .expect(400);
    });

    it('rejects a missing password', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: uniqueEmail() })
        .expect(400);
    });
  });
});
