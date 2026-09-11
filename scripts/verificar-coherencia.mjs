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

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const leer = (p) => readFileSync(join(raiz, p), 'utf8')
const json = (p) => JSON.parse(leer(p))

/** @type {string[]} */
const fallos = []
const fallo = (control, detalle) => fallos.push(`${control}: ${detalle}`)

// ── 1. El suelo de Node declarado coincide con el que se prueba en CI ──────
const engines = json('package.json').engines.node
const sueloDeclarado = engines.replace(/^>=/, '')

const ci = leer('.github/workflows/ci.yml')
const matriz = /node: \[([^\]]+)\]/.exec(ci)
if (!matriz) {
  fallo('matriz-ci', 'no se encuentra la matriz de versiones de Node en ci.yml')
} else {
  const versiones = matriz[1].split(',').map((v) => v.trim().replace(/'/g, ''))
  const sueloProbado = versiones[0]
  if (!sueloDeclarado.startsWith(sueloProbado)) {
    fallo(
      'suelo-de-node',
      `package.json declara ">=${sueloDeclarado}" pero la versión más baja que la CI prueba es ${sueloProbado}. Se soporta lo que se prueba.`,
    )
  }
}

// ── 1b. Ninguna condición apunta a una versión que no está en la matriz ────
// Nació de la revisión de la PR #6: tras cambiar la matriz de '22' a '22.13',
// dos pasos con `if: matrix.node == '22'` se saltaron en silencio en todas las
// ejecuciones — entre ellos el typecheck y este mismo script. Un `if` que
// nunca se cumple no falla: desaparece.
if (matriz) {
  const versiones = matriz[1].split(',').map((v) => v.trim().replace(/'/g, ''))
  // Sólo líneas `if:` reales: un comentario que cite el patrón no cuenta.
  for (const m of ci.matchAll(/^\s*if:.*matrix\.node\s*==\s*'([^']+)'/gm)) {
    if (!versiones.includes(m[1])) {
      fallo(
        'condicion-de-matriz',
        `ci.yml tiene una condición "matrix.node == '${m[1]}'" pero la matriz es [${versiones.join(', ')}]. Ese paso no se ejecutaría nunca.`,
      )
    }
  }
}

// ── 1c. El job de tipos y coherencia usa la versión del suelo ─────────────
{
  const job = /calidad:[\s\S]*?node-version:\s*'([^']+)'/.exec(ci)
  if (!job) {
    fallo('job-de-calidad', 'no se encuentra el job `calidad` en ci.yml: los tipos y la coherencia no se comprobarían en CI')
  } else if (job[1] !== sueloDeclarado) {
    fallo('job-de-calidad', `el job \`calidad\` usa Node ${job[1]} y el suelo declarado es ${sueloDeclarado}`)
  }
}

// ── 2. La documentación dice la misma versión que package.json ────────────
for (const doc of ['README.md', 'CONTRIBUTING.md']) {
  const texto = leer(doc)
  const m = /Node\.js >= ([\d.]+)/.exec(texto)
  if (!m) {
    fallo('version-documentada', `${doc} no declara ninguna versión mínima de Node`)
  } else if (m[1] !== sueloDeclarado) {
    fallo(
      'version-documentada',
      `${doc} dice "Node.js >= ${m[1]}" y package.json dice ">=${sueloDeclarado}"`,
    )
  }
}

// ── 3. Los paquetes publicables declaran su propio `engines` ──────────────
// El `engines` de la raíz no llega al usuario: la raíz es privada. Sin esto,
// quien instale el CLI no recibe el aviso que README y CONTRIBUTING prometen.
const dirsDePaquetes = []
for (const base of ['packages', 'packages/packs']) {
  for (const nombre of readdirSync(join(raiz, base))) {
    const ruta = join(base, nombre)
    try {
      if (statSync(join(raiz, ruta, 'package.json')).isFile()) dirsDePaquetes.push(ruta)
    } catch {
      /* no es un paquete */
    }
  }
}
for (const dir of dirsDePaquetes) {
  const pkg = json(join(dir, 'package.json'))
  if (pkg.private) continue
  if (!pkg.engines?.node) {
    fallo('engines-en-paquetes', `${pkg.name} se publica pero no declara "engines.node"`)
  } else if (pkg.engines.node !== engines) {
    fallo(
      'engines-en-paquetes',
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
  const remotas = execSync('git ls-remote --heads origin', {
    cwd: raiz,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 15_000,
  })
    .split('\n')
    .map((l) => l.split('refs/heads/')[1])
    .filter(Boolean)

  if (remotas.length > 0) {
    for (const wf of ['.github/workflows/ci.yml', '.github/workflows/e2e.yml']) {
      const texto = leer(wf)
      for (const m of texto.matchAll(/branches: \[([^\]]+)\]/g)) {
        for (const rama of m[1].split(',').map((r) => r.trim())) {
          if (remotas.includes(rama)) continue

          // Los nombres de rama de git SÍ distinguen mayúsculas: `Prod` y
          // `prod` son ramas distintas. Un desajuste de caja es el error más
          // probable y el más difícil de ver a simple vista, así que se
          // diagnostica aparte en lugar de decir "no existe" y dejar al
          // lector comparando letra por letra.
          const porCaja = remotas.find((r) => r.toLowerCase() === rama.toLowerCase())
          fallo(
            'ramas-de-disparadores',
            porCaja
              ? `${wf} dispara sobre "${rama}", pero la rama del remoto se llama "${porCaja}". Los nombres de rama distinguen mayúsculas: el disparador nunca se activaría.`
              : `${wf} dispara sobre la rama "${rama}", que no existe en el remoto. Esa rama no tendría ninguna CI. Ramas disponibles: ${remotas.join(', ')}.`,
          )
        }
      }
    }
  }
} catch {
  // Sin red o sin remoto: no se puede comprobar, y no es motivo para fallar.
  console.warn('  (aviso: no se han podido listar las ramas remotas; control omitido)')
}

// ── 5. Los nombres de rama van en inglés y con el formato del plan ───────
// La lógica vive en `scripts/branch-names.mjs` y está cubierta por
// `scripts/branch-names.test.mjs` con un corpus de nombres reales. Aquí sólo
// se conectan las dos entradas: el plan y la rama de la Pull Request en curso.
//
// La rama de la PR se lee de GITHUB_HEAD_REF y no se interpola en el workflow,
// porque un nombre de rama lo controla quien abre la PR y meterlo en un `run:`
// sería una vía de inyección de comandos. El autor viene de GITHUB_ACTOR.
for (const motivo of checkPlan(leer('docs/PLAN_DE_EJECUCION.md'))) {
  fallo('nombre-de-rama-en-plan', motivo)
}

const motivoRamaPR = checkPullRequestBranch(process.env.GITHUB_HEAD_REF, process.env.GITHUB_ACTOR)
if (motivoRamaPR) {
  fallo('nombre-de-rama-de-la-pr', `"${process.env.GITHUB_HEAD_REF}" ${motivoRamaPR}`)
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
        fallo('skill-con-enlace', `${relative(raiz, full)} es un enlace simbólico: el hash del lock no lo cubre`)
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

if (existsSync(join(raiz, 'skills-lock.json'))) {
  const locked = json('skills-lock.json').skills ?? {}
  const installed = existsSync(join(raiz, SKILLS_DIR))
    ? readdirSync(join(raiz, SKILLS_DIR), { withFileTypes: true }).filter((e) => !e.isFile()).map((e) => e.name)
    : []
  for (const name of installed) {
    if (!(name in locked)) fallo('skill-sin-lock', `${SKILLS_DIR}/${name} no está en skills-lock.json`)
  }
  for (const [name, entry] of Object.entries(locked)) {
    const dir = join(raiz, SKILLS_DIR, name)
    if (!existsSync(dir)) {
      fallo('skill-ausente', `skills-lock.json fija "${name}" pero ${SKILLS_DIR}/${name} no existe`)
      continue
    }
    const actual = skillFolderHash(dir)
    if (actual !== entry.computedHash) {
      fallo('skill-alterada', `${SKILLS_DIR}/${name} no coincide con el hash de skills-lock.json (${actual})`)
    }
    // 6b. Claude Code sólo lee `.claude/skills/`. Sin el enlace, la skill está
    // instalada y versionada pero ningún asistente la carga: parece que funciona.
    const link = join(raiz, CLAUDE_SKILLS_DIR, name)
    const expected = `../../${SKILLS_DIR}/${name}`
    let target
    try {
      target = lstatSync(link).isSymbolicLink() ? readlinkSync(link) : undefined
    } catch {
      target = undefined
    }
    if (target !== expected) {
      fallo('skill-sin-enlace', `${CLAUDE_SKILLS_DIR}/${name} debe ser un enlace a ${expected}`)
    }
  }
}

// ── 7. El runbook de napkin respeta sus propias reglas de curación (F0-17) ─
// Las reglas están escritas en la cabecera del fichero, y una regla escrita se
// incumple. Máximo 10 entradas por categoría; cada una con fecha y "Do instead".
const NAPKIN = '.claude/napkin.md'
if (existsSync(join(raiz, NAPKIN))) {
  let category
  let count = 0
  let pending // entrada abierta que aún no ha mostrado su "Do instead"
  const closeEntry = () => {
    if (pending) fallo('napkin-sin-do-instead', `"${pending}" (${category})`)
    pending = undefined
  }
  for (const line of leer(NAPKIN).split('\n')) {
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
      if (count === 11) fallo('napkin-categoria-llena', `"${category}" pasa de 10 entradas`)
      if (!/^\*\*\[\d{4}-\d{2}-\d{2}\] /.test(item[1])) {
        fallo('napkin-sin-fecha', `"${item[1].slice(0, 60)}" (${category})`)
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
  const claude = leer('CLAUDE.md')
  const seccion = (prefijo) => {
    const desde = claude.indexOf(`\n## ${prefijo}`)
    if (desde < 0) return undefined
    const resto = claude.slice(desde + 1)
    const hasta = resto.indexOf('\n## ')
    return hasta < 0 ? resto : resto.slice(0, hasta)
  }

  const seccion0 = seccion('0. ')
  const listaDePermitidos = /Sí puedes usar los de sólo lectura:([\s\S]*?)\./.exec(claude)
  const permitidos = listaDePermitidos
    ? [...listaDePermitidos[1].matchAll(/`([^`]+)`/g)].map((m) => m[1])
    : []

  // Sin ancla no hay control: se falla en vez de pasar en silencio.
  if (!seccion0) fallo('git-permitido-en-claude-md', 'no se encuentra la sección "## 0. " en CLAUDE.md')
  else if (permitidos.length === 0) {
    fallo('git-permitido-en-claude-md', 'no se encuentra la lista de comandos git de sólo lectura en la §1')
  } else {
    // Se recorre la §0 entera, no sólo sus bloques ```bash: un `git reset
    // --hard` escrito en prosa, entre acentos graves, es igual de copiable y
    // se colaba. El subcomando arrastra sólo sus opciones, de modo que la
    // captura termina donde acaba el comando y no se come la frase.
    const usos = seccion0.matchAll(
      /(?:^|[\s`("])git\s+([a-z][a-z-]*(?:\s+--?[a-z][\w.-]*(?:=\S+)?)*)/g,
    )
    let vistos = 0
    for (const uso of usos) {
      vistos += 1
      const comando = uso[1].trim()
      const permitido = permitidos.some((p) => comando === p || comando.startsWith(`${p} `))
      if (!permitido) {
        fallo(
          'git-permitido-en-claude-md',
          `la §0 propone "git ${comando}", que no está en la lista de sólo lectura de la §1`,
        )
      }
    }
    // Si la §0 deja de proponer comandos, este control se queda sin objeto y
    // hay que revisarlo, no dejarlo pasando en verde sin mirar nada.
    if (vistos === 0) fallo('git-permitido-en-claude-md', 'la §0 ya no propone ningún comando git')
  }
}

// ── Resultado ─────────────────────────────────────────────────────────────
if (fallos.length > 0) {
  console.error('\nCoherencia: se han encontrado incoherencias.\n')
  for (const f of fallos) console.error(`  ✗ ${f}`)
  console.error('')
  process.exit(1)
}
console.log('Coherencia: lo que declaramos coincide con lo que probamos.')
