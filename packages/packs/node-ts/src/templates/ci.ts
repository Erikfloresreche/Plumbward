import type { PackageManager } from '@plumbward/core'
import type { OutputLanguage, Profile } from '@plumbward/packs-sdk'
import type { GovernanceMode } from '@plumbward/scanner'

/** Reproducible install command for each package manager. */
function installCommand(manager: PackageManager): string {
  switch (manager) {
    case 'pnpm':
      return 'pnpm install --frozen-lockfile'
    case 'yarn':
      return 'yarn install --immutable'
    case 'bun':
      return 'bun install --frozen-lockfile'
    default:
      return 'npm ci'
  }
}

function runCommand(manager: PackageManager, script: string): string {
  switch (manager) {
    case 'pnpm':
      return `pnpm run ${script}`
    case 'yarn':
      return `yarn ${script}`
    case 'bun':
      return `bun run ${script}`
    default:
      return `npm run ${script}`
  }
}

/**
 * Validation workflow for every Pull Request.
 *
 * It is the heart of the value proposition: what is automated here is exactly
 * what a senior reviews by hand today on every AI-generated PR.
 *
 * English by default; the Spanish variant is chosen with `language: es` in the
 * profile (F0-45). Job ids are identifiers, not text: they are the same in both
 * languages, so a check required by branch protection does not change name.
 */
export function ciDevWorkflow(
  manager: PackageManager,
  mode: GovernanceMode,
  profile: Profile,
  pushBranches: readonly string[],
): string {
  return profile.language === 'es'
    ? ciDevWorkflowEs(manager, mode, profile, pushBranches)
    : ciDevWorkflowEn(manager, mode, profile, pushBranches)
}

/** Staging deploy workflow. Commented and ready to complete. */
export function ciStagingWorkflow(manager: PackageManager, profile: Profile): string {
  return profile.language === 'es'
    ? ciStagingWorkflowEs(manager, profile)
    : ciStagingWorkflowEn(manager, profile)
}

/**
 * Production deploy workflow, with a manual approval gate. It is only called
 * when the team has explicitly configured `branches.release`: nothing is ever
 * deployed from an inferred branch (ADR 0005).
 */
export function ciProdWorkflow(
  manager: PackageManager,
  release: string,
  language: OutputLanguage,
): string {
  return language === 'es' ? ciProdWorkflowEs(manager, release) : ciProdWorkflowEn(manager, release)
}

/** Setup block shared by every workflow: checkout, package manager and Node. */
function setupStepsEn(manager: PackageManager, fullHistory: boolean): string {
  const managerSetup =
    manager === 'pnpm'
      ? [
          '      # Installs pnpm before Node so the dependency cache works.',
          '      - name: Install pnpm',
          '        uses: pnpm/action-setup@v4',
          '',
        ].join('\n')
      : manager === 'bun'
        ? [
            '      - name: Install Bun',
            '        uses: oven-sh/setup-bun@v2',
            '',
          ].join('\n')
        : ''

  const cache = manager === 'bun' ? '' : `\n          cache: ${manager}`

  return [
    '      - name: Check out the code',
    '        uses: actions/checkout@v4',
    ...(fullHistory
      ? [
          '        with:',
          '          # Full history: the ratchet needs to compare against the base branch.',
          '          fetch-depth: 0',
        ]
      : []),
    '',
    managerSetup,
    '      - name: Set up Node.js',
    '        uses: actions/setup-node@v4',
    '        with:',
    '          node-version-file: .nvmrc' + cache,
    '',
    '      - name: Install dependencies',
    `        run: ${installCommand(manager)}`,
  ]
    .filter((line) => line !== '')
    .join('\n')
}

