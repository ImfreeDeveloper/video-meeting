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

  function listFiles(token: string | undefined, meetingId: string) {
    const req = request(app.getHttpServer()).get(`/meeting/${meetingId}/files`);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  }

  function downloadFile(token: string | undefined, meetingId: string, fileId: string) {
    const req = request(app.getHttpServer())
      .get(`/meeting/${meetingId}/files/${fileId}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  }

  function deleteFile(token: string | undefined, meetingId: string, fileId: string) {
    const req = request(app.getHttpServer()).delete(`/meeting/${meetingId}/files/${fileId}`);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  }

  async function uploadedFileId(
    token: string,
    meetingId: string,
    buffer: Buffer,
    filename: string,
    mimeType: string,
  ): Promise<string> {
    const response = await uploadFile(token, meetingId, buffer, filename, mimeType).expect(201);
    return response.body.id as string;
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

  describe('GET /meeting/:meetingId/files', () => {
    it("lists the files uploaded to the caller's meeting", async () => {
      const token = await registerAndGetToken();
      const meetingId = await createMeeting(token);
      await uploadFile(
        token,
        meetingId,
        Buffer.from('audio'),
        'recording.mp3',
        'audio/mpeg',
      ).expect(201);
      await uploadFile(token, meetingId, Buffer.from('notes'), 'notes.txt', 'text/plain').expect(
        201,
      );

      const response = await listFiles(token, meetingId).expect(200);

      expect(response.body).toHaveLength(2);
      expect((response.body as Array<{ filename: string }>).map((f) => f.filename).sort()).toEqual([
        'notes.txt',
        'recording.mp3',
      ]);
    });

    it('returns an empty list when the meeting has no files', async () => {
      const token = await registerAndGetToken();
      const meetingId = await createMeeting(token);

      const response = await listFiles(token, meetingId).expect(200);

      expect(response.body).toEqual([]);
    });

    it('rejects a request without an access token', async () => {
      const token = await registerAndGetToken();
      const meetingId = await createMeeting(token);

      await listFiles(undefined, meetingId).expect(401);
    });

    it("rejects listing another user's meeting files", async () => {
      const ownerToken = await registerAndGetToken();
      const meetingId = await createMeeting(ownerToken);

      const otherToken = await registerAndGetToken();
      await listFiles(otherToken, meetingId).expect(404);
    });
  });

  describe('GET /meeting/:meetingId/files/:fileId', () => {
    it('downloads a previously uploaded file', async () => {
      const token = await registerAndGetToken();
      const meetingId = await createMeeting(token);
      const buffer = Buffer.from('fake mp3 content');
      const fileId = await uploadedFileId(token, meetingId, buffer, 'recording.mp3', 'audio/mpeg');

      const response = await downloadFile(token, meetingId, fileId).expect(200);

      expect(response.headers['content-type']).toContain('audio/mpeg');
      expect(response.headers['content-disposition']).toContain('recording.mp3');
      expect((response.body as Buffer).equals(buffer)).toBe(true);
    });

    it('rejects a request without an access token', async () => {
      const token = await registerAndGetToken();
      const meetingId = await createMeeting(token);
      const fileId = await uploadedFileId(
        token,
        meetingId,
        Buffer.from('x'),
        'note.txt',
        'text/plain',
      );

      await downloadFile(undefined, meetingId, fileId).expect(401);
    });

    it('returns 404 for a file that does not exist', async () => {
      const token = await registerAndGetToken();
      const meetingId = await createMeeting(token);

      await downloadFile(token, meetingId, randomUUID()).expect(404);
    });

    it("rejects downloading another user's meeting file", async () => {
      const ownerToken = await registerAndGetToken();
      const meetingId = await createMeeting(ownerToken);
      const fileId = await uploadedFileId(
        ownerToken,
        meetingId,
        Buffer.from('x'),
        'note.txt',
        'text/plain',
      );

      const otherToken = await registerAndGetToken();
      await downloadFile(otherToken, meetingId, fileId).expect(404);
    });
  });

  describe('DELETE /meeting/:meetingId/files/:fileId', () => {
    it('deletes a file from disk and the DB, making it unavailable at the same link', async () => {
      const token = await registerAndGetToken();
      const meetingId = await createMeeting(token);
      const fileId = await uploadedFileId(
        token,
        meetingId,
        Buffer.from('fake mp3 content'),
        'recording.mp3',
        'audio/mpeg',
      );
      expect(storedFileCount(meetingId)).toBe(1);

      await deleteFile(token, meetingId, fileId).expect(204);

      expect(storedFileCount(meetingId)).toBe(0);
      expect(await prisma.meetingFile.count({ where: { id: fileId } })).toBe(0);
      await downloadFile(token, meetingId, fileId).expect(404);
    });

    it('rejects a request without an access token', async () => {
      const token = await registerAndGetToken();
      const meetingId = await createMeeting(token);
      const fileId = await uploadedFileId(
        token,
        meetingId,
        Buffer.from('x'),
        'note.txt',
        'text/plain',
      );

      await deleteFile(undefined, meetingId, fileId).expect(401);
    });

    it('returns 404 for a file that does not exist', async () => {
      const token = await registerAndGetToken();
      const meetingId = await createMeeting(token);

      await deleteFile(token, meetingId, randomUUID()).expect(404);
    });

    it("rejects deleting another user's meeting file, leaving it intact", async () => {
      const ownerToken = await registerAndGetToken();
      const meetingId = await createMeeting(ownerToken);
      const fileId = await uploadedFileId(
        ownerToken,
        meetingId,
        Buffer.from('x'),
        'note.txt',
        'text/plain',
      );

      const otherToken = await registerAndGetToken();
      await deleteFile(otherToken, meetingId, fileId).expect(404);

      expect(await prisma.meetingFile.count({ where: { id: fileId } })).toBe(1);
      await downloadFile(ownerToken, meetingId, fileId).expect(200);
    });
  });
});
