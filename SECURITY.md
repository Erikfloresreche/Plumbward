# Security policy

## Reporting a vulnerability

If you find a vulnerability in Plumbward, **do not open a public issue**.
Write to **erikfloresreche@gmail.com** with the subject `[SECURITY] Plumbward`.

Include, as far as possible:

- A description of the problem and its impact.
- The steps to reproduce it.
- The affected version and the operating system.

You will receive an acknowledgement within **5 business days** and an initial
assessment within **15 calendar days**. These are deadlines a project with a
single maintainer can really meet; they will be shortened when the team grows.
If the vulnerability is confirmed, we will agree a disclosure date with you and
credit you in the advisory unless you prefer otherwise.

## Why this tool deserves special attention

Plumbward **writes to its users' repositories** and **runs commands** on their
machines. That makes it an interesting target. The areas where a flaw would be
most serious:

- **Writing outside the repository.** `resolveInRepo()` in
  [core/src/fs.ts](packages/core/src/fs.ts) rejects absolute paths and paths
  that escape with `../`. Any way around it is critical.
  **Already known, no need to report it:** the check is lexical and does not
  resolve symbolic links, so a symlink inside the repository that points
  outside allows escaping. It is recorded as task F0-10.
- **Command execution.** `execa` is used without a shell precisely to avoid
  injection. Any path that allows injecting a command is critical.
- **Third-party packs.** That a pack only declares operations and does not write
  is today a **convention**, not a technical boundary: a pack is loaded in the
  same Node process and can import `node:fs`. That is why the CLI **only loads
  packs shipped in its own package**; third-party packs are not accepted yet,
  and accepting them first requires real isolation (task F2-11). If you find a
  way for an untrusted pack to be loaded today, it is critical.
- **Information leaks.** The CLI sends no telemetry. When licence validation
  exists, it will send only the token, the repository fingerprint and the
  version. Never code, paths or file names.

## Scope

In scope: the code in this repository and the packages published from it.

Out of scope: the third-party tools Plumbward configures (ESLint, Gitleaks,
Husky and the rest) —report those to their maintainers—, and vulnerabilities
that require the attacker to already have write access to the repository or to
the victim's machine.
