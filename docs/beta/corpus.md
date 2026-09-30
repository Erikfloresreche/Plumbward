# Beta corpus

The public TypeScript repositories the beta is run against (F7-2). The
developer forks them and runs the full cycle on each fork (F7-5); the safety
tests of M1 and the automatic battery of F6-2 take their cases from this list.

**Pinned on:** 2026-09-30. Every repository is pinned to a full commit SHA, so
two runs of the beta see the same code. A fork is prepared with
`git clone https://github.com/<repository>` followed by
`git checkout <commit>` in a scratch directory, never inside this repository.

No telemetry: every figure below was measured by hand, on a local clone, and
nothing is sent anywhere.

---

## 1. How the columns are measured

- **SLOC**: the total that Plumbward's own scanner reports
  (`scanRepository`, `packages/scanner/src/sloc.ts`) on a clone at the pinned
  commit. It counts every language the scanner knows, not only TypeScript, and
  skips empty lines and comment lines.
- **Size**: the bucket of `SIZE_THRESHOLDS` by SLOC alone: small under 2,000,
  medium up to 50,000, large above. It is **not** the scanner's `sizeClass`,
  which forces every repository it takes for a monorepo into `large` (§4).
- **Package manager**: the lockfile at the root, or the `packageManager` field.
  No lockfile means npm.
- **Linter**: the configuration file at the root. "Legacy ESLint" is
  `.eslintrc*`; "flat ESLint" is `eslint.config.*`.
- **CI**: GitHub Actions workflows under `.github/workflows/`.
- **Hooks**: the hook manager the repository declares, whatever its format.
- **Monorepo**: what the repository really is, read from its layout. The
  scanner's opinion is in §4 when it differs.

## 2. The repositories

