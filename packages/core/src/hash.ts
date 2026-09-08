import { createHash } from 'node:crypto'

/** Hash corto y estable de un contenido, usado en las cabeceras gestionadas. */
export function shortHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 12)
}

/** Hash completo, usado en la baseline del ratchet. */
export function fullHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}
