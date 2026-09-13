#!/usr/bin/env node
/**
 * Control de coherencia entre lo que declaramos y lo que probamos.
 *
 * Existe porque las revisiones en contexto nuevo han encontrado tres veces la
 * misma clase de fallo: afirmar en la documentación algo que el código no
 * respalda. Una regla escrita en un documento no lo impide; este script sí.
 *
 * Es el primer control de la tarea F0-12. Cada vez que una revisión encuentre
 * una incoherencia mecanizable, su comprobación se añade aquí.
 */
import { readFileSync } from 'node:fs'
import { readdirSync, statSync, lstatSync, readlinkSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkPlan, checkPullRequestBranch } from './branch-names.mjs'
import { uncoveredMutationInputs } from './mutation-paths.mjs'
import { checkQueue } from './execution-queue.mjs'
import { checkEnglishOnly } from './english-only.mjs'
import { checkDocLinks, withDirectories } from './doc-links.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')
const json = (p) => JSON.parse(read(p))

/** @type {string[]} */
const failures = []
const fail = (control, detail) => failures.push(`${control}: ${detail}`)

// ── 1. El suelo de Node declarado coincide con el que se prueba en CI ──────
const engines = json('package.json').engines.node
const declaredFloor = engines.replace(/^>=/, '')

const ci = read('.github/workflows/ci.yml')
const matrix = /node: \[([^\]]+)\]/.exec(ci)
if (!matrix) {
  fail('ci-matrix', 'no se encuentra la matriz de versiones de Node en ci.yml')
} else {
  const versions = matrix[1].split(',').map((v) => v.trim().replace(/'/g, ''))
  const testedFloor = versions[0]
  if (!declaredFloor.startsWith(testedFloor)) {
    fail(
      'node-floor',
      `package.json declara ">=${declaredFloor}" pero la versión más baja que la CI prueba es ${testedFloor}. Se soporta lo que se prueba.`,
    )
  }
}

// ── 1b. Ninguna condición apunta a una versión que no está en la matriz ────
// Nació de la revisión de la PR #6: tras cambiar la matriz de '22' a '22.13',
// dos pasos con `if: matrix.node == '22'` se saltaron en silencio en todas las
// ejecuciones — entre ellos el typecheck y este mismo script. Un `if` que
// nunca se cumple no falla: desaparece.
if (matrix) {
  const versions = matrix[1].split(',').map((v) => v.trim().replace(/'/g, ''))
  // Sólo líneas `if:` reales: un comentario que cite el patrón no cuenta.
  for (const m of ci.matchAll(/^\s*if:.*matrix\.node\s*==\s*'([^']+)'/gm)) {
    if (!versions.includes(m[1])) {
      fail(
        'matrix-condition',
        `ci.yml tiene una condición "matrix.node == '${m[1]}'" pero la matriz es [${versions.join(', ')}]. Ese paso no se ejecutaría nunca.`,
      )
    }
  }
}

// ── 1c. El job de tipos y coherencia usa la versión del suelo ─────────────
{
  const job = /quality:[\s\S]*?node-version:\s*'([^']+)'/.exec(ci)
  if (!job) {
    fail('quality-job', 'no se encuentra el job `quality` en ci.yml: los tipos y la coherencia no se comprobarían en CI')
  } else if (job[1] !== declaredFloor) {
    fail('quality-job', `el job \`quality\` usa Node ${job[1]} y el suelo declarado es ${declaredFloor}`)
  }
}

// ── 2. La documentación dice la misma versión que package.json ────────────
for (const doc of ['README.md', 'CONTRIBUTING.md']) {
  const text = read(doc)
  const m = /Node\.js >= ([\d.]+)/.exec(text)
  if (!m) {
    fail('documented-version', `${doc} no declara ninguna versión mínima de Node`)
  } else if (m[1] !== declaredFloor) {
    fail(
      'documented-version',
      `${doc} dice "Node.js >= ${m[1]}" y package.json dice ">=${declaredFloor}"`,
    )
  }
}

// ── 3. Los paquetes publicables declaran su propio `engines` ──────────────
// El `engines` de la raíz no llega al usuario: la raíz es privada. Sin esto,
// quien instale el CLI no recibe el aviso que README y CONTRIBUTING prometen.
const packageDirs = []
for (const base of ['packages', 'packages/packs']) {
  for (const name of readdirSync(join(root, base))) {
    const path = join(base, name)
    try {
      if (statSync(join(root, path, 'package.json')).isFile()) packageDirs.push(path)
    } catch {
      /* no es un paquete */
    }
  }
}
for (const dir of packageDirs) {
  const pkg = json(join(dir, 'package.json'))
  if (pkg.private) continue
  if (!pkg.engines?.node) {
    fail('package-engines', `${pkg.name} se publica pero no declara "engines.node"`)
  } else if (pkg.engines.node !== engines) {
    fail(
      'package-engines',
      `${pkg.name} declara "${pkg.engines.node}" y la raíz declara "${engines}"`,
    )
  }
}

// ── 4. Las ramas de los disparadores de CI existen de verdad ─────────────
// Nació de una revisión: los workflows disparaban sobre `main`, una rama que
// no existe en este repositorio — la de releases se llama `Prod`. El resultado
// era que la rama de releases no tenía ninguna CI, en silencio.
try {
  const { execSync } = await import('node:child_process')
  const remoteBranches = execSync('git ls-remote --heads origin', {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 15_000,
  })
    .split('\n')
    .map((l) => l.split('refs/heads/')[1])
    .filter(Boolean)

  if (remoteBranches.length > 0) {
    // Todos los workflows, no una lista escrita a mano: un workflow nuevo
    // con un disparador sobre una rama inexistente no tendría control.
    const workflows = readdirSync(join(root, '.github/workflows'))
      .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
      .map((f) => `.github/workflows/${f}`)
    for (const wf of workflows) {
      const text = read(wf)
      for (const m of text.matchAll(/branches: \[([^\]]+)\]/g)) {
        for (const branch of m[1].split(',').map((r) => r.trim())) {
          if (remoteBranches.includes(branch)) continue

          // Los nombres de rama de git SÍ distinguen mayúsculas: `Prod` y
          // `prod` son ramas distintas. Un desajuste de caja es el error más
          // probable y el más difícil de ver a simple vista, así que se
          // diagnostica aparte en lugar de decir "no existe" y dejar al
          // lector comparando letra por letra.
          const caseMatch = remoteBranches.find((r) => r.toLowerCase() === branch.toLowerCase())
          fail(
            'trigger-branches',
            caseMatch
              ? `${wf} dispara sobre "${branch}", pero la rama del remoto se llama "${caseMatch}". Los nombres de rama distinguen mayúsculas: el disparador nunca se activaría.`
              : `${wf} dispara sobre la rama "${branch}", que no existe en el remoto. Esa rama no tendría ninguna CI. Ramas disponibles: ${remoteBranches.join(', ')}.`,
          )
        }
      }
    }
  }
} catch {
  // Sin red o sin remoto: no se puede comprobar, y no es motivo para fallar.
  console.warn('  (aviso: no se han podido listar las ramas remotas; control omitido)')
}

