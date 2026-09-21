# Hosted credential creation — 2026-09-20

Owner explicitly authorized new credentials following the hosted preflight.
Created independent secret material on each host using
`deployment/game-service/proxy/create-host-secrets.sh dev|prod`.

## Result

| Host environment | New directory | Result |
| --- | --- | --- |
| DEV | `/etc/moles-game-v2-dev/secrets` | Three files created and permissions verified |
| PROD | `/etc/moles-game-v2-prod/secrets` | Three independent files created and permissions verified |

Each directory and its parent is `0700 root:root`. Each file is `0600 root:root`:

- `db_password`: 32 random bytes, hex encoded.
- `admin_password`: 32 separately generated random bytes, hex encoded.
- `coach_password`: 16 separately generated random bytes, hex encoded to satisfy
  the retained bootstrap field's 32-character format. This is not a Firebase or
  application account credential.

Generation used OpenSSL on the respective VM; DEV reported OpenSSL 3.0.13.
No secret values or hashes were printed, downloaded, committed, or shared between
environments. Existing credentials were not modified. Both existing
`moles-game` services remained active. No service restart occurred.

These are staged secret files, **not yet installed MariaDB accounts/grants**.
Runtime-user access, database installation/provisioning, and nginx/runtime
deployment remain pending. No further authorization for these new secrets is
needed; use them during the already authorized rollout without rotating them.

## Checks and commands

Local generator test:

```powershell
docker run --name r3d-host-secrets-check-20260920 --network none --mount 'type=bind,source=C:/Users/jaken/Git-Hub/fumbbl-rebuild-chatgpt/deployment/game-service/proxy,target=/checks,readonly' --entrypoint /bin/bash ffb-r3d-proxy-test:20260919 /checks/test-host-secrets.sh
```

Passed: valid DEV/PROD generation; exact formats and modes; independent fixture
values; invalid environment/extra arguments rejected before creation; retry
rejected without modifying existing files. Container retained. No actual host
credentials, existing database volumes, or retained evidence were mounted.

An initial isolated test (`r3d-host-secrets-20260920`) exited 1 because mounting
an empty tmpfs over `/etc` removed the root account-name lookup needed by the
ownership assertion. Retained; corrected test used the normal isolated
container filesystem. No host effects.

Remote execution reused the preflight's pinned PuTTY host keys, existing PPK,
and IAP ports 22339 (DEV) and 22340 (PROD). Each invocation first required an exact
match from the VM metadata project ID, then executed the checked-in generator
through `sudo -n bash -s -- ENV`. No uploaded script or secret command-line
arguments were needed. An attempted new DEV tunnel found the previous tunnel
still bound, so the existing tunnel was reused.

DEV completed creation and all in-script checks, then PowerShell's appended CR
on an extra blank stdin line caused a trailing shell error (exit 1). It was not
rerun or overwritten. Explicit post-checks confirmed all five directory/file
permissions and the running service. PROD used LF-normalized source with a
terminal comment to absorb the transport CR and exited 0. Both hosts' final
read-only checks used:

```sh
sudo -n stat -c '%a %U:%G %n' /etc/moles-game-v2-ENV /etc/moles-game-v2-ENV/secrets /etc/moles-game-v2-ENV/secrets/db_password /etc/moles-game-v2-ENV/secrets/admin_password /etc/moles-game-v2-ENV/secrets/coach_password
systemctl is-active moles-game
```

No engine, replay, route, or browser behavior changed. Maven/browser/database
checks are not evidence for this credentials-only operation; hosted rollout
acceptance remains outstanding.
