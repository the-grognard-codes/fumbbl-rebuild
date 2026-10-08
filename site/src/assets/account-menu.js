const header = document.querySelector('.site-header');
if (header) {
  let navigation = header.querySelector('nav');
  if (!navigation) {
    navigation = document.createElement('nav');
    navigation.setAttribute('aria-label', 'Account navigation');
    header.append(navigation);
  }
  const menu = document.createElement('details');
  menu.className = 'account-menu';
  menu.innerHTML = `<summary aria-label="My account" aria-controls="account-options">
    <svg class="account-avatar" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7" r="4"/><path d="M3 23v-4a9 9 0 0 1 18 0v4Z"/></svg>
    <span class="account-label"><span>My account</span><span class="account-identity">Sign in</span></span>
  </summary>
  <div id="account-options" class="account-options">
    <ul aria-label="Account options">
      <li><button type="button" disabled>Account Settings</button></li>
      <li><button type="button" disabled>My games</button></li>
      <li><button type="button" disabled>My teams</button></li>
      <li><button type="button" disabled>Match history</button></li>
      <li><button type="button" disabled>Preferences</button></li>
    </ul>
    <a class="account-sign-in" href="/login">Sign in</a>
    <button class="account-sign-out" type="button" hidden>Sign out</button>
    <p class="account-message" role="status"></p>
  </div>`;
  const oldSignIn = navigation.querySelector('a[href="/login"]');
  if (oldSignIn) oldSignIn.replaceWith(menu); else navigation.append(menu);
  const summary = menu.querySelector('summary');
  const close = () => { menu.open = false; };
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.open) { event.preventDefault(); close(); summary.focus(); }
  });
  document.addEventListener('click', event => { if (!menu.contains(event.target)) close(); });
  document.addEventListener('focusin', event => { if (!menu.contains(event.target)) close(); });
  menu.addEventListener('toggle', () => summary.setAttribute('aria-expanded', String(menu.open)));
  summary.setAttribute('aria-expanded', 'false');
  const identity = menu.querySelector('.account-identity');
  const signIn = menu.querySelector('.account-sign-in');
  const signOutButton = menu.querySelector('.account-sign-out');
  const message = menu.querySelector('.account-message');
  async function observeAccount() {
    try {
      const [{ authentication }, { onAuthStateChanged, signOut }] = await Promise.all([
        import('./auth-client.js'), import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js')
      ]);
      const { auth } = authentication();
      onAuthStateChanged(auth, user => {
        identity.textContent = user ? user.email || 'Signed in' : 'Sign in';
        signIn.hidden = !!user; signOutButton.hidden = !user; message.textContent = '';
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