| # | Repository | Commit | Licence | Why it is in |
|---|---|---|---|---|
| 1 | [developit/mitt](https://github.com/developit/mitt) | `6b41670516ed8e8b738612f60491995470aa63b3` | MIT | Smallest case: one source file, no lockfile, legacy ESLint. |
| 2 | [total-typescript/ts-reset](https://github.com/total-typescript/ts-reset) | `81b3b2614a32e47948cd4b8d5468879c07c2b361` | MIT | Small, no linter at all, and a `turbo.json` in a single package. |
| 3 | [vercel/ms](https://github.com/vercel/ms) | `4ff48cec099f0514c3e9bbca18706c9c21122bfb` | MIT | Small with Biome and husky; `pnpm-workspace.yaml` holds only settings. |
| 4 | [piotrwitek/utility-types](https://github.com/piotrwitek/utility-types) | `fb06cf0c7d2768e39b78bed8b7ca94727998cb2f` | MIT | Small, npm lockfile, TSLint and husky v4 configured in `package.json`. |
| 5 | [unjs/ufo](https://github.com/unjs/ufo) | `f06c800d0c59f2a4a1b9ba65eb6cb61a84419be6` | MIT | Just over the small threshold: flat ESLint, pnpm, no hooks. |
| 6 | [microsoft/tsyringe](https://github.com/microsoft/tsyringe) | `78222334f49265ea2874fac2c73284345c1124d9` | MIT | Medium, yarn, legacy ESLint in YAML and a `.huskyrc.json`. |
| 7 | [millsp/ts-toolbelt](https://github.com/millsp/ts-toolbelt) | `b8a49285e3ed3a7d8bb8e0b433389eac46a5f140` | Apache-2.0 | The only one without GitHub Actions: its CI is Travis. |
| 8 | [pmndrs/zustand](https://github.com/pmndrs/zustand) | `d7a5583cffd80af515f7dfb69583c95cbdc9e2ce` | MIT | Medium, flat ESLint, two lockfiles at the root (npm and pnpm). |
| 9 | [immerjs/immer](https://github.com/immerjs/immer) | `061c2425e1c9dff89e4e4189d42af1b7839dfe0a` | MIT | Medium, yarn, Prettier only and no linter. |
| 10 | [sindresorhus/ky](https://github.com/sindresorhus/ky) | `0d59458a0a58e1c3d7c6db0ab17ed5c7cd671e47` | MIT | Medium, npm without lockfile, linted with `xo` from `package.json`. |
| 11 | [gcanti/fp-ts](https://github.com/gcanti/fp-ts) | `c0a6472121c67a2b083e62fcff13e7d022e39d8f` | MIT | Top of the medium bucket, npm lockfile, legacy ESLint. |
| 12 | [elysiajs/elysia](https://github.com/elysiajs/elysia) | `e037eca710e7ad193be09cc6615ab0dbe54af914` | MIT | Large single package on bun, legacy ESLint. |
| 13 | [vitejs/vite](https://github.com/vitejs/vite) | `cf5c0288d526824aead1b24e977400f13c527927` | MIT | Monorepo on pnpm workspaces, flat ESLint, simple-git-hooks. |
| 14 | [excalidraw/excalidraw](https://github.com/excalidraw/excalidraw) | `35e854ecf7a1ace3467922965ce07ec1a6f0ea54` | MIT | Monorepo on yarn workspaces, legacy ESLint, husky. |
| 15 | [better-auth/better-auth](https://github.com/better-auth/better-auth) | `69defbcabae430ca48e4ff1088c52a051566905e` | MIT | Monorepo on pnpm and turbo, Biome, lefthook. |
| 16 | [sst/opencode](https://github.com/sst/opencode) | `9b4882db54627f2656a6990daafa412f9f3c7c82` | MIT | Largest case: monorepo on bun workspaces and turbo, oxlint, husky. |

## 3. What each repository covers

| # | SLOC | Size | Package manager | Linter | CI | Hooks | Monorepo |
|---|---:|---|---|---|---|---|---|
| 1 | 285 | small | npm (no lockfile) | legacy ESLint | yes | no | no |
| 2 | 807 | small | pnpm | none | yes | no | no |
| 3 | 1,031 | small | pnpm | Biome | yes | husky | no |
| 4 | 1,352 | small | npm | TSLint | yes | husky v4 | no |
| 5 | 2,228 | medium | pnpm | flat ESLint | yes | no | no |
| 6 | 3,039 | medium | yarn | legacy ESLint | yes | husky v4 | no |
| 7 | 6,872 | medium | npm (no lockfile) | legacy ESLint | no (Travis) | husky v4 | no |
| 8 | 9,027 | medium | pnpm, plus a `package-lock.json` | flat ESLint | yes | no | no |
| 9 | 13,841 | medium | yarn | none | yes | husky v4 | no |
| 10 | 22,217 | medium | npm (no lockfile) | xo | yes | no | no |
| 11 | 46,675 | medium | npm | legacy ESLint | yes | no | no |
| 12 | 60,373 | large | bun | legacy ESLint | yes | no | no |
| 13 | 93,876 | large | pnpm | flat ESLint | yes | simple-git-hooks | yes |
| 14 | 188,420 | large | yarn | legacy ESLint | yes | husky | yes |
| 15 | 411,842 | large | pnpm | Biome | yes | lefthook | yes |
| 16 | 648,650 | large | bun | oxlint | yes | husky | yes |

Every variety that F7-2 asks for has at least one repository:

| Variety | Repositories |
|---|---|
| Small / medium / large | 1–4 / 5–11 / 12–16 |
| npm / pnpm / yarn / bun | 1, 4, 7, 10, 11 / 2, 3, 5, 8, 13, 15 / 6, 9, 14 / 12, 16 |
| Monorepo | 13, 14, 15, 16 |
| No linter | 2, 9 |
| Legacy ESLint | 1, 6, 7, 11, 12, 14 |
| Flat ESLint | 5, 8, 13 |
| Biome | 3, 15 |
| Without CI | 7 |
| With husky | 3, 14, 16 (husky v4: 4, 6, 7, 9) |
| Other hook managers | 13 (simple-git-hooks), 15 (lefthook) |
| Without hooks | 1, 2, 5, 8, 10, 11, 12 |

## 4. Where the scanner reads them differently today

The baseline, measured with the scanner of `develop` on 2026-09-30. It is
recorded so the beta measures these defects, not so it avoids them (F7-2,
point 3). None of them is fixed here.

1. **Single packages taken for monorepos.** `pnpm-workspace.yaml` holds only
   pnpm settings in 3 and 8, and 2 has a `turbo.json`. The scanner reports all
   three as monorepos, so it classifies them as `large` and chooses
   `non-disruptive` for repositories under 10,000 SLOC. It is the first open
   question of [ARCHITECTURE §8](../ARCHITECTURE.md#8-known-open-questions).
2. **A yarn monorepo not taken for one.** 14 declares `workspaces` in
   `package.json` and has no workspace file, so the scanner does not see a
   monorepo. The mode is right by size, but the packs reason about the root
   (F2-7).
3. **Linters the scanner does not know.** `xo` (10), TSLint (4) and oxlint
   (16) do not count as a configured linter. What a pack generates next to them
   is one of the conflicts the beta counts
   ([metrics §3](metrics.md#3-conflicts-by-type)).
4. **Hooks the scanner does not know.** husky v4, configured in `package.json`
   or `.huskyrc.json` (4, 6, 7, 9), and simple-git-hooks (13) do not count as
   hooks.
5. **CI outside GitHub Actions.** 7 runs on Travis, and the scanner reports it
   without CI. Correct for what Plumbward generates, but the repository is not
   one without CI for its team.

None of them makes the cycle unsafe: they change the mode chosen or the
maturity score, not what `apply` and `rollback` can touch. So none opens a task
of its own for M1. Whether any of them blocks the beta is decided with the
measurements of F7-5, not before.
