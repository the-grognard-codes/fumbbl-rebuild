# TODO

- [ ] **Containerized deployment parity across local, DEV, and PROD.** Replace
  the native nginx/systemd JVM deployment candidate with a reviewed containerized
  deployment approach. Build versioned Java and nginx images through the same
  pipeline and promote the same immutable artifacts between environments, keeping
  environment-specific configuration and secrets external. Decide whether Java
  and nginx should use separate containers; the current combined image is a local
  test fixture, not a production deployment artifact. Cover persistent MariaDB
  and backup storage, private backend networking, TLS renewal, health checks,
  resource limits, rollback, and active-match drain/compatible-runtime handling.
  Validate local-to-DEV-to-PROD parity without resetting retained data or upgrading
  active matches in place. This is future work only; public deployment and
  infrastructure changes require separate authorization.
