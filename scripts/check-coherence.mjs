#!/usr/bin/env node
/**
 * Coherence control between what we declare and what we test.
 *
 * It exists because fresh-context reviews found the same class of failure three
 * times: claiming in the documentation something the code does not back. A rule
 * written in a document does not prevent it; this script does.
 *
 * It is the first control of task F0-12. Every time a review finds a
 * mechanisable inconsistency, its check is added here.
 */
import { readFileSync } from 'node:fs'
import { readdirSync, statSync, lstatSync, readlinkSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkPlan, checkPullRequestBranch } from './branch-names.mjs'
import { uncoveredMutationInputs } from './mutation-paths.mjs'
import { checkQueue } from './execution-queue.mjs'
import { checkEnglishOnly } from './english-only.mjs'
import { checkDocLinks, withDirectories } from './doc-links.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')
const json = (p) => JSON.parse(read(p))

/** @type {string[]} */
const failures = []
const fail = (control, detail) => failures.push(`${control}: ${detail}`)

// ── 1. The declared Node floor matches the one tested in CI ───────────────
const engines = json('package.json').engines.node
const declaredFloor = engines.replace(/^>=/, '')

const ci = read('.github/workflows/ci.yml')
const matrix = /node: \[([^\]]+)\]/.exec(ci)
if (!matrix) {
  fail('ci-matrix', 'the Node version matrix is not found in ci.yml')
} else {
  const versions = matrix[1].split(',').map((v) => v.trim().replace(/'/g, ''))
  const testedFloor = versions[0]
  if (!declaredFloor.startsWith(testedFloor)) {
    fail(
      'node-floor',
      `package.json declares ">=${declaredFloor}" but the lowest version the CI tests is ${testedFloor}. What is tested is what is supported.`,
    )
  }
}

// ── 1b. No condition points at a version that is not in the matrix ────────
// Born from the review of PR #6: after changing the matrix from '22' to '22.13',
// two steps with `if: matrix.node == '22'` were skipped in silence on every run
// — among them the typecheck and this very script. An `if` that never matches
// does not fail: it disappears.
if (matrix) {
  const versions = matrix[1].split(',').map((v) => v.trim().replace(/'/g, ''))
  // Only real `if:` lines: a comment quoting the pattern does not count.
  for (const m of ci.matchAll(/^\s*if:.*matrix\.node\s*==\s*'([^']+)'/gm)) {
    if (!versions.includes(m[1])) {
      fail(
        'matrix-condition',
        `ci.yml has a condition "matrix.node == '${m[1]}'" but the matrix is [${versions.join(', ')}]. That step would never run.`,
      )
    }
  }
}

// ── 1c. The types and coherence job uses the floor version ────────────────
{
  const job = /quality:[\s\S]*?node-version:\s*'([^']+)'/.exec(ci)
  if (!job) {
    fail('quality-job', 'the `quality` job is not found in ci.yml: types and coherence would not be checked in CI')
  } else if (job[1] !== declaredFloor) {
    fail('quality-job', `the \`quality\` job uses Node ${job[1]} and the declared floor is ${declaredFloor}`)
  }
}

// ── 2. The documentation states the same version as package.json ──────────
for (const doc of ['README.md', 'CONTRIBUTING.md']) {
  const text = read(doc)
  const m = /Node\.js >= ([\d.]+)/.exec(text)
  if (!m) {
    fail('documented-version', `${doc} declares no minimum Node version`)
  } else if (m[1] !== declaredFloor) {
    fail(
      'documented-version',
      `${doc} says "Node.js >= ${m[1]}" and package.json says ">=${declaredFloor}"`,
    )
  }
}

// ── 3. Publishable packages declare their own `engines` ───────────────────
// The root `engines` does not reach the user: the root is private. Without
// this, whoever installs the CLI does not get the warning README and
// CONTRIBUTING promise.
const packageDirs = []
for (const base of ['packages', 'packages/packs']) {
  for (const name of readdirSync(join(root, base))) {
    const path = join(base, name)
    try {
      if (statSync(join(root, path, 'package.json')).isFile()) packageDirs.push(path)
    } catch {
      /* not a package */
    }
  }
}
for (const dir of packageDirs) {
  const pkg = json(join(dir, 'package.json'))
  if (pkg.private) continue
  if (!pkg.engines?.node) {
    fail('package-engines', `${pkg.name} is published but does not declare "engines.node"`)
  } else if (pkg.engines.node !== engines) {
    fail(
      'package-engines',
      `${pkg.name} declares "${pkg.engines.node}" and the root declares "${engines}"`,
    )
  }
}

// ── 4. The branches of the CI triggers really exist ───────────────────────
// Born from a review: the workflows triggered on `main`, a branch that does
// not exist in this repository — the release one is called `Prod`. The result
// was that the release branch had no CI at all, in silence.
try {
  const { execSync } = await import('node:child_process')
  const remoteBranches = execSync('git ls-remote --heads origin', {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 15_000,
  })
    .split('\n')
    .map((l) => l.split('refs/heads/')[1])
    .filter(Boolean)

  if (remoteBranches.length > 0) {
    // Every workflow, not a hand-written list: a new workflow with a trigger on
    // a branch that does not exist would have no control.
    const workflows = readdirSync(join(root, '.github/workflows'))
      .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
      .map((f) => `.github/workflows/${f}`)
    for (const wf of workflows) {
      const text = read(wf)
      for (const m of text.matchAll(/branches: \[([^\]]+)\]/g)) {
        for (const branch of m[1].split(',').map((r) => r.trim())) {
          if (remoteBranches.includes(branch)) continue

          // Git branch names ARE case-sensitive: `Prod` and `prod` are
          // different branches. A case mismatch is the most likely mistake and
          // the hardest to see at a glance, so it is diagnosed separately
          // instead of saying "does not exist" and leaving the reader to
          // compare letter by letter.
          const caseMatch = remoteBranches.find((r) => r.toLowerCase() === branch.toLowerCase())
          fail(
            'trigger-branches',
            caseMatch
              ? `${wf} triggers on "${branch}", but the remote branch is called "${caseMatch}". Branch names are case-sensitive: the trigger would never fire.`
              : `${wf} triggers on the branch "${branch}", which does not exist on the remote. That branch would have no CI. Available branches: ${remoteBranches.join(', ')}.`,
          )
        }
      }
    }
  }
} catch {
  // No network or no remote: it cannot be checked, and that is no reason to fail.
  console.warn('  (warning: the remote branches could not be listed; control skipped)')
}

