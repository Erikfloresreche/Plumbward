import type { Profile } from '@plumbward/packs-sdk'
import type { RepoScan } from '@plumbward/scanner'

/**
 * Sección de límites operativos.
 *
 * Es la única parte de las reglas que no habla de cómo escribir código sino de
 * qué NO debe ejecutar el asistente. Se genera aparte porque el equipo puede
 * desactivarla desde el perfil, y porque es la sección que más se consulta.
 */
function boundariesSection(profile: Profile): string {
  const { git, database, commitLanguage } = profile.agentBoundaries
  const commitLanguageName = commitLanguage === 'en' ? 'inglés' : 'español'

  const gitBlock = git
    ? `### Comandos de git que modifican el estado

Prohibido ejecutarlos: \`commit\`, \`push\`, \`pull\`, \`merge\`, \`rebase\`,
\`checkout\`, \`switch\`, \`reset\`, \`revert\`, \`cherry-pick\`, \`stash\`,
\`tag\`, \`clean\` y la gestión de remotos.

Los ejecuta **a mano la persona que esté trabajando**. Deja los cambios en el
árbol de trabajo, enumera los ficheros que has tocado y entrega el mensaje de
commit listo para copiar.

Sí puedes usar los de sólo lectura: \`status\`, \`log\`, \`diff\`, \`show\`,
\`blame\`, \`branch --list\`.

*Por qué:* quien firma el commit responde de lo que entra en el historial. Un
push automático introduce código sin revisar en un repositorio compartido, y
revertirlo pasa a ser un problema de todo el equipo.

`
    : ''

  const dbBlock = database
    ? `### Comandos de base de datos que escriben

Prohibido ejecutarlos: migraciones (\`migrate\`, \`db:push\`, \`db:seed\`,
\`upgrade\`), \`INSERT\`, \`UPDATE\`, \`DELETE\`, \`DROP\`, \`TRUNCATE\`,
\`ALTER\`, restauraciones de copias de seguridad y cualquier CLI de base de
datos que altere datos o esquema.

Los ejecuta **a mano la persona que esté trabajando**. Escribe el fichero de
migración o la consulta y explica cómo lanzarla, pero no la lances.

Sí puedes hacer \`SELECT\` de inspección y consultar el esquema.

*Por qué:* una migración no tiene botón de deshacer. El coste de equivocarse no
es un fichero mal escrito, son datos perdidos.

`
    : ''

  return `## 7. Lo que NO debes ejecutar

${gitBlock}${dbBlock}### Idioma del historial de git

Aunque el proyecto se documente en otro idioma, **los mensajes de commit, los
títulos y descripciones de Pull Request y los nombres de rama se redactan siempre
en ${commitLanguageName}**. Todo eso queda en el historial de git, y lo leerá gente que no
estuvo en la conversación.

- Commits y títulos de PR siguen Conventional Commits.
- Las ramas siguen el formato \`<tipo>/<descripción-en-kebab-case>\`, por ejemplo
  \`fix/protected-branch-detection\`. Propón el nombre de la rama antes de empezar
  a trabajar.

Entrégalo todo como texto para que lo use la persona que ejecuta git.

`
}

/**
 * Reglas de contexto para asistentes de IA.
 *
 * Se genera un único cuerpo de reglas y se publica en los ficheros que espera
 * cada herramienta. Mantener una sola fuente evita que Cursor y Claude acaben
 * con instrucciones divergentes sobre el mismo repositorio.
 */
