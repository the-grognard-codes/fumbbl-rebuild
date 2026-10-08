const links = [['teambuilder', 'Team Builder'], ['play', 'Play'], ['spectate', 'Spectate'], ['updates', 'Updates']];

export function renderSiteHeader(page) {
  const navigation = links.map(([path, label]) =>
    `<a href="/${path}"${page === path || page.startsWith(`${path}/`) ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  return `<header class="site-header">
    <a class="brand" href="/" aria-label="Moles Under the Pitch home">Moles Under the Pitch</a>
    <nav aria-label="Primary navigation">${navigation}<a href="/login">Sign in</a></nav>
  </header>`;
}