// ── 4 bis. The mutation workflow filter covers what is mutated ────────────
// `mutations.yml` only runs on the PRs that touch the files `check-mutations.mjs`
// mutates or runs. That list is written by hand in the workflow and the list of
// mutations grows: if a new mutation touches a file the filter does not name,
// the job stops running on the PRs that change it without turning red —it does
// not run, it does not fail—. The logic lives in `scripts/mutation-paths.mjs`,
// covered by its test. Task F0-27.
for (const file of uncoveredMutationInputs(
  read('scripts/check-mutations.mjs'),
  read('.github/workflows/mutations.yml'),
)) {
  fail(
    'mutation-filter',
    `check-mutations.mjs mutates or runs "${file}", but the paths: filter of .github/workflows/mutations.yml does not name it. A PR that changes that file would not launch the mutations.`,
  )
}

// ── 5. Branch names are in English and follow the plan format ─────────────
// The logic lives in `scripts/branch-names.mjs` and is covered by
// `scripts/branch-names.test.mjs` with a corpus of real names. Here the two
// inputs are only wired: the plan and the branch of the current Pull Request.
//
// The PR branch is read from GITHUB_HEAD_REF and not interpolated in the
// workflow, because a branch name is controlled by whoever opens the PR and
// putting it in a `run:` would be a command injection path. The author comes
// from GITHUB_ACTOR.
for (const reason of checkPlan(read('docs/EXECUTION_PLAN.md'))) {
  fail('plan-branch-name', reason)
}

const prBranchReason = checkPullRequestBranch(process.env.GITHUB_HEAD_REF, process.env.GITHUB_ACTOR)
if (prBranchReason) {
  fail('pr-branch-name', `"${process.env.GITHUB_HEAD_REF}" ${prBranchReason}`)
}

// ── 5 bis. The execution queue describes the plan (F0-40) ─────────────────
// The next task is the first one in the queue of §5. If the queue leaves out a
// pending task, keeps a closed one or puts something before its dependency, the
// next task stops being the right one without anyone noticing.
for (const reason of checkQueue(read('docs/EXECUTION_PLAN.md'))) {
  fail('execution-queue', reason)
}

