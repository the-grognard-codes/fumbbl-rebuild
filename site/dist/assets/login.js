import { sendSignInLinkToEmail, signInWithPopup } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { authentication } from './auth-client.js';

const message = document.querySelector('#auth-message');
const environment = document.querySelector('#auth-environment');
const show = value => { message.textContent = value; };
try {
  const { auth, config, GoogleAuthProvider, OAuthProvider } = authentication();
  environment.textContent = `Signing in to the ${config.environment.toUpperCase()} environment (${config.authDomain}).`;
  document.querySelector('#google-sign-in').addEventListener('click', async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); show('Google sign-in completed.'); } catch (error) { show(`Google sign-in failed: ${error.message}`); }
  });
  document.querySelector('#microsoft-sign-in').addEventListener('click', async () => {
    try { await signInWithPopup(auth, new OAuthProvider('microsoft.com')); show('Microsoft sign-in completed.'); } catch (error) { show(`Microsoft sign-in failed: ${error.message}`); }
  });
  document.querySelector('#email-link-form').addEventListener('submit', async event => {
    event.preventDefault();
    const email = document.querySelector('#email').value;
    try {
      await sendSignInLinkToEmail(auth, email, { url: config.emailLinkUrl, handleCodeInApp: true });
      localStorage.setItem('moles-email-link-address', email);
      show(`A sign-in link was sent to ${email}.`);
    } catch (error) { show(`Could not send the sign-in link: ${error.message}`); }
  });
} catch (error) { environment.textContent = error.message; }
