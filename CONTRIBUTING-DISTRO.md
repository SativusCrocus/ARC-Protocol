# Contributing to ARC Goose (Distro)

Thanks for helping ship an ARC-flavored distribution of Goose. This guide
covers contributions specific to `/distro/arc-goose/`. For protocol-level
changes (backend, MCP server, frontend), see the main `CONTRIBUTING.md`
if present, or open an issue first.

## Scope of distro contributions

Distro PRs should touch **only** files under:

- `/distro/arc-goose/`
- `/CONTRIBUTING-DISTRO.md`
- root `README.md` (distro section only)

If your change also touches `backend/`, `mcp-server/`, `frontend/`, or
`orchestrator/`, split it into two PRs — a protocol PR and a distro PR
that pins the new protocol version.

## License

- ARC Goose (this distro) is **MIT**, matching ARC Protocol.
- Upstream Goose is **Apache-2.0**. Both are compatible for
  redistribution; if you vendor any Apache-2.0 code, preserve the
  original copyright notices and include the upstream `NOTICE` file.
- By submitting a PR you agree to license your contribution under MIT.

## What makes a good distro PR

**Config changes** — prefer surgical edits over rewrites. If you add a
new MCP server to `config.yaml`, explain why the default ARC Goose user
benefits. Esoteric providers belong in user docs, not defaults.

**Installer changes** — keep `install.sh` idempotent. Every new step
must be safe to re-run. New keys or records must be generated only when
absent. If you need mutable state, use `~/.arc-goose/` and check for
existing state before writing.

**Branding** — logo/banner/color changes should include before/after
screenshots in the PR description. Don't ship partial brand refreshes.

**Docs** — keep `QUICKSTART.md` at three steps. If your change needs
more explanation, put it in `ARCHITECTURE.md` or a new doc.

**Workflows** — CI changes should not silently loosen signing or
validation. If you add a step that skips a check, justify it in the PR.

## Not welcome

- Forks of Goose internals (we ship config, not a fork).
- New default providers that require paid API keys for the default install.
- Telemetry, analytics, or "phone home" behavior.
- Dropping the idempotency guarantees in `install.sh`.
- Increasing `system_prompt_append` above 500 words (enforced by CI).

## How to test locally

```bash
cd distro/arc-goose
./install.sh            # dry-run friendly: re-runs are safe
docker compose up -d    # full stack
goose session           # verify a session records an arc_action
```

Check the chain:

```bash
curl -s http://localhost:8000/chain/$(jq -r .pubkey ~/.arc-goose/identity.json) | jq
```

Run the CI suite the same way GitHub will:

```bash
act -W distro/arc-goose/.github/workflows/build.yml  # if you use nektos/act
```

## Release process

1. Land your PR on `main`
2. Update `version:` in `distro/arc-goose/config.yaml`
3. Update the compatibility matrix in `distro/arc-goose/docs/UPGRADING.md`
4. Tag: `git tag arc-goose-v<version> && git push origin arc-goose-v<version>`
5. The `release` workflow builds tarball, docker images, and GitHub release

## Questions

Open an issue with label `distro` or start a thread in the repo's
Discussions tab.
