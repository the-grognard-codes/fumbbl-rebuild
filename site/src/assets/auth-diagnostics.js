/** Record actionable failure codes without serializing Firebase error/credential objects. */
export function reportAuthenticationFailure(error, method, environment, event = 'sign-in-failed') {
  const code = typeof error?.code === 'string' && /^auth\/[a-z0-9-]{1,64}$/.test(error.code) ? error.code : 'unknown';
  const methods = ['google', 'microsoft', 'email-link', 'email-link-completion', 'initialization'];
  const environments = ['dev', 'prod', 'local', 'local-dev'];
  const providerCodes = typeof error?.message === 'string'
    ? [...new Set(error.message.match(/\bAADSTS\d{4,10}\b/g) || [])].slice(0, 5)
    : [];
  console.warn('[MUTP auth] ' + JSON.stringify({
    event: event === 'initialization-failed' ? event : 'sign-in-failed',
    method: methods.includes(method) ? method : 'unknown',
    code,
    environment: environments.includes(environment) ? environment : 'unknown',
    ...(providerCodes.length ? { providerCodes } : {})
  }));
  const firebaseCode = code === 'unknown' ? '' : ` Error code: ${code}.`;
  const providerCode = providerCodes.length ? ` Provider code: ${providerCodes.join(', ')}.` : '';
  return firebaseCode + providerCode;
}
