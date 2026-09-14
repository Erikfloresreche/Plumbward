import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { checkQueue, nextTask, parseTasks, QUEUE_END, QUEUE_START } from './execution-queue.mjs'

/**
 * F0-40. Each case builds a minimal plan with the real format: headings
 * `### [ ] F0-1 — ...`, a line `**Branch:** ... · **Depends on:** ...` and the
 * queue between markers.
 */

function task(id, done, dependsOn) {
  return [
    `### [${done ? 'x' : ' '}] ${id} — Task ${id}`,
    `**Branch:** \`fix/f0-task\` · **Depends on:** ${dependsOn}`,
    '',
    'Task text.',
    '',
    '---',
    '',
  ].join('\n')
}

function plan(tasks, queue) {
  return [
    '## PHASE 0 — Foundation',
    '',
    ...tasks,
    '## 5. Execution order and dependencies',
    '',
    QUEUE_START,
    '**Block A**',
    ...queue.map((id) => `- **${id}** — reason`),
    QUEUE_END,
    '',
  ].join('\n')
}

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8')

describe('execution queue of the plan', () => {
  it('accepts a queue that respects dependencies and state', () => {
    const text = plan(
      [task('F0-1', true, 'nothing'), task('F0-2', false, 'F0-1'), task('F0-3', false, 'F0-2')],
      ['F0-2', 'F0-3'],
    )
    expect(checkQueue(text)).toEqual([])
    expect(nextTask(text)).toBe('F0-2')
  })

  it('rejects a pending task that is not in the queue', () => {
    const text = plan([task('F0-1', false, 'nothing'), task('F0-2', false, 'nothing')], ['F0-1'])
    expect(checkQueue(text)).toEqual([expect.stringMatching(/F0-2 is pending and not in the queue/)])
  })

  it('rejects a completed task that is still in the queue', () => {
    const text = plan([task('F0-1', true, 'nothing'), task('F0-2', false, 'nothing')], ['F0-1', 'F0-2'])
    expect(checkQueue(text)).toEqual([expect.stringMatching(/F0-1 is completed/)])
  })

  it('rejects a task before its pending dependency', () => {
    const text = plan([task('F0-1', false, 'nothing'), task('F0-2', false, 'F0-1')], ['F0-2', 'F0-1'])
    expect(checkQueue(text)).toEqual([expect.stringMatching(/F0-2 is in the queue before F0-1/)])
  })

  it('reads every dependency of the line, not only the first one', () => {
    const text = plan(
      [task('F0-1', false, 'nothing'), task('F0-2', false, 'nothing'), task('F0-3', false, 'F0-1, F0-2')],
      ['F0-1', 'F0-3', 'F0-2'],
    )
    expect(checkQueue(text)).toEqual([expect.stringMatching(/F0-3 is in the queue before F0-2/)])
  })

  it('does not take as a dependency what the line declares it blocks', () => {
    const blocking = [
      '### [ ] F0-1 — Base',
      '**Branch:** `chore/f0-base` · **Depends on:** nothing · **Blocks:** F0-2',
      '',
    ].join('\n')
    const text = plan([blocking, task('F0-2', false, 'F0-1')], ['F0-1', 'F0-2'])
    expect(parseTasks(text)[0]?.dependsOnTasks).toEqual([])
    expect(checkQueue(text)).toEqual([])
  })

  it('requires the whole phase before a task that depends on "Phase N complete"', () => {
    const text = plan(
      [task('F0-1', false, 'nothing'), task('F0-2', false, 'nothing'), task('F1-1', false, 'Phase 0 complete')],
      ['F0-1', 'F1-1', 'F0-2'],
    )
    expect(checkQueue(text)).toEqual([
      expect.stringMatching(/F1-1 is in the queue before F0-2, which it depends on \(Phase 0 complete\)/),
    ])
  })

  it('fails when a task has no dependency line it recognises, instead of reading no dependencies', () => {
    // F0-42. Translating the plan changed the marker. A parser still looking for
    // the old one read every task as dependency-free, and a broken order passed.
    const oldFormat = ['### [ ] F0-2 — Old format', '**Rama:** `fix/f0-task` · **Depende de:** F0-1', ''].join('\n')
    const text = plan([task('F0-1', false, 'nothing'), oldFormat], ['F0-2', 'F0-1'])
    expect(checkQueue(text)).toEqual([expect.stringMatching(/F0-2 has no `\*\*Depends on:\*\*` line/)])
  })

  it('rejects identifiers that do not exist and duplicates', () => {
    const text = plan([task('F0-1', false, 'nothing')], ['F0-1', 'F0-9', 'F0-1'])
    const failures = checkQueue(text)
    expect(failures).toContainEqual(expect.stringMatching(/F0-9 is in the queue and does not exist/))
    expect(failures).toContainEqual(expect.stringMatching(/F0-1 appears more than once/))
  })

  it('rejects a dependency that does not exist in the plan', () => {
    const text = plan([task('F0-1', false, 'F0-7')], ['F0-1'])
    expect(checkQueue(text)).toEqual([expect.stringMatching(/F0-1 depends on F0-7, which does not exist/)])
  })

  it('fails if the markers are missing or the plan has no tasks', () => {
    expect(checkQueue(task('F0-1', false, 'nothing'))).toEqual([expect.stringMatching(/has no execution queue/)])
    expect(checkQueue('## Empty plan\n')).toEqual([expect.stringMatching(/declares no/)])
  })

  it('does not recognise the Spanish queue markers the plan used before F0-42', () => {
    const text = plan([task('F0-1', false, 'nothing')], ['F0-1'])
      .replace(QUEUE_START, '<!-- cola:inicio -->')
      .replace(QUEUE_END, '<!-- cola:fin -->')
    expect(checkQueue(text)).toEqual([expect.stringMatching(/has no execution queue/)])
  })

  it('the queue of the real plan describes the plan', () => {
    expect(checkQueue(read('../docs/EXECUTION_PLAN.md'))).toEqual([])
  })
})
