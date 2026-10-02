import { describe, expect, it } from 'vitest'

import { applyMutation } from './mutation-apply.mjs'

const source = "if (ok && release !== null) {\n  run(manager, release, language)\n}\n"

describe('applying one mutation', () => {
  it('replaces the primary anchor when it occurs exactly once', () => {
    expect(applyMutation(source, ' && release !== null', '', undefined)).toEqual({
      mutated: 'if (ok) {\n  run(manager, release, language)\n}\n',
    })
  })

  it('a primary anchor that no longer occurs is stale', () => {
    expect(applyMutation(source, 'gone', 'x', undefined)).toEqual({ stale: { anchor: 'gone', count: 0 } })
  })

  it('a primary anchor that occurs twice is stale', () => {
    expect(applyMutation(source, 'release', 'x', undefined)).toEqual({ stale: { anchor: 'release', count: 2 } })
  })

  it('applies the extra replacement after the primary one', () => {
    const extra = ['run(manager, release, language)', "run(manager, release ?? 'main', language)"]
    expect(applyMutation(source, ' && release !== null', '', extra)).toEqual({
      mutated: "if (ok) {\n  run(manager, release ?? 'main', language)\n}\n",
    })
  })

  it('an extra anchor that no longer occurs is stale, not a silent no-op', () => {
    // F0-45 added the language argument; the old `extra` kept matching nothing
    // and the mutation ran with only half of its change.
    const extra = ['run(manager, release)', "run(manager, release ?? 'main')"]
    expect(applyMutation(source, ' && release !== null', '', extra)).toEqual({
      stale: { anchor: 'run(manager, release)', count: 0 },
    })
  })

  it('an extra anchor that occurs twice is stale', () => {
    expect(applyMutation(source, 'if (ok', 'if (!ok', ['release', 'x'])).toEqual({
      stale: { anchor: 'release', count: 2 },
    })
  })

  it('the extra anchor is counted after the primary replacement', () => {
    // The primary replacement removes one of the two `release !== null`.
    const twice = 'a(release !== null)\nb(release !== null)\n'
    expect(applyMutation(twice, 'a(release !== null)', 'a(true)', ['release !== null', 'true'])).toEqual({
      mutated: 'a(true)\nb(true)\n',
    })
  })

  it('takes the replacement text literally, with no `$` patterns', () => {
    expect(applyMutation('x', 'x', "$&-$'", undefined)).toEqual({ mutated: "$&-$'" })
  })
})
