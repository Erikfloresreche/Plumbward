# Plan de ejecución — Enterprise DevSecOps & AI Governance CLI

> Documento vivo. Es la fuente de verdad del desarrollo del producto: qué se
> construye, en qué orden, en qué rama y con qué criterio se da por terminado.
> Cada tarea se cierra actualizando su casilla en este fichero, dentro de la
> misma Pull Request que la implementa.

**Última actualización:** 2026-09-09
**Estado global:** Fase 0 en curso — F0-1 y F0-5 completadas. Quedan F0-2, F0-3, F0-4 y F0-6 a F0-11.
**Producto:** Plumbward · https://github.com/Erikfloresreche/Plumbward
**Modelo de negocio:** suscripción anual por repositorio — ver
[MODELO_DE_NEGOCIO.md](MODELO_DE_NEGOCIO.md)

> El renombrado de `@governance/*` a `@plumbward/*` es la tarea **F0-8**; hasta
> que se ejecute, el código sigue usando el scope antiguo.

---

## 1. Cómo se usa este documento

1. Se trabaja **una tarea a la vez**, en **su propia rama**, con el identificador
   de la tarea (`F2-4`) en el nombre de la rama y en el cuerpo de la PR.
2. Ninguna tarea empieza sin que sus **dependencias** estén integradas en `develop`.
3. Una tarea sólo se marca `[x]` cuando cumple **todos** sus criterios de
   aceptación y el **Definition of Done universal** (§4).
4. Si durante una tarea aparece trabajo que no estaba previsto: **no se amplía la
   tarea**. Se añade una tarea nueva al final de su fase y se sigue.

---

## 2. Estado actual verificado (baseline)

Comprobado el 2026-09-08 ejecutando `pnpm build` y `pnpm test`: **6 builds
correctos, 24 tests en verde**.

### 2.1 Lo que ya existe y funciona

| Paquete | Responsabilidad | Cobertura |
|---|---|---|
| `@governance/core` | Motor transaccional: `Operation[]` → `ChangePlan` → `apply` con journal, simulación y rollback | Completo |
| `@governance/ast` | Edición no destructiva de JSON y YAML + bloques delimitados por marcadores | Completo, con tests |
| `@governance/scanner` | Estado git, fingerprint, SLOC, detección de stack, informe de madurez 0-100 | Completo para Node y Go |
| `@governance/packs-sdk` | Contrato `StackPack`, DSL de operaciones, registro y suite de conformidad | Completo |
| `@governance/pack-node-ts` | Único pack real: CI, ESLint, Prettier, Husky, Gitleaks, devcontainer, reglas de IA | Completo |
| `@governance/cli` | Comandos `scan`, `plan`, `apply`, `rollback`, `doctor` | Funciona de punta a punta |

### 2.2 Los tres invariantes de arquitectura

Están implementados y **no se revierten sin una ADR que lo justifique**:

- **Nadie escribe en disco por su cuenta.** Todo módulo declara intención
  emitiendo `Operation[]`. Sólo `applyPlan` materializa, y deja journal.
- **`.governance/config.yml` es la fuente de verdad.** La CLI es una función
  determinista de ese fichero: mismo config + mismo repo = mismo plan, siempre.
- **El catálogo de packs es el eje de escalado.** Soportar un stack nuevo es
  publicar un paquete que implemente `StackPack` y pase la conformidad. El
  núcleo no se toca nunca.

### 2.3 Desviaciones deliberadas respecto al PDF original

| PDF | Este proyecto | Motivo |
|---|---|---|
| Reglas descargadas en runtime desde una API | Todo local en el paquete NPM | Un equipo de seguridad corporativo veta la ejecución de lógica remota descargada. Bloquea la venta enterprise. |
| Inyectar `@tu-empresa/ci-guard` que rompe los pipelines del cliente | No se inyecta nada que pueda hacer fallar CI ajena | Es un sabotaje contractual desde el punto de vista del cliente; destruye la confianza que el producto vende. |
| `init` monolítico | `scan` → `plan` → `apply` → `rollback` | Permite regalar `scan` como gancho comercial y hace la herramienta auditable en la PR. |
| Pago único de 1.500-2.500 € con 12 meses de actualizaciones | Suscripción anual por repositorio | Con licencia perpetua, el mes 13 la herramienta sigue funcionando y nadie renueva. Obligaría a degradar lo instalado, que contradice la ADR 0002. Ver [ADR 0004](adr/0004-suscripcion-anual.md). |

### 2.4 Huecos conocidos que este plan cierra

1. El repositorio **no está bajo control de versiones** (no hay `.git`). → F0-1
2. Sólo hay pack de Node: cualquier otro stack recibe un conflicto bloqueante. → Fase 2
3. Todos los textos están hardcodeados en español pese a existir `Profile.language`. → Fase 1
4. Los modos `ratchet` y `non-disruptive` se calculan pero no cambian nada. → Fase 3
5. No existe el wizard `init` ni el comando `upgrade`. → Fase 4
6. No hay licenciamiento. → Fase 5
7. No hay README, LICENSE, CI propio ni publicación. → Fases 0 y 6

---

## 3. Estrategia de ramas, commits y Pull Requests

Este flujo es **dogfooding deliberado**: la generación y protección de esta misma
estrategia es una funcionalidad vendible del producto (tarea F3-5). Toda
fricción que encontremos aquí es un requisito para esa feature.

### 3.1 Ramas permanentes

| Rama | Papel | Protección |
|---|---|---|
| `main` | Sólo releases publicadas. Cada commit es una versión etiquetada. | Sin push directo. Sólo merge desde `develop` vía PR con CI verde. |
| `develop` | Integración continua del trabajo en curso. Siempre debe estar en verde. | Sin push directo. Sólo merge de ramas de tarea vía PR. |

### 3.2 Ramas de tarea

Formato: **`<tipo>/f<fase>-<slug-en-kebab-case>`**

Tipos permitidos: `feat`, `fix`, `refactor`, `test`, `docs`, `build`, `ci`, `chore`.

```
develop ──┬── feat/f2-pack-python ──── PR ──┐
          ├── feat/f2-pack-go ─────── PR ───┼──> develop ──> PR ──> main (release)
          └── docs/f2-guia-packs ──── PR ───┘
```

Reglas:
- Una rama **nace de `develop` actualizado** y muere al integrarse. No se reutiliza.
- Una rama implementa **exactamente una tarea** del plan.
- Merge por **squash**, para que cada tarea sea un commit en `develop`.
- Se borra la rama tras el merge.

### 3.3 Commits

**Los ejecuta siempre una persona, nunca un asistente de IA.** Un asistente deja
los cambios en el árbol de trabajo y entrega el mensaje redactado; quien firma el
commit es quien responde de lo que entra en el historial. Lo mismo aplica a
`push`, `merge`, `rebase` y `reset`, y a cualquier comando que escriba en una
base de datos. Está recogido en `CLAUDE.md`.

Conventional Commits **en inglés**, referenciando la tarea. El código y la
documentación del proyecto están en español; el historial de git no, porque es
la convención dominante y porque sobrevive a un cambio de equipo:

```
feat(pack-python): detect Poetry and uv and generate their pipeline

Implements F2-4. Adds the Python pack with ruff, mypy and pytest support,
selecting the dependency manager from the files present in the repository.
```

`commitlint` lo verifica en el hook `commit-msg` (tarea F0-4).

**Al cerrar cada tarea**, el asistente entrega el mensaje de commit y la
descripción de la PR ya redactados, y pregunta quién revisará la PR. Si no hay
nadie disponible y la PR se bloquearía, puede revisarla él **en contexto nuevo**
—nunca con el historial que produjo el código, porque reproduciría los mismos
puntos ciegos—, entregando hallazgos sin aprobar ni integrar. Detalle en
`CLAUDE.md`.

### 3.4 Cuerpo de la PR

Plantilla obligatoria (se genera en F0-5):

Las descripciones de Pull Request se redactan **en inglés**, igual que los
commits:

```markdown
## Task
F2-4 — Python pack

## What changes and why

## Acceptance criteria
- [ ] (copied from docs/PLAN_DE_EJECUCION.md)

## How this was verified
```

---

## 4. Definition of Done universal

Aplica a **todas** las tareas, además de sus criterios propios:

- [ ] `pnpm build`, `pnpm typecheck` y `pnpm test` en verde en local y en CI.
- [ ] Cero `any` implícitos, cero `@ts-expect-error` sin comentario que lo justifique.
- [ ] Todo retorno público tiene interfaz declarada (regla del PDF, §6.1).
- [ ] Todo fichero **generado para el cliente** lleva comentarios explicativos en
      su idioma configurado (regla del PDF, §6.3).
- [ ] Toda ruta de error nueva puede revertirse: o participa del journal, o no
      escribe (regla del PDF, §6.2).
- [ ] Tests nuevos para el comportamiento nuevo. Los bugs se corrigen con un
      test que falle antes del arreglo.
- [ ] La casilla de la tarea en este documento queda marcada en la misma PR.
- [ ] Ningún asistente ha ejecutado comandos git que modifiquen el estado ni
      escrituras en base de datos: los lanza una persona (ver `CLAUDE.md`).
- [ ] Se han entregado el mensaje de commit y la descripción de la PR en inglés,
      y se ha preguntado quién revisa.

---

## FASE 0 — Fundación del repositorio

**Objetivo:** que el proyecto sea un proyecto: versionado, verificado en CI,
documentado y publicable. Bloquea todo lo demás.
**Estimación:** 1-2 sesiones de trabajo.
**Criterio de salida de fase:** un desarrollador ajeno clona, ejecuta
`pnpm install && pnpm test` y todo funciona sin preguntar nada.

