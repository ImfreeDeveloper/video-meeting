/**
 * `avatarUrl` is stored as the public route that serves the file, so the web
 * app can drop it straight into an `<img src>` without knowing the storage
 * layout. Both directions live here so the route and the stored value can
 * never drift apart.
 */

/**
 * Only names this module itself produced: a UUID plus one of the allowed
 * image extensions. Everything the public route resolves against the disk
 * goes through this, so a `..` segment, a nested path or a dotfile can't
 * reach `join()` in the first place.
 */
const STORED_AVATAR_FILENAME = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(jpe?g|png|webp)$/;

export function isStoredAvatarFilename(filename: string): boolean {
  return STORED_AVATAR_FILENAME.test(filename);
}

/**
 * A `User.id` is a cuid, but this only has to be strict enough that the value
 * can't act as a path: no separators, no `.`, so no `..` segment. Anything
 * shaped like an id passes and simply misses on disk.
 */
const SAFE_USER_ID = /^[A-Za-z0-9_-]+$/;

export function isSafeUserIdSegment(userId: string): boolean {
  return SAFE_USER_ID.test(userId);
}

export function buildAvatarUrl(userId: string, filename: string): string {
  return `/users/${userId}/avatar/${filename}`;
}

/**
 * The filename inside a stored `avatarUrl`, or `null` if the value isn't one
 * this module wrote — used to find the previous file when replacing an avatar,
 * where a bad value must mean "nothing to delete", never a stray unlink.
 */
export function avatarFilenameFromUrl(url: string | null): string | null {
  if (!url) return null;
  const filename = url.split('/').pop();
  return filename && isStoredAvatarFilename(filename) ? filename : null;
}