// ── 5 ter. English everywhere, except what is listed (F0-41) ──────────────
// Tracked files plus new ones not yet added, so Spanish is caught before the
// commit and not only in CI. A file deleted on disk but still in the index is
// skipped, and so are symlinks: their target is scanned as its own path.
{
  const { execFileSync } = await import('node:child_process')
  const paths = new Set(
    execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean),
  )
  const files = []
  for (const path of paths) {
    const full = join(root, path)
    if (!existsSync(full) || !lstatSync(full).isFile()) continue
    files.push({ path, text: readFileSync(full, 'utf8') })
  }
  for (const problem of checkEnglishOnly(files, json('scripts/english-only.json'))) {
    fail('english-only', problem)
  }

  // ── 5 quater. Relative documentation links resolve (F0-16) ──────────────
  // Same file list: a link to a new file not yet added resolves, a link to a
  // file deleted on disk does not. A rename otherwise breaks links in silence.
  const existing = withDirectories([...paths].filter((path) => existsSync(join(root, path))))
  for (const problem of checkDocLinks(files, existing)) {
    fail('doc-links', problem)
  }
}

// ── 6. The versioned agent skills are the ones the lock pins (F0-17) ──────
// A skill is third-party code the assistant loads with access to the repo.
// `skills-lock.json` pins its hash; if someone edits it by hand or replaces it,
// the lock stops describing what is loaded and nobody notices. The hash is
// computed like `computeSkillFolderHash` of the `skills` CLI (v1.5.25): sha256
// of relative path + content of each file, sorted by path.
const SKILLS_DIR = '.agents/skills'
const CLAUDE_SKILLS_DIR = '.claude/skills'

/** @returns {string} */
function skillFolderHash(dir) {
  /** @type {{ path: string, content: Buffer }[]} */
  const files = []
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      // A symbolic link is neither a file nor a directory for `Dirent`: the
      // `skills` CLI skips it, so its content never enters the hash. It is
      // forbidden, or it would be a way to slip in code the lock does not cover.
      if (entry.isSymbolicLink()) {
        fail('skill-symlink', `${relative(root, full)} is a symbolic link: the lock hash does not cover it`)
      } else if (entry.isDirectory()) {
        if (entry.name !== '.git' && entry.name !== 'node_modules') walk(full)
      } else if (entry.isFile() && entry.name !== '.DS_Store') {
        // .DS_Store: macOS creates it, it is in .gitignore and never reaches CI.
        files.push({ path: relative(dir, full).split('\\').join('/'), content: readFileSync(full) })
      }
    }
  }
  walk(dir)
  files.sort((a, b) => a.path.localeCompare(b.path))
  const hash = createHash('sha256')
  for (const f of files) hash.update(f.path).update(f.content)
  return hash.digest('hex')
}

if (existsSync(join(root, 'skills-lock.json'))) {
  const locked = json('skills-lock.json').skills ?? {}
  const installed = existsSync(join(root, SKILLS_DIR))
    ? readdirSync(join(root, SKILLS_DIR), { withFileTypes: true }).filter((e) => !e.isFile()).map((e) => e.name)
    : []
  for (const name of installed) {
    if (!(name in locked)) fail('skill-not-locked', `${SKILLS_DIR}/${name} is not in skills-lock.json`)
  }
  for (const [name, entry] of Object.entries(locked)) {
    const dir = join(root, SKILLS_DIR, name)
    if (!existsSync(dir)) {
      fail('skill-missing', `skills-lock.json pins "${name}" but ${SKILLS_DIR}/${name} does not exist`)
      continue
    }
    const actual = skillFolderHash(dir)
    if (actual !== entry.computedHash) {
      fail('skill-altered', `${SKILLS_DIR}/${name} does not match the hash in skills-lock.json (${actual})`)
    }
    // 6b. Claude Code only reads `.claude/skills/`. Without the link, the skill
    // is installed and versioned but no assistant loads it: it looks like it works.
    const link = join(root, CLAUDE_SKILLS_DIR, name)
    const expected = `../../${SKILLS_DIR}/${name}`
    let target
    try {
      target = lstatSync(link).isSymbolicLink() ? readlinkSync(link) : undefined
    } catch {
      target = undefined
    }
    if (target !== expected) {
      fail('skill-not-linked', `${CLAUDE_SKILLS_DIR}/${name} must be a link to ${expected}`)
    }
  }
}