---

### [x] F0-1 — Poner el proyecto bajo control de versiones
**Rama:** `chore/f0-git-bootstrap` · **Depende de:** nada · **Bloquea:** absolutamente todo

**Por qué primero:** hoy todo el trabajo existe sólo en el disco de una máquina.
Cualquier error irreversible lo pierde entero.

**Trabajo:**
1. `git init -b main` en la raíz.
2. Revisar `.gitignore`: ya cubre `node_modules/`, `dist/`, `.turbo/`,
   `coverage/`, `.env*`. Añadir `.DS_Store` (ya está) y `*.log`.
3. Crear `.gitattributes`: `* text=auto eol=lf`, y marcar `pnpm-lock.yaml`
   como `linguist-generated`.
4. Commit inicial: `chore: importa la base del monorepo de gobernanza`.
5. Crear `develop` desde `main` y dejarla como rama activa.
6. Crear el repositorio remoto (privado) y hacer push de ambas ramas.

**Criterios de aceptación:**
- [x] `git log` muestra el commit inicial con todo el árbol de `packages/`.
- [x] `git status` limpio tras un `pnpm install && pnpm build` (nada generado se cuela).
- [x] `main` y `develop` existen en el remoto.

**Cerrada el 2026-09-08.** Commit inicial de 63 ficheros y 440 KB. Además de lo
previsto: se movió a la raíz un `.code-workspace` de VSCode que estaba guardado
por error dentro de `packages/scanner/src/`, y se añadió un README mínimo (el
definitivo es F0-5). La identidad de git se configuró **local al repositorio**,
no global: `Erik Flores Reche <erikfloresreche@gmail.com>`, el correo asociado a
la cuenta personal de GitHub que aloja el repositorio. GitHub atribuye los
commits por dirección de correo, no por nombre, así que usar otra dirección los
vincula a otra cuenta.

---

### [ ] F0-2 — Una única fuente para el número de versión
**Rama:** `build/f0-version-unica` · **Depende de:** F0-1

**Por qué:** `CLI_VERSION` está hardcodeado como `'0.1.0'` en
[context.ts](../packages/cli/src/context.ts). En cuanto publiquemos, el journal
y las cabeceras de fichero gestionado mentirán sobre qué versión generó qué, y
`upgrade` (F4-2) depende de ese dato para decidir si regenera.

**Trabajo:**
1. Inyectar la versión en build time con `define` en
   [tsup.config.ts](../packages/cli/tsup.config.ts), leyendo `package.json`.
2. Sustituir la constante por la variable inyectada, con fallback legible en dev.
3. Test que compara la versión que reporta `governance --version` con la del
   `package.json` del CLI.

**Criterios de aceptación:**
- Cambiar la versión en `package.json` y reconstruir cambia la salida de
  `governance --version` sin tocar código.
- El test falla si alguien vuelve a hardcodearla.

---

### [ ] F0-3 — Pipeline de integración continua propio
**Rama:** `ci/f0-pipeline-propio` · **Depende de:** F0-1

**Por qué:** vendemos CI. No tener CI es un problema de credibilidad además de
uno técnico.

**Trabajo:**
1. `.github/workflows/ci.yml`: se dispara en PR a `develop` y `main`.
   - Matriz Node **18, 20, 22** (el paquete declara `>=18`; hay que probarlo).
   - Pasos: `pnpm install --frozen-lockfile` → `build` → `typecheck` → `test`.
   - Caché de pnpm y de turbo.
2. `.github/workflows/e2e.yml`: los tests E2E sobre repos temporales, separados
   porque son lentos y tocan git de verdad.
3. Ejecutar `gitleaks` sobre nuestro propio repo en cada PR.

**Criterios de aceptación:**
- Una PR con un test roto queda bloqueada en rojo.
- El pipeline completo baja de 5 minutos con caché caliente.
- Node 18 pasa (o, si no pasa, se sube `engines` conscientemente y se documenta).

---

### [ ] F0-4 — Dogfooding: aplicar nuestras propias reglas a este repo
**Rama:** `chore/f0-dogfooding-hooks` · **Depende de:** F0-3

**Por qué:** es la prueba más barata de que el producto sirve, y el mejor sitio
donde detectar que una regla molesta más de lo que aporta.

**Trabajo:**
1. Husky + lint-staged + commitlint (`@commitlint/config-conventional`).
2. ESLint 9 plano + Prettier para el propio monorepo, alineados con lo que
   genera el pack de Node.
3. `.gitleaks.toml` propio.
4. `CODEOWNERS`.
5. Documentar en `CONTRIBUTING.md` (F0-5) cómo saltarse un hook en una
   emergencia y por qué casi nunca debe hacerse.

**Criterios de aceptación:**
- Un commit con mensaje no convencional se rechaza.
- Un commit que introduce una cadena tipo secreto se rechaza.
- `pnpm lint` en verde sobre todo el repo.

---

### [x] F0-5 — Documentación base del proyecto
**Rama:** `docs/f0-documentacion-base` · **Depende de:** F0-1

**Por qué:** sin README no hay demo, ni onboarding, ni conversación de venta.

**Trabajo:**
1. `README.md` raíz: el problema en tres frases, la demo en un bloque
   (`npx @governance/cli scan`), qué instala, los tres invariantes, y el enlace a
   este plan. Escrito para un CTO, no para un contribuidor.
2. `LICENSE` — decidir y documentar el modelo (ver §Riesgos: afecta a Fase 5).
3. `CONTRIBUTING.md` — flujo de ramas de §3, cómo correr los tests, cómo escribir un pack.
4. `SECURITY.md` — canal de reporte de vulnerabilidades. Lo piden en compras enterprise.
5. `docs/ARQUITECTURA.md` — el diagrama de flujo `scan → plan → apply` y por qué
   nadie escribe en disco.
6. `docs/adr/0001-plan-antes-de-aplicar.md` y `0002-licenciamiento-local-first.md` —
   las dos decisiones que más nos van a cuestionar; conviene tener la respuesta escrita.
7. `.github/PULL_REQUEST_TEMPLATE.md` con la plantilla de §3.4.

**Criterios de aceptación:**
- [x] El README permite a alguien sin contexto ejecutar la herramienta en 2 minutos.
- [x] Las ADR explican la decisión, la alternativa descartada y el coste asumido.

**Cerrada el 2026-09-09.** Entregado: `README.md` reescrito para un CTO,
`LICENSE` (BUSL-1.1), `CONTRIBUTING.md`, `SECURITY.md`,
[ARQUITECTURA.md](ARQUITECTURA.md) con el porqué de cada fichero del monorepo, y
`.github/PULL_REQUEST_TEMPLATE.md`.

Se escribieron **tres** ADR en lugar de dos: la licencia del código resultó ser
una decisión distinta de la del licenciamiento técnico y merecía la suya
([0003](adr/0003-licencia-busl.md)).

**Revisión en contexto nuevo (2026-09-09).** La PR se sometió al flujo de F3-6 y
la revisión encontró 12 hallazgos reales, tres de ellos afirmaciones falsas sobre
el propio código que la primera redacción daba por buenas. Corregido todo en la
misma PR. Lo que destapó del código son las tareas nuevas **F0-9, F0-10, F0-11 y
F2-11**.

El hallazgo más grave: el README indicaba `npx aegiscode`, un paquete real de
**otro autor** publicado en npm. Se corrigió y se documentó el conflicto de
nombre en F0-8.

**Pendiente que deja abierto:** el texto de `LICENSE` **debe contrastarse contra
https://mariadb.com/bsl11/** antes de hacer público el repositorio y revisarse
legalmente antes de facturar.

---

### [ ] F0-6 — Versionado y changelog automatizados
**Rama:** `build/f0-changesets` · **Depende de:** F0-3

**Por qué:** son seis paquetes con dependencias `workspace:*`. Versionarlos a
mano acaba en incoherencias, y el cliente paga una suscripción anual por recibir
actualizaciones: tiene que poder leer qué cambió en cada una.

**Trabajo:**
1. Instalar y configurar `@changesets/cli`.
2. Regla en CI: toda PR que toque `packages/**` debe traer un changeset (o
   marcarse explícitamente como `no-release`).
3. Workflow de release: al mergear a `main`, versiona, genera CHANGELOG y publica.
   Se deja **desactivada la publicación real** hasta F6-1.

**Criterios de aceptación:**
- Un changeset en un paquete propaga la subida de versión a sus dependientes.
- El CHANGELOG generado es legible por un cliente, no sólo por nosotros.

---

### [ ] F0-7 — Umbral de cobertura de tests
**Rama:** `test/f0-cobertura-umbral` · **Depende de:** F0-3

**Trabajo:**
1. Activar `coverage` en [vitest.config.ts](../vitest.config.ts) con proveedor `v8`.
2. Umbrales: **90% en `@governance/core`** (es el que puede corromper el repo de
   un cliente), 80% en el resto, sin umbral en las plantillas de texto.
3. Publicar el informe como artefacto de la PR.

**Criterios de aceptación:**
- CI falla si la cobertura de `core` baja del 90%.
- Los umbrales reflejan la cobertura real actual, no un número aspiracional.

---

### [ ] F0-8 — Renombrar el scope de los paquetes a AegisCode
**Rama:** `refactor/f0-scope-aegiscode` · **Depende de:** F0-1 · **Bloquea:** Fase 2

**Por qué antes de la Fase 2:** hoy hay seis paquetes bajo `@governance/*`, un
scope provisional que casi con seguridad está ocupado en NPM. Cada pack nuevo
multiplica los imports que habría que reescribir después, y el README ya
promete `npx aegiscode` mientras el binario se llama `governance`.

