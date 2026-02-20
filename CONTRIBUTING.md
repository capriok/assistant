# Contributing

Thanks for contributing to `assistant`.

## Development setup

1. Initialize submodules: `bun run setup:submodules`
2. Install JS dependencies: `bun i`
3. Create Python venv and install dependencies from `requirements.txt`
4. Build native dependencies with:
   - `bun run build:llama`
   - `bun run build:whisper`

## Before opening a PR

- Run `bun run check`
- Keep changes scoped and documented
- Update README when behavior or setup changes

## Pull requests

- Use a clear title and include motivation + test evidence
- Link related issues
- Note platform assumptions (macOS/Linux)

## Issues, labels, and milestones

Recommended labels:

- `bug`
- `enhancement`
- `documentation`
- `good first issue`
- `help wanted`

Recommended milestones:

- `beta-hardening`
- `developer-experience`
- `stability`

No automation is required for label or milestone management in v1.