function ciDevWorkflowEn(
  manager: PackageManager,
  mode: GovernanceMode,
  profile: Profile,
  pushBranches: readonly string[],
): string {
  const strict = profile.strictness === 'strict'
  const ratchetNote =
    mode === 'greenfield'
      ? 'The repository is small: quality is required on ALL the code.'
      : mode === 'ratchet'
        ? 'Ratchet mode: the strict rules apply to the code that changes, not to legacy code.'
        : 'Non-disruptive mode: only the files this PR touches are audited.'

  return `# ---------------------------------------------------------------------------
# Pull Request validation
#
# ${ratchetNote}
#
# This file is managed by the governance CLI. You can add your own jobs at the
# end; the ones inside the markers are regenerated on update.
# ---------------------------------------------------------------------------
name: CI · PR validation

# Runs on EVERY Pull Request, whatever branch it targets. Filtering by target
# branch left unreviewed the PRs aimed at a branch the tool had not identified
# as the main one.
on:
  pull_request:
${pushBranches.length > 0 ? `  push:
    branches: [${pushBranches.join(', ')}]
` : ''}
# Cancels older runs on the same branch: saves CI minutes and money.
concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read
  pull-requests: read

jobs:
  quality:
    name: Code quality
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
${setupStepsEn(manager, mode !== 'greenfield')}

      # Typing is the first line of defence against AI-generated code: it
      # catches invented APIs before anyone reads them.
      - name: Type check
        run: ${runCommand(manager, 'typecheck')}

      - name: Linter
        run: ${runCommand(manager, 'lint')}

      - name: Tests
        run: ${runCommand(manager, 'test')}

      - name: Build
        run: ${runCommand(manager, 'build')}

  secrets:
    name: Secret scanning
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - name: Check out the code
        uses: actions/checkout@v4
        with:
          # Full history: a secret can be in an earlier commit of the branch.
          fetch-depth: 0

      # A token leaked by an AI assistant is the most frequent security incident
      # and the most expensive one to revert. This job is non-negotiable.
      - name: Gitleaks
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}

  governance:
    name: Governance rules
    runs-on: ubuntu-latest
    timeout-minutes: 10
    if: github.event_name == 'pull_request'

    steps:
      - name: Check out the code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      # A huge PR is not reviewed: it is approved blindly. This warning is the
      # cheapest measure there is to get real reviews back.
      - name: Check the PR size
        run: |
          BASE="origin/\${{ github.base_ref }}"
          git fetch --no-tags --depth=1 origin "\${{ github.base_ref }}"
          ADDED=$(git diff --shortstat "$BASE"...HEAD | grep -oE '[0-9]+ insertion' | grep -oE '[0-9]+' || echo 0)
          echo "Lines added: $ADDED"
          if [ "$ADDED" -gt ${strict ? 400 : 800} ]; then
            echo "::warning::This PR adds $ADDED lines. Above ${strict ? 400 : 800} a review loses effectiveness: consider splitting it."
          fi

      - name: Check that new code comes with tests
        run: |
          BASE="origin/\${{ github.base_ref }}"
          git fetch --no-tags --depth=1 origin "\${{ github.base_ref }}"
          SOURCE=$(git diff --name-only --diff-filter=A "$BASE"...HEAD | grep -E '\\.(ts|tsx|js|jsx)$' | grep -vE '\\.(test|spec)\\.' | wc -l | tr -d ' ')
          TESTS=$(git diff --name-only --diff-filter=A "$BASE"...HEAD | grep -E '\\.(test|spec)\\.' | wc -l | tr -d ' ')
          echo "New source files: $SOURCE · New test files: $TESTS"
          if [ "$SOURCE" -gt 0 ] && [ "$TESTS" -eq 0 ]; then
            echo "::warning::$SOURCE source files are added without any new test."
          fi
`
}

