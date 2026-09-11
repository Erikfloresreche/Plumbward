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
import { readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

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
  for (const m of ci.matchAll(/matrix\.node\s*==\s*'([^']+)'/g)) {
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
// Formato `<tipo>/f<fase>-<slug>`. El idioma no se puede demostrar
// mecánicamente, así que esto es una heurística deliberadamente conservadora:
// caracteres no ASCII y palabras españolas frecuentes en nuestros nombres. No
// sustituye a la revisión; atrapa el caso típico, que es el que se repite.
const FORMATO_RAMA = /^(feat|fix|refactor|test|docs|build|ci|chore)\/f\d+-[a-z0-9]+(-[a-z0-9]+)*$/
const PALABRAS_ES = new Set([
  'de', 'del', 'la', 'las', 'el', 'los', 'y', 'con', 'para', 'por', 'al', 'sin',
  'rama', 'ramas', 'regla', 'reglas', 'prueba', 'pruebas', 'paquete', 'informe',
  'guia', 'flujo', 'flujos', 'control', 'controles', 'propio', 'documentacion',
])

/** @returns {string | undefined} el motivo por el que el nombre no vale */
function problemaDeRama(rama) {
  if (/[^\x00-\x7F]/.test(rama)) return 'contiene caracteres no ASCII'
  if (!FORMATO_RAMA.test(rama)) return 'no sigue el formato <tipo>/f<fase>-<slug>'
  const slug = rama.split('/')[1].replace(/^f\d+-/, '')
  const enEspanol = slug.split('-').filter((t) => PALABRAS_ES.has(t))
  if (enEspanol.length > 0) return `parece estar en español (${enEspanol.join(', ')})`
  return undefined
}

// 5a. Las ramas previstas para tareas PENDIENTES del plan. Las cerradas se
// saltan a propósito: su nombre es un hecho histórico, no una convención.
{
  let pendiente = false
  for (const linea of leer('docs/PLAN_DE_EJECUCION.md').split('\n')) {
    const cabecera = /^### \[([ x])\] /.exec(linea)
    if (cabecera) pendiente = cabecera[1] === ' '
    const m = /^\*\*Rama:\*\* `([^`]+)`/.exec(linea)
    if (m && pendiente) {
      const motivo = problemaDeRama(m[1])
      if (motivo) fallo('nombre-de-rama-en-plan', `"${m[1]}" ${motivo}`)
    }
  }
}

// 5b. La rama de la Pull Request en curso. GitHub la expone en la variable de
// entorno GITHUB_HEAD_REF: se lee de ahí y no interpolándola en el workflow,
// porque un nombre de rama lo controla quien abre la PR y meterlo en un `run:`
// sería una vía de inyección de comandos.
const ramaPR = process.env.GITHUB_HEAD_REF
if (ramaPR && !ramaPR.startsWith('dependabot/')) {
  const motivo = problemaDeRama(ramaPR)
  if (motivo) fallo('nombre-de-rama-de-la-pr', `"${ramaPR}" ${motivo}`)
}

// ── Resultado ─────────────────────────────────────────────────────────────
if (fallos.length > 0) {
  console.error('\nCoherencia: se han encontrado incoherencias.\n')
  for (const f of fallos) console.error(`  ✗ ${f}`)
  console.error('')
  process.exit(1)
}
console.log('Coherencia: lo que declaramos coincide con lo que probamos.')