export function aiRules(scan: RepoScan, profile: Profile): string {
  const stack = scan.primaryStack
  const typescript = stack?.typescript ?? false
  const frameworks = stack?.frameworks ?? []
  const manager = stack?.packageManager ?? 'npm'
  const strict = profile.strictness === 'strict'

  const frameworkLine =
    frameworks.length > 0
      ? `Frameworks detectados: ${frameworks.join(', ')}.`
      : 'No se ha detectado ningún framework dominante.'

  const modeLine =
    profile.mode === 'greenfield'
      ? 'Proyecto pequeño: aplica los estándares completos desde el primer fichero.'
      : profile.mode === 'ratchet'
        ? 'Proyecto en crecimiento: el código NUEVO cumple el estándar completo; el legado se migra sólo cuando ya se está tocando por otro motivo.'
        : 'Proyecto grande o monorepo: no emprendas migraciones masivas. Limita cada cambio al alcance estrictamente pedido.'

  return `# Reglas de contexto del proyecto

Estas reglas son de obligado cumplimiento para cualquier asistente de IA que
genere código en este repositorio. Están versionadas y se revisan en las PRs.

## 1. Contexto del proyecto

- Stack principal: ${stack?.name ?? 'sin determinar'}.
- ${frameworkLine}
- Gestor de paquetes: **${manager}**. No uses ningún otro ni mezcles lockfiles.
- Tamaño del repositorio: ~${scan.sloc.total.toLocaleString('es-ES')} líneas de código.
- ${modeLine}

## 2. Antes de escribir código

1. **Busca antes de crear.** Localiza utilidades, tipos y patrones que ya existan
   en el repositorio y reutilízalos. Duplicar lógica es el fallo más común del
   código generado por IA y el más caro de limpiar después.
2. **Sigue el estilo del fichero que estás tocando**, no tus preferencias:
   nombres, orden de importaciones, densidad de comentarios y manejo de errores.
3. **Si falta información, pregunta.** No inventes nombres de API, rutas de
   fichero, variables de entorno ni endpoints. Una invención plausible cuesta más
   tiempo de revisión que una pregunta.

## 3. Reglas de código${typescript ? ' (TypeScript)' : ''}

${
  typescript
    ? `- \`any\` está prohibido. Si no conoces el tipo, usa \`unknown\` y estrecha con
  comprobaciones explícitas.
- Toda función exportada declara su tipo de retorno de forma explícita.
- Las respuestas de API y los límites del sistema se modelan con interfaces.
- No uses \`@ts-ignore\`. Si de verdad hace falta, usa \`@ts-expect-error\` con un
  comentario que explique por qué y cuándo se podrá quitar.
- Prohibida la aserción no nula (\`!\`) salvo con un comentario que justifique la
  invariante que la garantiza.`
    : `- Documenta con JSDoc los parámetros y el retorno de toda función exportada.
- Valida en el borde del sistema todo dato externo antes de usarlo.`
}
- Nada de \`console.log\` en el código de producción: usa el logger del proyecto.
- Los errores se manejan de forma explícita. Prohibido el \`catch\` vacío o el
  \`catch\` que sólo registra y continúa como si nada hubiera pasado.
- Sin números ni cadenas mágicas: extrae constantes con nombre.
- Límite orientativo: ${strict ? '50' : '80'} líneas por función y ${strict ? '400' : '600'} por fichero.
  Superarlo es señal de que hay más de una responsabilidad dentro.

## 4. Seguridad (innegociable)

- **Jamás** escribas secretos, tokens, claves de API o credenciales en el código,
  ni siquiera como ejemplo o valor por defecto. Usa variables de entorno y
  documenta la variable nueva en \`.env.example\`.
- Nunca construyas SQL por concatenación de cadenas: usa consultas parametrizadas.
- Valida y sanea toda entrada procedente del usuario o de un servicio externo.
- No añadas dependencias nuevas sin necesidad real. Si lo haces, dilo
  explícitamente en la descripción de la PR y justifícalo.

## 5. Pruebas

- Todo comportamiento nuevo llega con su prueba. Sin excepciones.
- Cubre el camino feliz, al menos un caso de error y los valores límite.
- Las pruebas no dependen de la red, del reloj del sistema ni del orden de
  ejecución.
${strict ? '- Corregir un bug empieza por escribir la prueba que lo reproduce.\n' : ''}
## 6. Pull Requests

- Una PR, un propósito. No mezcles refactorización con funcionalidad nueva.
- Objetivo de tamaño: por debajo de ${strict ? '400' : '800'} líneas añadidas. Por encima, divídela.
- La descripción explica **qué cambia y por qué**, no repite el diff.
- Si has generado el código con un asistente, revísalo tú antes de pedir revisión
  a otra persona. La responsabilidad del código es de quien abre la PR.

${boundariesSection(profile)}## 8. Lo que NUNCA debes hacer

- Modificar ficheros dentro de marcadores \`plumbward:begin\` / \`plumbward:end\`:
  se regeneran automáticamente y perderás tus cambios.
- Tocar ficheros de CI/CD, \`.env\`, lockfiles o configuración de despliegue sin
  que te lo hayan pedido explícitamente.
- Desactivar reglas del linter para que pase el pipeline. Arregla la causa.
- Reformatear ficheros enteros: ensucia el diff y hace la revisión imposible.
`
}

/** Instrucciones para GitHub Copilot, que espera un fichero más breve. */
export function copilotInstructions(scan: RepoScan, profile: Profile): string {
  const stack = scan.primaryStack
  const strict = profile.strictness === 'strict'

  return `# Instrucciones para GitHub Copilot

Stack: ${stack?.name ?? 'sin determinar'}${
    stack?.frameworks.length ? ` (${stack.frameworks.join(', ')})` : ''
  }.
Gestor de paquetes: ${stack?.packageManager ?? 'npm'}.

Al proponer código en este repositorio:

- Reutiliza lo que ya existe antes de crear nada nuevo.
${stack?.typescript ? '- Prohibido `any`; usa `unknown` y estrecha el tipo. Tipo de retorno explícito en todo lo exportado.\n' : ''}- Nunca incluyas secretos ni credenciales, tampoco como ejemplo.
- Todo comportamiento nuevo llega con su prueba.
- Maneja los errores de forma explícita; nada de \`catch\` vacíos.
- Mantén las funciones por debajo de ${strict ? '50' : '80'} líneas.
- No modifiques CI/CD, \`.env\` ni lockfiles salvo petición explícita.
${profile.agentBoundaries.git ? '- No ejecutes comandos git que modifiquen el estado (commit, push, merge, reset): los lanza la persona que trabaja.\n' : ''}${profile.agentBoundaries.database ? '- No ejecutes migraciones ni sentencias que escriban en la base de datos: las lanza la persona que trabaja.\n' : ''}- Redacta los mensajes de commit, las PR y los nombres de rama en ${profile.agentBoundaries.commitLanguage === 'en' ? 'inglés' : 'español'}.

Las reglas completas están en \`.cursorrules\`.
`
}
