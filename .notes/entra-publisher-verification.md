# Microsoft Entra publisher-domain verification

Issue: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/476
PR: https://github.com/the-grognard-codes/fumbbl-rebuild/pull/477

Hosting assembly selects separate DEV and PROD association files at
`/.well-known/microsoft-identity-association.json`. Local profiles use DEV.
The Firebase upload filter includes this directory while excluding other
hidden files and directories.

Both environment builds and artifact checks passed. Local Hosting HTTP checks
returned 200 with the matching app ID, UTF-8 JSON, and no redirect. Upload-list
probes confirmed the verification file is included and other dotfiles excluded.

The owner authorized publication to DEV and PROD. PR checks, the complete local
browser gate for DEV, and the PROD browser release gate precede deployment.
Microsoft sign-in provider setup and secrets are separately configured in Firebase.

## Recreated app registrations

The owner recreated both registrations to support the intended Microsoft account
types. DEV now uses `527c3196-8930-421e-ab7c-06028fc9fb31` and PROD uses
`b3f701a9-ce63-40cf-93d8-d0d87b8a5281`. The obsolete deployment attempts were
stopped. The owner explicitly authorized bypassing CI/CD checks for this
correction; normal deployment gates remain unchanged in the repository.
