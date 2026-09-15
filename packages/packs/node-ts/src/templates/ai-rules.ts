import type { OutputLanguage, Profile } from '@plumbward/packs-sdk'
import type { RepoScan } from '@plumbward/scanner'

/**
 * Operating limits section.
 *
 * It is the only part of the rules that is not about how to write code but
 * about what the assistant must NOT run. It is generated apart because the team
 * can disable it from the profile, and because it is the most consulted section.
 */
function boundariesSection(profile: Profile): string {
  return profile.language === 'es' ? boundariesSectionEs(profile) : boundariesSectionEn(profile)
}

/** Name of the commit language, written in English. */
function languageNameEn(language: OutputLanguage): string {
  return language === 'en' ? 'English' : 'Spanish'
}

function boundariesSectionEn(profile: Profile): string {
  const { git, database, commitLanguage } = profile.agentBoundaries

  const gitBlock = git
    ? `### Git commands that change state

Forbidden to run: \`commit\`, \`push\`, \`pull\`, \`merge\`, \`rebase\`,
\`checkout\`, \`switch\`, \`reset\`, \`revert\`, \`cherry-pick\`, \`stash\`,
\`tag\`, \`clean\` and remote management.

**The person working at the time runs them by hand.** Leave the changes in the
working tree, list the files you touched and deliver the commit message ready
to copy.

You may use the read-only ones: \`status\`, \`log\`, \`diff\`, \`show\`,
\`blame\`, \`branch --list\`.

*Why:* whoever signs the commit answers for what enters the history. An
automatic push puts unreviewed code into a shared repository, and reverting it
becomes a problem for the whole team.

`
    : ''

  const dbBlock = database
    ? `### Database commands that write

Forbidden to run: migrations (\`migrate\`, \`db:push\`, \`db:seed\`,
\`upgrade\`), \`INSERT\`, \`UPDATE\`, \`DELETE\`, \`DROP\`, \`TRUNCATE\`,
\`ALTER\`, backup restores and any database CLI that alters data or schema.

**The person working at the time runs them by hand.** Write the migration file
or the query and explain how to run it, but do not run it.

You may run inspection \`SELECT\`s and query the schema.

*Why:* a migration has no undo button. The cost of a mistake is not a badly
written file, it is lost data.

`
    : ''

  return `## 7. What you must NOT run

${gitBlock}${dbBlock}### Language of the git history

Even if the project is documented in another language, **commit messages, Pull
Request titles and descriptions and branch names are always written in
${languageNameEn(commitLanguage)}**. All of that stays in the git history, and people who were not
in the conversation will read it.

- Commits and PR titles follow Conventional Commits.
- Branches follow the format \`<type>/<kebab-case-description>\`, for example
  \`fix/protected-branch-detection\`. Propose the branch name before you start
  working.

Deliver all of it as text, for the person who runs git to use.

`
}