// ── 4 bis. El filtro del workflow de mutaciones cubre lo que se muta ────
// `mutations.yml` sólo corre en las PRs que tocan los ficheros que
// `check-mutations.mjs` muta o ejecuta. Esa lista está escrita a mano en el
// workflow y la de mutaciones crece: si una mutación nueva toca un fichero que
// el filtro no nombra, el job deja de ejecutarse en las PRs que lo cambian sin
// ponerse en rojo —no se ejecuta, no falla—. La lógica vive en
// `scripts/mutation-paths.mjs`, cubierta por su test. Tarea F0-27.
for (const file of uncoveredMutationInputs(
  read('scripts/check-mutations.mjs'),
  read('.github/workflows/mutations.yml'),
)) {
  fail(
    'mutation-filter',
    `check-mutations.mjs muta o ejecuta "${file}", pero el filtro paths: de .github/workflows/mutations.yml no lo nombra. Una PR que cambie ese fichero no lanzaría las mutaciones.`,
  )
}

// ── 5. Los nombres de rama van en inglés y con el formato del plan ───────
// La lógica vive en `scripts/branch-names.mjs` y está cubierta por
// `scripts/branch-names.test.mjs` con un corpus de nombres reales. Aquí sólo
// se conectan las dos entradas: el plan y la rama de la Pull Request en curso.
//
// La rama de la PR se lee de GITHUB_HEAD_REF y no se interpola en el workflow,
// porque un nombre de rama lo controla quien abre la PR y meterlo en un `run:`
// sería una vía de inyección de comandos. El autor viene de GITHUB_ACTOR.
for (const reason of checkPlan(read('docs/EXECUTION_PLAN.md'))) {
  fail('plan-branch-name', reason)
}

