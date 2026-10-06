export const updatesPageSize = 10;
export const updateCategories = ['Gameplay', 'Design', 'Platform', 'Developer tools', 'Project notes'];

export function updatesState(search) {
  const params = new URLSearchParams(search);
  const requestedPage = Number(params.get('page') ?? 1);
  return {
    query: (params.get('q') ?? '').trim().slice(0, 200),
    category: updateCategories.includes(params.get('category')) ? params.get('category') : '',
    page: Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
  };
}

export function selectUpdates(entries, state, pageSize = updatesPageSize) {
  const terms = state.query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches = entries.filter(entry => (!state.category || entry.category === state.category)
    && terms.every(term => entry.searchText.toLocaleLowerCase().includes(term)));
  const pages = Math.max(1, Math.ceil(matches.length / pageSize));
  const page = Math.min(state.page, pages);
  const start = (page - 1) * pageSize;
  return { entries: matches.slice(start, start + pageSize), total: matches.length, page, pages, start };
}

export function updatesHref(state) {
  const params = new URLSearchParams();
  if (state.query) params.set('q', state.query);
  if (state.category) params.set('category', state.category);
  if (state.page > 1) params.set('page', String(state.page));
  return `/updates${params.size ? `?${params}` : ''}#updates-list`;
}

export function paginationPages(current, total) {
  const pages = new Set([1, total]);
  for (let page = Math.max(1, current - 1); page <= Math.min(total, current + 1); page++) pages.add(page);
  return [...pages].sort((left, right) => left - right);
}

export function mountUpdates(root, view = window) {
  const form = root.querySelector('#updates-search');
  const query = form.querySelector('[name="q"]');
  const category = form.querySelector('[name="category"]');
  const list = root.querySelector('#updates-list');
  const status = root.querySelector('#updates-status');
  const empty = root.querySelector('#updates-empty');
  const navigations = [...root.querySelectorAll('.updates-pagination')];
  const entries = [...list.querySelectorAll('.update-entry')].map(article => ({
    article, category: article.dataset.category,
    searchText: `pr${article.dataset.pr} ${article.textContent}`,
  }));
  let state = updatesState(view.location.search);

  function navigate(next, focus = true) {
    state = next;
    render();
    view.history.pushState(null, '', updatesHref(state));
    if (focus) { list.focus({ preventScroll: true }); list.scrollIntoView({ block: 'start' }); }
  }

  function pageLink(text, page, current = false) {
    const link = root.ownerDocument.createElement('a');
    link.textContent = text;
    link.href = updatesHref({ ...state, page });
    if (/^\d+$/.test(text)) link.setAttribute('aria-label', `Page ${page}`);
    if (current) link.setAttribute('aria-current', 'page');
    link.addEventListener('click', event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); navigate({ ...state, page });
    });
    return link;
  }

  function render() {
    const result = selectUpdates(entries, state);
    state = { ...state, page: result.page };
    query.value = state.query; category.value = state.category;
    const visible = new Set(result.entries);
    entries.forEach(entry => { entry.article.hidden = !visible.has(entry); });
    empty.hidden = result.total > 0;
    status.textContent = result.total ? `Showing ${result.start + 1}–${result.start + result.entries.length} of ${result.total} updates · Page ${result.page} of ${result.pages}` : 'No updates match these filters.';
    for (const navigation of navigations) {
      navigation.replaceChildren();
      navigation.hidden = result.pages <= 1;
      if (result.page > 1) navigation.append(pageLink('← Newer', result.page - 1));
      let previous = 0;
      for (const page of paginationPages(result.page, result.pages)) {
        if (previous && page > previous + 1) {
          const gap = root.ownerDocument.createElement('span');
          gap.textContent = '…'; gap.setAttribute('aria-hidden', 'true'); navigation.append(gap);
        }
        navigation.append(pageLink(String(page), page, page === result.page)); previous = page;
      }
      if (result.page < result.pages) navigation.append(pageLink('Older →', result.page + 1));
    }
  }

  form.hidden = false;
  form.addEventListener('submit', event => {
    event.preventDefault(); navigate({ query: query.value.trim(), category: category.value, page: 1 }, false);
  });
  root.querySelectorAll('[data-clear-updates]').forEach(button => button.addEventListener('click', () => {
    navigate({ query: '', category: '', page: 1 }, false); query.focus();
  }));
  view.addEventListener('popstate', () => { state = updatesState(view.location.search); render(); });
  render();
}

if (typeof document !== 'undefined') {
  const root = document.querySelector('.updates-page');
  if (root) mountUpdates(root);
}
