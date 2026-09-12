import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rollbackLastApply, OutdatedJournalError, RollbackError } from './rollback.js'
import { JOURNAL_FILE } from './types.js'

/**
 * Punto 1 de F0-24, a nivel de núcleo: cuándo se niega `rollbackLastApply`.
 *
 * Los casos de punta a punta con git real están en
 * `packages/cli/test/rollback-branch.test.ts`. Aquí se fija la decisión sola,
 * sin git, incluyendo las dos negativas que no se pueden provocar desde la CLI
 * sin montar un HEAD desacoplado o un journal antiguo.
 *
 * Todos comprueban además que **no se ha escrito** y que el journal sigue ahí:
 * negarse y dejar el repositorio a medias sería el mismo fallo con otra cara.
 */

const created: string[] = []

/** Repositorio de mentira con un fichero y un journal que lo restauraría. */
async function createRepoWithJournal(journal: unknown): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'plumbward-rollback-core-'))
  created.push(root)
  await writeFile(join(root, 'README.md'), 'contenido actual\n')
  await mkdir(join(root, '.governance'), { recursive: true })
  await writeFile(join(root, JOURNAL_FILE), JSON.stringify(journal, null, 2))
  return root
}

/** Journal que, si se aplicase, devolvería `README.md` a su versión anterior. */
function journalWritingReadme(writtenOnBranch: string | null, version = 2): unknown {
  return {
    version,
    startedAt: '2026-09-12T00:00:00.000Z',
    repoRoot: '/irrelevante',
    writtenOnBranch,
    entries: [
      {
        index: 0,
        operation: {
          kind: 'createFile',
          path: 'README.md',
          content: 'lo que escribió apply\n',
          managed: true,
          reason: 'prueba',
        },
        snapshots: [
          {
            path: 'README.md',
            existed: true,
            contentBase64: Buffer.from('contenido anterior\n').toString('base64'),
          },
        ],
        appliedAt: '2026-09-12T00:00:00.000Z',
        status: 'applied',
      },
    ],
  }
}

async function readme(root: string): Promise<string> {
  return readFile(join(root, 'README.md'), 'utf8')
}

async function journalExists(root: string): Promise<boolean> {
  return readFile(join(root, JOURNAL_FILE), 'utf8').then(
    () => true,
    () => false,
  )
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('rollbackLastApply: en qué rama se permite revertir', () => {
  it('revierte en la rama en la que apply escribió', async () => {
    const root = await createRepoWithJournal(journalWritingReadme('chore/setup-ai-governance'))

    const result = await rollbackLastApply(root, { currentBranch: 'chore/setup-ai-governance' })

    expect(result.restoredFiles).toBe(1)
    expect(await readme(root)).toBe('contenido anterior\n')
    expect(await journalExists(root)).toBe(false)
  })

  it('se niega en otra rama, sin escribir y conservando el journal', async () => {
    const root = await createRepoWithJournal(journalWritingReadme('chore/setup-ai-governance'))

    await expect(rollbackLastApply(root, { currentBranch: 'Prod' })).rejects.toThrow(RollbackError)

    expect(await readme(root)).toBe('contenido actual\n')
    expect(await journalExists(root)).toBe(true)
  })

  it('el mensaje dice en qué rama se escribió y cómo volver', async () => {
    const root = await createRepoWithJournal(journalWritingReadme('chore/setup-ai-governance'))

    await expect(rollbackLastApply(root, { currentBranch: 'Prod' })).rejects.toThrow(
      /"chore\/setup-ai-governance"[\s\S]*"Prod"[\s\S]*git checkout chore\/setup-ai-governance/,
    )
  })

  it('se niega con HEAD desacoplado aunque el journal también lo estuviera', async () => {
    const root = await createRepoWithJournal(journalWritingReadme(null))

    await expect(rollbackLastApply(root, { currentBranch: null })).rejects.toThrow(RollbackError)

    expect(await readme(root)).toBe('contenido actual\n')
    expect(await journalExists(root)).toBe(true)
  })

  it('se niega si el journal lo escribió una versión que no anotaba la rama', async () => {
    const root = await createRepoWithJournal({
      ...(journalWritingReadme(null, 1) as Record<string, unknown>),
      writtenOnBranch: undefined,
      branch: 'Prod',
    })

    await expect(rollbackLastApply(root, { currentBranch: 'Prod' })).rejects.toThrow(
      OutdatedJournalError,
    )

    expect(await readme(root)).toBe('contenido actual\n')
    expect(await journalExists(root)).toBe(true)
  })
})
