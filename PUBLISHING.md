# Publishing sr-engine

This package is published from the repository root as an ESM npm package.

## 1. Pre-release checks

Run the full local release gate:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run test:package-smoke
```

Verify the exact tarball contents before publishing:

```bash
npm pack --dry-run
```

Expected publish payload is limited to:

- `dist/`
- `README.md`
- `LICENSE`
- `package.json`

## 2. Package name check

Before the first publish, verify that the package name is available:

```bash
npm view sr-engine
```

If the unscoped name is unavailable, switch to a scoped package name such as:

- `@mart0nk/sr-engine`
- `@gecko/sr-engine`

If you use a scoped public package, publish with public access.

## 3. Versioning

Update `package.json` and `package-lock.json` to the release version before publishing.

Recommended flow:

```bash
npm version <patch|minor|major>
```

Then update:

- `CHANGELOG.md`
- `MIGRATION.md` when the release changes public behavior or contracts

## 4. Tarball validation

Build a real tarball and test it in a clean consumer project:

```bash
npm pack
mkdir -p /tmp/sr-engine-consumer
cd /tmp/sr-engine-consumer
npm init -y
npm install /absolute/path/to/sr-engine-<version>.tgz
```

Minimal consumer import check:

```js
import { SupportResistanceEngine } from "sr-engine";
import { createSupportResistanceRollingEngine } from "sr-engine/rolling";
import { toChartOverlays } from "sr-engine/chart";
import { toScannerFacts } from "sr-engine/facts";
import { resolveSupportResistanceConfig } from "sr-engine/config";
import type { Candle } from "sr-engine/types";
```

## 5. Publish

Authenticate with npm:

```bash
npm login
npm whoami
```

Publish:

```bash
npm publish
```

For scoped public packages:

```bash
npm publish --access public
```

`publishConfig.access` is already set to `public` in `package.json`.

## 6. Post-publish verification

Verify the registry metadata:

```bash
npm view sr-engine
```

Then install from the registry in a clean directory:

```bash
mkdir -p /tmp/sr-engine-registry-check
cd /tmp/sr-engine-registry-check
npm init -y
npm install sr-engine
```

Run the same minimal consumer import check against the published package.

## 7. CI expectations

GitHub Actions should stay green before release:

- `npm ci`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run test:package-smoke`

`prepublishOnly` also runs the package smoke test, so export/tarball regressions fail before publish.