function ciStagingWorkflowEn(manager: PackageManager, profile: Profile): string {
  const staging = profile.branches.staging ?? 'staging'

  return `# ---------------------------------------------------------------------------
# Deploy to STAGING
#
# Triggered when integrating into "${staging}". It repeats the validations
# before deploying: nothing that has not passed quality is ever deployed.
#
# The deploy step is commented out on purpose: uncomment it and fill in the
# secrets once the provider is configured.
# ---------------------------------------------------------------------------
name: CD · Staging

on:
  push:
    branches: [${staging}]
  workflow_dispatch: # Lets you run it by hand from the Actions tab.

concurrency:
  group: staging
  cancel-in-progress: false # Never cancel a deploy halfway.

permissions:
  contents: read

jobs:
  deploy:
    name: Deploy to staging
    runs-on: ubuntu-latest
    environment: staging # Configure manual approvals here if you need them.
    timeout-minutes: 20

    steps:
${setupStepsEn(manager, false)}

      - name: Build
        run: ${runCommand(manager, 'build')}

      # ---------------------------------------------------------------------
      # DEPLOY — uncomment the block of your provider and add the secrets
      # in Settings > Secrets and variables > Actions.
      # ---------------------------------------------------------------------
      # - name: Deploy to Vercel
      #   run: npx vercel deploy --token=\${{ secrets.VERCEL_TOKEN }}
      #
      # - name: Publish Docker image
      #   run: |
      #     echo "\${{ secrets.REGISTRY_PASSWORD }}" | docker login -u "\${{ secrets.REGISTRY_USER }}" --password-stdin \${{ vars.REGISTRY_URL }}
      #     docker build -t \${{ vars.REGISTRY_URL }}/app:\${{ github.sha }} .
      #     docker push \${{ vars.REGISTRY_URL }}/app:\${{ github.sha }}

      - name: Configuration reminder
        run: echo "::notice::The staging deploy is not configured yet in .github/workflows/ci-staging.yml"
`
}

function ciProdWorkflowEn(manager: PackageManager, release: string): string {
  return `# ---------------------------------------------------------------------------
# Deploy to PRODUCTION
#
# Only triggered from "${release}", and it requires manual approval through
# the "production" environment of GitHub (Settings > Environments).
#
# Configure the required reviewers there: it is the last barrier before the
# code reaches the users.
# ---------------------------------------------------------------------------
name: CD · Production

on:
  push:
    branches: [${release}]
  workflow_dispatch:

concurrency:
  group: production
  cancel-in-progress: false

permissions:
  contents: read

jobs:
  deploy:
    name: Deploy to production
    runs-on: ubuntu-latest
    environment: production # Add required reviewers in the environment settings.
    timeout-minutes: 30

    steps:
${setupStepsEn(manager, false)}

      - name: Type check
        run: ${runCommand(manager, 'typecheck')}

      - name: Tests
        run: ${runCommand(manager, 'test')}

      - name: Build
        run: ${runCommand(manager, 'build')}

      # ---------------------------------------------------------------------
      # DEPLOY — uncomment the block of your provider.
      # ---------------------------------------------------------------------
      # - name: Deploy to Vercel (production)
      #   run: npx vercel deploy --prod --token=\${{ secrets.VERCEL_TOKEN }}

      - name: Configuration reminder
        run: echo "::notice::The production deploy is not configured yet in .github/workflows/ci-prod.yml"
`
}

/** Spanish variant of `setupStepsEn`. */
function setupStepsEs(manager: PackageManager, fullHistory: boolean): string {
  const managerSetup =
    manager === 'pnpm'
      ? [
          '      # Instala pnpm antes que Node para que la caché de dependencias funcione.',
          '      - name: Instalar pnpm',
          '        uses: pnpm/action-setup@v4',
          '',
        ].join('\n')
      : manager === 'bun'
        ? [
            '      - name: Instalar Bun',
            '        uses: oven-sh/setup-bun@v2',
            '',
          ].join('\n')
        : ''

  const cache = manager === 'bun' ? '' : `\n          cache: ${manager}`

  return [
    '      - name: Descargar el código',
    '        uses: actions/checkout@v4',
    ...(fullHistory
      ? [
          '        with:',
          '          # Historial completo: el trinquete necesita comparar contra la rama base.',
          '          fetch-depth: 0',
        ]
      : []),
    '',
    managerSetup,
    '      - name: Preparar Node.js',
    '        uses: actions/setup-node@v4',
    '        with:',
    '          node-version-file: .nvmrc' + cache,
    '',
    '      - name: Instalar dependencias',
    `        run: ${installCommand(manager)}`,
  ]
    .filter((line) => line !== '')
    .join('\n')
}

