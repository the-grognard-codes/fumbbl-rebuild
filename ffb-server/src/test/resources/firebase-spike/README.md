# Synthetic Firebase feasibility fixture

`synthetic.p12` is a self-signed, locally generated RSA test key/certificate,
alias and password `synthetic`. It has never identified a real Firebase project
or account and has no provider permissions. It signs only in-memory spike JWTs.
Do not use this publicly known key for any real identity.

`owned-transport.p12` is a separate synthetic TLS/JWT fixture with the same alias
and password. Its provider-host SANs exercise hostname validation only against
the isolated loopback server and its explicitly injected test trust store.
Production trust is never modified.
