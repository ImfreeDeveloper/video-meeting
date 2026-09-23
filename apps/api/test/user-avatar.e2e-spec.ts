import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createValidationPipe } from '../src/validation-pipe.js';

/**
 * Phase 2: avatar upload, storage and public delivery. Storage is isolated
 * per test run via AVATAR_STORAGE_DIR/MAX_AVATAR_SIZE_BYTES, set below
 * *before* AppModule is compiled — multer bakes the size limit into the
 * instance it builds at controller-decoration time, so the ordering matters
 * (same as test/meeting-file.e2e-spec.ts).
 */
const storageDir = mkdtempSync(join(tmpdir(), 'claudelar-avatars-'));
process.env.AVATAR_STORAGE_DIR = storageDir;
process.env.MAX_AVATAR_SIZE_BYTES = String(10 * 1024); // 10 KiB, small on purpose

const { AppModule } = await import('./../src/app.module.js');

describe('User avatar (e2e)', () => {
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

  afterAll(() => {
    rmSync(storageDir, { recursive: true, force: true });
  });

  function uniqueEmail(): string {
    return `${randomUUID()}@example.com`;
  }

  async function register(): Promise<{ token: string; userId: string }> {
    const registration = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: uniqueEmail(), password: 'correct-password' })
      .expect(201);
    const token = registration.body.accessToken as string;
    const me = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return { token, userId: me.body.id as string };
  }

  function uploadAvatar(
    token: string | undefined,
    buffer: Buffer,
    filename: string,
    mimeType: string,
  ) {
    const req = request(app.getHttpServer()).post('/users/me/avatar');
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.attach('file', buffer, { filename, contentType: mimeType });
  }

  function getMe(token: string) {
    return request(app.getHttpServer()).get('/users/me').set('Authorization', `Bearer ${token}`);
  }

  /** Fetches an avatar URL as a raw buffer, deliberately without any token. */
  function fetchAvatar(url: string) {
    return request(app.getHttpServer())
      .get(url)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
  }

  /** Every avatar file currently on disk for a user, whatever the layout. */
  function storedAvatarFiles(userId: string): string[] {
    const dir = join(storageDir, userId);
    if (!existsSync(dir)) return [];
    return readdirSync(dir);
  }

  async function uploadedAvatarUrl(
    token: string,
    buffer: Buffer,
    filename: string,
    mimeType: string,
  ): Promise<string> {
    const response = await uploadAvatar(token, buffer, filename, mimeType).expect(200);
    return response.body.avatarUrl as string;
  }

  describe('POST /users/me/avatar', () => {
    it('rejects a request without an access token', async () => {
      await uploadAvatar(undefined, Buffer.from('jpeg bytes'), 'avatar.jpg', 'image/jpeg').expect(
        401,
      );
    });

    it('rejects a request with an invalid access token', async () => {
      await uploadAvatar(
        'not-a-valid-token',
        Buffer.from('jpeg bytes'),
        'avatar.jpg',
        'image/jpeg',
      ).expect(401);
    });

    it.each([
      ['avatar.jpg', 'image/jpeg'],
      ['avatar.jpeg', 'image/jpeg'],
      ['avatar.png', 'image/png'],
      ['avatar.webp', 'image/webp'],
    ])('uploads a %s avatar and stores it on disk', async (filename, mimeType) => {
      const { token, userId } = await register();

      const response = await uploadAvatar(
        token,
        Buffer.from('image bytes'),
        filename,
        mimeType,
      ).expect(200);

      expect(response.body.avatarUrl).toEqual(expect.any(String));
      expect(response.body.id).toBe(userId);
      expect(storedAvatarFiles(userId)).toHaveLength(1);
    });

    it('accepts a MIME type that differs only in case from the allowlist', async () => {
      const { token } = await register();

      await uploadAvatar(token, Buffer.from('image bytes'), 'avatar.PNG', 'Image/PNG').expect(200);
    });

    it('never exposes the password hash in the upload response', async () => {
      const { token } = await register();

      const response = await uploadAvatar(
        token,
        Buffer.from('image bytes'),
        'avatar.png',
        'image/png',
      ).expect(200);

      expect(response.body).not.toHaveProperty('passwordHash');
    });

    it('persists the avatar URL on the profile', async () => {
      const { token } = await register();

      const avatarUrl = await uploadedAvatarUrl(
        token,
        Buffer.from('image bytes'),
        'avatar.png',
        'image/png',
      );

      const me = await getMe(token).expect(200);
      expect(me.body.avatarUrl).toBe(avatarUrl);
    });

    it('rejects an unsupported format without writing it to disk', async () => {
      const { token, userId } = await register();

      await uploadAvatar(
        token,
        Buffer.from('malicious payload'),
        'payload.exe',
        'application/x-msdownload',
      ).expect(415);

      expect(storedAvatarFiles(userId)).toHaveLength(0);
      const me = await getMe(token).expect(200);
      expect(me.body.avatarUrl).toBeNull();
    });

    it('rejects a document format that is allowed for meeting files', async () => {
      const { token, userId } = await register();

      await uploadAvatar(token, Buffer.from('notes'), 'notes.txt', 'text/plain').expect(415);

      expect(storedAvatarFiles(userId)).toHaveLength(0);
    });

    it('rejects a file whose extension and MIME type disagree', async () => {
      const { token, userId } = await register();

      await uploadAvatar(token, Buffer.from('image bytes'), 'avatar.png', 'image/jpeg').expect(415);

      expect(storedAvatarFiles(userId)).toHaveLength(0);
    });

    it('rejects a file exceeding the maximum size without writing it to disk', async () => {
      const { token, userId } = await register();
      const oversized = Buffer.alloc(20 * 1024, 'a'); // over the 10 KiB test limit

      await uploadAvatar(token, oversized, 'avatar.png', 'image/png').expect(413);

      expect(storedAvatarFiles(userId)).toHaveLength(0);
      const me = await getMe(token).expect(200);
      expect(me.body.avatarUrl).toBeNull();
    });

    it('rejects a request without a file', async () => {
      const { token } = await register();

      await request(app.getHttpServer())
        .post('/users/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('keeps the previous avatar after a rejected upload', async () => {
      const { token, userId } = await register();
      const avatarUrl = await uploadedAvatarUrl(
        token,
        Buffer.from('image bytes'),
        'avatar.png',
        'image/png',
      );

      await uploadAvatar(token, Buffer.from('payload'), 'payload.exe', 'application/x-msdownload')
        .expect(415)
        .then(() => undefined);

      expect(storedAvatarFiles(userId)).toHaveLength(1);
      const me = await getMe(token).expect(200);
      expect(me.body.avatarUrl).toBe(avatarUrl);
      await fetchAvatar(avatarUrl).expect(200);
    });

    it('replaces the avatar, deleting the previous file from disk', async () => {
      const { token, userId } = await register();
      const firstUrl = await uploadedAvatarUrl(
        token,
        Buffer.from('first image'),
        'first.png',
        'image/png',
      );
      expect(storedAvatarFiles(userId)).toHaveLength(1);

      const secondUrl = await uploadedAvatarUrl(
        token,
        Buffer.from('second image'),
        'second.webp',
        'image/webp',
      );

      expect(secondUrl).not.toBe(firstUrl);
      expect(storedAvatarFiles(userId)).toHaveLength(1);
      await fetchAvatar(firstUrl).expect(404);
      const me = await getMe(token).expect(200);
      expect(me.body.avatarUrl).toBe(secondUrl);
    });

    it('serves the replacement bytes at the new URL', async () => {
      const { token } = await register();
      await uploadedAvatarUrl(token, Buffer.from('first image'), 'first.png', 'image/png');
      const replacement = Buffer.from('second image');

      const secondUrl = await uploadedAvatarUrl(token, replacement, 'second.png', 'image/png');

      const response = await fetchAvatar(secondUrl).expect(200);
      expect((response.body as Buffer).equals(replacement)).toBe(true);
    });

    it("does not touch another user's avatar", async () => {
      const victim = await register();
      const victimUrl = await uploadedAvatarUrl(
        victim.token,
        Buffer.from('victim image'),
        'victim.png',
        'image/png',
      );
      const attacker = await register();

      await uploadAvatar(
        attacker.token,
        Buffer.from('attacker image'),
        'attacker.png',
        'image/png',
      ).expect(200);

      expect(storedAvatarFiles(victim.userId)).toHaveLength(1);
      await fetchAvatar(victimUrl).expect(200);
      const victimAfter = await getMe(victim.token).expect(200);
      expect(victimAfter.body.avatarUrl).toBe(victimUrl);
    });
  });

  describe('public avatar delivery', () => {
    it('serves the uploaded avatar without an access token', async () => {
      const { token } = await register();
      const bytes = Buffer.from('png image bytes');
      const avatarUrl = await uploadedAvatarUrl(token, bytes, 'avatar.png', 'image/png');

      const response = await fetchAvatar(avatarUrl).expect(200);

      expect(response.headers['content-type']).toContain('image/png');
      expect((response.body as Buffer).equals(bytes)).toBe(true);
    });

    it('serves a jpeg avatar with its own content type', async () => {
      const { token } = await register();
      const avatarUrl = await uploadedAvatarUrl(
        token,
        Buffer.from('jpeg image bytes'),
        'avatar.jpg',
        'image/jpeg',
      );

      const response = await fetchAvatar(avatarUrl).expect(200);

      expect(response.headers['content-type']).toContain('image/jpeg');
    });

    it('returns 404 for an avatar file that does not exist', async () => {
      const { userId } = await register();

      await fetchAvatar(`/users/${userId}/avatar/${randomUUID()}.png`).expect(404);
    });

    it('answers a missing avatar with a JSON body, not the image content type', async () => {
      const { userId } = await register();

      const response = await fetchAvatar(`/users/${userId}/avatar/${randomUUID()}.png`).expect(404);

      expect(response.headers['content-type']).toContain('application/json');
    });

    it('returns 404 for a user that does not exist', async () => {
      await fetchAvatar(`/users/${randomUUID()}/avatar/${randomUUID()}.png`).expect(404);
    });

    it("returns 404 for another user's avatar filename", async () => {
      const owner = await register();
      const avatarUrl = await uploadedAvatarUrl(
        owner.token,
        Buffer.from('image bytes'),
        'avatar.png',
        'image/png',
      );
      const filename = avatarUrl.split('/').pop()!;
      const other = await register();

      await fetchAvatar(`/users/${other.userId}/avatar/${filename}`).expect(404);
    });

    it('does not serve files outside the avatar directory', async () => {
      const { userId } = await register();

      const response = await fetchAvatar(`/users/${userId}/avatar/..%2F..%2F.env`);

      expect(response.status).not.toBe(200);
    });
  });
});
