import { reportAuthenticationFailure } from './auth-diagnostics.js';

const message = document.querySelector('#auth-message');
const environment = document.querySelector('#auth-environment');
const methods = document.querySelector('#sign-in-methods');
const query = new URLSearchParams(window.location.search);
const requestedReturn = query.get('returnTo');
const returnTo = ['/teambuilder', '/spectate'].includes(requestedReturn) ? requestedReturn : '/play';
const show = (value, state = 'info') => {
  message.textContent = value;
  message.dataset.state = state;
};
let pending = false;
let authEnvironment;

function errorMessage(error, provider) {
  switch (error?.code) {
    case 'auth/popup-blocked':
      return `Your browser blocked the ${provider} window. Allow pop-ups for this site, then try again.`;
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return `${provider} sign-in was cancelled. Choose Continue with ${provider} to try again.`;
    case 'auth/account-exists-with-different-credential':
      return 'An account already uses this email with another sign-in method. Use the method you chose before, or contact support for help.';
    case 'auth/network-request-failed':
      return 'Could not connect. Check your internet connection, then try again.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a few minutes before trying again.';
    case 'auth/invalid-email':
      return 'Check your email address, then try again.';
    case 'auth/operation-not-allowed':
    case 'auth/unauthorized-domain':
      return 'This sign-in method is unavailable on this site. Try another method or contact support.';
    default:
      return provider ? `${provider} sign-in could not be completed. Try again or see Help signing in.`
        : 'Could not send the sign-in link. Check the address and try again, or see Help signing in.';
  }
}

async function performAction(progress, provider, action) {
  if (pending) return;
  const focused = document.activeElement;
  pending = true;
  methods.disabled = true;
  methods.setAttribute('aria-busy', 'true');
  show(progress);
  try { await action(); }
  catch (error) {
    const method = provider ? provider.toLowerCase() : 'email-link';
    const diagnostic = reportAuthenticationFailure(error, method, authEnvironment);
    show(errorMessage(error, provider) + diagnostic, 'error');
  }
  finally {
    pending = false;
    methods.disabled = false;
    methods.removeAttribute('aria-busy');
    if (document.activeElement === document.body && methods.contains(focused)) focused.focus();
  }
}

try {
  // Catch SDK-loading failures so the page offers recovery instead of inert controls.
  const [{ authentication }, { OAuthProvider, sendSignInLinkToEmail, signInWithPopup }] = await Promise.all([
    import('./auth-client.js'),
    import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js')
  ]);
  const { auth, config, GoogleAuthProvider } = authentication();
  authEnvironment = config.environment;
  if (config.environment !== 'prod') {
    environment.hidden = false;
    environment.textContent = config.environment === 'dev'
      ? 'Development site: accounts and teams are separate from the live site.'
      : 'Local preview: accounts and teams are separate from the live site.';
  }
  for (const [id, name, createProvider] of [
    ['google-sign-in', 'Google', () => new GoogleAuthProvider()],
    ['microsoft-sign-in', 'Microsoft', () => {
      const provider = new OAuthProvider('microsoft.com');
      // These app registrations accept personal accounts; /common requires a broader audience.
      provider.setCustomParameters({ tenant: 'consumers' });
      return provider;
    }]
  ]) {
    document.getElementById(id).addEventListener('click', () => performAction(
      `Finish signing in with ${name} in the window that opens.`, name, async () => {
        await signInWithPopup(auth, createProvider());
        window.location.assign(returnTo);
      }));
  }
  document.querySelector('#email-link-form').addEventListener('submit', event => {
    event.preventDefault();
    const email = document.querySelector('#email').value.trim();
    performAction('Sending your sign-in link…', null, async () => {
      await sendSignInLinkToEmail(auth, email, { url: config.emailLinkUrl, handleCodeInApp: true });
      try {
        localStorage.setItem('moles-email-link-address', email);
      } catch { /* The link can still be completed by entering the email address. */ }
      try { sessionStorage.setItem('moles-login-return-to', returnTo); }
      catch { /* Sign-in can still return to the default /play destination. */ }
      show(`Check your inbox: a sign-in link was sent to ${email}. Use the latest link; check Spam or Junk if it does not arrive.`, 'success');
    });
  });
  methods.disabled = false;
  show(query.get('reason') === 'expired' ? 'Your sign-in expired. Sign in again to continue.' : '');
} catch (error) {
  reportAuthenticationFailure(error, 'initialization', authEnvironment, 'initialization-failed');
  show('Sign-in could not load. Refresh the page and check your connection, or see Help signing in.', 'error');
}
