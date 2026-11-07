import { reportAuthenticationFailure } from './auth-diagnostics.js';

const message = document.querySelector('#completion-message');
const form = document.querySelector('#completion-form');
const input = document.querySelector('#completion-email');
const submit = document.querySelector('#completion-submit');
let pending = false;
let authEnvironment;

function storedValue(storage, key) {
  try { return window[storage].getItem(key); }
  catch { return null; }
}

function clearStoredValue(storage, key) {
  try { window[storage].removeItem(key); }
  catch { /* Storage permissions must not turn a completed sign-in into an error. */ }
}

try {
  const [{ authentication }, { isSignInWithEmailLink, signInWithEmailLink }] = await Promise.all([
    import('./auth-client.js'),
    import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js')
  ]);
  const { auth, config } = authentication();
  authEnvironment = config.environment;
  if (!isSignInWithEmailLink(auth, window.location.href)) {
    message.textContent = 'This is not a valid email sign-in link for this site. Request another sign-in link to try again.';
  } else {
    const complete = async email => {
      if (pending) return;
      pending = true;
      input.disabled = true;
      submit.disabled = true;
      form.setAttribute('aria-busy', 'true');
      message.textContent = 'Completing sign-in…';
      try {
        await signInWithEmailLink(auth, email, window.location.href);
        clearStoredValue('localStorage', 'moles-email-link-address');
        const requestedReturn = storedValue('sessionStorage', 'moles-login-return-to');
        const returnTo = ['/teambuilder', '/spectate'].includes(requestedReturn) ? requestedReturn : '/play';
        clearStoredValue('sessionStorage', 'moles-login-return-to');
        window.location.assign(returnTo);
      } catch (error) {
        const diagnostic = reportAuthenticationFailure(error, 'email-link-completion', authEnvironment);
        const expired = ['auth/expired-action-code', 'auth/invalid-action-code'].includes(error?.code);
        message.textContent = expired
          ? 'This link has expired or has already been used. Request another sign-in link.'
          : error?.code === 'auth/network-request-failed'
            ? 'Could not connect. Check your internet connection, then try again.'
            : 'Could not complete sign-in. Enter the exact email address used to request this link, then try again.';
        message.textContent += diagnostic;
        form.hidden = expired;
      } finally {
        pending = false;
        input.disabled = false;
        submit.disabled = false;
        form.removeAttribute('aria-busy');
      }
    };
    form.addEventListener('submit', event => { event.preventDefault(); complete(input.value.trim()); });
    const email = storedValue('localStorage', 'moles-email-link-address');
    if (email) complete(email);
    else {
      message.textContent = 'Enter the email address used to request this link.';
      form.hidden = false;
      submit.disabled = false;
    }
  }
} catch (error) {
  reportAuthenticationFailure(error, 'initialization', authEnvironment, 'initialization-failed');
  message.textContent = 'Sign-in could not load. Refresh the page and check your connection, or see Help signing in.';
}
