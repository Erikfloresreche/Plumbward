import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { checkQueue, nextTask, parseTasks, QUEUE_END, QUEUE_START } from './execution-queue.mjs'

/**
 * F0-40. Cada caso construye un plan mínimo con el formato real: cabeceras
 * `### [ ] F0-1 — ...`, línea `**Rama:** ... · **Depende de:** ...` y la cola
 * entre marcadores.
 */

function task(id, done, dependsOn) {
  return [
    `### [${done ? 'x' : ' '}] ${id} — Tarea ${id}`,
    `**Rama:** \`fix/f0-task\` · **Depende de:** ${dependsOn}`,
    '',
    'Texto de la tarea.',
    '',
    '---',
    '',
  ].join('\n')
}

function plan(tasks, queue) {
  return [
    '## FASE 0 — Fundación',
    '',
    ...tasks,
    '## 5. Orden de ejecución y dependencias',
    '',
    QUEUE_START,
    '**Bloque A**',
    ...queue.map((id) => `- **${id}** — motivo`),
    QUEUE_END,
    '',
  ].join('\n')
}

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8')

describe('cola de ejecución del plan', () => {
  it('acepta una cola que respeta dependencias y estado', () => {
    const text = plan(
      [task('F0-1', true, 'nada'), task('F0-2', false, 'F0-1'), task('F0-3', false, 'F0-2')],
      ['F0-2', 'F0-3'],
    )
    expect(checkQueue(text)).toEqual([])
    expect(nextTask(text)).toBe('F0-2')
  })

  it('rechaza una tarea pendiente que no está en la cola', () => {
    const text = plan([task('F0-1', false, 'nada'), task('F0-2', false, 'nada')], ['F0-1'])
    expect(checkQueue(text)).toEqual([expect.stringMatching(/F0-2 está pendiente y no está en la cola/)])
  })

  it('rechaza una tarea completada que sigue en la cola', () => {
    const text = plan([task('F0-1', true, 'nada'), task('F0-2', false, 'nada')], ['F0-1', 'F0-2'])
    expect(checkQueue(text)).toEqual([expect.stringMatching(/F0-1 está completada/)])
  })

  it('rechaza una tarea antes que su dependencia pendiente', () => {
    const text = plan([task('F0-1', false, 'nada'), task('F0-2', false, 'F0-1')], ['F0-2', 'F0-1'])
    expect(checkQueue(text)).toEqual([expect.stringMatching(/F0-2 está en la cola antes que F0-1/)])
  })

  it('lee todas las dependencias de la línea, no sólo la primera', () => {
    const text = plan(
      [task('F0-1', false, 'nada'), task('F0-2', false, 'nada'), task('F0-3', false, 'F0-1, F0-2')],
      ['F0-1', 'F0-3', 'F0-2'],
    )
    expect(checkQueue(text)).toEqual([expect.stringMatching(/F0-3 está en la cola antes que F0-2/)])
  })

  it('no toma como dependencia lo que la línea declara que bloquea', () => {
    const blocking = [
      '### [ ] F0-1 — Base',
      '**Rama:** `chore/f0-base` · **Depende de:** nada · **Bloquea:** F0-2',
      '',
    ].join('\n')
    const text = plan([blocking, task('F0-2', false, 'F0-1')], ['F0-1', 'F0-2'])
    expect(parseTasks(text)[0]?.dependsOnTasks).toEqual([])
    expect(checkQueue(text)).toEqual([])
  })

  it('exige la fase entera antes de una tarea que depende de "Fase N completa"', () => {
    const text = plan(
      [task('F0-1', false, 'nada'), task('F0-2', false, 'nada'), task('F1-1', false, 'Fase 0 completa')],
      ['F0-1', 'F1-1', 'F0-2'],
    )
    expect(checkQueue(text)).toEqual([
      expect.stringMatching(/F1-1 está en la cola antes que F0-2, de la que depende \(Fase 0 completa\)/),
    ])
  })

  it('rechaza identificadores que no existen y duplicados', () => {
    const text = plan([task('F0-1', false, 'nada')], ['F0-1', 'F0-9', 'F0-1'])
    const failures = checkQueue(text)
    expect(failures).toContainEqual(expect.stringMatching(/F0-9 está en la cola y no existe/))
    expect(failures).toContainEqual(expect.stringMatching(/F0-1 aparece más de una vez/))
  })

  it('rechaza una dependencia que no existe en el plan', () => {
    const text = plan([task('F0-1', false, 'F0-7')], ['F0-1'])
    expect(checkQueue(text)).toEqual([expect.stringMatching(/F0-1 depende de F0-7, que no existe/)])
  })

  it('falla si faltan los marcadores o el plan no tiene tareas', () => {
    expect(checkQueue(task('F0-1', false, 'nada'))).toEqual([expect.stringMatching(/no tiene cola/)])
    expect(checkQueue('## Plan vacío\n')).toEqual([expect.stringMatching(/ninguna tarea/)])
  })

  it('la cola del plan real describe el plan', () => {
    expect(checkQueue(read('../docs/PLAN_DE_EJECUCION.md'))).toEqual([])
  })
})
