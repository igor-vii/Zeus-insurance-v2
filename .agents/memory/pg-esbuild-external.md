---
name: pg-esbuild-external
description: Why pg must be declared as a direct dependency of api-server when used via esbuild externals
---

When esbuild externalizes a package (e.g. `"pg"` in the `external` array), the bundled output at `dist/index.mjs` does a bare `import "pg"` at runtime. Node resolves that relative to the dist file's package — which is `artifacts/api-server/`. If `pg` is only a transitive dep (via `@workspace/db`), Node cannot find it.

**Rule:** any package added to `build.mjs` externals must also be listed in `artifacts/api-server/package.json` dependencies.

**How to apply:** whenever adding a new external to build.mjs for the api-server, also add it explicitly to the api-server package.json and run `pnpm install`.
