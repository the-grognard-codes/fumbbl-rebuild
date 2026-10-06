import { existsSync } from 'node:fs';
import { win32 } from 'node:path';

// Docker Desktop may report a Windows bind source in its Linux VM namespace.
export function reviewMountSource(container, destination, errorCode = 'REVIEW_MOUNT_UNAVAILABLE') {
  const mounts = container.Mounts.filter(mount => mount.Destination === destination);
  if (mounts.length !== 1 || mounts[0].Type !== 'bind' || mounts[0].RW !== false
    || typeof mounts[0].Source !== 'string') throw Error(errorCode);
  let source = mounts[0].Source;
  if (process.platform === 'win32') {
    const desktopPath = source.match(/^\/run\/desktop\/mnt\/host\/([a-z])\/(.+)$/i);
    if (desktopPath) source = win32.normalize(`${desktopPath[1].toUpperCase()}:/${desktopPath[2]}`);
  }
  if (!existsSync(source)) throw Error(errorCode);
  return source;
}
