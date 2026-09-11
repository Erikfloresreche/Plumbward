#!/usr/bin/env node
/**
 * Pruebas de mutación de la lógica de ramas protegidas.
 *
 * Cada mutación deshace, a propósito, una pieza concreta de la lógica —casi todas
 * son fallos reales que encontraron las revisiones de F0-14— y comprueba que
 * algún test falla. Si una mutación sobrevive, esa pieza no está cubierta.
 *
 * Existe para que "N mutaciones detectadas" sea algo que cualquiera puede
 * reproducir, no una afirmación en una PR. Es lento, así que no corre en cada PR:
 *
 *     pnpm check:mutations
 *
 * Todo se ejecuta con una configuración de git hostil —firma de commits con un
 * gpg que siempre falla, en la configuración global y también inyectada por
 * `GIT_CONFIG_COUNT`—, para que las pruebas demuestren también su aislamiento.
 * Restaura cada fichero aunque se interrumpa.
 *
 * Con un argumento, sólo ejecuta las mutaciones cuyo nombre lo contiene:
 *
 *     pnpm check:mutations HEAD
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const TESTS = [
  'packages/packs-sdk/src/branches.test.ts',
  'packages/scanner/test/default-branch.test.ts',
  'packages/cli/test/protected-branches.test.ts',
  'packages/cli/test/head-moved.test.ts',
  'packages/packs/node-ts/src/validate.test.ts',
  'packages/cli/test/e2e.test.ts',
]

const BR = 'packages/packs-sdk/src/branches.ts'
const CT = 'packages/packs-sdk/src/contract.ts'
const GT = 'packages/scanner/src/git.ts'
const CM = 'packages/cli/src/commands.ts'
const CX = 'packages/cli/src/context.ts'
const PK = 'packages/packs/node-ts/src/index.ts'
const CI = 'packages/packs/node-ts/src/templates/ci.ts'
const WF = 'packages/packs/node-ts/src/workflow-checks.ts'
const VS = 'vitest.setup.ts'

/** [descripción, fichero, texto original, texto mutado, reemplazo adicional opcional] */
const MUTATIONS = [
  ['Aislar siempre, también en ramas de trabajo', BR, '  if (head.detachedHead) return true\n', '  return true\n'],
  ['No aislar con HEAD desacoplado', BR, '  if (head.detachedHead) return true\n', ''],
  ['Proteger sólo lo configurado, sin inversión', BR, '  return !isWorkBranch(head.branch)\n', '  return false\n'],
  ['Ignorar las ramas configuradas en el perfil', BR, '  if (configuredBranches(profile, head.defaultBranch).has(head.branch.toLowerCase())) return true\n', ''],
  ['Comparar ramas configuradas distinguiendo mayúsculas', BR, '      .map((name) => name.toLowerCase()),\n', ''],
  ['Prefijos de trabajo sensibles a mayúsculas', BR, 'branch.slice(0, slash).toLowerCase()', 'branch.slice(0, slash)'],
  ['Quitar los prefijos de asistentes de IA', BR, "  'claude',\n", ''],
  ['Ignorar --no-branch', CM, '  if (!createBranch) return\n', ''],
  ['Escribir en la rama aislada existente', CM, '  if (!(await branchExists(repoRoot, GOVERNANCE_BRANCH))) return false\n', '  return false\n'],
  ['Crear la rama aislada heredando el upstream', CM, "['checkout', '--no-track', '-b', GOVERNANCE_BRANCH]", "['checkout', '-b', GOVERNANCE_BRANCH]"],
  ['Aplicar sin consultar el perfil', CM, '  if (!requiresIsolation(git, profile)) {', '  if (!requiresIsolation(git, { branches: { integration: null, release: null, staging: null } })) {'],
  ['Leer la rama abreviada (heads/X)', GT, "git(repoRoot, ['symbolic-ref', '-q', 'HEAD'])", "git(repoRoot, ['symbolic-ref', '-q', 'HEAD']).then((r) => r?.replace('refs/heads/', 'refs/heads/heads/'))"],
  ['Volver a adivinar la rama de despliegue', CT, '      release: null,\n', '      release: scan.git.defaultBranch,\n'],
  ['Sin respaldo de integración (git init + push)', CT, "  if (scan.git.branch && !isWorkBranch(scan.git.branch)) return scan.git.branch\n  return scan.git.branches.find((name) => name === 'main' || name === 'master') ?? null", '  return null'],
  ['Sin respaldo de main existente', CT, "  return scan.git.branches.find((name) => name === 'main' || name === 'master') ?? null", '  return null'],
  ['Traducir el main antiguo a release', CX, "    release: text(source['release']),\n", "    release: text(source['release']) ?? text(source['main']),\n"],
  ['No leer el main antiguo', CX, "    integration: text(source['integration']) ?? text(source['dev']) ?? text(source['main']),\n", "    integration: text(source['integration']) ?? text(source['dev']),\n"],
  ['Aceptar una rama vacía como configurada', CX, "typeof value === 'string' && value.trim() !== ''", "typeof value === 'string'"],
  ['Completar el config con el origin/HEAD local', CX, '      branches: normaliseBranches(fromFile.branches),\n', '      branches: Object.fromEntries(Object.entries(normaliseBranches(fromFile.branches)).map(([k, v]) => [k, v ?? base.branches[k]])),\n'],
  ['Filtrar otra vez las PRs por rama', CI, 'on:\n  pull_request:\n$', 'on:\n  pull_request:\n    branches: [main]\n$'],
  ['Declarar push aunque no haya ramas', CI, "${pushBranches.length > 0 ? `  push:\n    branches: [${pushBranches.join(', ')}]\n` : ''}", "  push:\n    branches: [${pushBranches.join(', ')}]\n"],
  ['Staging con nombre literal', CI, "  const staging = profile.branches.staging ?? 'staging'", "  const staging = 'staging'"],
  ['Push CI sin cablear el perfil', PK, '          ciPushBranches(profile),', '          ciPushBranches({ branches: { integration: null, release: null, staging: null } }),'],
  ['Desplegar sin rama configurada', PK, "if (profile.deployTarget !== 'none' && release !== null) {", "if (profile.deployTarget !== 'none') {", ['ciProdWorkflow(manager, release)', "ciProdWorkflow(manager, release ?? 'main')"]],
  ['doctor ignora un ci-prod.yml existente', WF, "  if (deployTarget === 'none' && prodText === undefined) return undefined\n", "  if (deployTarget === 'none') return undefined\n"],
  ['doctor no compara la rama del ci-prod.yml', WF, '  if (deploysFrom.length !== 1 || deploysFrom[0] !== release) {', '  if (false) {'],
  ['doctor acepta PRs filtradas', WF, '  if (filter === null) return { ...base, ok: true', '  if (filter !== undefined) return { ...base, ok: true'],
  ['Heredar las variables GIT_* del entorno', VS, "  if (name.startsWith('GIT_')) delete process.env[name]\n", ''],
  ['Aplicar aunque HEAD cambie durante la confirmación', CM, '  if (headMoved(scan.git, headBefore, await readHead(scan.repoRoot))) {', '  if (false) {'],
  ['Comparar sólo la rama, no el commit', CM, ' || now.commit !== before.commit', ''],
]

