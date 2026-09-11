import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';

/**
 * Meeting routes require authentication. Each user only ever creates,
 * lists, and fetches their own meetings — a meeting id that exists but
 * belongs to another user must 404, not 403, so existence isn't leaked.
 */
describe('Meeting (e2e)', () => {
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

  async function registerAndGetToken(): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: uniqueEmail(), password: 'correct-password' })
      .expect(201);
    return response.body.accessToken as string;
  }

  function validMeetingPayload(): Record<string, unknown> {
    return {
      title: 'Sprint planning',
      startTime: '2026-09-15T10:00:00.000Z',
      endTime: '2026-09-15T11:00:00.000Z',
    };
  }

  function createMeeting(token: string | undefined, payload = validMeetingPayload()) {
    const req = request(app.getHttpServer()).post('/meeting');
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.send(payload);
  }

  function listMeetings(token: string | undefined) {
    const req = request(app.getHttpServer()).get('/meeting');
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  }

  function getMeeting(token: string | undefined, id: string) {
    const req = request(app.getHttpServer()).get(`/meeting/${id}`);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  }

  describe('POST /meeting', () => {
    it('creates a new meeting for the authenticated user', async () => {
      const token = await registerAndGetToken();
      const payload = validMeetingPayload();

      const response = await createMeeting(token, payload).expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toMatchObject(payload);
    });

    it('rejects a request without an access token', async () => {
      await createMeeting(undefined).expect(401);
    });

    it('rejects a request with an invalid access token', async () => {
      await createMeeting('not-a-valid-token').expect(401);
    });

    it('rejects a missing title', async () => {
      const token = await registerAndGetToken();
      const { title: _title, ...rest } = validMeetingPayload();

      await createMeeting(token, rest).expect(400);
    });

    it('rejects an empty title', async () => {
      const token = await registerAndGetToken();

      await createMeeting(token, { ...validMeetingPayload(), title: '' }).expect(400);
    });

    it('rejects a missing startTime', async () => {
      const token = await registerAndGetToken();
      const { startTime: _startTime, ...rest } = validMeetingPayload();

      await createMeeting(token, rest).expect(400);
    });

    it('rejects a missing endTime', async () => {
      const token = await registerAndGetToken();
      const { endTime: _endTime, ...rest } = validMeetingPayload();

      await createMeeting(token, rest).expect(400);
    });

    it('rejects a startTime that is not a valid date', async () => {
      const token = await registerAndGetToken();

      await createMeeting(token, { ...validMeetingPayload(), startTime: 'not-a-date' }).expect(400);
    });
  });

  describe('GET /meeting', () => {
    it('rejects a request without an access token', async () => {
      await listMeetings(undefined).expect(401);
    });

    it('returns an empty list when the user has no meetings', async () => {
      const token = await registerAndGetToken();

      const response = await listMeetings(token).expect(200);

      expect(response.body).toEqual([]);
    });

    it("returns the authenticated user's meetings", async () => {
      const token = await registerAndGetToken();
      const created = await createMeeting(token).expect(201);

      const response = await listMeetings(token).expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({ id: created.body.id });
    });

    it("does not include another user's meetings", async () => {
      const ownerToken = await registerAndGetToken();
      await createMeeting(ownerToken).expect(201);

      const otherToken = await registerAndGetToken();
      const response = await listMeetings(otherToken).expect(200);

      expect(response.body).toEqual([]);
    });
  });

  describe('GET /meeting/:id', () => {
    it('rejects a request without an access token', async () => {
      await getMeeting(undefined, randomUUID()).expect(401);
    });

    it('returns a meeting owned by the authenticated user', async () => {
      const token = await registerAndGetToken();
      const created = await createMeeting(token).expect(201);

      const response = await getMeeting(token, created.body.id as string).expect(200);

      expect(response.body).toMatchObject(validMeetingPayload());
      expect(response.body.id).toBe(created.body.id);
    });

    it('returns 404 for an id that does not exist', async () => {
      const token = await registerAndGetToken();

      await getMeeting(token, randomUUID()).expect(404);
    });

    it('returns 404 for a meeting owned by another user', async () => {
      const ownerToken = await registerAndGetToken();
      const created = await createMeeting(ownerToken).expect(201);

      const otherToken = await registerAndGetToken();
      await getMeeting(otherToken, created.body.id as string).expect(404);
    });
  });
});