const prBranchReason = checkPullRequestBranch(process.env.GITHUB_HEAD_REF, process.env.GITHUB_ACTOR)
if (prBranchReason) {
  fail('pr-branch-name', `"${process.env.GITHUB_HEAD_REF}" ${prBranchReason}`)
}

// ── 5 bis. La cola de ejecución describe el plan (F0-40) ─────────────────
// La siguiente tarea es la primera de la cola del §5. Si la cola se deja una
// tarea pendiente, conserva una cerrada o pone algo antes de su dependencia,
// la siguiente tarea deja de ser la correcta sin que nadie lo note.
for (const reason of checkQueue(read('docs/EXECUTION_PLAN.md'))) {
  fail('execution-queue', reason)
}

// ── 5 ter. English everywhere, except what is listed (F0-41) ──────────────
// Tracked files plus new ones not yet added, so Spanish is caught before the
// commit and not only in CI. A file deleted on disk but still in the index is
// skipped, and so are symlinks: their target is scanned as its own path.
{
  const { execFileSync } = await import('node:child_process')
  const paths = new Set(
    execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean),
  )
  const files = []
  for (const path of paths) {
    const full = join(root, path)
    if (!existsSync(full) || !lstatSync(full).isFile()) continue
    files.push({ path, text: readFileSync(full, 'utf8') })
  }
  for (const problem of checkEnglishOnly(files, json('scripts/english-only.json'))) {
    fail('english-only', problem)
  }

  // ── 5 quater. Relative documentation links resolve (F0-16) ──────────────
  // Same file list: a link to a new file not yet added resolves, a link to a
  // file deleted on disk does not. A rename otherwise breaks links in silence.
  const existing = withDirectories([...paths].filter((path) => existsSync(join(root, path))))
  for (const problem of checkDocLinks(files, existing)) {
    fail('doc-links', problem)
  }
}

// ── 6. Las skills de agente versionadas son las que fija el lock (F0-17) ──
// Una skill es código de terceros que el asistente carga con acceso al repo.
// `skills-lock.json` fija su hash; si alguien la edita a mano o la sustituye,
// el lock deja de describir lo que se carga y nadie se entera. El hash se
// calcula igual que `computeSkillFolderHash` de la CLI `skills` (v1.5.25):
// sha256 de ruta relativa + contenido de cada fichero, ordenados por ruta.
const SKILLS_DIR = '.agents/skills'
const CLAUDE_SKILLS_DIR = '.claude/skills'

