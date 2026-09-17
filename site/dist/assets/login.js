import { sendSignInLinkToEmail, signInWithPopup } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { authentication } from './auth-client.js';

const message = document.querySelector('#auth-message');
const environment = document.querySelector('#auth-environment');
const show = value => { message.textContent = value; };
const returnTo = '/play';
const finishSignIn = () => { window.location.assign(returnTo); };
try {
  const { auth, config, GoogleAuthProvider } = authentication();
  environment.textContent = `Signing in to the ${config.environment.toUpperCase()} environment (${config.authDomain}).`;
  if (new URLSearchParams(window.location.search).get('reason') === 'expired') {
    show('Your sign-in expired. Sign in again to continue.');
  }
  document.querySelector('#google-sign-in').addEventListener('click', async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); finishSignIn(); } catch { show('Google sign-in could not be completed.'); }
  });
  document.querySelector('#email-link-form').addEventListener('submit', async event => {
    event.preventDefault();
    const email = document.querySelector('#email').value;
    try {
      await sendSignInLinkToEmail(auth, email, { url: config.emailLinkUrl, handleCodeInApp: true });
      localStorage.setItem('moles-email-link-address', email);
      sessionStorage.setItem('moles-login-return-to', returnTo);
      show(`A sign-in link was sent to ${email}.`);
    } catch { show('Could not send the sign-in link.'); }
  });
} catch (error) { environment.textContent = error.message; }
