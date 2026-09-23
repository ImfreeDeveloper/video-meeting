import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { extname, isAbsolute, join } from 'node:path';
import { UnsupportedMediaTypeException } from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface.js';
import { diskStorage } from 'multer';

/**
 * Allowed extension -> MIME type(s), per the PRD's avatar format list. Both
 * must match a single row for an upload to be accepted. Deliberately much
 * narrower than the meeting-file allowlist: an avatar is rendered straight
 * into an `<img src>` off a public URL, so only real image formats belong here.
 */
const ALLOWED_TYPES: Record<string, string[]> = {
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
  '.webp': ['image/webp'],
};

const DEFAULT_STORAGE_DIR = './storage/avatars';
const DEFAULT_MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024; // 5 MiB — plenty for a profile picture

/**
 * The `Content-Type` the public avatar route serves a stored file under.
 * Derived from the extension rather than stored per row: the extension is
 * only ever written by `avatarMulterOptions()` below, and it got there by
 * matching this same allowlist.
 */
export function avatarMimeType(filename: string): string | undefined {
  return ALLOWED_TYPES[extname(filename).toLowerCase()]?.[0];
}

/**
 * Read fresh on every call — used inside multer's per-request `destination`
 * callback below, so a directory picked in tests by setting the env var
 * before compiling AppModule is honored on every subsequent upload.
 */
export function resolveAvatarStorageRoot(): string {
  const dir = process.env.AVATAR_STORAGE_DIR ?? DEFAULT_STORAGE_DIR;
  return isAbsolute(dir) ? dir : join(process.cwd(), dir);
}

/**
 * Unlike resolveAvatarStorageRoot(), this is only read once — when
 * avatarMulterOptions() below is called at controller-decoration time —
 * because multer bakes `limits.fileSize` into the instance it constructs.
 * Tests must set MAX_AVATAR_SIZE_BYTES before that module is first imported.
 */
export function maxAvatarSizeBytes(): number {
  const raw = process.env.MAX_AVATAR_SIZE_BYTES;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_AVATAR_SIZE_BYTES;
}

/** Directory holding one user's avatar — the only place the public route reads from. */
export function userAvatarDir(userId: string): string {
  return join(resolveAvatarStorageRoot(), userId);
}

function tempUploadDir(): string {
  return join(resolveAvatarStorageRoot(), '.tmp');
}

/**
 * Files land in a temp dir first, keyed by a random name, and the command
 * handler moves one into its final <userId>/ directory only after the whole
 * upload succeeded — a rejected or half-written upload never leaves bytes
 * where the public route could serve them, and never clobbers the avatar
 * the user already has.
 */
export function avatarMulterOptions(): MulterOptions {
  return {
    storage: diskStorage({
      destination: (_req, _file, cb) => {
        const dir = tempUploadDir();
        mkdir(dir, { recursive: true })
          .then(() => cb(null, dir))
          .catch((error: Error) => cb(error, dir));
      },
      filename: (_req, file, cb) => {
        cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`);
      },
    }),
    limits: { fileSize: maxAvatarSizeBytes(), files: 1 },
    fileFilter: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase();
      const mimetype = file.mimetype.toLowerCase();
      const allowedMimeTypes = ALLOWED_TYPES[ext];
      if (!allowedMimeTypes || !allowedMimeTypes.includes(mimetype)) {
        cb(
          new UnsupportedMediaTypeException(`Unsupported avatar type: ${ext || file.mimetype}`),
          false,
        );
        return;
      }
      cb(null, true);
    },
  };
}