/** @returns {string} */
function skillFolderHash(dir) {
  /** @type {{ path: string, content: Buffer }[]} */
  const files = []
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      // Un enlace simbólico no es fichero ni directorio para `Dirent`: la CLI
      // `skills` lo salta, así que su contenido nunca entra en el hash. Se
      // prohíbe, o sería una forma de meter código que el lock no cubre.
      if (entry.isSymbolicLink()) {
        fail('skill-symlink', `${relative(root, full)} es un enlace simbólico: el hash del lock no lo cubre`)
      } else if (entry.isDirectory()) {
        if (entry.name !== '.git' && entry.name !== 'node_modules') walk(full)
      } else if (entry.isFile() && entry.name !== '.DS_Store') {
        // .DS_Store: lo crea macOS, está en .gitignore y nunca llega a la CI.
        files.push({ path: relative(dir, full).split('\\').join('/'), content: readFileSync(full) })
      }
    }
  }
  walk(dir)
  files.sort((a, b) => a.path.localeCompare(b.path))
  const hash = createHash('sha256')
  for (const f of files) hash.update(f.path).update(f.content)
  return hash.digest('hex')
}

if (existsSync(join(root, 'skills-lock.json'))) {
  const locked = json('skills-lock.json').skills ?? {}
  const installed = existsSync(join(root, SKILLS_DIR))
    ? readdirSync(join(root, SKILLS_DIR), { withFileTypes: true }).filter((e) => !e.isFile()).map((e) => e.name)
    : []
  for (const name of installed) {
    if (!(name in locked)) fail('skill-not-locked', `${SKILLS_DIR}/${name} no está en skills-lock.json`)
  }
  for (const [name, entry] of Object.entries(locked)) {
    const dir = join(root, SKILLS_DIR, name)
    if (!existsSync(dir)) {
      fail('skill-missing', `skills-lock.json fija "${name}" pero ${SKILLS_DIR}/${name} no existe`)
      continue
    }
    const actual = skillFolderHash(dir)
    if (actual !== entry.computedHash) {
      fail('skill-altered', `${SKILLS_DIR}/${name} no coincide con el hash de skills-lock.json (${actual})`)
    }
    // 6b. Claude Code sólo lee `.claude/skills/`. Sin el enlace, la skill está
    // instalada y versionada pero ningún asistente la carga: parece que funciona.
    const link = join(root, CLAUDE_SKILLS_DIR, name)
    const expected = `../../${SKILLS_DIR}/${name}`
    let target
    try {
      target = lstatSync(link).isSymbolicLink() ? readlinkSync(link) : undefined
    } catch {
      target = undefined
    }
    if (target !== expected) {
      fail('skill-not-linked', `${CLAUDE_SKILLS_DIR}/${name} debe ser un enlace a ${expected}`)
    }
  }
}

// ── 7. El runbook de napkin respeta sus propias reglas de curación (F0-17) ─
// Las reglas están escritas en la cabecera del fichero, y una regla escrita se
// incumple. Máximo 10 entradas por categoría; cada una con fecha y "Do instead".
const NAPKIN = '.claude/napkin.md'
if (existsSync(join(root, NAPKIN))) {
  let category
  let count = 0
  let pending // entrada abierta que aún no ha mostrado su "Do instead"
  const closeEntry = () => {
    if (pending) fail('napkin-no-do-instead', `"${pending}" (${category})`)
    pending = undefined
  }
  for (const line of read(NAPKIN).split('\n')) {
    const header = /^## (.+)$/.exec(line)
    if (header) {
      closeEntry()
      category = header[1]
      count = 0
      continue
    }
    const item = /^\d+\. (.*)$/.exec(line)
    if (item) {
      closeEntry()
      count += 1
      if (count === 11) fail('napkin-category-full', `"${category}" pasa de 10 entradas`)
      if (!/^\*\*\[\d{4}-\d{2}-\d{2}\] /.test(item[1])) {
        fail('napkin-no-date', `"${item[1].slice(0, 60)}" (${category})`)
      }
      pending = item[1].slice(0, 60)
      continue
    }
    if (/^\s+Do instead: \S/.test(line)) pending = undefined
  }
  closeEntry()
}

