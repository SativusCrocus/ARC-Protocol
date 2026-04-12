# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in ARC Protocol, please report it responsibly:

1. **Email**: Open a private security advisory on this repository
2. **Do NOT** open a public issue for security vulnerabilities
3. We will acknowledge receipt within 48 hours
4. We will provide a fix within 7 days for critical issues

## Security Model

### Core Principles

- **Private keys never leave the client.** Key generation, storage, and signing happen exclusively on the local machine. The API layer never transmits, logs, or caches private key material beyond the initial keygen response.
- **Inscriptions are final and immutable on Bitcoin.** Once an ARC record is inscribed via `ord`, it becomes a permanent part of the Bitcoin blockchain. There is no undo, no admin override, no soft delete.
- **Every record is cryptographically signed.** BIP-340 Schnorr signatures over secp256k1 ensure tamper-evidence. Modifying any field invalidates the signature and breaks chain validation.
- **Content-addressed storage.** Record IDs are SHA-256 hashes of the signed JSON. Duplicate records produce identical IDs. Tampering changes the ID.

### Key Management

- Private keys are stored at `~/.arc/keys/` with `0600` permissions (owner read/write only)
- Keys are 32-byte random secrets generated via `os.urandom(32)`
- Public keys are x-only Taproot keys (BIP-340 compliant)
- **Never commit keys to version control**
- **Never use mainnet keys in development or testing**

### API Security

- Rate limiting on all mutation endpoints via `slowapi` (configurable, default 60 req/min)
- Strict Pydantic input validation with regex-enforced hex format checks on every request
- Schnorr signature re-verification before every record is persisted (defense in depth)
- CORS configured per-environment
- Security headers on all responses: CSP, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy
- No authentication tokens stored server-side (stateless cryptographic verification)

### Network Security

- All Bitcoin communication uses standard RPC/REST protocols
- Lightning Network integration via LND REST API with macaroon authentication
- Ollama LLM calls are local-only (localhost:11434 by default)
- No telemetry, no analytics, no third-party tracking

### Threat Model

| Threat | Mitigation |
|--------|-----------|
| Key theft | Keys stored with `0600` permissions, never transmitted over network |
| Record tampering | BIP-340 Schnorr signatures, content-addressed IDs |
| Chain manipulation | Deep validation walks entire `prev` chain recursively |
| API abuse | Rate limiting via `slowapi`, strict input validation |
| XSS / injection | CSP headers, React auto-escaping, Pydantic validation |
| Replay attacks | Monotonic timestamps, unique content-addressed IDs |
| Frame-jacking | `X-Frame-Options: DENY`, `frame-ancestors 'none'` |

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.x   | Yes       |

## Dependencies

This project minimizes dependencies to reduce attack surface:

- **Cryptography**: Pure Python BIP-340 implementation (no C extensions, fully auditable)
- **Backend**: FastAPI + Pydantic (well-audited, type-safe)
- **Frontend**: Next.js + React (industry standard, actively maintained)
- **Rate Limiting**: slowapi (lightweight, in-memory)
