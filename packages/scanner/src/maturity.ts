import type { MaturityReport, MaturitySignal } from './types.js'

interface SignalDefinition {
  readonly id: string
  readonly label: string
  readonly weight: number
  readonly hint: string
  readonly matches: (has: (pattern: string | RegExp) => boolean) => boolean
}

/**
 * DevSecOps maturity signals.
 *
 * The weight reflects how much pain each one prevents, not how hard it is to
 * put in place. This report is the commercial piece of the tool: it is what the
 * client is shown before buying and what justifies the renewal a year later.
 */
const SIGNALS: readonly SignalDefinition[] = [
  {
    id: 'ci',
    label: 'Integración continua',
    weight: 15,
    hint: 'Sin CI, cada PR se valida a ojo. Es la base de todo lo demás.',
    matches: (has) =>
      has(/^\.github\/workflows\/.+\.ya?ml$/) ||
      has('.gitlab-ci.yml') ||
      has('Jenkinsfile') ||
      has(/^\.circleci\//),
  },
  {
    id: 'tests',
    label: 'Suite de pruebas',
    weight: 15,
    hint: 'Sin tests, el código generado por IA entra sin red de seguridad.',
    matches: (has) =>
      has(/(^|\/)(tests?|__tests__|spec)\//i) ||
      has(/\.(test|spec)\.[jt]sx?$/) ||
      has(/_test\.go$/) ||
      has(/(^|\/)test_.+\.py$/),
  },
  {
    id: 'linter',
    label: 'Linter configurado',
    weight: 12,
    hint: 'Automatiza la mitad de los comentarios que hoy escribe un senior en cada PR.',
    matches: (has) =>
      has(/^(eslint\.config\.[mc]?[jt]s|\.eslintrc(\.[a-z]+)?)$/) ||
      has('biome.json') ||
      has('biome.jsonc') ||
      has(/^\.?ruff\.toml$/) ||
      has('phpstan.neon') ||
      has('.golangci.yml') ||
      has('.golangci.yaml'),
  },
  {
    id: 'formatter',
    label: 'Formateador y estilo unificado',
    weight: 6,
    hint: 'Elimina los diffs de formato que ensucian las revisiones.',
    matches: (has) =>
      has(/^\.prettierrc/) ||
      has('prettier.config.js') ||
      has('.editorconfig') ||
      has('biome.json') ||
      has('.php-cs-fixer.dist.php'),
  },
  {
    id: 'hooks',
    label: 'Hooks de pre-commit',
    weight: 12,
    hint: 'Detiene los problemas antes del push, no en la revisión.',
    matches: (has) =>
      has(/^\.husky\//) || has('.pre-commit-config.yaml') || has('lefthook.yml'),
  },
  {
    id: 'secrets',
    label: 'Escaneo de secretos',
    weight: 14,
    hint: 'Un token filtrado por un asistente de IA es la brecha más común y más cara.',
    matches: (has) =>
      has('.gitleaks.toml') ||
      has('gitleaks.toml') ||
      has(/^\.github\/workflows\/.*(gitleaks|secret|trufflehog).*\.ya?ml$/i) ||
      has('.trufflehogignore'),
  },
  {
    id: 'ai-rules',
    label: 'Reglas de contexto para asistentes de IA',
    weight: 12,
    hint: 'Sin ellas, cada desarrollador obtiene una arquitectura distinta del mismo prompt.',
    matches: (has) =>
      has('.cursorrules') ||
      has(/^\.cursor\/rules\//) ||
      has('CLAUDE.md') ||
      has('.clauderules') ||
      has('AGENTS.md') ||
      has('.github/copilot-instructions.md'),
  },
  {
    id: 'containers',
    label: 'Entorno contenedorizado',
    weight: 8,
    hint: 'Acaba con el "en mi máquina funciona" y acelera el alta de nuevos perfiles.',
    matches: (has) =>
      has(/^Dockerfile/) || has(/^docker-compose\.ya?ml$/) || has(/^compose\.ya?ml$/),
  },
  {
    id: 'devcontainer',
    label: 'DevContainer',
    weight: 4,
    hint: 'Un clon y a trabajar: entorno idéntico para todo el equipo.',
    matches: (has) => has(/^\.devcontainer\//),
  },
  {
    id: 'codeowners',
    label: 'CODEOWNERS',
    weight: 5,
    hint: 'Enruta cada PR a quien de verdad conoce esa parte del código.',
    matches: (has) => has(/(^|\/)CODEOWNERS$/),
  },
  {
    id: 'dependency-updates',
    label: 'Actualización automática de dependencias',
    weight: 5,
    hint: 'Evita que la deuda de seguridad se acumule en silencio.',
    matches: (has) =>
      has('renovate.json') || has('.github/dependabot.yml') || has('.renovaterc.json'),
  },
  {
    id: 'docs',
    label: 'README y documentación de arranque',
    weight: 4,
    hint: 'Es lo primero que lee tanto un desarrollador nuevo como un asistente de IA.',
    matches: (has) => has(/^README(\.md)?$/i),
  },
  {
    id: 'security-policy',
    label: 'Política de seguridad',
    weight: 3,
    hint: 'Requisito habitual en auditorías y en ventas a empresa.',
    matches: (has) => has(/(^|\/)SECURITY\.md$/i),
  },
  {
    id: 'env-example',
    label: 'Plantilla de variables de entorno',
    weight: 5,
    hint: 'Documenta qué secretos hacen falta sin publicar ninguno.',
    matches: (has) => has(/^\.env\.(example|sample|template)$/),
  },
]

/**
 * Assesses the maturity of the repository from its file listing.
 *
 * It works on the listing the scanner already obtained: it does not touch the
 * disk again.
 */
export function assessMaturity(files: readonly string[]): MaturityReport {
  const fileSet = new Set(files)

  const has = (pattern: string | RegExp): boolean => {
    if (typeof pattern === 'string') return fileSet.has(pattern)
    return files.some((file) => pattern.test(file))
  }

  const signals: MaturitySignal[] = SIGNALS.map((definition) => ({
    id: definition.id,
    label: definition.label,
    weight: definition.weight,
    hint: definition.hint,
    present: definition.matches(has),
  }))

  const maxScore = signals.reduce((sum, signal) => sum + signal.weight, 0)
  const earned = signals.reduce((sum, signal) => sum + (signal.present ? signal.weight : 0), 0)

  return {
    score: maxScore === 0 ? 0 : Math.round((earned / maxScore) * 100),
    signals,
    missing: signals.filter((signal) => !signal.present).sort((a, b) => b.weight - a.weight),
  }
}
