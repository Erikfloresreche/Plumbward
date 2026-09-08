/**
 * Bloques gestionados: el mecanismo que permite `governance upgrade` sin
 * destruir el trabajo del cliente.
 *
 * Todo lo que la herramienta inyecta dentro de un fichero ajeno queda entre
 * marcadores. Al actualizar sólo se reescribe lo que hay entre marcadores; una
 * sola línea fuera de ellos jamás se toca.
 */

export type CommentStyle = 'hash' | 'slash' | 'html' | 'semicolon'

export const BEGIN_TOKEN = 'governance:begin'
export const END_TOKEN = 'governance:end'

interface Delimiters {
  readonly prefix: string
  readonly suffix: string
}

const DELIMITERS: Record<CommentStyle, Delimiters> = {
  hash: { prefix: '#', suffix: '' },
  slash: { prefix: '//', suffix: '' },
  semicolon: { prefix: ';', suffix: '' },
  html: { prefix: '<!--', suffix: ' -->' },
}

/** Envuelve un texto como comentario en el estilo del fichero destino. */
export function commentLine(style: CommentStyle, text: string): string {
  const { prefix, suffix } = DELIMITERS[style]
  return `${prefix} ${text}${suffix}`
}

function beginMarker(style: CommentStyle, blockId: string): string {
  return commentLine(style, `>>> ${BEGIN_TOKEN} ${blockId}`)
}

function endMarker(style: CommentStyle, blockId: string): string {
  return commentLine(style, `<<< ${END_TOKEN} ${blockId}`)
}

export interface EnsureBlockResult {
  readonly text: string
  readonly changed: boolean
  /** `true` si el bloque ya existía y sólo se ha actualizado su contenido. */
  readonly replaced: boolean
}

/**
 * Inserta el bloque si no existe, o reemplaza su contenido si ya está presente.
 *
 * Es idempotente: si el contenido coincide con el que ya hay, no toca el fichero.
 */
export function ensureBlock(
  original: string,
  blockId: string,
  content: string,
  style: CommentStyle,
): EnsureBlockResult {
  const begin = beginMarker(style, blockId)
  const end = endMarker(style, blockId)
  const warning = commentLine(
    style,
    'Bloque gestionado automáticamente. No edites dentro de los marcadores:',
  )
  const warning2 = commentLine(style, '`governance upgrade` regenerará su contenido.')

  const body = [begin, warning, warning2, content.trimEnd(), end].join('\n')

  const beginIndex = original.indexOf(begin)
  const endIndex = original.indexOf(end)

  if (beginIndex !== -1 && endIndex !== -1 && endIndex > beginIndex) {
    const before = original.slice(0, beginIndex)
    const after = original.slice(endIndex + end.length)
    const next = `${before}${body}${after}`
    return { text: next, changed: next !== original, replaced: true }
  }

  const separator = original.length === 0 ? '' : original.endsWith('\n') ? '\n' : '\n\n'
  const next = `${original}${separator}${body}\n`
  return { text: next, changed: true, replaced: false }
}

/** Extrae el contenido actual de un bloque gestionado, si existe. */
export function readBlock(
  original: string,
  blockId: string,
  style: CommentStyle,
): string | undefined {
  const begin = beginMarker(style, blockId)
  const end = endMarker(style, blockId)
  const beginIndex = original.indexOf(begin)
  const endIndex = original.indexOf(end)
  if (beginIndex === -1 || endIndex === -1 || endIndex <= beginIndex) return undefined
  return original.slice(beginIndex + begin.length, endIndex).trim()
}

/**
 * Cabecera de fichero completamente gestionado. El hash permite que `upgrade`
 * detecte si el cliente editó el fichero a mano y, en ese caso, no pisarlo.
 */
export function managedHeader(
  style: CommentStyle,
  version: string,
  contentHash: string,
): string {
  return [
    commentLine(style, `governance:managed v=${version} hash=${contentHash}`),
    commentLine(style, 'Fichero generado por la CLI de gobernanza.'),
    commentLine(style, 'Si lo editas a mano, `governance upgrade` dejará de actualizarlo'),
    commentLine(style, 'y te avisará del conflicto en lugar de sobrescribir tus cambios.'),
  ].join('\n')
}

/** Lee la cabecera gestionada de un fichero, si la tiene. */
export function parseManagedHeader(
  text: string,
): { version: string; hash: string } | undefined {
  const match = /governance:managed v=([^\s]+) hash=([0-9a-f]+)/.exec(text)
  if (!match?.[1] || !match[2]) return undefined
  return { version: match[1], hash: match[2] }
}
