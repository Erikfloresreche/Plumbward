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

/** Lee el journal de la última ejecución, si existe. */
export async function readJournal(repoRoot: string): Promise<Journal | undefined> {
  const raw = await readFileIfExists(resolveInRepo(repoRoot, JOURNAL_FILE))
  if (raw === undefined) return undefined

  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as { version?: unknown }).version !== 1
    ) {
      throw new Error('formato desconocido')
    }
    return parsed as Journal
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new RollbackError(`El journal "${JOURNAL_FILE}" está corrupto: ${detail}`)
  }
}

/**
 * Revierte la última ejecución dejando el árbol de trabajo exactamente como
 * estaba. Verificación esperada: `git status --porcelain` vacío después.
 *
 * El journal se elimina al terminar para que no se pueda revertir dos veces.
 */
export async function rollbackLastApply(repoRoot: string): Promise<RollbackResult> {
  const journal = await readJournal(repoRoot)
  if (!journal) {
    throw new RollbackError(
      'No hay nada que revertir: no se encontró el journal de una ejecución previa.',
    )
  }

  const restoredFiles = await revertEntries(journal.entries, repoRoot)
  await removeFile(resolveInRepo(repoRoot, JOURNAL_FILE))

  return {
    restoredFiles,
    operationsReverted: journal.entries.length,
    journal,
  }
}
