import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
  BRANCH_FORMAT,
  branchExemption,
  branchProblem,
  checkPlan,
  checkPullRequestBranch,
  parsePlan,
  spanishEvidence,
} from './branch-names.mjs'

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8')
const corpus = JSON.parse(read('./branch-names-corpus.json'))

describe('formato del nombre de rama', () => {
  it('acepta las fases reales', () => {
    expect(BRANCH_FORMAT.test('fix/f0-branch-control-review')).toBe(true)
    expect(BRANCH_FORMAT.test('feat/f6-launch')).toBe(true)
    expect(BRANCH_FORMAT.test('refactor/f10-something')).toBe(true)
  })

  it('rechaza fases con ceros a la izquierda o de tres cifras', () => {
    expect(branchProblem('feat/f00-launch')).toMatch(/formato/)
    expect(branchProblem('feat/f999-launch')).toMatch(/formato/)
  })

  it('rechaza tipos, mayúsculas y separadores fuera de convención', () => {
    expect(branchProblem('feature/f0-launch')).toMatch(/formato/)
    expect(branchProblem('feat/f0-Launch')).toMatch(/formato/)
    expect(branchProblem('feat/f0--launch')).toMatch(/formato/)
    expect(branchProblem('feat/f0-launch-')).toMatch(/formato/)
    expect(branchProblem('f0-launch')).toMatch(/formato/)
  })

  it('rechaza caracteres no ASCII antes que el formato', () => {
    expect(branchProblem('feat/f0-versión')).toBe('contiene caracteres no ASCII')
  })
})

describe('heurística de idioma sobre el corpus', () => {
  // El corpus son los 33 nombres que la PR #6 renombró y sus sustitutos. La
  // heurística anterior dejaba pasar 15 de los 33 y rechazaba dos nombres
  // ingleses válidos; por eso el corpus está en el repositorio y no en el test.
  it.each(corpus.spanish)('rechaza el nombre español %s', (name) => {
    expect(branchProblem(name)).toMatch(/español/)
  })

  it.each(corpus.english)('acepta el nombre inglés %s', (name) => {
    expect(branchProblem(name)).toBeUndefined()
  })

  // Límite conocido y medido, no un descuido: cada componente es también una
  // palabra inglesa. Si algún día se detecta, este test avisa para moverlo.
  it.each(corpus.spanishNotDetected)('no detecta %s, y así está declarado', (name) => {
    expect(branchProblem(name)).toBeUndefined()
  })

  it('las palabras funcionales sólo cuentan entre otros dos componentes', () => {
    expect(spanishEvidence('de-duplicate')).toEqual([])
    expect(spanishEvidence('y-axis')).toEqual([])
    expect(spanishEvidence('parte-de-algo')).toContain('de')
  })

  it('las terminaciones no chocan con palabras inglesas cortas', () => {
    expect(spanishEvidence('dad-mode')).toEqual([])
    expect(spanishEvidence('instalacion')).toContain('instalacion')
  })
})

describe('exenciones', () => {
  it('deja pasar una release de develop a Prod', () => {
    expect(checkPullRequestBranch('develop', 'Erikfloresreche')).toBeUndefined()
    expect(checkPullRequestBranch('Prod', 'Erikfloresreche')).toBeUndefined()
  })

  it('exime a los bots por autor, no por prefijo del nombre', () => {
    expect(checkPullRequestBranch('dependabot/npm_and_yarn/vitest-2', 'dependabot[bot]')).toBeUndefined()
    // La puerta trasera anterior: el prefijo lo escribía quien abría la PR.
    expect(checkPullRequestBranch('dependabot/../fix/f0-ramas', 'someone')).toMatch(/formato/)
  })

  it('exime al editor web sólo cuando el login del nombre es el del autor', () => {
    expect(checkPullRequestBranch('octocat-patch-1', 'octocat')).toBeUndefined()
    expect(checkPullRequestBranch('octocat-patch-1', 'mallory')).toMatch(/formato/)
  })

  it('exime al botón Revert sólo si la rama revertida era válida', () => {
    expect(checkPullRequestBranch('revert-42-fix/f0-protected-branches', 'octocat')).toBeUndefined()
    expect(checkPullRequestBranch('revert-42-develop', 'octocat')).toBeUndefined()
    expect(checkPullRequestBranch('revert-42-lo-que-sea', 'octocat')).toMatch(/formato/)
  })

  it('no exime sin autor conocido', () => {
    expect(branchExemption('octocat-patch-1', undefined)).toBeUndefined()
  })

  it('no comprueba nada si no hay rama de PR', () => {
    expect(checkPullRequestBranch(undefined, 'octocat')).toBeUndefined()
  })
})