/** Spanish variant of `ciDevWorkflowEn`. */
function ciDevWorkflowEs(
  manager: PackageManager,
  mode: GovernanceMode,
  profile: Profile,
  pushBranches: readonly string[],
): string {
  const strict = profile.strictness === 'strict'
  const ratchetNote =
    mode === 'greenfield'
      ? 'El repositorio es pequeño: se exige calidad sobre TODO el código.'
      : mode === 'ratchet'
        ? 'Modo trinquete: las reglas estrictas se aplican al código que cambia, no al legado.'
        : 'Modo no disruptivo: sólo se auditan los ficheros que toca esta PR.'

  return `# ---------------------------------------------------------------------------
# Validación de Pull Requests
#
# ${ratchetNote}
#
# Este fichero lo gestiona la CLI de gobernanza. Puedes añadir jobs propios al
# final; los que están dentro de los marcadores se regenerarán al actualizar.
# ---------------------------------------------------------------------------
name: CI · Validación de PR

# Se ejecuta en TODAS las Pull Requests, vayan a la rama que vayan. Filtrar por
# rama de destino dejaba sin revisar las PRs dirigidas a una rama que la
# herramienta no había identificado como principal.
on:
  pull_request:
${pushBranches.length > 0 ? `  push:
    branches: [${pushBranches.join(', ')}]
` : ''}
# Cancela ejecuciones antiguas de la misma rama: ahorra minutos de CI y dinero.
concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read
  pull-requests: read

jobs:
  quality:
    name: Calidad de código
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
${setupStepsEs(manager, mode !== 'greenfield')}

      # El tipado es la primera línea de defensa contra el código generado por IA:
      # detecta invenciones de API antes de que nadie las lea.
      - name: Comprobación de tipos
        run: ${runCommand(manager, 'typecheck')}

      - name: Linter
        run: ${runCommand(manager, 'lint')}

      - name: Pruebas
        run: ${runCommand(manager, 'test')}

      - name: Build
        run: ${runCommand(manager, 'build')}

  secrets:
    name: Escaneo de secretos
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - name: Descargar el código
        uses: actions/checkout@v4
        with:
          # Historial completo: un secreto puede estar en un commit anterior de la rama.
          fetch-depth: 0

      # Un token filtrado por un asistente de IA es la incidencia de seguridad
      # más frecuente y la más cara de revertir. Este job es innegociable.
      - name: Gitleaks
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}

  governance:
    name: Reglas de gobernanza
    runs-on: ubuntu-latest
    timeout-minutes: 10
    if: github.event_name == 'pull_request'

    steps:
      - name: Descargar el código
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      # Una PR enorme no se revisa: se aprueba a ciegas. Este aviso es la medida
      # más barata que existe para recuperar revisiones de verdad.
      - name: Comprobar el tamaño de la PR
        run: |
          BASE="origin/\${{ github.base_ref }}"
          git fetch --no-tags --depth=1 origin "\${{ github.base_ref }}"
          CAMBIOS=$(git diff --shortstat "$BASE"...HEAD | grep -oE '[0-9]+ insertion' | grep -oE '[0-9]+' || echo 0)
          echo "Líneas añadidas: $CAMBIOS"
          if [ "$CAMBIOS" -gt ${strict ? 400 : 800} ]; then
            echo "::warning::Esta PR añade $CAMBIOS líneas. Por encima de ${strict ? 400 : 800} la revisión pierde eficacia: considera dividirla."
          fi

      - name: Comprobar que el código nuevo lleva pruebas
        run: |
          BASE="origin/\${{ github.base_ref }}"
          git fetch --no-tags --depth=1 origin "\${{ github.base_ref }}"
          FUENTE=$(git diff --name-only --diff-filter=A "$BASE"...HEAD | grep -E '\\.(ts|tsx|js|jsx)$' | grep -vE '\\.(test|spec)\\.' | wc -l | tr -d ' ')
          PRUEBAS=$(git diff --name-only --diff-filter=A "$BASE"...HEAD | grep -E '\\.(test|spec)\\.' | wc -l | tr -d ' ')
          echo "Ficheros de código nuevos: $FUENTE · Ficheros de prueba nuevos: $PRUEBAS"
          if [ "$FUENTE" -gt 0 ] && [ "$PRUEBAS" -eq 0 ]; then
            echo "::warning::Se añaden $FUENTE ficheros de código sin ninguna prueba nueva."
          fi
`
}