// ── 7. The napkin runbook follows its own curation rules (F0-17) ──────────
// The rules are written in the header of the file, and a written rule gets
// broken. At most 10 entries per category; each one with a date and "Do instead".
const NAPKIN = '.claude/napkin.md'
if (existsSync(join(root, NAPKIN))) {
  let category
  let count = 0
  let pending // open entry that has not shown its "Do instead" yet
  const closeEntry = () => {
    if (pending) fail('napkin-no-do-instead', `"${pending}" (${category})`)
    pending = undefined
  }
  for (const line of read(NAPKIN).split('\n')) {
    const header = /^## (.+)$/.exec(line)
    if (header) {
      closeEntry()
      category = header[1]
      count = 0
      continue
    }
    const item = /^\d+\. (.*)$/.exec(line)
    if (item) {
      closeEntry()
      count += 1
      if (count === 11) fail('napkin-category-full', `"${category}" has more than 10 entries`)
      if (!/^\*\*\[\d{4}-\d{2}-\d{2}\] /.test(item[1])) {
        fail('napkin-no-date', `"${item[1].slice(0, 60)}" (${category})`)
      }
      pending = item[1].slice(0, 60)
      continue
    }
    if (/^\s+Do instead: \S/.test(line)) pending = undefined
  }
  closeEntry()
}

// ── 8. The git commands of §0 of CLAUDE.md are allowed by §1 (F0-15) ──────
// The guide to pick up the project proposed `git branch --show-current`, which
// was not in the list of allowed read-only commands. A guide that tells you to
// do something the same file forbids is only found by reading both sections at
// once, which is exactly what nobody does.
{
  const claude = read('CLAUDE.md')
  const section = (prefix) => {
    const from = claude.indexOf(`\n## ${prefix}`)
    if (from < 0) return undefined
    const rest = claude.slice(from + 1)
    const to = rest.indexOf('\n## ')
    return to < 0 ? rest : rest.slice(0, to)
  }

  const section0 = section('0. ')
  const allowedList = /You may use the read-only ones:([\s\S]*?)\./.exec(claude)
  const allowed = allowedList
    ? [...allowedList[1].matchAll(/`([^`]+)`/g)].map((m) => m[1])
    : []

  // Without an anchor there is no control: fail instead of passing in silence.
  if (!section0) fail('claude-md-allowed-git', 'the "## 0. " section is not found in CLAUDE.md')
  else if (allowed.length === 0) {
    fail('claude-md-allowed-git', 'the list of read-only git commands is not found in §1')
  } else {
    // The whole §0 is walked, not only its ```bash blocks: a `git reset
    // --hard` written in prose, between backticks, is just as copyable and
    // slipped through. The subcommand only carries its options, so the capture
    // ends where the command ends and does not swallow the sentence.
    //
    // Global options (`git -C path push`, `git -c k=v commit`) are skipped to
    // reach the subcommand: they are a common way to write a command, and a
    // pattern that requires a letter right after `git ` did not match at all
    // and let it through whole. The lookbehind avoids `legit`, and `\s+` after
    // `git` avoids `gitlab`.
    //
    // The group is optional on purpose: a `git` whose subcommand this control
    // cannot read falls into `undefined` instead of disappearing, and fails out
    // loud. Silence here is exactly what made the sentence of §1 false.
    const uses = section0.matchAll(
      /(?<![\w-])git\s+(?:-[cC]\s+\S+\s+)*([a-z][a-z-]*(?:\s+--?[a-z][\w.-]*(?:=\S+)?)*)?/g,
    )
    let seen = 0
    for (const use of uses) {
      seen += 1
      const command = use[1]?.trim()
      if (!command) {
        const excerpt = section0.slice(use.index, use.index + 48).split('\n')[0].trim()
        fail(
          'claude-md-allowed-git',
          `§0 writes "${excerpt}", and this control cannot read a subcommand there: ` +
            'it cannot claim that §1 allows it',
        )
        continue
      }
      const isAllowed = allowed.some((p) => command === p || command.startsWith(`${p} `))
      if (!isAllowed) {
        fail(
          'claude-md-allowed-git',
          `§0 proposes "git ${command}", which is not in the read-only list of §1`,
        )
      }
    }
    // If §0 stops proposing commands, this control has no purpose left and has
    // to be reviewed, not left passing green without looking at anything.
    if (seen === 0) fail('claude-md-allowed-git', '§0 no longer proposes any git command')
  }
}

// ── Result ────────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error('\nCoherencia: se han encontrado incoherencias.\n')
  for (const f of failures) console.error(`  ✗ ${f}`)
  console.error('')
  process.exit(1)
}
console.log('Coherencia: lo que declaramos coincide con lo que probamos.')
