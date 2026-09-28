import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { createValidationPipe } from './../src/validation-pipe.js';

/**
 * `/users/me` always resolves the user from the access token — there is no
 * user id in the route or body, so a caller can only ever read or rename
 * themselves.
 */
describe('Users (e2e)', () => {
  let app: INestApplication<Server>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  function uniqueEmail(): string {
    return `${randomUUID()}@example.com`;
  }

  async function register(): Promise<{ email: string; token: string }> {
    const email = uniqueEmail();
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'correct-password' })
      .expect(201);
    return { email, token: response.body.accessToken as string };
  }

  function getMe(token: string | undefined) {
    const req = request(app.getHttpServer()).get('/users/me');
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  }

  function patchMe(token: string | undefined, payload: Record<string, unknown>) {
    const req = request(app.getHttpServer()).patch('/users/me');
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.send(payload);
  }

  describe('GET /users/me', () => {
    it('rejects a request without an access token', async () => {
      await getMe(undefined).expect(401);
    });

    it('rejects a request with an invalid access token', async () => {
      await getMe('not-a-valid-token').expect(401);
    });

    it("returns the authenticated user's id, email, name and avatarUrl", async () => {
      const { email, token } = await register();

      const response = await getMe(token).expect(200);

      expect(response.body).toEqual({
        id: expect.any(String),
        email,
        name: null,
        avatarUrl: null,
      });
    });

    it('never exposes the password hash', async () => {
      const { token } = await register();

      const response = await getMe(token).expect(200);

      expect(response.body).not.toHaveProperty('passwordHash');
    });
  });

  describe('PATCH /users/me', () => {
    it('rejects a request without an access token', async () => {
      await patchMe(undefined, { name: 'Alice' }).expect(401);
    });

    it("updates the authenticated user's name", async () => {
      const { email, token } = await register();

      const response = await patchMe(token, { name: 'Alice' }).expect(200);

      expect(response.body).toEqual({
        id: expect.any(String),
        email,
        name: 'Alice',
        avatarUrl: null,
      });
      const me = await getMe(token).expect(200);
      expect(me.body.name).toBe('Alice');
    });

    it('trims surrounding whitespace from the name', async () => {
      const { token } = await register();

      const response = await patchMe(token, { name: '  Alice  ' }).expect(200);

      expect(response.body.name).toBe('Alice');
    });

    it('rejects a missing name', async () => {
      const { token } = await register();

      await patchMe(token, {}).expect(400);
    });

    it('rejects an empty name', async () => {
      const { token } = await register();

      await patchMe(token, { name: '' }).expect(400);
    });

    it('rejects a whitespace-only name', async () => {
      const { token } = await register();

      await patchMe(token, { name: '   ' }).expect(400);
    });

    it('rejects a name that is not a string', async () => {
      const { token } = await register();

      await patchMe(token, { name: 42 }).expect(400);
    });

    it('rejects a name longer than 100 characters', async () => {
      const { token } = await register();

      await patchMe(token, { name: 'a'.repeat(101) }).expect(400);
    });

    it('returns a validation message for an invalid name', async () => {
      const { token } = await register();

      const response = await patchMe(token, { name: '' }).expect(400);

      expect(JSON.stringify(response.body.message)).toMatch(/name/);
    });

    it('does not change the name after a rejected update', async () => {
      const { token } = await register();
      await patchMe(token, { name: 'Alice' }).expect(200);

      await patchMe(token, { name: '' }).expect(400);

      const me = await getMe(token).expect(200);
      expect(me.body.name).toBe('Alice');
    });

    it('cannot rename another user, even when their id is passed in the body', async () => {
      const victim = await register();
      const victimMe = await getMe(victim.token).expect(200);
      const attacker = await register();

      const response = await patchMe(attacker.token, {
        id: victimMe.body.id,
        name: 'Hacked',
      }).expect(200);

      expect(response.body.email).toBe(attacker.email);
      const victimAfter = await getMe(victim.token).expect(200);
      expect(victimAfter.body.name).toBeNull();
    });
  });
});
