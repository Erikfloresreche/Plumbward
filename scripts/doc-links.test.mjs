import { describe, expect, it } from 'vitest'

import { checkDocLinks, linkTargets, withDirectories } from './doc-links.mjs'

/** F0-16: a rename must not leave links pointing at the old path. */

const existing = withDirectories(['CLAUDE.md', 'docs/EXECUTION_PLAN.md', 'docs/adr/0001-plan-before-apply.md'])
const check = (path, text) => checkDocLinks([{ path, text }], existing)

describe('checkDocLinks', () => {
  it('fails for a link to a path that was renamed', () => {
    const problems = check('CLAUDE.md', 'Read [the plan](docs/PLAN_DE_EJECUCION.md) first.\n')
    expect(problems).toEqual(['CLAUDE.md:1 links to "docs/PLAN_DE_EJECUCION.md", which does not exist'])
  })

  it('accepts a link to an existing file', () => {
    expect(check('CLAUDE.md', '[plan](docs/EXECUTION_PLAN.md)')).toEqual([])
  })

  it('resolves the target from the directory of the file that links', () => {
    expect(check('docs/EXECUTION_PLAN.md', '[ADR](adr/0001-plan-before-apply.md)')).toEqual([])
    expect(check('docs/EXECUTION_PLAN.md', '[ADR](docs/adr/0001-plan-before-apply.md)')).toHaveLength(1)
    expect(check('docs/adr/0001-plan-before-apply.md', '[guide](../../CLAUDE.md)')).toEqual([])
    expect(check('docs/EXECUTION_PLAN.md', '[same](./EXECUTION_PLAN.md)')).toEqual([])
  })

  it('reads a leading slash as the repository root', () => {
    expect(check('docs/EXECUTION_PLAN.md', '[guide](/CLAUDE.md)')).toEqual([])
  })

  it('ignores the anchor, but not the file before it', () => {
    expect(check('CLAUDE.md', '[task](docs/EXECUTION_PLAN.md#f0-16)')).toEqual([])
    expect(check('CLAUDE.md', '[task](docs/GONE.md#f0-16)')).toHaveLength(1)
  })

  it('accepts a link to a directory that holds files', () => {
    expect(check('CLAUDE.md', '[ADRs](docs/adr/)')).toEqual([])
    expect(check('CLAUDE.md', '[ADRs](docs/adr)')).toEqual([])
    expect(check('CLAUDE.md', '[none](docs/empty/)')).toHaveLength(1)
  })

  it('checks images too', () => {
    expect(check('CLAUDE.md', '![logo](docs/logo.png)')).toHaveLength(1)
  })

  it('decodes escaped characters in the target', () => {
    const spaced = withDirectories(['docs/a b.md'])
    expect(checkDocLinks([{ path: 'x.md', text: '[a](docs/a%20b.md)' }], spaced)).toEqual([])
  })

  it('fails for a link that leaves the repository', () => {
    expect(check('CLAUDE.md', '[up](../other/README.md)')[0]).toContain('outside the repository')
  })

  it('skips external URLs and in-page anchors', () => {
    const text = '[a](https://example.com/x.md) [b](mailto:a@b.c) [c](#section)'
    expect(check('CLAUDE.md', text)).toEqual([])
  })

  it('reads only Markdown files', () => {
    expect(checkDocLinks([{ path: 'a.ts', text: '// [x](gone.md)' }], existing)).toEqual([])
  })

  it('reports the line of each broken link', () => {
    expect(check('CLAUDE.md', 'ok\n\n[x](gone.md)\n')[0]).toContain('CLAUDE.md:3')
  })
})

describe('linkTargets', () => {
  it('skips links inside fenced code blocks, with backticks or tildes', () => {
    const text = ['```md', '[x](a.md)', '```', '~~~', '[y](b.md)', '~~~', '[z](c.md)'].join('\n')
    expect(linkTargets(text)).toEqual([{ line: 7, target: 'c.md' }])
  })

  it('does not close a backtick fence with a tilde line', () => {
    const text = ['```', '~~~', '[x](a.md)', '```', '[z](c.md)'].join('\n')
    expect(linkTargets(text)).toEqual([{ line: 5, target: 'c.md' }])
  })

  it('skips links inside inline code', () => {
    expect(linkTargets('Write `[x](a.md)` and [y](b.md)')).toEqual([{ line: 1, target: 'b.md' }])
  })

  it('reads a target in angle brackets and a target with a title', () => {
    expect(linkTargets('[a](<a.md>) [b](b.md "Title")').map((t) => t.target)).toEqual(['a.md', 'b.md'])
  })
})

describe('withDirectories', () => {
  it('adds every parent directory and the root', () => {
    expect([...withDirectories(['a/b/c.md'])].sort()).toEqual(['.', 'a', 'a/b', 'a/b/c.md'])
  })
})
