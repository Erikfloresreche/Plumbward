import type { Profile } from '@plumbward/packs-sdk'
import type { RepoScan } from '@plumbward/scanner'

/**
 * Welcome document to the governance of the repository.
 *
 * It is written for someone who does not know what a pre-commit hook is. It is
 * a piece of product, not technical documentation: if the client does not
 * understand what we installed, they do not maintain it and do not renew.
 *
 * English by default; the Spanish variant is chosen with `language: es` in the
 * profile (F0-45). Moving both to catalogues is F1-2.
 */
export function governanceDoc(scan: RepoScan, profile: Profile): string {
  return profile.language === 'es' ? governanceDocEs(scan, profile) : governanceDocEn(scan, profile)
}

/** Rule files the profile generates, as a Markdown list of paths. */
function ruleFiles(profile: Profile): string {
  return `${profile.aiAssistants.includes('cursor') ? ' `.cursorrules`' : ''}${
    profile.aiAssistants.includes('claude') ? ', `CLAUDE.md`' : ''
  }`
}

function governanceDocEn(scan: RepoScan, profile: Profile): string {
  const stack = scan.primaryStack
  const modeText =
    profile.mode === 'greenfield'
      ? {
          name: 'Strict (new project)',
          explanation:
            'The repository is small, so the rules apply to all the code from day one. It is the best moment to do it: the later you start, the more it costs.',
        }
      : profile.mode === 'ratchet'
        ? {
            name: 'Ratchet (progressive)',
            explanation:
              'The strict rules apply **only to the code you write from now on**. The old code stays as it is and nobody has to stop to fix the past. Every week that goes by, the share of code under control grows on its own.',
          }
        : {
            name: 'Non-disruptive',
            explanation:
              'The repository is large. A snapshot of its current state (the *baseline*) was saved, and only the files each Pull Request touches are audited. Nothing that already works is affected.',
          }

  return `# Governance of this repository

This document explains, taking nothing for granted, what was set up in the
project, why, and what you have to do day to day.

## In one sentence

Automatic checks were installed that review the code before it reaches a
person, so that reviews stop being spent on spotting typos and go to what
really matters.

## What was detected in the project

| Item | Value |
|---|---|
| Stack | ${stack?.name ?? 'undetermined'} |
| Frameworks | ${stack?.frameworks.length ? stack.frameworks.join(', ') : '—'} |
| Package manager | ${stack?.packageManager ?? 'npm'} |
| Size | ~${scan.sloc.total.toLocaleString('en-US')} lines of code |
| Governance mode | **${modeText.name}** |

### What the "${modeText.name}" mode means

${modeText.explanation}

## What was installed

### 1. Checks before every commit

On \`git commit\`, and **only on the files you are committing**, these run
automatically:

- The **formatter**, which tidies the code so every file looks the same. No
  more arguing about style.
- The **linter**, which catches frequent mistakes before they reach review.
- A **secret scanner**, which stops a password or a token from being published
  in the git history. This matters: once a secret enters the history, removing
  it is an incident, not a fix.

In a hurry and need to skip the check? \`git commit --no-verify\`.
The pipeline will run it again anyway.

### 2. Checks on every Pull Request

In \`.github/workflows/\` there are pipelines that, on every PR, check types,
linter, tests, build and secrets. They also warn (without blocking) when:

- The PR is so large that nobody is really going to review it.
- New code is added without any test.

### 3. Rules for AI assistants

The rule files${ruleFiles(profile)} tell Cursor, Claude or Copilot how code is
written **in this particular project**: which patterns to use, what not to
touch and what is forbidden.

Without them, each person on the team gets a different architecture from the
same prompt, and technical debt multiplies without anyone noticing until it is
too late.

### 4. Unified commands

Type \`make\` at the root of the project to see everything you can do. The
commands are the same in every governed project, so switching repositories no
longer has a learning cost.

\`\`\`bash
make setup   # installs everything and prepares the environment
make dev     # starts the project
make check   # runs the same as the pipeline, locally
\`\`\`

## Frequently asked questions

**A commit failed and I do not understand the message.**
Run \`make check\`: you will see the same error with more context. If it is
still unclear, run \`npx @plumbward/cli doctor\`, which diagnoses it and
proposes the fix.

**The scanner says there is a secret and there is none.**
It is a false positive. Add an exception in \`.gitleaks.toml\`, in the
\`[allowlist]\` section, and explain in the commit why it is not a secret.

**Can I change these rules?**
Yes. The configuration is in \`.governance/config.yml\` and is versioned like
any other file: the change is proposed in a PR and discussed. What you must
not edit by hand is the content between the
\`plumbward:begin\` / \`plumbward:end\` markers, because it is regenerated on
upgrade.

**What if this gets in our way?**
\`npx @plumbward/cli rollback\` leaves the repository exactly as it was before
the installation. There is nothing to uninstall by hand.

---

*Set up with the governance CLI. This file can be edited freely.*
`
}

