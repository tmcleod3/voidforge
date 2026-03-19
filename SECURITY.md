# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in VoidForge, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please email the maintainer directly or use GitHub's [private vulnerability reporting](https://github.com/tmcleod3/voidforge/security/advisories/new).

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if you have one)

You will receive a response within 48 hours acknowledging receipt.

## Scope

Security issues in VoidForge include:
- **Vault encryption** — weaknesses in AES-256-GCM, scrypt KDF, or key management
- **TOTP implementation** — bypass, replay, or timing attacks
- **Socket API authentication** — session token, vault password, or TOTP verification bypass
- **Command injection** — shell injection via notification functions, provisioner scripts, or deploy commands
- **SSRF** — the site scanner fetching internal/private URLs
- **Financial safety tiers** — bypassing budget limits or spend authorization
- **Cross-site attacks** — XSS, CSRF, or CORS misconfiguration in the Danger Room

Out of scope:
- Issues in projects built WITH VoidForge (those are the user's responsibility)
- Social engineering attacks against the methodology (e.g., tricking an agent into writing bad code)
- Denial of service against the local daemon (it runs on your own machine)

## Supported Versions

| Version | Supported |
|---------|-----------|
| 12.x | Yes |
| 11.x | Security fixes only |
| < 11.0 | No |
