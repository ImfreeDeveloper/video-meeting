import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { createValidationPipe } from './../src/validation-pipe.js';

const OLD_PASSWORD = 'old-password';
const NEW_PASSWORD = 'new-password';

/**
 * `PATCH /users/me/password` changes the password of the token's own user only,
 * and only against the correct current password. The check that matters in
 * every case below is what `POST /auth/login` accepts afterwards — that, not
 * the response body, is what a user actually feels.
 */
describe('User password (e2e)', () => {
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

  async function register(): Promise<{ email: string; token: string }> {
    const email = `${randomUUID()}@example.com`;
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: OLD_PASSWORD })
      .expect(201);
    return { email, token: response.body.accessToken as string };
  }

  function changePassword(token: string | undefined, payload: Record<string, unknown>) {
    const req = request(app.getHttpServer()).patch('/users/me/password');
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.send(payload);
  }

  function login(email: string, password: string) {
    return request(app.getHttpServer()).post('/auth/login').send({ email, password });
  }

  describe('authentication', () => {
    it('rejects a request without an access token', async () => {
      await changePassword(undefined, {
        oldPassword: OLD_PASSWORD,
        newPassword: NEW_PASSWORD,
      }).expect(401);
    });

    it('rejects a request with an invalid access token', async () => {
      await changePassword('not-a-valid-token', {
        oldPassword: OLD_PASSWORD,
        newPassword: NEW_PASSWORD,
      }).expect(401);
    });

    it('does not change the password of a user named in the body of an unauthenticated request', async () => {
      const { email } = await register();

      await changePassword(undefined, {
        email,
        oldPassword: OLD_PASSWORD,
        newPassword: NEW_PASSWORD,
      }).expect(401);

      await login(email, OLD_PASSWORD).expect(200);
    });
  });

  describe('wrong current password', () => {
    it('rejects a wrong current password', async () => {
      const { token } = await register();

      const response = await changePassword(token, {
        oldPassword: 'not-my-password',
        newPassword: NEW_PASSWORD,
      }).expect(400);

      expect(JSON.stringify(response.body.message)).toMatch(/password/i);
    });

    it('leaves the password unchanged after a wrong current password', async () => {
      const { email, token } = await register();

      await changePassword(token, {
        oldPassword: 'not-my-password',
        newPassword: NEW_PASSWORD,
      }).expect(400);

      await login(email, OLD_PASSWORD).expect(200);
      await login(email, NEW_PASSWORD).expect(401);
    });

    it("rejects another user's password as the current one", async () => {
      const { email, token } = await register();
      const other = await register();
      await changePassword(other.token, {
        oldPassword: OLD_PASSWORD,
        newPassword: 'someone-elses-password',
      }).expect(204);

      await changePassword(token, {
        oldPassword: 'someone-elses-password',
        newPassword: NEW_PASSWORD,
      }).expect(400);

      await login(email, OLD_PASSWORD).expect(200);
    });
  });

  describe('correct current password', () => {
    it('changes the password', async () => {
      const { token } = await register();

      const response = await changePassword(token, {
        oldPassword: OLD_PASSWORD,
        newPassword: NEW_PASSWORD,
      }).expect(204);

      expect(response.body).toEqual({});
    });

    it('accepts a login with the new password', async () => {
      const { email, token } = await register();

      await changePassword(token, {
        oldPassword: OLD_PASSWORD,
        newPassword: NEW_PASSWORD,
      }).expect(204);

      await login(email, NEW_PASSWORD).expect(200);
    });

    it('rejects a login with the old password', async () => {
      const { email, token } = await register();

      await changePassword(token, {
        oldPassword: OLD_PASSWORD,
        newPassword: NEW_PASSWORD,
      }).expect(204);

      await login(email, OLD_PASSWORD).expect(401);
    });

    it('does not store the new password in plaintext', async () => {
      const { email, token } = await register();

      await changePassword(token, {
        oldPassword: OLD_PASSWORD,
        newPassword: NEW_PASSWORD,
      }).expect(204);

      const me = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(JSON.stringify(me.body)).not.toMatch(NEW_PASSWORD);
      expect(me.body).not.toHaveProperty('passwordHash');
      expect(me.body.email).toBe(email);
    });

    it('can be changed twice in a row, each time against the then-current password', async () => {
      const { email, token } = await register();
      const finalPassword = 'final-password';

      await changePassword(token, {
        oldPassword: OLD_PASSWORD,
        newPassword: NEW_PASSWORD,
      }).expect(204);
      await changePassword(token, {
        oldPassword: NEW_PASSWORD,
        newPassword: finalPassword,
      }).expect(204);

      await login(email, finalPassword).expect(200);
      await login(email, NEW_PASSWORD).expect(401);
      await login(email, OLD_PASSWORD).expect(401);
    });

    it('keeps the access token issued before the change usable', async () => {
      const { token } = await register();

      await changePassword(token, {
        oldPassword: OLD_PASSWORD,
        newPassword: NEW_PASSWORD,
      }).expect(204);

      await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });
  });

  describe('validation', () => {
    it('rejects a missing current password', async () => {
      const { token } = await register();

      await changePassword(token, { newPassword: NEW_PASSWORD }).expect(400);
    });

    it('rejects a missing new password', async () => {
      const { token } = await register();

      await changePassword(token, { oldPassword: OLD_PASSWORD }).expect(400);
    });

    it('rejects an empty current password', async () => {
      const { token } = await register();

      await changePassword(token, { oldPassword: '', newPassword: NEW_PASSWORD }).expect(400);
    });

    it('rejects a new password shorter than 6 characters', async () => {
      const { token } = await register();

      const response = await changePassword(token, {
        oldPassword: OLD_PASSWORD,
        newPassword: 'short',
      }).expect(400);

      expect(JSON.stringify(response.body.message)).toMatch(/newPassword/);
    });

    it('rejects a new password that is not a string', async () => {
      const { token } = await register();

      await changePassword(token, { oldPassword: OLD_PASSWORD, newPassword: 123456 }).expect(400);
    });

    it('leaves the password unchanged after a rejected payload', async () => {
      const { email, token } = await register();

      await changePassword(token, { oldPassword: OLD_PASSWORD, newPassword: 'short' }).expect(400);

      await login(email, OLD_PASSWORD).expect(200);
      await login(email, 'short').expect(401);
    });
  });

  describe('isolation between users', () => {
    it("cannot change another user's password, even when their id is passed in the body", async () => {
      const victim = await register();
      const victimMe = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${victim.token}`)
        .expect(200);
      const attacker = await register();

      await changePassword(attacker.token, {
        id: victimMe.body.id,
        userId: victimMe.body.id,
        email: victim.email,
        oldPassword: OLD_PASSWORD,
        newPassword: NEW_PASSWORD,
      }).expect(204);

      await login(victim.email, OLD_PASSWORD).expect(200);
      await login(victim.email, NEW_PASSWORD).expect(401);
      await login(attacker.email, NEW_PASSWORD).expect(200);
    });
  });
});