function governanceDocEs(scan: RepoScan, profile: Profile): string {
  const stack = scan.primaryStack
  const modeText =
    profile.mode === 'greenfield'
      ? {
          name: 'Estricto (proyecto nuevo)',
          explanation:
            'El repositorio es pequeño, así que las reglas se aplican a todo el código desde el primer día. Es el mejor momento para hacerlo: cuanto más tarde se empieza, más caro sale.',
        }
      : profile.mode === 'ratchet'
        ? {
            name: 'Trinquete (progresivo)',
            explanation:
              'Las reglas estrictas se aplican **sólo al código que escribís a partir de ahora**. El código antiguo se queda como está y nadie tiene que parar a arreglar el pasado. Cada semana que pasa, el porcentaje de código bajo control sube solo.',
          }
        : {
            name: 'No disruptivo',
            explanation:
              'El repositorio es grande. Se ha guardado una foto del estado actual (la *baseline*) y sólo se auditan los ficheros que toca cada Pull Request. Nada de lo que ya funciona se ve afectado.',
          }

  return `# Gobernanza de este repositorio

Este documento explica, sin dar nada por sabido, qué se ha configurado en el
proyecto, por qué, y qué tenéis que hacer en el día a día.

## En una frase

Se han instalado unas comprobaciones automáticas que revisan el código antes de
que llegue a una persona, para que las revisiones dejen de gastarse en detectar
erratas y se dediquen a lo que de verdad importa.

## Qué se ha detectado en el proyecto

| Dato | Valor |
|---|---|
| Stack | ${stack?.name ?? 'sin determinar'} |
| Frameworks | ${stack?.frameworks.length ? stack.frameworks.join(', ') : '—'} |
| Gestor de paquetes | ${stack?.packageManager ?? 'npm'} |
| Tamaño | ~${scan.sloc.total.toLocaleString('es-ES')} líneas de código |
| Modo de gobernanza | **${modeText.name}** |

### Qué significa el modo "${modeText.name}"

${modeText.explanation}

## Qué se ha instalado

### 1. Comprobaciones antes de cada commit

Al hacer \`git commit\`, y **sólo sobre los ficheros que estás guardando**, se
ejecutan automáticamente:

- El **formateador**, que ordena el código para que todos los ficheros se vean
  igual. No tenéis que discutir de estilo nunca más.
- El **linter**, que detecta errores frecuentes antes de que lleguen a revisión.
- Un **escáner de secretos**, que impide que una contraseña o un token acaben
  publicados en el historial de git. Esto es importante: una vez un secreto entra
  en el historial, quitarlo es un incidente, no una corrección.

¿Tienes prisa y necesitas saltarte la comprobación? \`git commit --no-verify\`.
El pipeline la volverá a hacer de todas formas.

### 2. Comprobaciones en cada Pull Request

En \`.github/workflows/\` hay pipelines que, en cada PR, comprueban tipos, linter,
pruebas, build y secretos. Además avisan (sin bloquear) cuando:

- La PR es tan grande que nadie la va a revisar de verdad.
- Se añade código nuevo sin ninguna prueba.

### 3. Reglas para los asistentes de IA

Los ficheros de reglas${ruleFiles(profile)} le dicen a Cursor, Claude o Copilot cómo se
escribe el código **en este proyecto concreto**: qué patrones usar, qué no tocar
y qué está prohibido.

Sin esto, cada persona del equipo obtiene una arquitectura distinta del mismo
prompt, y la deuda técnica se multiplica sin que nadie lo note hasta que es tarde.

### 4. Comandos unificados

Escribe \`make\` en la raíz del proyecto para ver todo lo que puedes hacer. Los
comandos son los mismos en todos los proyectos gobernados, así que cambiar de
repositorio deja de tener coste de aprendizaje.

\`\`\`bash
make setup   # instala todo y prepara el entorno
make dev     # arranca el proyecto
make check   # ejecuta lo mismo que el pipeline, en local
\`\`\`

## Preguntas frecuentes

**Un commit me ha fallado y no entiendo el mensaje.**
Ejecuta \`make check\`: verás el mismo error con más contexto. Si sigue sin quedar
claro, ejecuta \`npx @plumbward/cli doctor\`, que diagnostica y propone el arreglo.

**El escáner dice que hay un secreto y no lo hay.**
Es un falso positivo. Añade una excepción en \`.gitleaks.toml\`, en la sección
\`[allowlist]\`, y explica en el commit por qué no es un secreto.

**¿Puedo cambiar estas reglas?**
Sí. La configuración está en \`.governance/config.yml\` y está versionada como
cualquier otro fichero: se propone el cambio en una PR y se discute. Lo que no
debéis editar a mano es el contenido entre los marcadores
\`plumbward:begin\` / \`plumbward:end\`, porque se regenera al actualizar.

**¿Y si esto nos estorba?**
\`npx @plumbward/cli rollback\` deja el repositorio exactamente como estaba antes
de la instalación. No hay nada que desinstalar a mano.

---

*Configurado con la CLI de gobernanza. Este fichero se puede editar libremente.*
`
}
