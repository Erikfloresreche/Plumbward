import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { mutationInputs, uncoveredMutationInputs, workflowPaths } from './mutation-paths.mjs'

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8')
const script = read('./check-mutations.mjs')
const workflow = read('../.github/workflows/mutations.yml')

describe('files the script mutates or runs', () => {
  it('reads the file constants', () => {
    expect(mutationInputs(script)).toContain('packages/packs-sdk/src/branches.ts')
    expect(mutationInputs(script)).toContain('vitest.setup.ts')
  })

  it('reads the TESTS array', () => {
    expect(mutationInputs(script)).toContain('packages/cli/test/e2e.test.ts')
  })

  it('reads a path written as a literal in the mutation, not as a constant', () => {
    const inline = "const MUTATIONS = [\n  ['Something', 'packages/new/src/piece.ts', 'a', 'b'],\n]"
    expect(mutationInputs(inline)).toContain('packages/new/src/piece.ts')
  })

  it('does not mistake the text of a mutation for a file', () => {
    const withLiteral = "const BR = 'packages/a/b.ts'\nconst MUTATIONS = [\n  ['Something', BR, '  if (x) return true\\n', ''],\n]"
    expect(mutationInputs(withLiteral)).toEqual(['packages/a/b.ts'])
  })

  it('reads a constant with digits or an underscore in its name', () => {
    // The two-letter abbreviations are exhausted: the next mutation on a file
    // already used will be called `CX2` or `WF_2`. If the name is not
    // recognised, the file vanishes from the list and the control goes green.
    expect(mutationInputs("const CX2 = 'packages/new/a.ts'")).toEqual(['packages/new/a.ts'])
    expect(mutationInputs("const WF_2 = 'packages/new/b.ts'")).toEqual(['packages/new/b.ts'])
    expect(mutationInputs("const Br = 'packages/new/c.ts'")).toEqual(['packages/new/c.ts'])
  })

  it('does not take as a file a constant that is not a path', () => {
    expect(mutationInputs("const CMD = 'pnpm'")).toEqual([])
  })

  it('reads a mutated file that is not TypeScript', () => {
    // The mutation list does not promise to touch only `.ts`: filtering by known
    // extension would reopen the same hole for a `.yml` or a `.json`.
    expect(mutationInputs("const TP = 'packages/packs/node-ts/src/templates/ci.yml'")).toEqual([
      'packages/packs/node-ts/src/templates/ci.yml',
    ])
  })

  it('does not repeat a file that appears as a constant and as a test', () => {
    const dup = "const BR = 'packages/a/b.ts'\nconst TESTS = [\n  'packages/a/b.ts',\n]"
    expect(mutationInputs(dup)).toEqual(['packages/a/b.ts'])
  })

  it('does not take a commented-out test as a file', () => {
    // A path that no longer runs demanded in the filter: a false red.
    const commented = "const TESTS = [\n  'packages/a.test.ts',\n  // 'packages/old.test.ts',\n  /* 'packages/older.test.ts' */\n]"
    expect(mutationInputs(commented)).toEqual(['packages/a.test.ts'])
  })

  it('does not end the TESTS array at a ] inside a comment', () => {
    // The paths after the comment were lost in silence: a false green.
    const bracket = "const TESTS = [\n  'packages/a.test.ts',\n  // see [F0-27]\n  'packages/b.test.ts',\n]"
    expect(mutationInputs(bracket)).toEqual(['packages/a.test.ts', 'packages/b.test.ts'])
  })

  it('fails out loud if the TESTS array is never closed', () => {
    expect(() => mutationInputs("const TESTS = [\n  'packages/a.test.ts',\n")).toThrow(/never closed/)
  })
})

