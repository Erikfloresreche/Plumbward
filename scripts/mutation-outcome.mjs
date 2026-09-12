/**
 * Veredicto de una ejecución de la batería de tests contra una mutación.
 *
 * Existe porque `result.status !== 0` daba "la mutación está cazada" también
 * cuando los tests no llegaban a ejecutarse: `spawnSync` devuelve
 * `status: null` si no puede lanzar el proceso —un `pnpm` que no está en el
 * PATH, un `install` a medias, un runner sin memoria— o si salta el `timeout`,
 * y `null !== 0` es cierto. El resultado era "30 de 30 mutaciones detectadas"
 * y CI en verde con cero tests ejecutados: exactamente lo contrario de lo que
 * este control promete.
 *
 * Vive fuera de `check-mutations.mjs` para poder probarse: aquel script se
 * ejecuta al cargarse y termina en `process.exit`. Tarea F0-27.
 */

/**
 * @typedef {'detectada' | 'sobrevive' | 'no-ejecutada'} Veredicto
 */

/**
 * Clasifica el resultado de `spawnSync`.
 *
 * - `detectada`: los tests corrieron y alguno falló. La pieza está cubierta.
 * - `sobrevive`: los tests corrieron y pasaron todos. La pieza no está cubierta.
 * - `no-ejecutada`: no se sabe nada. No es una detección, y no puede contarse
 *   como tal: cuenta como fallo para que la CI se ponga en rojo.
 *
 * @param {{ status: number | null, error?: Error }} result resultado de `spawnSync`
 * @returns {Veredicto}
 */
export function mutationOutcome(result) {
  if (result.error || result.status === null) return 'no-ejecutada'
  return result.status === 0 ? 'sobrevive' : 'detectada'
}

/** Un veredicto que no sea `detectada` deja la CI en rojo. */
export const esFallo = (veredicto) => veredicto !== 'detectada'

/** Etiqueta de doce caracteres para alinear la salida del script. */
export const etiqueta = (veredicto) =>
  ({ detectada: 'DETECTADA   ', sobrevive: 'SOBREVIVE   ', 'no-ejecutada': 'NO EJECUTADA' })[veredicto]