function boundariesSectionEs(profile: Profile): string {
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
 * Context rules for AI assistants.
 *
 * A single body of rules is generated and published in the files each tool
 * expects. Keeping one source stops Cursor and Claude from ending up with
 * diverging instructions about the same repository.
 *
 * English by default; the Spanish variant is chosen with `language: es` in the
 * profile (F0-45). Moving both to catalogues is F1-2.
 */
export function aiRules(scan: RepoScan, profile: Profile): string {
  return profile.language === 'es' ? aiRulesEs(scan, profile) : aiRulesEn(scan, profile)
}

function aiRulesEn(scan: RepoScan, profile: Profile): string {
  const stack = scan.primaryStack
  const typescript = stack?.typescript ?? false
  const frameworks = stack?.frameworks ?? []
  const manager = stack?.packageManager ?? 'npm'
  const strict = profile.strictness === 'strict'

  const frameworkLine =
    frameworks.length > 0
      ? `Detected frameworks: ${frameworks.join(', ')}.`
      : 'No dominant framework was detected.'

  const modeLine =
    profile.mode === 'greenfield'
      ? 'Small project: apply the full standards from the first file.'
      : profile.mode === 'ratchet'
        ? 'Growing project: NEW code meets the full standard; legacy code is migrated only when it is already being touched for another reason.'
        : 'Large project or monorepo: do not start mass migrations. Limit each change to the scope strictly asked for.'

  return `# Project context rules

These rules are mandatory for any AI assistant that generates code in this
repository. They are versioned and reviewed in Pull Requests.

## 1. Project context

- Main stack: ${stack?.name ?? 'undetermined'}.
- ${frameworkLine}
- Package manager: **${manager}**. Do not use any other one or mix lockfiles.
- Repository size: ~${scan.sloc.total.toLocaleString('en-US')} lines of code.
- ${modeLine}

## 2. Before writing code

1. **Search before creating.** Find the utilities, types and patterns that
   already exist in the repository and reuse them. Duplicated logic is the most
   common flaw of AI-generated code and the most expensive to clean up later.
2. **Follow the style of the file you are touching**, not your preferences:
   names, import order, comment density and error handling.
3. **If information is missing, ask.** Do not invent API names, file paths,
   environment variables or endpoints. A plausible invention costs more review
   time than a question.

## 3. Code rules${typescript ? ' (TypeScript)' : ''}

${
  typescript
    ? `- \`any\` is forbidden. If you do not know the type, use \`unknown\` and narrow it
  with explicit checks.
- Every exported function declares its return type explicitly.
- API responses and system boundaries are modelled with interfaces.
- Do not use \`@ts-ignore\`. If it is really needed, use \`@ts-expect-error\` with
  a comment that explains why and when it can be removed.
- Non-null assertions (\`!\`) are forbidden unless a comment justifies the
  invariant that guarantees them.`
    : `- Document with JSDoc the parameters and the return value of every exported function.
- Validate every external input at the system boundary before using it.`
}
- No \`console.log\` in production code: use the project logger.
- Errors are handled explicitly. An empty \`catch\`, or a \`catch\` that only logs
  and carries on as if nothing had happened, is forbidden.
- No magic numbers or strings: extract named constants.
- Guideline limit: ${strict ? '50' : '80'} lines per function and ${strict ? '400' : '600'} per file.
  Going over it signals more than one responsibility inside.

## 4. Security (non-negotiable)

- **Never** write secrets, tokens, API keys or credentials in the code, not even
  as an example or default value. Use environment variables and document the
  new variable in \`.env.example\`.
- Never build SQL by concatenating strings: use parameterised queries.
- Validate and sanitise all input coming from the user or an external service.
- Do not add new dependencies without a real need. If you do, say so explicitly
  in the PR description and justify it.

## 5. Tests

- Every new behaviour comes with its test. No exceptions.
- Cover the happy path, at least one error case and the boundary values.
- Tests do not depend on the network, the system clock or the execution order.
${strict ? '- Fixing a bug starts with writing the test that reproduces it.\n' : ''}
## 6. Pull Requests

- One PR, one purpose. Do not mix refactoring with new functionality.
- Size target: under ${strict ? '400' : '800'} added lines. Above that, split it.
- The description explains **what changes and why**, it does not repeat the diff.
- If you generated the code with an assistant, review it yourself before asking
  someone else for a review. The code is the responsibility of whoever opens the PR.

${boundariesSection(profile)}## 8. What you must NEVER do

- Modify files inside \`plumbward:begin\` / \`plumbward:end\` markers: they are
  regenerated automatically and you will lose your changes.
- Touch CI/CD files, \`.env\`, lockfiles or deployment configuration without
  being explicitly asked to.
- Disable linter rules to make the pipeline pass. Fix the cause.
- Reformat whole files: it pollutes the diff and makes the review impossible.
`
}

function aiRulesEs(scan: RepoScan, profile: Profile): string {
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

/** Instructions for GitHub Copilot, which expects a shorter file. */
export function copilotInstructions(scan: RepoScan, profile: Profile): string {
  return profile.language === 'es'
    ? copilotInstructionsEs(scan, profile)
    : copilotInstructionsEn(scan, profile)
}

function copilotInstructionsEn(scan: RepoScan, profile: Profile): string {
  const stack = scan.primaryStack
  const strict = profile.strictness === 'strict'

  return `# Instructions for GitHub Copilot

Stack: ${stack?.name ?? 'undetermined'}${
    stack?.frameworks.length ? ` (${stack.frameworks.join(', ')})` : ''
  }.
Package manager: ${stack?.packageManager ?? 'npm'}.

When proposing code in this repository:

- Reuse what already exists before creating anything new.
${stack?.typescript ? '- `any` is forbidden; use `unknown` and narrow the type. Explicit return type on everything exported.\n' : ''}- Never include secrets or credentials, not even as an example.
- Every new behaviour comes with its test.
- Handle errors explicitly; no empty \`catch\` blocks.
- Keep functions under ${strict ? '50' : '80'} lines.
- Do not modify CI/CD, \`.env\` or lockfiles unless explicitly asked.
${profile.agentBoundaries.git ? '- Do not run git commands that change state (commit, push, merge, reset): the person working runs them.\n' : ''}${profile.agentBoundaries.database ? '- Do not run migrations or statements that write to the database: the person working runs them.\n' : ''}- Write commit messages, PRs and branch names in ${languageNameEn(profile.agentBoundaries.commitLanguage)}.

The full rules are in \`.cursorrules\`.
`
}

function copilotInstructionsEs(scan: RepoScan, profile: Profile): string {
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
