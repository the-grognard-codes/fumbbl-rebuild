const header = document.querySelector('.site-header');
if (header) {
  let navigation = header.querySelector('nav');
  if (!navigation) {
    navigation = document.createElement('nav');
    navigation.setAttribute('aria-label', 'Account navigation');
    header.append(navigation);
  }
  const signInLink = document.createElement('a');
  signInLink.className = 'account-sign-in-link';
  signInLink.href = '/login';
  signInLink.innerHTML = `<svg class="account-avatar" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7" r="4"/><path d="M3 23v-4a9 9 0 0 1 18 0v4Z"/></svg><span>Sign in</span>`;
  const menu = document.createElement('details');
  menu.className = 'account-menu';
  menu.hidden = true;
  menu.innerHTML = `<summary aria-controls="account-options">
    <svg class="account-avatar" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7" r="4"/><path d="M3 23v-4a9 9 0 0 1 18 0v4Z"/></svg>
    <span id="account-identity" class="account-identity">Signed in</span>
  </summary>
  <div id="account-options" class="account-options">
    <ul aria-label="Account options">
      <li><button type="button" disabled>Account Settings</button></li>
      <li><button type="button" disabled>My games</button></li>
      <li><button type="button" disabled>My teams</button></li>
      <li><button type="button" disabled>Match history</button></li>
      <li><button type="button" disabled>Preferences</button></li>
    </ul>
    <button class="account-sign-out" type="button">Sign out</button>
    <p class="account-message" role="status"></p>
  </div>`;
  const oldSignIn = navigation.querySelector('a[href="/login"]');
  if (oldSignIn) oldSignIn.replaceWith(signInLink); else navigation.append(signInLink);
  navigation.append(menu);
  const summary = menu.querySelector('summary');
  const options = menu.querySelector('.account-options');
  const fitOptions = () => {
    if (menu.open) options.style.setProperty('--account-options-top', `${options.getBoundingClientRect().top}px`);
  };
  const layoutObserver = new ResizeObserver(fitOptions);
  layoutObserver.observe(header);
  layoutObserver.observe(navigation);
  layoutObserver.observe(summary);
  window.addEventListener('resize', fitOptions);
  window.addEventListener('scroll', fitOptions, { passive: true });
  const close = () => { menu.open = false; };
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.open) { event.preventDefault(); close(); summary.focus(); }
  });
  document.addEventListener('click', event => { if (!menu.contains(event.target)) close(); });
  document.addEventListener('focusin', event => { if (!menu.contains(event.target)) close(); });
  menu.addEventListener('toggle', () => {
    summary.setAttribute('aria-expanded', String(menu.open));
    fitOptions();
  });
  summary.setAttribute('aria-expanded', 'false');
  const identity = menu.querySelector('.account-identity');
  const signOutButton = menu.querySelector('.account-sign-out');
  const message = menu.querySelector('.account-message');
  async function observeAccount() {
    try {
      const [{ authentication }, { onAuthStateChanged, signOut }] = await Promise.all([
        import('./auth-client.js'), import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js')
      ]);
      const { auth } = authentication();
      onAuthStateChanged(auth, user => {
        const signedIn = !!user;
        const accountHadFocus = menu.contains(document.activeElement);
        const signInHadFocus = document.activeElement === signInLink;
        identity.textContent = user?.email || 'Signed in';
        summary.title = user?.email || '';
        signInLink.hidden = signedIn;
        menu.hidden = !signedIn;
        if (signedIn && signInHadFocus) summary.focus();
        if (!signedIn) { close(); if (accountHadFocus) signInLink.focus(); }
        message.textContent = '';
      });
      signOutButton.addEventListener('click', async () => {
        signOutButton.disabled = true; message.textContent = '';
        try { await signOut(auth); close(); }
        catch { message.textContent = 'Could not sign out. Please try again.'; }
        finally { signOutButton.disabled = false; }
      });
    } catch { message.textContent = 'Account sign-in is currently unavailable.'; }
  }
  observeAccount();
}
