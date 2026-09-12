import type { Journal } from './types.js'
import { JOURNAL_FILE } from './types.js'
import { readFileIfExists, removeFile, resolveInRepo } from './fs.js'
import { revertEntries } from './apply.js'

export interface RollbackResult {
  readonly restoredFiles: number
  readonly operationsReverted: number
  readonly journal: Journal
}

/** Error específico de rollback, para distinguirlo de fallos de apply. */
export class RollbackError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RollbackError'
  }
}

/**
 * Journal escrito por una versión anterior, que guardaba la rama de partida en
 * lugar de la rama escrita. No se puede saber dónde se aplicó, así que no se
 * revierte: restaurar a ciegas es justamente la pérdida de datos que se corrigió.
 */
export class OutdatedJournalError extends RollbackError {
  constructor() {
    super(
      `El journal "${JOURNAL_FILE}" lo escribió una versión anterior que no anotaba la rama en la que se aplicó.\n` +
        '  No se revierte nada: restaurarlo en la rama equivocada sobrescribiría trabajo.\n' +
        `  Deshaz los cambios con git (\`git diff\`, \`git checkout -- .\`) y borra ${JOURNAL_FILE}.`,
    )
    this.name = 'OutdatedJournalError'
  }
}

/** Lee el journal de la última ejecución, si existe. */
export async function readJournal(repoRoot: string): Promise<Journal | undefined> {
  const raw = await readFileIfExists(resolveInRepo(repoRoot, JOURNAL_FILE))
  if (raw === undefined) return undefined

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('formato desconocido')
    }
    const version = (parsed as { version?: unknown }).version
    if (version === 1) {
      throw new OutdatedJournalError()
    }
    if (version !== 2) {
      throw new Error('formato desconocido')
    }
    return parsed as Journal
  } catch (error) {
    if (error instanceof RollbackError) throw error
    const detail = error instanceof Error ? error.message : String(error)
    throw new RollbackError(`El journal "${JOURNAL_FILE}" está corrupto: ${detail}`)
  }
}

/**
 * Comprueba que se está revirtiendo donde se escribió. Ante la duda, se niega:
 * el coste de negarse es volver a la rama correcta; el de equivocarse, trabajo
 * perdido (misma dirección que la ADR 0005).
 */
function assertSameBranch(journal: Journal, currentBranch: string | null): void {
  if (journal.writtenOnBranch === null) {
    throw new RollbackError(
      'El `apply` se hizo con HEAD desacoplado, así que el journal no puede nombrar dónde escribió.\n' +
        '  No se revierte nada: no hay forma de comprobar que sigues en el mismo sitio.\n' +
        '  Deshaz los cambios con git (`git diff`, `git checkout -- .`).',
    )
  }

  if (currentBranch === journal.writtenOnBranch) return

  const where =
    currentBranch === null ? 'HEAD está desacoplado' : `estás en la rama "${currentBranch}"`
  throw new RollbackError(
    `El último \`apply\` escribió en la rama "${journal.writtenOnBranch}", pero ${where}.\n` +
      '  No se revierte nada: los ficheros guardados son los de esa rama, y restaurarlos aquí\n' +
      '  sobrescribiría lo que tengas en esta.\n' +
      `  Vuelve con \`git checkout ${journal.writtenOnBranch}\` y ejecuta \`plumbward rollback\` allí.`,
  )
}

export interface RollbackOptions {
  /**
   * Rama actual del repositorio, que lee la CLI. `null` con HEAD desacoplado.
   * El núcleo no habla con git: quien llama le dice dónde está.
   */
  readonly currentBranch: string | null
}

/**
 * Revierte la última ejecución dejando el árbol de trabajo exactamente como
 * estaba. Verificación esperada: `git status --porcelain` vacío después.
 *
 * **Sólo en la rama en la que `apply` escribió.** Los snapshots del journal son
 * fotos de los ficheros de esa rama; escribirlos en otra no revierte nada, borra
 * lo que esa otra rama tuviera. Si no coincide, no se toca nada y el journal se
 * conserva, para poder revertir después desde el sitio correcto.
 *
 * El journal se elimina al revertir para que no se pueda revertir dos veces.
 */
export async function rollbackLastApply(
  repoRoot: string,
  options: RollbackOptions,
): Promise<RollbackResult> {
  const journal = await readJournal(repoRoot)
  if (!journal) {
    throw new RollbackError(
      'No hay nada que revertir: no se encontró el journal de una ejecución previa.',
    )
  }

  assertSameBranch(journal, options.currentBranch)

  const restoredFiles = await revertEntries(journal.entries, repoRoot)
  await removeFile(resolveInRepo(repoRoot, JOURNAL_FILE))

  return {
    restoredFiles,
    operationsReverted: journal.entries.length,
    journal,
  }
}