// ── 8. Los comandos git de la §0 de CLAUDE.md los permite la §1 (F0-15) ───
// La guía para retomar el proyecto proponía `git branch --show-current`, que
// no estaba en la lista de comandos de sólo lectura permitidos. Una guía que
// manda hacer algo que el mismo fichero prohíbe sólo se descubre leyendo las
// dos secciones a la vez, que es justo lo que nadie hace.
{
  const claude = read('CLAUDE.md')
  const section = (prefix) => {
    const from = claude.indexOf(`\n## ${prefix}`)
    if (from < 0) return undefined
    const rest = claude.slice(from + 1)
    const to = rest.indexOf('\n## ')
    return to < 0 ? rest : rest.slice(0, to)
  }

  const section0 = section('0. ')
  const allowedList = /You may use the read-only ones:([\s\S]*?)\./.exec(claude)
  const allowed = allowedList
    ? [...allowedList[1].matchAll(/`([^`]+)`/g)].map((m) => m[1])
    : []

  // Sin ancla no hay control: se falla en vez de pasar en silencio.
  if (!section0) fail('claude-md-allowed-git', 'no se encuentra la sección "## 0. " en CLAUDE.md')
  else if (allowed.length === 0) {
    fail('claude-md-allowed-git', 'no se encuentra la lista de comandos git de sólo lectura en la §1')
  } else {
    // Se recorre la §0 entera, no sólo sus bloques ```bash: un `git reset
    // --hard` escrito en prosa, entre acentos graves, es igual de copiable y
    // se colaba. El subcomando arrastra sólo sus opciones, de modo que la
    // captura termina donde acaba el comando y no se come la frase.
    //
    // Se saltan las opciones globales (`git -C ruta push`, `git -c k=v commit`)
    // para llegar al subcomando: son una forma corriente de escribir un
    // comando, y un patrón que empiece a exigir letra tras `git ` no casaba en
    // absoluto y lo dejaba pasar entero. La negación por detrás evita `legit`,
    // y `\s+` tras `git` evita `gitlab`.
    //
    // El grupo es opcional a propósito: un `git` cuyo subcomando este control
    // no sepa leer cae en `undefined` en vez de desaparecer, y se falla en voz
    // alta. Silencio aquí es exactamente lo que hacía falsa la frase de la §1.
    const uses = section0.matchAll(
      /(?<![\w-])git\s+(?:-[cC]\s+\S+\s+)*([a-z][a-z-]*(?:\s+--?[a-z][\w.-]*(?:=\S+)?)*)?/g,
    )
    let seen = 0
    for (const use of uses) {
      seen += 1
      const command = use[1]?.trim()
      if (!command) {
        const excerpt = section0.slice(use.index, use.index + 48).split('\n')[0].trim()
        fail(
          'claude-md-allowed-git',
          `la §0 escribe "${excerpt}", y este control no sabe leer ahí un subcomando: ` +
            'no puede afirmar que la §1 lo permita',
        )
        continue
      }
      const isAllowed = allowed.some((p) => command === p || command.startsWith(`${p} `))
      if (!isAllowed) {
        fail(
          'claude-md-allowed-git',
          `la §0 propone "git ${command}", que no está en la lista de sólo lectura de la §1`,
        )
      }
    }
    // Si la §0 deja de proponer comandos, este control se queda sin objeto y
    // hay que revisarlo, no dejarlo pasando en verde sin mirar nada.
    if (seen === 0) fail('claude-md-allowed-git', 'la §0 ya no propone ningún comando git')
  }
}

// ── Resultado ─────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error('\nCoherencia: se han encontrado incoherencias.\n')
  for (const f of failures) console.error(`  ✗ ${f}`)
  console.error('')
  process.exit(1)
}
console.log('Coherencia: lo que declaramos coincide con lo que probamos.')