describe('paths of the workflow filter', () => {
  it('reads every entry of the real filter', () => {
    expect(workflowPaths(workflow)).toContain('packages/packs-sdk/src/branches.ts')
    expect(workflowPaths(workflow)).toContain('vitest.config.ts')
  })

  it('does not stop at a comment or a blank line inside the list', () => {
    const wf = "on:\n  pull_request:\n    paths:\n      - 'a.ts'\n\n      # comment\n      - 'b.ts'\n  workflow_dispatch:\n"
    expect(workflowPaths(wf)).toEqual(['a.ts', 'b.ts'])
  })

  it('ends the list when it reaches another key', () => {
    const wf =
      "on:\n  pull_request:\n    paths:\n      - 'a.ts'\n  workflow_dispatch:\n      - 'no.ts'\n"
    expect(workflowPaths(wf)).toEqual(['a.ts'])
  })

  it('reads the pull_request filter, not the first paths of the file', () => {
    // A `push:` trigger with its own list ahead of it hijacked the control: it
    // validated that list and never looked at the one filtering PRs.
    const wf =
      "on:\n  push:\n    paths:\n      - 'all.ts'\n  pull_request:\n    paths:\n      - 'only-one.ts'\n"
    expect(workflowPaths(wf)).toEqual(['only-one.ts'])
  })

  it('does not mistake paths-ignore for the filter', () => {
    const wf = "on:\n  pull_request:\n    paths-ignore:\n      - 'docs/**'\n"
    expect(() => workflowPaths(wf)).toThrow(/paths-ignore/)
  })

  it('tells apart no filter from a filter that leaves files out', () => {
    // No filter: the workflow runs on every PR. Not the same as an empty list.
    expect(workflowPaths('on:\n  pull_request:\n    branches: [develop]\n')).toBeNull()
    expect(workflowPaths('on:\n  pull_request:\n  workflow_dispatch:\n')).toBeNull()
  })

  it('fails out loud if there is no pull_request trigger', () => {
    expect(() => workflowPaths('on:\n  push:\n    paths:\n      - a.ts\n')).toThrow(/pull_request/)
  })

  it('fails out loud on an inline filter it does not read', () => {
    expect(() => workflowPaths("on:\n  pull_request:\n    paths: ['a.ts']\n")).toThrow(/inline/)
  })

  it('stops at the end of the list, not at the next entry of another key', () => {
    // Kills the mutant that removes the indentation check: the less indented
    // `- ` would be read as one more path.
    const wf = "on:\n  pull_request:\n    paths:\n      - 'a.ts'\n  - 'no.ts'\n"
    expect(workflowPaths(wf)).toEqual(['a.ts'])
  })

  it('reads a list not indented under its key, and ends it at the next key', () => {
    const wf = "on:\n  pull_request:\n    paths:\n    - 'a.ts'\n    - b.ts\n    branches:\n    - develop\n"
    expect(workflowPaths(wf)).toEqual(['a.ts', 'b.ts'])
  })

  it('fails out loud on an entry it cannot read, instead of cutting or skipping', () => {
    // Cutting the list loses every path after it; skipping loses one in
    // silence. Either way the red blames the wrong file, or none.
    const wf = "on:\n  pull_request:\n    paths:\n      - 'a.ts'\n      - key: value\n      - 'b.ts'\n"
    expect(() => workflowPaths(wf)).toThrow(/key: value/)
  })

  it('reads double quotes, no quotes and a comment at the end of an entry', () => {
    const wf =
      "on:\n  pull_request:\n    paths:\n      - \"a.ts\"\n      - b.ts # why\n      - 'c.ts'  # why\n      - 'd.ts'\n"
    expect(workflowPaths(wf)).toEqual(['a.ts', 'b.ts', 'c.ts', 'd.ts'])
  })
})

describe('filter coverage', () => {
  it('the real workflow covers everything the script mutates or runs', () => {
    expect(uncoveredMutationInputs(script, workflow)).toEqual([])
  })

  it('exposes a new mutation on a file the filter does not name', () => {
    const withNewMutation = script.replace(
      "const VS = 'vitest.setup.ts'",
      "const VS = 'vitest.setup.ts'\nconst NW = 'packages/new/src/piece.ts'",
    )
    expect(withNewMutation).not.toBe(script)
    expect(uncoveredMutationInputs(withNewMutation, workflow)).toEqual(['packages/new/src/piece.ts'])
  })

  it('accepts the real workflow with its paths: filter removed', () => {
    // The emergency exit mutations.yml documents for the day the job becomes
    // required: with no filter the workflow runs on every PR.
    const withoutFilter = workflow.replace(/\n    paths:\n(?:      .*\n|\s*\n)+/, '\n')
    expect(workflowPaths(withoutFilter)).toBeNull()
    expect(uncoveredMutationInputs(script, withoutFilter)).toEqual([])
  })

  it('does not accept a broad pattern instead of the exact path', () => {
    const broad = "on:\n  pull_request:\n    paths:\n      - 'packages/**'\n"
    expect(uncoveredMutationInputs(script, broad).length).toBeGreaterThan(0)
  })
})
