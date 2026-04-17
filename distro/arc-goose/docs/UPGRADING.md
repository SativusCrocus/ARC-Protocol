# ARC Goose — Upgrading

ARC Goose tracks upstream Goose. This doc explains how to merge upstream
updates cleanly.

## Which files are ARC-specific

Everything under `distro/arc-goose/` is ARC-owned. None of it should appear
in an upstream Goose PR.

```
distro/arc-goose/
├── config.yaml              ARC
├── install.sh               ARC
├── docker-compose.yml       ARC
├── branding/                ARC
├── docs/                    ARC
└── .github/workflows/       ARC
```

Everything under `mcp-server/`, `backend/`, `frontend/`, and
`orchestrator/` is ARC Protocol proper — also not upstream.

**Upstream-owned** files only appear if you vendor Goose into this repo
(not recommended). The default distribution model is: user installs Goose
via its own installer, then ARC Goose layers config on top.

## How to merge upstream Goose updates

The distro does **not** fork Goose. Upgrading just means:

1. Confirm the Goose release is compatible (see matrix below)
2. Update the pinned version in `install.sh` if needed
3. Update `config.yaml` if Goose introduced breaking schema changes
4. Bump `version:` in `config.yaml`
5. Run the integration test suite (`distro/arc-goose/.github/workflows/build.yml`)

### Weekly auto-sync

`.github/workflows/upstream-sync.yml` runs weekly. It:

1. Fetches the latest Goose release tag
2. Diffs Goose's `CUSTOM_DISTROS.md` and config schema against what we shipped
3. Opens a PR against `main` titled `chore(distro): sync upstream Goose vX.Y.Z`
4. Attaches a summary of schema changes requiring attention

The PR does not auto-merge. A human reviews schema diffs, updates
`config.yaml`, and tests before shipping.

## Version compatibility matrix

| ARC Goose | Upstream Goose   | ARC Protocol | MCP protocol | Notes                     |
| --------- | ---------------- | ------------ | ------------ | ------------------------- |
| 1.0.0     | 0.9.x            | 0.3.x        | 2025-06-18   | Initial distro release    |
| 1.1.x     | 0.10.x (planned) | 0.3.x        | 2025-06-18   | TBD — see upstream-sync   |

Compatibility policy:

- **Patch** bumps (`1.0.x`): config-only changes, fully backward compatible.
- **Minor** bumps (`1.x.0`): new MCP tools, new branding, new recipes.
- **Major** bumps (`2.x.x`): breaking changes to identity file format or
  signature scheme. An explicit migration script will ship with any major
  bump.

## License handling during upgrades

- ARC Goose is MIT (this distro's code + docs)
- Upstream Goose is Apache-2.0 (not vendored here, but if ever vendored,
  preserve the `NOTICE` file)
- If a PR adds Apache-2.0 code into this tree, call it out in the PR
  description and retain the upstream copyright headers.

## Rollback

The installer backs up the existing Goose config to
`~/.config/goose/config.yaml.backup.<timestamp>` before overwriting.
To roll back:

```bash
cd ~/.config/goose
mv config.yaml.backup.<timestamp> config.yaml
```

Your ARC identity at `~/.arc-goose/identity.json` is never touched by
upgrades or rollbacks.