describe('analizador del plan', () => {
  const plan = [
    '# Plan',
    '',
    '### [ ] F0-1 — Pendiente',
    '**Rama:** `fix/f0-pending-task`',
    '',
    '### [X] F0-2 — Cerrada con equis mayúscula',
    '**Rama:** `fix/f0-ramas-cerradas`',
    '',
    '## Otra cabecera que no es una tarea',
    '**Rama:** `fix/f0-ramas-huerfanas`',
    '',
  ].join('\n')

  it('reconoce [ ], [x] y [X] y cuenta las tareas', () => {
    const { tasks, declarations, branches } = parsePlan(plan)
    expect(tasks).toBe(2)
    expect(declarations).toBe(3)
    expect(branches.map((b) => b.pending)).toEqual([true, false, false])
  })

  it('cuenta como declarada la tarea que dice no tener rama de código', () => {
    const { tasks, declarations, branches } = parsePlan(
      '### [ ] F0-1 — Sin rama\n**Rama:** configuración de GitHub, sin rama de código\n',
    )
    expect({ tasks, declarations, branches }).toEqual({ tasks: 1, declarations: 1, branches: [] })
  })

  it('una cabecera que no es tarea cierra la anterior', () => {
    // La rama bajo "## Otra cabecera" está en español, pero no cuelga de una
    // tarea pendiente: antes el estado sobrevivía y la atribuía a la anterior.
    expect(checkPlan(plan)).toEqual([])
  })

  it('sólo juzga las ramas de las tareas pendientes', () => {
    const conFallo = plan.replace('fix/f0-pending-task', 'fix/f0-ramas-protegidas')
    expect(checkPlan(conFallo)).toEqual([
      expect.stringContaining('"fix/f0-ramas-protegidas" parece estar en español'),
    ])
  })

  it('falla ante un plan sin tareas en lugar de pasar en silencio', () => {
    expect(checkPlan('')).toEqual([expect.stringContaining('no declara ninguna tarea')])
    expect(checkPlan('### F0-1 — Sin casilla\n')).toEqual([
      expect.stringContaining('no declara ninguna tarea'),
    ])
  })

  it('falla si alguna tarea no declara su rama', () => {
    const sinRama = '### [ ] F0-1 — Con rama\n**Rama:** `fix/f0-one`\n\n### [ ] F0-2 — Sin rama\n'
    expect(checkPlan(sinRama)).toEqual([expect.stringContaining('2 tareas y sólo 1')])
  })

  it('falla si la línea de rama no sigue un formato que el analizador reconoce', () => {
    // El fallo que motivó la aserción: el analizador se saltaba la línea y el
    // control pasaba como si la tarea no tuviera rama que juzgar.
    const otraForma = '### [ ] F0-1 — Tarea\n*Rama*: `fix/f0-ramas-protegidas`\n'
    expect(checkPlan(otraForma)).toEqual([expect.stringContaining('1 tareas y sólo 0')])
  })

  it('tolera espaciado distinto en la línea de rama', () => {
    const { branches } = parsePlan('### [ ] T\n  **Rama:**   `fix/f0-spaced`\n')
    expect(branches).toEqual([{ name: 'fix/f0-spaced', pending: true }])
  })

  it('el plan real del repositorio pasa el control', () => {
    expect(checkPlan(read('../docs/PLAN_DE_EJECUCION.md'))).toEqual([])
  })
})
