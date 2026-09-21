import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { extname, isAbsolute, join } from 'node:path';
import { Logger, UnsupportedMediaTypeException } from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface.js';
import { diskStorage } from 'multer';

const logger = new Logger('MeetingFileUpload');

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
const MAX_INT32 = 2_147_483_647; // MeetingFile.size is a Postgres Int column — can't hold more than this

/**
 * Read fresh on every call — used inside multer's per-request `destination`
 * callback below, so a directory picked in tests by setting the env var
 * before compiling AppModule is honored on every subsequent upload.
 */
export function resolveStorageRoot(): string {
  const dir = process.env.FILE_STORAGE_DIR ?? DEFAULT_STORAGE_DIR;
  return isAbsolute(dir) ? dir : join(process.cwd(), dir);
}

/**
 * Unlike resolveStorageRoot(), this is only read once — when
 * meetingFileMulterOptions() below is called at controller-decoration time —
 * because multer bakes `limits.fileSize` into the instance it constructs.
 * Tests must set MAX_FILE_SIZE_BYTES before that module is first imported,
 * same as the existing e2e specs already do.
 */
export function maxFileSizeBytes(): number {
  const raw = process.env.MAX_FILE_SIZE_BYTES;
  const parsed = raw ? Number(raw) : NaN;
  const value = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_FILE_SIZE_BYTES;

  if (value > MAX_INT32) {
    logger.warn(
      `MAX_FILE_SIZE_BYTES=${value} exceeds what MeetingFile.size (a Postgres Int column) can store; clamped to ${MAX_INT32}.`,
    );
    return MAX_INT32;
  }

  return value;
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
    // Busboy's default (latin1) mis-decodes non-ASCII filenames that
    // clients send as raw UTF-8 bytes in the multipart Content-Disposition
    // header — this makes it interpret them correctly instead.
    defParamCharset: 'utf8',
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
    limits: { fileSize: maxFileSizeBytes(), files: 1 },
    fileFilter: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase();
      const mimetype = file.mimetype.toLowerCase();
      const allowedMimeTypes = ALLOWED_TYPES[ext];
      if (!allowedMimeTypes || !allowedMimeTypes.includes(mimetype)) {
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