**Trabajo:**
1. **Registrar la organización `aegiscode` en npm antes de tocar nada.**
   Comprobado el 2026-09-09: el paquete sin scope `aegiscode` está **ocupado**
   por una herramienta de otro autor (v5.2.33, "AEGIS CLI — AI-powered coding
   assistant"), igual que `aegiscode-cli`. No hay paquetes publicados bajo
   `@aegiscode/`, pero eso no garantiza que la organización esté libre.
   Alternativas comprobadas y libres sin scope: `aegis-code`, `aegis-governance`.
2. Renombrar los seis paquetes a `@aegiscode/*` y actualizar las dependencias
   `workspace:*` de todos los `package.json`.
3. Renombrar el binario de `governance` a `aegiscode`, manteniendo `governance`
   como alias mientras no haya usuarios externos.
4. Decidir si el directorio de estado en el repositorio del cliente pasa de
   `.governance/` a `.aegiscode/`. **Recomendación: mantener `.governance/`** —
   describe la función, no la marca, y así una migración de marca futura no
   obliga a tocar los repositorios ya configurados.
5. Actualizar README, plan y textos de la CLI.

**Criterios de aceptación:**
- `pnpm build && pnpm test` en verde tras el renombrado.
- Ni una referencia a `@governance/` fuera del historial de git.
- El scope de NPM queda registrado a nombre de la empresa.

---

### [ ] F0-9 — Guarda de exhaustividad en el simulador y el renderizador
**Rama:** `fix/f0-exhaustividad-simulate` · **Depende de:** F0-1

**Origen:** revisión de F0-5. El documento de arquitectura afirmaba que añadir un
tipo de operación nuevo obliga al compilador a tratarlo en todas partes. Sólo es
cierto en `executeOperation` y en `plan.ts`.

**Por qué importa:** el `switch` de
[simulate.ts](../packages/core/src/simulate.ts) no tiene `default` ni
aserción `never`. Un séptimo tipo de operación compilaría limpio y sería
**ignorado en silencio por `plan` pero ejecutado por `apply`**. Es exactamente la
divergencia que toda la arquitectura existe para impedir, y hoy nada la detecta.

**Trabajo:**
1. Añadir `default: { const _exhaustivo: never = operation; ... }` al switch de
   `simulatePlan`.
2. Revisar `render.ts`, que hoy no discrimina por `kind` de forma exhaustiva.
3. Test que añada un tipo de operación falso y verifique que el typecheck falla.

**Criterios de aceptación:**
- Añadir un miembro a la unión `Operation` rompe `pnpm typecheck` señalando cada
  sitio que hay que actualizar.

---

### [ ] F0-10 — Contención de rutas resistente a enlaces simbólicos
**Rama:** `fix/f0-symlink-containment` · **Depende de:** F0-1

**Origen:** revisión de F0-5.

**Por qué importa:** `resolveInRepo()` en [fs.ts](../packages/core/src/fs.ts)
compara rutas de forma **léxica**, sin `realpath`. Un enlace simbólico dentro del
repositorio que apunte fuera (`enlace -> /home/usuario/.ssh`) hace que
`enlace/authorized_keys` supere la validación, y `writeFileEnsuringDir` escriba a
través de él. `SECURITY.md` presenta esta función como la barrera principal.

**Trabajo:**
1. Resolver enlaces con `realpath` en el directorio padre existente más cercano
   antes de comparar, sin romper el caso legítimo de crear ficheros nuevos.
2. Decidir la política ante un symlink que apunta fuera: rechazar y reportarlo
   como conflicto, nunca seguirlo en silencio.
3. Tests con un symlink a un directorio externo y con uno interno legítimo.
4. Actualizar `SECURITY.md` y `ARQUITECTURA.md` cuando el hueco esté cerrado.

**Criterios de aceptación:**
- Escribir a través de un symlink que sale del repositorio se rechaza.
- Los symlinks internos legítimos siguen funcionando.

---

### [ ] F0-11 — Reversibilidad de los efectos de la instalación
**Rama:** `feat/f0-rollback-instalacion` · **Depende de:** F0-1

**Origen:** revisión de F0-5.

**Por qué importa:** el producto promete que `rollback` deja el repositorio
idéntico. Hoy sólo es cierto con `--no-install`: las operaciones `execCommand`
devuelven `snapshots: []`, así que el lockfile que reescribe `pnpm add` y el
contenido de `node_modules` quedan fuera del journal. El test E2E y el guion de
prueba de la documentación **usan `--no-install`**, que es como el hueco pasó
desapercibido.

**Trabajo:**
1. Fotografiar los ficheros de manifiesto y de bloqueo (`package.json`,
   `pnpm-lock.yaml`, `composer.lock`, `poetry.lock`...) antes de ejecutar un
   comando de instalación, y registrarlos en el journal.
2. Decidir qué hacer con `node_modules`: probablemente no restaurarlo, pero sí
   **decirlo con claridad** en la salida de `rollback` en lugar de callarlo.
3. Test E2E con instalación real que verifique el ciclo completo.
4. Al cerrar la tarea, retirar la advertencia del README y de `ARQUITECTURA.md`.

**Criterios de aceptación:**
- `apply` con instalación seguido de `rollback` deja el lockfile como estaba.
- `rollback` informa explícitamente de lo que no puede deshacer.

---

## FASE 1 — Internacionalización del motor de plantillas

**Objetivo:** que `Profile.language` funcione de verdad.
**Estimación:** 1-2 sesiones.
**Por qué ahora y no después:** hoy hay **un** pack que traducir. Después de la
Fase 2 habrá cinco. El coste de este refactor se multiplica por cinco si se
pospone, y es exactamente el tipo de deuda que el producto dice combatir.
**Criterio de salida:** `language: en` en el config produce un repositorio
íntegramente en inglés, con la misma estructura de ficheros que `language: es`.

---

### [ ] F1-1 — Paquete `@governance/i18n`
**Rama:** `feat/f1-paquete-i18n` · **Depende de:** Fase 0 completa

**Trabajo:**
1. Paquete nuevo con un catálogo tipado: las claves de `en` derivan del tipo del
   catálogo `es`, de modo que **falte una traducción es un error de compilación**.
2. API mínima: `translator(language)` devuelve una función `t(clave, valores)`
   con interpolación tipada.
3. Soporte para bloques de texto largo (las cabeceras de comentarios de los
   ficheros generados), no sólo cadenas cortas.
4. Decidir y documentar la convención de claves: `pack.nodeTs.eslint.cabecera`.

**Criterios de aceptación:**
- Añadir una clave a `es` sin añadirla a `en` rompe `pnpm typecheck`.
- El paquete no depende de ningún otro paquete del monorepo (es una hoja).

---

### [ ] F1-2 — Migrar el pack de Node/TS a los catálogos
**Rama:** `refactor/f1-node-ts-i18n` · **Depende de:** F1-1

**Trabajo:**
1. Extraer todo el texto en español de `packages/packs/node-ts/src/templates/*`
   (CI, reglas de IA, tooling, docs) al catálogo.
2. Traducir al inglés.
3. Traducir también los `reason` de cada operación: son lo que el usuario lee en
   `governance plan`, la pantalla más importante del producto.

**Criterios de aceptación:**
- Ni un literal en español fuera del catálogo (regla de lint que lo verifique si
  es viable; si no, revisión manual documentada).
- Los ficheros generados en inglés son idiomáticos, no traducción literal.

---

### [ ] F1-3 — Mensajes de la CLI en ambos idiomas
**Rama:** `refactor/f1-cli-i18n` · **Depende de:** F1-1

**Trabajo:**
1. Migrar [render.ts](../packages/cli/src/render.ts) y
   [commands.ts](../packages/cli/src/commands.ts) al catálogo.
2. Resolución del idioma, por orden de precedencia:
   `--lang` → `.governance/config.yml` → `$LANG` del sistema → `es`.
3. `governance scan` debe poder elegir idioma **antes** de que exista config.

**Criterios de aceptación:**
- `governance scan --lang en` en un repo sin configurar sale íntegro en inglés.

---

### [ ] F1-4 — Test de paridad entre idiomas
**Rama:** `test/f1-paridad-idiomas` · **Depende de:** F1-2, F1-3

**Por qué:** el riesgo real de la i18n no es traducir mal, es que el plan
**haga cosas distintas** según el idioma. Eso rompería el determinismo.

**Trabajo:**
1. Test que genera el plan con `es` y con `en` sobre el mismo repo de prueba y
   compara: mismo número de operaciones, mismas rutas, mismo orden, mismos
   comandos. Sólo puede diferir el contenido textual.
2. Test que verifica que ninguna traducción quedó vacía o igual a su clave.

**Criterios de aceptación:**
- Si alguien añade una operación condicionada por idioma, el test falla.

---
### [ ] F1-5 — Procedencia: cada regla cita su fuente
**Rama:** `feat/f1-procedencia-de-reglas` · **Depende de:** F1-1

**Por qué en esta fase:** es la misma lección que la i18n. Hoy hay un pack;
después de la Fase 2 habrá cinco, y añadir un campo obligatorio al contrato con
cinco packs escritos cuesta cinco veces más.

**Por qué importa comercialmente:** desactiva la objeción *"¿por qué debería
fiarme de vuestros estándares?"*. La respuesta pasa a ser: **ninguna regla es
opinión nuestra, cada una cita la documentación oficial y la versión en que se
apoya**. Y le da al asistente de IA una fuente verificable en lugar de una
afirmación, que es la diferencia entre que aplique la regla y que se la invente.

**Trabajo:**
1. Añadir al contrato de `packs-sdk` una estructura de procedencia: URL de la
   documentación oficial, versión de la herramienta y fecha de comprobación.
2. Hacerla obligatoria para las reglas de seguridad y de estilo generadas;
   opcional donde sea una convención propia, y en ese caso **decirlo
   explícitamente** en el fichero generado.
3. La suite de conformidad rechaza una regla de seguridad sin procedencia.
4. `doctor` avisa cuando una fuente lleva más de un año sin revisarse.

**Criterios de aceptación:**
- Los ficheros de reglas generados citan su fuente junto a cada regla.
- Un pack con una regla de seguridad sin procedencia no pasa la conformidad.

---

## FASE 2 — Cobertura de stacks

**Objetivo:** que la herramienta **nunca** se quede sin hacer nada, sea cual sea
el repositorio.
**Estimación:** 4-6 sesiones. Es la fase más larga y la de mayor retorno comercial.
**Por qué importa:** hoy, un repo que no sea Node recibe un conflicto bloqueante
y cero valor. Eso es una demo fallida delante de un cliente. Con esta fase, el
mercado direccionable pasa de "agencias JavaScript" a "cualquier equipo".
**Criterio de salida:** `governance apply` produce valor real en repos de Node,
Python, PHP/Laravel, Go y en uno de un stack no soportado.

---

### [ ] F2-1 — Detección multi-stack en el escáner
**Rama:** `feat/f2-scanner-multistack` · **Depende de:** Fase 1 completa

**Estado actual:** [stack.ts](../packages/scanner/src/stack.ts) sólo reconoce
`node-ts` y `go`.

**Trabajo:**
1. Añadir detectores, cada uno con su evidencia y su nivel de confianza:
   - **Python** — `pyproject.toml` (y dentro: Poetry / uv / PDM / setuptools),
     `requirements.txt`, `Pipfile`. Frameworks: FastAPI, Django, Flask.
   - **PHP** — `composer.json`. Frameworks: Laravel (`artisan`), Symfony.
   - **Java/Kotlin** — `pom.xml`, `build.gradle(.kts)`. Spring Boot.
   - **.NET** — `*.csproj`, `*.sln`.
   - **Ruby** — `Gemfile`. Rails.
   - **Rust** — `Cargo.toml`.
2. Un repo puede devolver **varios** stacks: el políglota es la norma, no la
   excepción (un backend Django con un frontend Next.js).
3. Extender `LanguageStat` y el conteo de SLOC a las extensiones nuevas.
4. Extender el informe de madurez con señales por lenguaje (`ruff`/`phpstan`/
   `golangci-lint` ya están contemplados en
   [maturity.ts](../packages/scanner/src/maturity.ts); revisar Java y .NET).

**Criterios de aceptación:**
- Tests con `package.json` de ejemplo por cada gestor y framework listado.
- Un repo Django + Next.js devuelve dos stacks, ordenados por SLOC real.
- El escáner sigue sin escribir nada en disco (invariante).

---

### [ ] F2-2 — Pack universal de respaldo
**Rama:** `feat/f2-pack-base` · **Depende de:** F2-1

**Por qué es la tarea más rentable de la fase:** cubre de golpe *todos* los
stacks que no tengan pack propio, y da valor inmediato en cualquier repositorio
del mundo. Es lo que convierte un "no soportado" en una venta.

**Trabajo:**
1. Pack `base` que **siempre** aplica, con confianza baja (0.1) para que nunca
   sea el pack principal.
2. Aporta lo que es independiente del lenguaje:
   - Escaneo de secretos con Gitleaks (config + workflow).
   - `.editorconfig`, `.gitattributes`.
   - `CODEOWNERS`, `SECURITY.md`, plantillas de PR e issues.
   - `.env.example` derivado de las variables que el escáner encuentre en el código.
   - Reglas de contexto de IA genéricas (`AGENTS.md`) construidas a partir del
     escaneo: stacks detectados, estructura, comandos.
   - Actualización de dependencias (Dependabot/Renovate) según los ecosistemas
     detectados.
3. Eliminar de [registry.ts](../packages/packs-sdk/src/registry.ts) el conflicto
   bloqueante "no se ha reconocido ningún stack": deja de poder ocurrir.

**Criterios de aceptación:**
- `governance apply` sobre un repo de un lenguaje sin pack (p. ej. Elixir)
  instala escaneo de secretos, CODEOWNERS y reglas de IA, y no falla.
- El pack `base` nunca duplica lo que ya aporta un pack específico (lo verifica
  el `PlanBuilder`, que debe reportar conflicto si ocurre).

---

### [ ] F2-3 — Kit de pruebas de conformidad reutilizable
**Rama:** `test/f2-kit-conformidad` · **Depende de:** F2-2

**Por qué antes de escribir cuatro packs:** sin esto, cada pack se testea de una
forma distinta y la calidad diverge. Y cuando abramos el catálogo a terceros
(el eje de escalado del negocio), esta suite es lo único que impide que un pack
mal escrito destroce el repositorio de un cliente.

**Trabajo:**
1. Paquete `@governance/pack-testkit`.
2. `describePackConformance(pack, escenarios)`: batería estándar que ejecuta
   `checkPackConformance` sobre varios repos sintéticos y comprueba además:
   - **Idempotencia**: aplicar dos veces no produce cambios la segunda.
   - **Reversibilidad**: `apply` + `rollback` deja el repo byte a byte idéntico.
   - **No destructividad**: nunca pisa un fichero preexistente del cliente sin
     declararlo como conflicto.
   - **Respeto del modo**: en `non-disruptive` no toca ficheros de código fuente.
   - **Paridad de idioma**: genera en `es` y en `en` con la misma estructura.
3. Utilidades para construir repos de prueba en memoria/tmp.
4. Migrar los tests existentes de `node-ts` al kit.

**Criterios de aceptación:**
- Un pack nuevo se valida con menos de 20 líneas de test.
- Introducir a propósito un fallo (p. ej. sobrescribir un fichero del cliente)
  hace fallar el kit.

---

### [ ] F2-4 — Pack de Python
**Rama:** `feat/f2-pack-python` · **Depende de:** F2-3

**Trabajo:**
1. Detección del gestor: uv → Poetry → PDM → pip, y respeto del que ya use el repo.
2. Aporta: `ruff` (lint + formato), `mypy` (estricto o gradual según
   `strictness`), `pytest` con cobertura, `pre-commit`, `bandit` o `pip-audit`
   para seguridad, workflows de CI con matriz de versiones de Python.
3. Reglas de IA específicas: tipado, gestión de entornos virtuales, estructura
   de proyecto, y el patrón del framework detectado (FastAPI vs Django).
4. Parcheo no destructivo de `pyproject.toml` — requiere **soporte TOML en
   `@governance/ast`**, que hoy sólo tiene JSON y YAML. Es la parte cara de esta
   tarea: presupuestarla aparte y usar un parser que preserve comentarios.

**Criterios de aceptación:**
- Pasa el kit de conformidad en repos con Poetry, con uv y con `requirements.txt`.
- Un `pyproject.toml` con comentarios y formato propio conserva ambos tras el parcheo.

---

### [ ] F2-5 — Pack de PHP / Laravel
**Rama:** `feat/f2-pack-php-laravel` · **Depende de:** F2-3

**Por qué tiene prioridad alta pese a no ser el stack de moda:** es el stack
dominante en el segmento de **agencias de desarrollo españolas**, que es
justamente el comprador del paquete de 4.000 €.

**Trabajo:**
1. Detección de Laravel (`artisan`, `composer.json`) frente a Symfony frente a PHP puro.
2. Aporta: PHPStan o Psalm con nivel según `strictness`, Laravel Pint o
   PHP-CS-Fixer, PHPUnit o Pest, `composer audit`, workflows con matriz de PHP.
3. Parcheo no destructivo de `composer.json` (es JSON: reutiliza `@governance/ast`).
4. Reglas de IA específicas de Laravel: dónde va la lógica de negocio, uso de
   Eloquent, form requests, evitar consultas N+1 — los errores exactos que
   comete un asistente de IA en Laravel.

**Criterios de aceptación:**
- Pasa el kit sobre un esqueleto de Laravel real.
- Los scripts de Composer se añaden sin pisar los que ya tuviera el proyecto.

---

### [ ] F2-6 — Pack de Go
**Rama:** `feat/f2-pack-go` · **Depende de:** F2-3

**Trabajo:**
1. El escáner ya detecta Go; falta el pack.
2. Aporta: `golangci-lint` con conjunto de linters razonado, `gofumpt`,
   `go vet`, `govulncheck`, `go test -race -cover`, workflows con matriz.
3. Reglas de IA: manejo de errores idiomático, contextos, interfaces pequeñas.
4. Ojo: Go no tiene "dependencias de desarrollo". Verificar que
   `AddDependencyOp` con `manager: 'go'` se traduce a algo sensato en
   [apply.ts](../packages/core/src/apply.ts) (`go install` de herramientas, o
   un `tools.go`). Si no encaja, es una corrección del núcleo, no del pack.

**Criterios de aceptación:**
- Pasa el kit sobre un módulo Go y sobre un monorepo con varios `go.mod`.

---

### [ ] F2-7 — Composición de packs en monorepos
**Rama:** `feat/f2-monorepo` · **Depende de:** F2-4, F2-5, F2-6

**Por qué:** el escáner ya detecta monorepos y los fuerza a `non-disruptive`,
pero los packs siguen razonando sobre la raíz. En un monorepo con `apps/api`
en Python y `apps/web` en Next.js, hoy se genera una configuración incoherente.
Y los monorepos son, por tamaño, los clientes de ticket más alto.

**Trabajo:**
1. Extender `RepoContext` con los **workspaces** detectados (pnpm/yarn/turbo/
   nx/lerna/Cargo/Go), cada uno con su ruta y sus stacks.
2. Permitir que un pack contribuya operaciones **con prefijo de ruta** por
   workspace, sin que los packs tengan que saber de monorepos.
3. CI que sólo ejecuta los jobs de los workspaces afectados por el diff.
4. Estrategia clara para la raíz: config compartida arriba, específica abajo.

**Criterios de aceptación:**
- Un monorepo Python + Next.js recibe dos configuraciones coherentes y una CI
  que sólo corre lo que cambia.
- Los packs de F2-4 a F2-6 funcionan sin modificarlos.

---

### [ ] F2-8 — Guía para autores de packs
**Rama:** `docs/f2-guia-autores-packs` · **Depende de:** F2-7

**Por qué:** es la palanca de escalado del negocio. Si un cliente enterprise
puede escribir su propio pack con sus estándares internos, deja de comprar una
herramienta y empieza a construir sobre una plataforma. Eso cambia el precio y
la permanencia.

**Trabajo:**
1. `docs/AUTORAR_PACKS.md`: contrato, DSL, ejemplos, errores frecuentes.
2. Plantilla ejecutable: `packages/packs/_template/`.
3. Documentar las garantías que el kit de conformidad verifica y por qué.

**Criterios de aceptación:**
- Alguien externo al proyecto escribe un pack mínimo siguiendo sólo la guía.

---
### [ ] F2-12 — Instalar las herramientas de agente que cada stack necesita
**Rama:** `feat/f2-skills-de-agente` · **Depende de:** F2-2

**Por qué:** hoy generamos ficheros de reglas. Pero un equipo que trabaja con
Claude Code, Cursor o Copilot necesita más que un `.cursorrules`: necesita las
*skills* y la configuración de agente adecuadas a su stack. **Nadie está
empaquetando esto**, y es de lo más diferenciador que podemos ofrecer.

**Trabajo:**
1. Detectar qué asistentes usa el equipo (ya está en `Profile.aiAssistants`) y
   qué herramientas de agente admite cada uno.
2. Instalar, según el stack detectado:
   - Skills de Claude Code en el directorio que corresponda.
   - Reglas de Cursor en `.cursor/rules/`, troceadas por dominio en lugar de un
     único fichero monolítico.
   - `AGENTS.md` genérico para el resto de asistentes.
   - Configuración de servidores MCP que tengan sentido para ese stack, **sin
     instalar ninguno automáticamente**: se proponen y decide el equipo.
3. Que todo lo generado pase por el mismo mecanismo de bloques gestionados, para
   que `upgrade` pueda actualizarlo sin pisar lo que el equipo añada.

**Criterios de aceptación:**
- Un repositorio de Node/TS recibe skills y reglas coherentes entre los tres
  asistentes, sin instrucciones contradictorias entre ficheros.
- Nada se conecta a un servicio externo sin confirmación explícita.

---

### [ ] F2-11 — Frontera real para packs de terceros
**Rama:** `feat/f2-aislamiento-packs` · **Depende de:** F2-8

**Origen:** revisión de F0-5.

**Por qué importa:** la documentación afirmaba que un pack "no tiene acceso al
sistema de ficheros". Es falso: un pack es un objeto cargado en el mismo proceso
de Node y puede importar `node:fs` y escribir donde quiera. `checkPackConformance`
sólo inspecciona las **operaciones devueltas**; no puede observar efectos
secundarios.

Mientras el CLI sólo cargue packs incluidos en su propio paquete, el riesgo es
teórico. En el momento en que se abra el catálogo —que es la palanca de escalado
del negocio (F2-8)— instalar un pack pasa a ser ejecutar código arbitrario en la
máquina del cliente. Esta tarea es **bloqueante para aceptar packs externos**.

**Trabajo:**
1. Decidir el mecanismo: ejecutar los packs en un `worker_thread` con permisos
   recortados, en un proceso hijo con el modelo de permisos de Node
   (`--experimental-permission`), o firmar y auditar los packs del catálogo.
   Escribir una ADR con la elección.
2. Implementarlo y añadir al kit de conformidad una prueba que detecte un pack
   que intente escribir directamente.
3. Hasta entonces, dejar explícito en la documentación y en la salida del CLI
   que sólo se cargan packs de confianza.

**Criterios de aceptación:**
- Un pack que intenta escribir por su cuenta es detectado o impedido.
- La ADR justifica el mecanismo elegido y lo que deja fuera.

---

### [ ] F2-9 — Llevar los límites operativos del asistente al pack base
**Rama:** `refactor/f2-limites-al-pack-base` · **Depende de:** F2-2

**Estado:** implementado **sólo** en el pack de Node/TypeScript (sección 7 de las
reglas generadas, más las instrucciones de Copilot), con el contrato
`AgentBoundaries` ya en el `Profile`. Falta generalizarlo.

**Por qué el pack base es su sitio:** que un asistente no ejecute `git push` ni
una migración no tiene nada que ver con el lenguaje del proyecto. Dejarlo en
`node-ts` significa que un cliente de Laravel o Django no lo recibe, que es
justo donde una migración mal lanzada hace más daño.

**Trabajo:**
1. Mover `boundariesSection` del pack de Node al pack base.
2. Publicarla en todos los ficheros de contexto de IA que genere el pack base
   (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `copilot-instructions.md`), sin
   duplicarla en los packs de stack.
3. Ampliar la lista de comandos prohibidos con los propios de cada ecosistema
   detectado: `php artisan migrate`, `python manage.py migrate`, `alembic
   upgrade`, `prisma migrate deploy`, `rails db:migrate`, `goose up`.
4. Traducir la sección a los catálogos i18n de la Fase 1.
5. Comprobación de salud en `doctor`: avisar si los ficheros de reglas de IA se
   han editado a mano y han perdido la sección.

**Criterios de aceptación:**
- Un repositorio de cualquier stack recibe los límites, con los comandos de
  migración propios de su ecosistema nombrados explícitamente.
- Desactivar `agentBoundaries.git` en el perfil los elimina de todos los
  ficheros generados a la vez, y la numeración de secciones sigue siendo válida.
- La sección aparece igual en español y en inglés.

---

## FASE 3 — Gobernanza real: modos de aplicación y flujo de trabajo

**Objetivo:** que la herramienta sirva en repositorios grandes y con legado, no
sólo en proyectos nuevos.
**Estimación:** 3-4 sesiones.
**Por qué importa:** un repo de 200.000 líneas es donde más duele el problema
que vendemos y donde está el ticket alto — y es justo donde una herramienta que
active reglas estrictas de golpe genera 4.000 errores y se desinstala en diez
minutos. Los modos `ratchet` y `non-disruptive` ya se **calculan** en
[sloc.ts](../packages/scanner/src/sloc.ts) pero hoy **no cambian nada**.
**Criterio de salida:** aplicar la herramienta a un repo grande y desordenado
deja la CI en verde desde el primer día, y aun así impide que empeore.

---

### [ ] F3-1 — Baseline: fotografía de la deuda existente
**Rama:** `feat/f3-baseline` · **Depende de:** Fase 2 completa

**Trabajo:**
1. Generar `.governance/baseline.json` (la constante `BASELINE_FILE` ya existe
   en [types.ts](../packages/core/src/types.ts), sin implementación detrás).
2. Contenido: por fichero y por regla, el número de infracciones **aceptadas**
   en el momento de instalar, más metadatos (fecha, versión, comando que lo generó).
3. Comando `governance baseline --update`, que exige que el árbol esté limpio
   y explica en la salida qué se está aceptando y qué implica.
4. El baseline es **legible y revisable en una PR**: nada de blobs binarios.

**Criterios de aceptación:**
- Regenerar el baseline sobre un repo sin cambios produce un fichero idéntico
  (determinismo).
- El fichero explica en su cabecera, en el idioma configurado, qué es y cómo se
  reduce.

---

### [ ] F3-2 — Modo trinquete: reglas estrictas sólo sobre lo que cambia
**Rama:** `feat/f3-ratchet-staged` · **Depende de:** F3-1

**Trabajo:**
1. En modo `ratchet`, los hooks aplican las reglas estrictas **sólo a los
   ficheros en staged**, y las reglas suaves al resto.
2. En modo `non-disruptive`, los hooks sólo avisan; nada bloquea.
3. Configuración generada de forma que el desarrollador entienda por qué su
   fichero se valida distinto que el de al lado (comentarios explicativos).

**Criterios de aceptación:**
- En un repo con 500 errores preexistentes, un commit de un fichero limpio pasa.
- Un commit que toca un fichero con deuda exige arreglar **sólo las líneas que toca**.

---

### [ ] F3-3 — CI que audita únicamente el diff de la Pull Request
**Rama:** `feat/f3-ci-solo-diff` · **Depende de:** F3-2

**Por qué:** es la promesa comercial literal del producto — "reducción del 40%
en tiempos de revisión de PRs" — y hoy no está implementada.

**Trabajo:**
1. Workflows que calculan los ficheros cambiados frente a la rama base y
   ejecutan linter, tipos y escaneo de secretos sólo sobre ellos.
2. Comentario automático en la PR con el resumen: qué se validó, qué mejoró y
   qué empeoró respecto al baseline.
3. Cubrir el caso del PR grande y el de la rama desactualizada.

**Criterios de aceptación:**
- Una PR de 3 ficheros en un repo de 200.000 líneas se valida en menos de un minuto.
- El comentario es útil para un revisor humano, no ruido.

---

### [ ] F3-4 — El trinquete: prohibido empeorar
**Rama:** `feat/f3-trinquete-metricas` · **Depende de:** F3-3

**Por qué:** es la diferencia entre "instalamos linters" y "gobernanza". Y es lo
que hace que la licencia se renueve: el valor se acumula mes a mes de forma medible.

**Trabajo:**
1. La CI compara las métricas de la PR contra el baseline y **falla si la deuda
   sube**, aunque los valores absolutos sigan siendo altos.
2. Cuando una PR reduce la deuda, el baseline se actualiza automáticamente a la
   baja: el trinquete nunca retrocede.
3. `governance report` muestra la evolución de la puntuación de madurez y de la
   deuda en el tiempo.

**Criterios de aceptación:**
- Una PR que añade un `any` nuevo falla, aunque el repo tenga 3.000.
- Una PR que elimina 10 infracciones baja el baseline en el mismo merge.

---

### [ ] F3-5 — Gobierno del flujo de ramas (feature de producto)
**Rama:** `feat/f3-gobierno-de-ramas` · **Depende de:** F2-2

**Por qué:** es la pregunta 1 del wizard en el PDF y hoy no existe nada.
Nosotros estamos usando este flujo internamente (§3): esta tarea convierte esa
práctica en producto.

**Trabajo:**
1. El pack `base` genera y documenta la estrategia de ramas elegida en el perfil
   (`main` / `staging` / `dev`, o `main` + ramas de tarea).
2. Genera las **reglas de protección de rama** como fichero declarativo
   (ruleset de GitHub) más las instrucciones para aplicarlas. Aplicarlas
   automáticamente requiere token de administración: se ofrece, **nunca se
   asume**, y sólo con confirmación explícita.
3. Genera plantillas de PR e issues, y `CODEOWNERS` a partir de los autores
   reales que devuelve el historial de git.
4. Documenta el flujo en el `GOBERNANZA.md` que ya genera el pack de Node.

**Criterios de aceptación:**
- Tras aplicar, el repo del cliente tiene documentado su flujo y las
  protecciones listas para activar.
- Nada toca la configuración remota del repositorio sin confirmación explícita.

---

### [ ] F3-6 — Flujo de entrega y revisión asistida en las reglas generadas
**Rama:** `feat/f3-flujo-de-entrega` · **Depende de:** F3-5

**Por qué:** el cuello de botella que el producto promete resolver no es escribir
el código, es **revisarlo**. Un equipo pequeño, o uno en el que sólo queda una
persona un viernes por la tarde, acumula PRs sin revisar y acaba mergeando sin
mirar. Esta tarea convierte en producto el flujo que ya usamos internamente
(§3.3): el asistente del cliente entrega los textos y, si hace falta, revisa.

**Trabajo:**
1. El pack base añade a las reglas de IA generadas una sección de **flujo de
   entrega**: al cerrar una unidad de trabajo, el asistente entrega el mensaje de
   commit y la descripción de la PR, en el idioma que indique
   `agentBoundaries.commitLanguage`, con el formato de la plantilla de PR que
   genere el propio pack.
2. Regla explícita de **revisión en contexto nuevo**: si el desarrollador pide
   que el asistente revise la PR, debe hacerlo sin el historial que produjo el
   código. Es el punto que hace que la revisión valga algo; sin él, el asistente
   se limita a confirmar sus propias suposiciones.
3. Regla de **preguntar antes**: nunca asumir que revisa el asistente. Se ofrece;
   decide el equipo.
4. La revisión **entrega hallazgos, no aprueba ni integra**. El merge lo hace una
   persona, siempre. Debe quedar escrito en las reglas generadas para que no se
   erosione con el uso.
5. Nueva opción de perfil `assistedReview` (por defecto activa) para que un
   equipo con revisión humana garantizada pueda desactivar el ofrecimiento.

**Criterios de aceptación:**
- Un repositorio configurado recibe el flujo de entrega en sus ficheros de reglas
  de IA, coherente con la plantilla de PR y el flujo de ramas que se le generan.
- Desactivar `assistedReview` elimina la parte de revisión pero mantiene la
  entrega de los mensajes.
- La sección deja explícito que la revisión asistida es una válvula contra el
  bloqueo, no un sustituto de la revisión humana.

---

### [ ] F3-7 — Leyes de testing acopladas al cambio
**Rama:** `feat/f3-leyes-de-testing` · **Depende de:** F3-3

**Por qué:** es la queja número uno sobre el código generado con IA — llega sin
pruebas— y es **mecánicamente comprobable**, que es lo que la convierte en
control y no en consejo.

**Trabajo:**
1. Comparar el diff de la Pull Request con los símbolos exportados que toca:
   - Función exportada **nueva** sin prueba que la cubra → falla.
   - Función exportada **modificada** cuya prueba no se ha tocado → avisa.
   - Función exportada **eliminada** con pruebas huérfanas → falla.
2. Respetar el modo: en `non-disruptive` sólo avisa, nunca bloquea.
3. Vía de escape explícita y auditable: una anotación que exima un símbolo
   concreto, **con motivo obligatorio**, visible en la revisión.
4. Que el mensaje de error diga qué fichero de prueba falta y dónde crearlo.

**Criterios de aceptación:**
- Una PR que añade una función exportada sin prueba se bloquea con un mensaje
  accionable.
- La exención requiere escribir un motivo y queda visible en la PR.

---

### [ ] F3-8 — Postura de seguridad, más allá de los secretos
**Rama:** `feat/f3-postura-de-seguridad` · **Depende de:** F3-3

**Por qué:** Gitleaks detecta tokens filtrados. No detecta **puertas abiertas**,
que es la otra mitad del problema y la que un asistente de IA introduce con más
facilidad porque copia ejemplos de documentación pensados para desarrollo local.

**Trabajo:**
1. Controles para configuraciones inseguras por defecto, con la fuente oficial
   que respalda cada uno (F1-5): `CORS: *`, modo depuración activo en producción,
   puertos expuestos innecesariamente, autenticación permisiva, cookies sin
   `Secure` ni `HttpOnly`, TLS desactivado.
2. Detección de variables de entorno usadas en el código pero ausentes de
   `.env.example`, y al revés.
3. Detección de credenciales por defecto en ficheros de contenedor y de
   `docker-compose`.
4. Cada hallazgo explica **por qué es un problema** y cómo se corrige. Un aviso
   que no enseña se acaba silenciando.

**Criterios de aceptación:**
- Los controles funcionan sobre los stacks con pack propio.
- Cada control cita su fuente oficial.
- Cero falsos positivos sobre los repositorios de prueba de F6-2; un control
  ruidoso se desactiva antes que tolerarlo.

---

## FASE 4 — Ciclo de vida del producto instalado

**Objetivo:** que la herramienta sirva el día 200, no sólo el día 1.
**Estimación:** 3-4 sesiones.
**Por qué importa:** el cliente paga una **suscripción anual**, y lo único que
justifica renovarla es el valor nuevo que llega cada versión
([ADR 0004](adr/0004-suscripcion-anual.md)). Sin `upgrade` y sin el motor
de recurrencia de F4-5 a F4-8, no hay segundo año.
**Criterio de salida:** un repo configurado hace seis meses se actualiza a las
reglas nuevas sin perder ni una sola personalización del cliente.

---

### [ ] F4-1 — Wizard interactivo `governance init`
**Rama:** `feat/f4-wizard-init` · **Depende de:** Fase 3 completa

**Trabajo:**
1. Comando `init` con `@clack/prompts` (ya es dependencia del CLI).
2. Preguntas, **todas con un valor por defecto derivado del escaneo** para que
   pulsar Enter cinco veces dé un resultado correcto:
   - Estrategia de ramas (F3-5).
   - Destino de despliegue por entorno.
   - Nivel de estrictez, mostrando cuántos errores generaría cada opción **sobre
     su repo real** — el escáner ya tiene los datos para calcularlo.
   - Asistentes de IA en uso.
   - **Límites operativos del asistente** (`agentBoundaries`): si puede ejecutar
     git y migraciones, y en qué idioma redacta los mensajes de commit. Por
     defecto los tres activos; desactivarlos debe requerir una acción consciente.
   - Docker Compose y DevContainer.
   - Idioma.
3. El wizard **no ejecuta nada**: sólo produce el `Profile` y lo escribe en
   `.governance/config.yml`. Después encadena a `plan`.
4. `--yes` para CI y `--profile <fichero>` para que una agencia aplique el mismo
   perfil a diez repositorios sin repetir el cuestionario.

**Criterios de aceptación:**
- `init --yes` en un repo cualquiera produce un config válido sin interacción.
- Cancelar a mitad no deja nada escrito.
- El wizard es reejecutable: parte del config existente si lo hay.

---

### [ ] F4-2 — `governance upgrade` con detección de personalizaciones
**Rama:** `feat/f4-upgrade-drift` · **Depende de:** F4-1

**Por qué:** es el corazón del modelo de suscripción, y el mecanismo ya está
medio construido: las cabeceras de fichero gestionado (`withManagedHeader`) y
los bloques delimitados (`ensureBlock`) existen precisamente para esto.

**Trabajo:**
1. Comparar el hash registrado en la cabecera de cada fichero gestionado con el
   contenido actual para clasificar: **intacto** (se regenera), **modificado por
   el cliente** (se respeta y se avisa) o **borrado** (se pregunta).
2. En ficheros con bloques delimitados, actualizar sólo el interior del bloque.
3. `governance upgrade --dry-run` que muestre el diff exacto, igual que `plan`.
4. Informe claro de qué se actualizó, qué se respetó y qué requiere decisión humana.
5. Migraciones entre versiones del formato de `config.yml`.

**Criterios de aceptación:**
- Un fichero generado y luego editado a mano **nunca** se pisa.
- Un fichero generado e intacto se actualiza a la versión nueva.
- `upgrade` es reversible con `rollback`, igual que `apply`.

---

### [ ] F4-3 — `doctor --fix`
**Rama:** `feat/f4-doctor-fix` · **Depende de:** F4-2

**Trabajo:**
1. Los `HealthCheck` ya declaran `fixHint`. Añadir un campo opcional que aporte
   las `Operation[]` que arreglan el problema.
2. `doctor --fix` construye un plan con esas operaciones y lo pasa por el mismo
   flujo de confirmación, journal y rollback. Sin atajos.
3. Salida en JSON (`--json`) para consumirla desde CI.

**Criterios de aceptación:**
- `doctor --fix` deja el repo en verde en los casos que declara poder arreglar.
- Nunca escribe fuera del flujo transaccional.

---

### [ ] F4-4 — Informe comercial `governance report`
**Rama:** `feat/f4-informe-comercial` · **Depende de:** F4-3

**Por qué:** el que decide la compra no es quien ejecuta el CLI, y no va a leer
una salida de terminal. Este informe es la herramienta de venta: se genera
gratis, se comparte por correo y crea la necesidad que el producto resuelve.

**Trabajo:**
1. `governance report --html` produce un informe autocontenido: puntuación de
   madurez, señales ausentes con su impacto, estimación de horas de trabajo
   DevOps que la herramienta ahorra, y comparación antes/después.
2. `--json` para integraciones.
3. Diseño sobrio y profesional, sin dependencias externas ni telemetría.

**Criterios de aceptación:**
- El HTML se abre sin conexión y se lee bien en móvil.
- Los números que muestra se pueden justificar con los datos del escaneo; nada
  inventado.

---

### [ ] F4-5 — Detectar que hay una versión nueva, sin telemetría
**Rama:** `feat/f4-deteccion-de-version` · **Depende de:** F4-2

**Por qué:** es la primera pieza del motor de recurrencia
([MODELO_DE_NEGOCIO.md §6](MODELO_DE_NEGOCIO.md)). Si el cliente no se
entera de que hay algo nuevo, la suscripción no se renueva.

**Trabajo:**
1. Consultar el registro público de npm para saber si hay versión más reciente.
   **Nunca una API nuestra**: no queremos saber quién ejecuta qué.
2. Caché local con tiempo de vida razonable, para no consultar en cada ejecución.
3. Aviso discreto al final de `scan` y `doctor`, jamás bloqueante.
4. `--no-update-check` y variable de entorno equivalente, para entornos aislados
   y para CI.

**Criterios de aceptación:**
- Sin red, el CLI funciona igual y no se retrasa ni un segundo.
- No se envía ningún dato identificable a ningún servidor.

---

### [ ] F4-6 — Changelog dirigido: sólo lo que aplica a este repositorio
**Rama:** `feat/f4-changelog-dirigido` · **Depende de:** F4-5

**Por qué:** esta es la pieza que no hace nadie. Un changelog genérico se ignora.
Uno que dice *"de los 14 cambios de esta versión, estos 3 te afectan porque usas
Next.js y no tienes contenedores"* se lee entero.

**Trabajo:**
1. Que cada entrada del changelog declare a qué stacks, modos y capacidades
   aplica. Es un cambio en el formato de release, no sólo en el CLI.
2. Cruzar el changelog con el escaneo del repositorio y mostrar **sólo** lo
   relevante, con el resto colapsado.
3. Enlazar cada entrada con el cambio concreto que produciría en su repositorio,
   para poder ir directo a `upgrade --dry-run`.

**Criterios de aceptación:**
- Dos repositorios de stacks distintos ven changelogs distintos de la misma
  versión.
- Una entrada sin metadatos de aplicabilidad no pasa la CI del release.

---

### [ ] F4-7 — Catálogo de capacidades y oferta continua
**Rama:** `feat/f4-catalogo-de-capacidades` · **Depende de:** F4-6

**Por qué:** es lo que convierte la herramienta de "configurador que se ejecuta
una vez" en "servicio que mejora tu repositorio cada trimestre". Sin esto, la
suscripción no tiene defensa.

**Trabajo:**
1. Un catálogo declarativo de capacidades, cada una con sus requisitos: qué
   stack necesita, qué debe existir ya en el repositorio, qué modo la permite.
2. Tras un `upgrade`, volver a escanear y comparar contra el catálogo para
   encontrar lo que el repositorio **ahora** admite y no tiene.
3. Presentarlo como oferta, nunca como acción: *"ahora sabemos dockerizar
   proyectos como el tuyo. ¿Lo hacemos?"*.
4. Recordar lo rechazado para no volver a proponerlo en cada ejecución. Una
   herramienta que insiste se desinstala.

**Criterios de aceptación:**
- Añadir una capacidad al catálogo hace que los repositorios que la admiten la
  vean ofrecida, sin tocar código del CLI.
- Rechazar una oferta la silencia hasta que el usuario la pida.

---

### [ ] F4-8 — Flujos guiados, empezando por dockerizar Node/TS
**Rama:** `feat/f4-flujos-guiados` · **Depende de:** F4-7

**Por qué:** hay capacidades que no se pueden generar a ciegas. Dockerizar exige
saber qué servicios hay, qué puertos, si existe base de datos y cómo se
construye el proyecto. Un asistente que pregunte lo mínimo y genere el resto es
un ahorro de horas muy visible — y muy demostrable en una venta.

**Riesgo, y por eso empezamos por uno solo:** si prometemos "yo te dockerizo el
proyecto", pasamos a ser dueños de todos los modos de fallo de todos los stacks.
Es el riesgo N2 del modelo de negocio. **Node/TypeScript primero, y no se amplía
hasta que funcione sin soporte manual.**

**Trabajo:**
1. Motor de flujos guiados sobre `@clack/prompts`, reutilizable por otras
   capacidades.
2. Primer flujo: dockerización de Node/TS. Detectar gestor de paquetes, script
   de build, puertos, servicios externos y variables de entorno; preguntar sólo
   lo que no se pueda deducir.
3. Generar `Dockerfile` multi-etapa, `.dockerignore`, `docker-compose.yml` para
   desarrollo, y documentación en el idioma del perfil.
4. **El resultado sigue siendo un `ChangePlan`**: revisable con `plan`, aplicable
   con `apply`, reversible con `rollback`. Ni un atajo.
5. Verificar que la imagen construye antes de dar la capacidad por completada.

**Criterios de aceptación:**
- Sobre un proyecto Next.js y sobre uno de Express, la imagen generada construye
  y arranca.
- Cancelar a mitad del flujo no deja nada escrito.
- El flujo no pregunta nada que el escáner pudiera haber deducido.

---

## FASE 5 — Licenciamiento local-first

**Objetivo:** cobrar, sin romper la confianza que hace vendible el producto.
**Estimación:** 3-4 sesiones (más el servicio, que es un proyecto aparte).
**Decisión de negocio tomada el 2026-09-08:** ver `docs/adr/0002`. Todo el
código viaja en el paquete NPM. La licencia se valida en red **sólo** en `init`
y `upgrade`. `scan`, `plan`, `apply`, `rollback` y `doctor` funcionan **offline
y para siempre**. No se inyecta nada que pueda hacer fallar la CI del cliente.
**Criterio de salida:** el producto se puede vender y facturar, y pasa una
revisión de proveedor de un departamento de seguridad corporativo.

---

### [ ] F5-1 — Paquete `@governance/licensing`
**Rama:** `feat/f5-licensing-sdk` · **Depende de:** Fase 4 completa

**Trabajo:**
1. Cliente HTTPS de la API de licencias, con tiempos de espera cortos y
   mensajes de error que digan qué hacer.
2. Huella del repositorio: la lógica ya existe en
   [git.ts](../packages/scanner/src/git.ts) (`fingerprint` a partir del primer
   commit, con la URL remota como respaldo). Sólo hay que consumirla.
3. Verificación **criptográfica local** de la licencia recibida (firma de clave
   pública embebida en el paquete). Así el CLI valida sin llamar a la API en
   cada ejecución.
4. Qué se envía, documentado en el README y visible con `--verbose`:
   token, huella del repositorio, versión del CLI. **Nunca** código, ni rutas,
   ni nombres de fichero, ni el correo del desarrollador.

**Criterios de aceptación:**
- Sin red, un repo ya licenciado sigue funcionando por completo.
- Una licencia manipulada a mano se rechaza por firma inválida.
- El usuario puede ver exactamente qué se envía antes de que se envíe.

---

### [ ] F5-2 — Servicio de licencias
**Rama:** repositorio aparte · **Depende de:** F5-1

**Trabajo:**
1. API mínima: emitir, validar, vincular a huella, listar y revocar.
2. Modelo de datos: licencia → huellas vinculadas, con el límite del plan
   (1 repo, o 5-10 en el paquete de agencia).
3. Integración con la pasarela de pago: comprar emite el token automáticamente.
4. Panel para el cliente: sus licencias, sus repos vinculados y **la posibilidad
   de desvincular él mismo**, sin abrir un ticket. Un repo se migra o se
   renombra; si eso obliga a escribir un correo, la experiencia se rompe.

**Criterios de aceptación:**
- Usar una licencia de 1 repo en un segundo repo devuelve un error claro que
  explica cómo desvincular o ampliar.
- El panel permite resolverlo sin intervención humana por nuestra parte.

---

### [ ] F5-3 — Permisos por plan (entitlements)
**Rama:** `feat/f5-entitlements` · **Depende de:** F5-2

**Trabajo:**
1. La licencia declara a qué packs y funcionalidades da derecho.
2. Gratis y sin licencia, para siempre: `scan` y `report`. Son el gancho.
3. La fecha de fin de actualizaciones se registra en el config: pasada esa
   fecha, `upgrade` deja de traer reglas nuevas, pero **todo lo instalado sigue
   funcionando**. No se rompe nada nunca.

**Criterios de aceptación:**
- Una licencia caducada no degrada ni bloquea un repositorio ya configurado.
- El aviso de caducidad es informativo y aparece con antelación suficiente.

---

### [ ] F5-4 — Tolerancia a fallos de red
**Rama:** `feat/f5-gracia-offline` · **Depende de:** F5-3

**Trabajo:**
1. Si la API no responde durante un `upgrade`, se usa la licencia firmada en
   caché mientras siga vigente.
2. Ninguna caída de nuestra infraestructura puede bloquear el trabajo de un cliente.
3. Test que simula la API caída y verifica que todo sigue.

**Criterios de aceptación:**
- Con la API apagada, todos los comandos funcionan con una licencia válida en caché.

---

### [ ] F5-5 — Suscripción anual y tramos por volumen
**Rama:** `feat/f5-suscripcion-anual` · **Depende de:** F5-3

**Origen:** decisión de negocio del 2026-09-09,
[ADR 0004](adr/0004-suscripcion-anual.md). Sustituye al modelo de pago
único con doce meses de actualizaciones.

**Trabajo:**
1. La licencia firmada lleva **fecha de expiración**, verificable en local contra
   la clave pública embebida.
2. Revalidación contra la API **sólo en `upgrade`**. Nunca en `scan`, `plan`,
   `apply`, `doctor` ni `rollback`.
3. Tramos por volumen de repositorios para agencias, con vinculación y
   desvinculación autogestionada desde el panel.
4. Avisos de caducidad con antelación suficiente y por canales que el cliente
   vea: salida del CLI y correo.
5. **Una suscripción caducada deja de traer reglas nuevas y nada más.** No
   degrada, no bloquea, no desinstala. El cliente conserva para siempre lo que
   tenía el último día que pagó.

**Criterios de aceptación:**
- Un repositorio con la suscripción vencida sigue funcionando por completo con
  la configuración que ya tenía.
- Sin red, un repositorio con licencia vigente en caché no se ve afectado.
- El paso de un tramo a otro no obliga a reconfigurar ningún repositorio.

---

## FASE 6 — Distribución y lanzamiento

**Objetivo:** que exista un producto comprable.
**Estimación:** 2-3 sesiones.
**Criterio de salida:** un cliente ejecuta `npx @tu-empresa/governance scan`, ve
el valor, paga y aplica.

---

### [ ] F6-1 — Publicación en NPM
**Rama:** `build/f6-publicacion-npm` · **Depende de:** Fase 5 completa

**Trabajo:**
1. Decidir el nombre definitivo del scope y registrarlo (hoy es `@governance/*`,
   que casi con seguridad está ocupado). **Hacerlo pronto, no aquí**: condiciona
   nombres en todo el código.
2. Empaquetado: un único ejecutable por `tsup`, arranque rápido, `bin` correcto.
3. Verificar `npx` en macOS, Linux y Windows, y con Node 18, 20 y 22.
4. Publicación automática desde `main` con changesets y provenance.
5. Comprobar el tamaño del paquete: `npx` se ejecuta en cada demo y una descarga
   lenta arruina la primera impresión.

**Criterios de aceptación:**
- `npx @tu-empresa/governance scan` funciona en las tres plataformas.
- Arranque por debajo de 2 segundos.

---

### [ ] F6-2 — Validación E2E sobre repositorios reales
**Rama:** `test/f6-e2e-repos-reales` · **Depende de:** F6-1

**Por qué:** es la Fase 4 del PDF original y el único filtro que detecta lo que
los tests sintéticos no ven.

**Trabajo:**
1. Batería sobre repositorios públicos reales, uno por perfil:
   - Greenfield (< 2.000 SLOC).
   - Medio con deuda (2.000-50.000).
   - Monorepo grande (> 50.000).
   - Uno por cada stack soportado.
   - Uno de un stack **no** soportado (verifica el pack base).
2. Para cada uno: `scan` → `plan` → `apply` → CI en verde → `rollback` → repo
   idéntico al original.
3. Medir de verdad el tiempo total y contrastarlo con la promesa de "menos de 5
   minutos" del PDF. Si no se cumple, se corrige el producto o se corrige la promesa.

**Criterios de aceptación:**
- Todos los perfiles pasan el ciclo completo.
- El tiempo medido queda registrado en el README como dato verificable.

---

### [ ] F6-3 — Materiales de venta
**Rama:** `docs/f6-landing-y-demo` · **Depende de:** F6-2

**Trabajo:**
1. Landing con la propuesta de valor, el precio y un `asciinema` de la demo real.
2. Informe de ejemplo (F4-4) publicado como muestra.
3. Documentación de usuario final, separada de la de contribuidores.
4. Caso de uso escrito con los números reales medidos en F6-2 — no estimaciones.

**Criterios de aceptación:**
- La landing responde en 30 segundos qué es, para quién y cuánto cuesta.

---

### [ ] F6-4 — Lanzamiento 1.0
**Rama:** `chore/f6-lanzamiento` · **Depende de:** F6-3

**Trabajo:**
1. Congelar la API pública de `StackPack`: a partir de 1.0, romperla tiene coste.
2. Política de soporte y de versiones publicada.
3. Canal de soporte y proceso de incidencias.
4. Primeros tres clientes piloto con descuento a cambio de retroalimentación
   estructurada.

---

## 5. Orden de ejecución y dependencias

```
FASE 0 ─────────────────> FASE 1 ─────> FASE 2 ─────> FASE 3 ─────> FASE 4 ─────> FASE 5 ─────> FASE 6
(fundación)              (i18n)        (stacks)      (modos)       (ciclo vida)  (licencias)   (lanzamiento)
```

Las fases son secuenciales, pero **dentro de cada fase hay paralelismo**:

- **Fase 0:** F0-1 primero. Después, F0-2, F0-3 y F0-5 en paralelo. F0-4, F0-6 y
  F0-7 dependen de F0-3.
- **Fase 2:** F2-1 → F2-2 → F2-3, y luego **F2-4, F2-5 y F2-6 son paralelas**.
  Es el mejor punto del plan para repartir trabajo.
- **Fase 3:** F3-5 sólo depende de F2-2, así que puede adelantarse.

### Camino más corto a una demo vendible

Si en algún momento hace falta enseñar el producto antes de terminar el plan, el
mínimo defendible es: **F0-1 → F0-3 → F0-5 → F2-1 → F2-2 → F4-4**. Con eso hay
un repositorio serio, cobertura universal por el pack base y un informe que
enseñar a quien decide la compra.

---

## 6. Riesgos y decisiones pendientes

| # | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| R1 | **Materializado.** `aegiscode` y `aegiscode-cli` están ocupados en npm por una herramienta de terceros de la misma categoría | Confusión de usuarios, y seis paquetes que renombrar | Publicar bajo el scope `@aegiscode/` y registrar la organización ya. Tarea **F0-8** |
| R7 | Documentar garantías que el código no cumple del todo | Pérdida de credibilidad justo en el punto que vendemos | La revisión en contexto nuevo (F3-6) lo detectó en F0-5; tareas F0-9, F0-10, F0-11 y F2-11 |
| R2 | El modelo de licencia es de código visible: es copiable | Pérdida de ingresos | Se vende la actualización continua y el soporte, no el binario. Decisión consciente (ADR 0002) |
| R3 | Cada pack nuevo es superficie de mantenimiento permanente | El coste crece con el catálogo | El kit de conformidad (F2-3) y el catálogo abierto a terceros (F2-8) |
| R4 | La promesa de "5 minutos" puede no cumplirse en repos grandes | Credibilidad comercial | Medirlo en F6-2 y ajustar el producto o el mensaje, nunca ocultarlo |
| R5 | Un `apply` que corrompa el repo de un cliente | Pérdida del cliente y del boca a boca | Journal, rollback, dry-run por defecto y el 90% de cobertura en `core` (F0-7) |
| R6 | Cambios en las herramientas que generamos (ESLint 10, ruff...) | Las plantillas caducan | Es precisamente lo que el cliente paga con la suscripción; presupuestar mantenimiento continuo |

**Decisiones abiertas, a cerrar en su fase:**

1. ~~**Licencia del código**~~ — cerrada el 2026-09-09: **BUSL-1.1**, con
   `scan` y `report` de uso libre y paso automático a Apache-2.0 a los cuatro
   años. Razonamiento y alternativas descartadas en
   [ADR 0003](adr/0003-licencia-busl.md).
2. ~~**Nombre del producto**~~ — cerrado el 2026-09-08: **AegisCode**. Queda registrar el scope de NPM (F0-8).
3. **Telemetría**: la recomendación es **ninguna por defecto**, opt-in explícito.
   Vendemos confianza; instrumentar el CLI la contradice.

---

## 7. Cómo se mide que el plan va bien

| Indicador | Objetivo |
|---|---|
| Stacks con pack propio | 5 al terminar la Fase 2 |
| Repositorios en los que la herramienta no hace nada | 0 tras F2-2 |
| Cobertura de `@governance/core` | ≥ 90% |
| Tiempo de `scan` en un repo de 100k SLOC | < 10 s |
| Tiempo del ciclo completo en un repo medio | < 5 min (verificado, no estimado) |
| Incidentes de corrupción de repositorio de cliente | 0 |
