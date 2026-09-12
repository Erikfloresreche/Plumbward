/**
 * Aviso de rama tras una operación que puede dejar HEAD donde no estaba.
 *
 * `apply` aísla el trabajo en una rama nueva, y ni la reversión automática de un
 * `apply` fallido ni `rollback` la deshacen: revierten ficheros, no ramas. Decir
 * sólo "el repositorio está intacto" es falso a medias, y quien lo lea seguirá
 * trabajando en la rama aislada creyéndose en la suya.
 *
 * Se separa de `commands.ts` para poder probar el texto sin provocar un EACCES
 * real (misma razón que el punto 4 de F0-15: lógica en línea que nadie cubre).
 */

export interface BranchNoticeInput {
  /** Rama en la que ha quedado el repositorio. `null` con HEAD desacoplado. */
  readonly currentBranch: string | null
  /** Rama desde la que se lanzó `apply`. `null` si ya estaba desacoplado. */
  readonly startedOnBranch: string | null
  /** Nombre de la rama aislada, para reconocerla y avisar de que sobra. */
  readonly isolatedBranch: string
  /**
   * `true` cuando queda un `rollback` pendiente: `apply` falló y la reversión
   * automática **también**, así que el árbol tiene ficheros a medias y el
   * journal sigue vivo.
   *
   * Cambia el consejo entero, no un matiz. Con trabajo a medias, `git checkout`
   * arrastra esos ficheros a la otra rama, y borrar la rama aislada deja el
   * `rollback` imposible para siempre: `assertSameBranch` exige estar en ella y
   * ya no existe.
   */
  readonly pendingRollback: boolean
}

/**
 * Líneas a imprimir, sin color y sin sangrar. Vacío cuando no hay nada que
 * decir: el repositorio ha quedado donde estaba.
 */
export function branchReturnNotice(input: BranchNoticeInput): readonly string[] {
  const { currentBranch, startedOnBranch, isolatedBranch, pendingRollback } = input

  if (currentBranch === startedOnBranch) return []

  const lines = [
    currentBranch === null
      ? 'HEAD ha quedado desacoplado, no en la rama en la que empezaste.'
      : `Sigues en la rama "${currentBranch}", no en la que empezaste.`,
  ]

  if (pendingRollback) {
    lines.push(
      'No vuelvas todavía: quedan ficheros a medias, y un `git checkout` los arrastraría contigo.',
      startedOnBranch === null
        ? 'Ejecuta `plumbward rollback` aquí; cuando termine, vuelve al commit en el que empezaste.'
        : `Ejecuta \`plumbward rollback\` aquí; cuando termine, vuelve con \`git checkout ${startedOnBranch}\`.`,
    )
    if (currentBranch === isolatedBranch) {
      lines.push(
        `No borres "${isolatedBranch}" hasta entonces: \`rollback\` sólo revierte desde la rama en ` +
          'la que se escribió. Como `apply` no commitea, git la borra sin avisar de que aún hacía falta.',
      )
    }
    return lines
  }

  lines.push(
    startedOnBranch === null
      ? 'Empezaste con HEAD desacoplado, así que no hay rama que nombrar: vuelve con `git checkout <commit>`.'
      : `Vuelve a la tuya con \`git checkout ${startedOnBranch}\`.`,
  )

  if (currentBranch === isolatedBranch) {
    lines.push(
      `La rama "${isolatedBranch}" queda creada y sin cambios: bórrala con ` +
        `\`git branch -d ${isolatedBranch}\`, o el próximo \`apply\` se negará a usarla.`,
    )
  }

  return lines
}