const hostile = join(mkdtempSync(join(tmpdir(), 'plumbward-hostile-')), 'gitconfig')
writeFileSync(hostile, '[commit]\n\tgpgsign = true\n[tag]\n\tgpgSign = true\n[gpg]\n\tprogram = false\n')

let restoring = null
process.on('SIGINT', () => {
  if (restoring) writeFileSync(restoring.path, restoring.content)
  process.exit(130)
})

let survivors = 0
const only = process.argv[2]
const selected = only ? MUTATIONS.filter(([name]) => name.includes(only)) : MUTATIONS
for (const [name, file, from, to, extra] of selected) {
  const path = join(root, file)
  const original = readFileSync(path, 'utf8')
  const count = original.split(from).length - 1
  if (count !== 1) {
    console.error(`  ANCLA ROTA    ${name} (${file}: ${count} apariciones). Actualiza la lista.`)
    survivors++
    continue
  }
  let mutated = original.replace(from, to)
  if (extra) mutated = mutated.replace(extra[0], extra[1])
  restoring = { path, content: original }
  writeFileSync(path, mutated)
  try {
    const result = spawnSync('pnpm', ['vitest', 'run', ...TESTS], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: hostile,
        GIT_CONFIG_COUNT: '2',
        GIT_CONFIG_KEY_0: 'commit.gpgsign',
        GIT_CONFIG_VALUE_0: 'true',
        GIT_CONFIG_KEY_1: 'gpg.program',
        GIT_CONFIG_VALUE_1: 'false',
      },
      timeout: 300_000,
    })
    const caught = result.status !== 0
    if (!caught) survivors++
    console.log(`  ${caught ? 'DETECTADA   ' : 'SOBREVIVE   '}  ${name}`)
  } finally {
    writeFileSync(path, original)
    restoring = null
  }
}

console.log(`\n${selected.length - survivors} de ${selected.length} mutaciones detectadas.`)
process.exit(survivors === 0 ? 0 : 1)
