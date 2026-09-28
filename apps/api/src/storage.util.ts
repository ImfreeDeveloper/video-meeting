import { unlink } from 'node:fs/promises';

/**
 * Deletes a file if it's there; a file that's already gone (ENOENT) is not
 * an error — anything else is, and propagates.
 */
export async function unlinkIfExists(path: string): Promise<void> {
  await unlink(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  });
}
