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
 * Journal escrito por una versión anterior, que no identifica el sitio en el
 * que se aplicó: la v1 guardaba la rama de partida en lugar de la escrita, y la
 * v2 guardaba el nombre de la rama pero no el commit. No se puede comprobar que
 * se sigue en el mismo sitio, así que no se revierte: restaurar a ciegas es
 * justamente la pérdida de datos que se corrigió.
 */
export class OutdatedJournalError extends RollbackError {
  constructor() {
    super(
      `El journal "${JOURNAL_FILE}" lo escribió una versión anterior que no anota el sitio (rama y commit) en el que se aplicó.\n` +
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
    if (version === 1 || version === 2) {
      throw new OutdatedJournalError()
    }
    if (version !== 3) {
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
 * Comprueba que se está revirtiendo donde se escribió: misma rama **y** mismo
 * commit. Ante la duda, se niega: el coste de negarse es volver al sitio
 * correcto; el de equivocarse, trabajo perdido (misma dirección que la ADR 0005).
 *
 * El nombre solo no basta. Una rama borrada y recreada sobre otro commit lleva
 * el mismo nombre y tiene otro contenido, y un commit hecho en la rama aislada
 * después del `apply` deja los snapshots viejos. En los dos casos restaurar
 * escribe encima de trabajo que no estaba cuando se fotografió el árbol.
 */
function assertSameSite(journal: Journal, current: RollbackOptions): void {
  assertSameBranch(journal, current.currentBranch)
  assertSameCommit(journal, current.currentCommit)
}

/** Cómo nombran los mensajes el sitio del journal: su rama, o ninguna. */
function writtenWhere(journal: Journal): string {
  return journal.writtenOnBranch === null
    ? 'con HEAD desacoplado'
    : `en la rama "${journal.writtenOnBranch}"`
}

/**
 * La etiqueta del sitio: en qué rama se escribió, o `null` con HEAD desacoplado.
 *
 * `null` se compara como cualquier otro nombre (F0-29): un journal escrito con
 * HEAD desacoplado se revierte con HEAD desacoplado, y `assertSameCommit` exige
 * además el mismo commit, que es lo que identifica el sitio desde F0-30.
 * Negarse siempre, como hacía F0-24, dejaba ese journal irreversible sin
 * proteger nada que el commit no proteja ya.
 *
 * Desde una rama que apunta al mismo commit también se niega. El árbol de
 * partida es el mismo, pero la etiqueta no coincide, y en el caso simétrico
 * —journal con rama, HEAD ahora desacoplado— ya se negaba: ante la duda, volver
 * es un `git checkout --detach`, y equivocarse es trabajo perdido.
 *
 * Sin rama y sin commit no queda nada que comparar. `apply` no escribe ese
 * journal —un HEAD desacoplado siempre apunta a un commit—, pero uno editado a
 * mano sí puede traerlo, y ahí se niega.
 */
function assertSameBranch(journal: Journal, currentBranch: string | null): void {
  if (journal.writtenOnBranch === null && journal.writtenOnCommit === null) {
    throw new RollbackError(
      'El journal no anota ni la rama ni el commit en los que se escribió.\n' +
        '  No se revierte nada: no hay forma de comprobar que sigues en el mismo sitio.\n' +
        '  Deshaz los cambios con git (`git diff`, `git checkout -- .`).',
    )
  }

  if (currentBranch === journal.writtenOnBranch) return

  const where =
    currentBranch === null ? 'HEAD está desacoplado' : `estás en la rama "${currentBranch}"`
  const back =
    journal.writtenOnBranch === null
      ? `git checkout --detach ${journal.writtenOnCommit}`
      : `git checkout ${journal.writtenOnBranch}`
  throw new RollbackError(
    `El último \`apply\` escribió ${writtenWhere(journal)}, pero ${where}.\n` +
      '  No se revierte nada: los ficheros guardados son los de aquel sitio, y restaurarlos aquí\n' +
      '  sobrescribiría lo que tengas en este.\n' +
      `  Vuelve con \`${back}\` y ejecuta \`plumbward rollback\` allí.`,
  )
}

/**
 * Misma etiqueta, otro commit: la rama se borró y se recreó, o se ha commiteado
 * después del `apply` (también sobre un HEAD desacoplado). Los snapshots son
 * del árbol de aquel commit.
 *
 * Dos `null` sí coinciden: un repositorio sin ningún commit sigue sin tenerlo,
 * y no hay historia que se haya podido rehacer por debajo.
 */
function assertSameCommit(journal: Journal, currentCommit: string | null): void {
  if (currentCommit === journal.writtenOnCommit) return

  const where = currentCommit === null ? 'ahora no tiene ninguno' : `ahora apunta a ${currentCommit}`
  const cause =
    journal.writtenOnBranch === null
      ? '  HEAD sigue desacoplado y no es el mismo sitio: se ha commiteado o cambiado de commit\n' +
        '  después del `apply`.'
      : '  La rama lleva el mismo nombre y no es el mismo sitio: se ha borrado y recreado, o se ha\n' +
        '  commiteado después del `apply`.'
  throw new RollbackError(
    `El último \`apply\` escribió ${writtenWhere(journal)} sobre el commit ` +
      `${journal.writtenOnCommit ?? '(ninguno)'}, pero ${where}.\n` +
      `${cause} No se revierte nada: los ficheros guardados son los de\n` +
      '  aquel commit, y restaurarlos aquí sobrescribiría lo que haya llegado después.\n' +
      '  Deshaz los cambios con git (`git diff`, `git checkout -- .`).',
  )
}

export interface RollbackOptions {
  /**
   * Rama actual del repositorio, que lee la CLI. `null` con HEAD desacoplado.
   * El núcleo no habla con git: quien llama le dice dónde está.
   */
  readonly currentBranch: string | null
  /**
   * Commit al que apunta HEAD ahora, de la misma lectura que `currentBranch`.
   * `null` en un repositorio sin ningún commit.
   */
  readonly currentCommit: string | null
}

/**
 * Revierte la última ejecución dejando el árbol de trabajo exactamente como
 * estaba. Verificación esperada: `git status --porcelain` vacío después.
 *
 * **Sólo en el sitio en el que `apply` escribió:** misma rama —o HEAD desacoplado
 * en los dos casos— y mismo commit.
 * Los snapshots del journal son fotos de los ficheros de ese árbol; escribirlos
 * en otro no revierte nada, borra lo que ese otro tuviera. Si no coincide, no se
 * toca nada y el journal se conserva, para poder revertir después desde el sitio
 * correcto.
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

  assertSameSite(journal, options)

  const restoredFiles = await revertEntries(journal.entries, repoRoot)
  await removeFile(resolveInRepo(repoRoot, JOURNAL_FILE))

  return {
    restoredFiles,
    operationsReverted: journal.entries.length,
    journal,
  }
}
