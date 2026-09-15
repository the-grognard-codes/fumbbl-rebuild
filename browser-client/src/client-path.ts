const basePath = import.meta.env.BASE_URL === '/' ? '' : import.meta.env.BASE_URL.replace(/\/$/, '');

export function clientPath(path: string) {
  return `${basePath}${path}`;
}

export function clientRoute() {
  const path = window.location.pathname;
  return basePath && path.startsWith(basePath) ? (path.slice(basePath.length) || '/') : path;
}
