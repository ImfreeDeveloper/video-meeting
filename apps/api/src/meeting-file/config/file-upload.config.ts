import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { extname, isAbsolute, join } from 'node:path';
import { UnsupportedMediaTypeException } from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface.js';
import { diskStorage } from 'multer';

/**
 * Allowed extension -> MIME type(s), per the PRD's supported format list.
 * Both must match a single row for an upload to be accepted.
 */
const ALLOWED_TYPES: Record<string, string[]> = {
  '.mp3': ['audio/mpeg'],
  '.wav': ['audio/wav', 'audio/x-wav', 'audio/wave'],
  '.m4a': ['audio/mp4', 'audio/x-m4a'],
  '.mp4': ['video/mp4'],
  '.mov': ['video/quicktime'],
  '.pdf': ['application/pdf'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.txt': ['text/plain'],
};

const DEFAULT_STORAGE_DIR = './storage/uploads';
const DEFAULT_MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500 MiB, generous enough for short video clips

/**
 * Read lazily (not cached at module load) so tests can point storage at a
 * throwaway directory by setting env vars before the app is compiled.
 */
export function resolveStorageRoot(): string {
  const dir = process.env.FILE_STORAGE_DIR ?? DEFAULT_STORAGE_DIR;
  return isAbsolute(dir) ? dir : join(process.cwd(), dir);
}

export function maxFileSizeBytes(): number {
  const raw = process.env.MAX_FILE_SIZE_BYTES;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_FILE_SIZE_BYTES;
}

function tempUploadDir(): string {
  return join(resolveStorageRoot(), '.tmp');
}

/**
 * Files land in a temp dir first, keyed by a random name — never the
 * meeting id from the route, which is attacker-controlled at this stage
 * (ownership isn't verified yet). The command handler moves the file into
 * its final <meetingId>/ directory only after confirming the caller owns
 * the meeting.
 */
export function meetingFileMulterOptions(): MulterOptions {
  return {
    storage: diskStorage({
      destination: (_req, _file, cb) => {
        const dir = tempUploadDir();
        mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (_req, file, cb) => {
        cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`);
      },
    }),
    limits: { fileSize: maxFileSizeBytes(), files: 1 },
    fileFilter: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase();
      const allowedMimeTypes = ALLOWED_TYPES[ext];
      if (!allowedMimeTypes || !allowedMimeTypes.includes(file.mimetype)) {
        cb(
          new UnsupportedMediaTypeException(`Unsupported file type: ${ext || file.mimetype}`),
          false,
        );
        return;
      }
      cb(null, true);
    },
  };
}