/** Spanish variant of `ciStagingWorkflowEn`. */
function ciStagingWorkflowEs(manager: PackageManager, profile: Profile): string {
  const staging = profile.branches.staging ?? 'staging'

  return `# ---------------------------------------------------------------------------
# Despliegue a STAGING
#
# Se dispara al integrar en "${staging}". Antes de desplegar repite las
# validaciones: nunca se despliega algo que no ha pasado por calidad.
#
# El paso de despliegue está comentado a propósito: descoméntalo y rellena los
# secretos cuando tengas el proveedor configurado.
# ---------------------------------------------------------------------------
name: CD · Staging

on:
  push:
    branches: [${staging}]
  workflow_dispatch: # Permite lanzarlo a mano desde la pestaña Actions.

concurrency:
  group: staging
  cancel-in-progress: false # Nunca canceles un despliegue a medias.

permissions:
  contents: read

jobs:
  deploy:
    name: Desplegar a staging
    runs-on: ubuntu-latest
    environment: staging # Configura aquí las aprobaciones manuales si las necesitas.
    timeout-minutes: 20

    steps:
${setupStepsEs(manager, false)}

      - name: Build
        run: ${runCommand(manager, 'build')}

      # ---------------------------------------------------------------------
      # DESPLIEGUE — descomenta el bloque de tu proveedor y añade los secretos
      # en Settings > Secrets and variables > Actions.
      # ---------------------------------------------------------------------
      # - name: Desplegar en Vercel
      #   run: npx vercel deploy --token=\${{ secrets.VERCEL_TOKEN }}
      #
      # - name: Publicar imagen Docker
      #   run: |
      #     echo "\${{ secrets.REGISTRY_PASSWORD }}" | docker login -u "\${{ secrets.REGISTRY_USER }}" --password-stdin \${{ vars.REGISTRY_URL }}
      #     docker build -t \${{ vars.REGISTRY_URL }}/app:\${{ github.sha }} .
      #     docker push \${{ vars.REGISTRY_URL }}/app:\${{ github.sha }}

      - name: Recordatorio de configuración
        run: echo "::notice::Despliegue a staging pendiente de configurar en .github/workflows/ci-staging.yml"
`
}

/** Spanish variant of `ciProdWorkflowEn`. */
function ciProdWorkflowEs(manager: PackageManager, release: string): string {
  return `# ---------------------------------------------------------------------------
# Despliegue a PRODUCCIÓN
#
# Sólo se dispara desde "${release}" y exige aprobación manual a
# través del entorno "production" de GitHub (Settings > Environments).
#
# Configura ahí los revisores obligatorios: es la última barrera antes de que el
# código llegue a los usuarios.
# ---------------------------------------------------------------------------
name: CD · Producción

on:
  push:
    branches: [${release}]
  workflow_dispatch:

concurrency:
  group: production
  cancel-in-progress: false

permissions:
  contents: read

jobs:
  deploy:
    name: Desplegar a producción
    runs-on: ubuntu-latest
    environment: production # Añade revisores obligatorios en la configuración del entorno.
    timeout-minutes: 30

    steps:
${setupStepsEs(manager, false)}

      - name: Comprobación de tipos
        run: ${runCommand(manager, 'typecheck')}

      - name: Pruebas
        run: ${runCommand(manager, 'test')}

      - name: Build
        run: ${runCommand(manager, 'build')}

      # ---------------------------------------------------------------------
      # DESPLIEGUE — descomenta el bloque de tu proveedor.
      # ---------------------------------------------------------------------
      # - name: Desplegar en Vercel (producción)
      #   run: npx vercel deploy --prod --token=\${{ secrets.VERCEL_TOKEN }}

      - name: Recordatorio de configuración
        run: echo "::notice::Despliegue a producción pendiente de configurar en .github/workflows/ci-prod.yml"
`
}
