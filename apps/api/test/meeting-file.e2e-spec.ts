import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * Phase 1 tracer bullet: upload a file onto an existing meeting. Storage is
 * isolated per test run via FILE_STORAGE_DIR/MAX_FILE_SIZE_BYTES, set below
 * *before* AppModule is compiled — the storage module resolves these lazily
 * per request, never caches them at import time, so this ordering is safe.
 */
const storageDir = mkdtempSync(join(tmpdir(), 'claudelar-meeting-files-'));
process.env.FILE_STORAGE_DIR = storageDir;
process.env.MAX_FILE_SIZE_BYTES = String(10 * 1024); // 10 KiB, small on purpose

const { AppModule } = await import('./../src/app.module.js');

describe('Meeting files (e2e)', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleFixture.get(PrismaService);
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(() => {
    rmSync(storageDir, { recursive: true, force: true });
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

  async function createMeeting(token: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/meeting')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Sprint planning',
        startTime: '2026-09-15T10:00:00.000Z',
        endTime: '2026-09-15T11:00:00.000Z',
      })
      .expect(201);
    return response.body.id as string;
  }

  function uploadFile(
    token: string | undefined,
    meetingId: string,
    buffer: Buffer,
    filename: string,
    mimeType: string,
  ) {
    const req = request(app.getHttpServer()).post(`/meeting/${meetingId}/files`);
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.attach('file', buffer, { filename, contentType: mimeType });
  }

  function storedFileCount(meetingId: string): number {
    const dir = join(storageDir, meetingId);
    if (!existsSync(dir)) return 0;
    return readdirSync(dir).length;
  }

  describe('POST /meeting/:meetingId/files', () => {
    it("uploads a supported file onto the caller's meeting", async () => {
      const token = await registerAndGetToken();
      const meetingId = await createMeeting(token);
      const buffer = Buffer.from('fake mp3 content');

      const response = await uploadFile(
        token,
        meetingId,
        buffer,
        'recording.mp3',
        'audio/mpeg',
      ).expect(201);

      expect(response.body).toMatchObject({
        meetingId,
        filename: 'recording.mp3',
        mimeType: 'audio/mpeg',
        size: buffer.length,
      });

      const stored = await prisma.meetingFile.findUnique({ where: { id: response.body.id } });
      expect(stored).not.toBeNull();
      expect(existsSync(join(storageDir, meetingId, stored!.storagePath.split('/').pop()!))).toBe(
        true,
      );
    });

    it('rejects a request without an access token', async () => {
      const token = await registerAndGetToken();
      const meetingId = await createMeeting(token);

      await uploadFile(undefined, meetingId, Buffer.from('x'), 'note.txt', 'text/plain').expect(
        401,
      );
    });

    it('rejects an unsupported file format without writing it to disk', async () => {
      const token = await registerAndGetToken();
      const meetingId = await createMeeting(token);

      await uploadFile(
        token,
        meetingId,
        Buffer.from('malicious payload'),
        'payload.exe',
        'application/x-msdownload',
      ).expect(415);

      expect(storedFileCount(meetingId)).toBe(0);
      expect(await prisma.meetingFile.count({ where: { meetingId } })).toBe(0);
    });

    it('rejects a file exceeding the maximum size without writing it to disk', async () => {
      const token = await registerAndGetToken();
      const meetingId = await createMeeting(token);
      const oversized = Buffer.alloc(20 * 1024, 'a'); // over the 10 KiB test limit

      await uploadFile(token, meetingId, oversized, 'recording.mp3', 'audio/mpeg').expect(413);

      expect(storedFileCount(meetingId)).toBe(0);
      expect(await prisma.meetingFile.count({ where: { meetingId } })).toBe(0);
    });

    it("rejects an upload onto another user's meeting", async () => {
      const ownerToken = await registerAndGetToken();
      const meetingId = await createMeeting(ownerToken);

      const otherToken = await registerAndGetToken();
      await uploadFile(otherToken, meetingId, Buffer.from('x'), 'note.txt', 'text/plain').expect(
        404,
      );

      expect(storedFileCount(meetingId)).toBe(0);
      expect(await prisma.meetingFile.count({ where: { meetingId } })).toBe(0);
    });

    it('returns 404 for a meeting that does not exist', async () => {
      const token = await registerAndGetToken();

      await uploadFile(token, randomUUID(), Buffer.from('x'), 'note.txt', 'text/plain').expect(404);
    });
  });
});
