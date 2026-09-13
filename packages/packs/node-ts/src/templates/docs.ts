import type { Profile } from '@plumbward/packs-sdk'
import type { RepoScan } from '@plumbward/scanner'

/**
 * Documento de bienvenida a la gobernanza del repositorio.
 *
 * Está escrito para alguien que no sabe qué es un hook de pre-commit. Es una
 * pieza de producto, no documentación técnica: si el cliente no entiende qué le
 * hemos instalado, no lo mantiene y no renueva.
 */
export function governanceDoc(scan: RepoScan, profile: Profile): string {
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

Los ficheros de reglas${
    profile.aiAssistants.includes('cursor') ? ' `.cursorrules`' : ''
  }${profile.aiAssistants.includes('claude') ? ', `CLAUDE.md`' : ''} le dicen a Cursor, Claude o Copilot cómo se
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
