import { isSignInWithEmailLink, signInWithEmailLink } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { authentication } from './auth-client.js';

const message = document.querySelector('#completion-message');
const form = document.querySelector('#completion-form');
const input = document.querySelector('#completion-email');
try {
  const { auth } = authentication();
  if (!isSignInWithEmailLink(auth, window.location.href)) {
    message.textContent = 'This is not a valid email sign-in link for this environment.';
  } else {
    const complete = async email => {
      try {
        await signInWithEmailLink(auth, email, window.location.href);
        localStorage.removeItem('moles-email-link-address');
        const returnTo = sessionStorage.getItem('moles-login-return-to') === '/teambuilder' ? '/teambuilder' : '/play';
        sessionStorage.removeItem('moles-login-return-to');
        window.location.assign(returnTo);
      } catch {
        message.textContent = 'Could not complete sign-in. Enter the email address used to request this link.';
        form.hidden = false;
      }
    };
    form.addEventListener('submit', event => { event.preventDefault(); complete(input.value); });
    const email = localStorage.getItem('moles-email-link-address');
    if (email) complete(email); else { message.textContent = 'Enter the email address used to request this link.'; form.hidden = false; }
  }
} catch (error) { message.textContent = error.message; }
