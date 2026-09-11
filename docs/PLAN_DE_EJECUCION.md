# Plan de ejecución — Enterprise DevSecOps & AI Governance CLI

> Documento vivo. Es la fuente de verdad del desarrollo del producto: qué se
> construye, en qué orden, en qué rama y con qué criterio se da por terminado.
> Cada tarea se cierra actualizando su casilla en este fichero, dentro de la
> misma Pull Request que la implementa.

**Última actualización:** 2026-09-12
**Estado global:** Fase 0 en curso — F0-1, F0-3, F0-5, F0-8, F0-13, F0-14, F0-15 y F0-17 completadas. Quedan F0-2, F0-4, F0-6, F0-7, F0-9 a F0-12, F0-16 y F0-18 a F0-25.
**Producto:** Plumbward · https://github.com/Erikfloresreche/Plumbward
**Modelo de negocio:** suscripción anual por repositorio — ver
[MODELO_DE_NEGOCIO.md](MODELO_DE_NEGOCIO.md)

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
| `@plumbward/core` | Motor transaccional: `Operation[]` → `ChangePlan` → `apply` con journal, simulación y rollback | Completo |
| `@plumbward/ast` | Edición no destructiva de JSON y YAML + bloques delimitados por marcadores | Completo, con tests |
| `@plumbward/scanner` | Estado git, fingerprint, SLOC, detección de stack, informe de madurez 0-100 | Completo para Node y Go |
| `@plumbward/packs-sdk` | Contrato `StackPack`, DSL de operaciones, registro y suite de conformidad | Completo |
| `@plumbward/pack-node-ts` | Único pack real: CI, ESLint, Prettier, Husky, Gitleaks, devcontainer, reglas de IA | Completo |
| `@plumbward/cli` | Comandos `scan`, `plan`, `apply`, `rollback`, `doctor` | Funciona de punta a punta |

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
| `Prod` | Sólo releases publicadas. Cada commit es una versión etiquetada. | Sin push directo. Sólo merge desde `develop` vía PR con CI verde. |
| `develop` | Integración continua del trabajo en curso. Siempre debe estar en verde. | Sin push directo. Sólo merge de ramas de tarea vía PR. |

### 3.2 Ramas de tarea

Formato: **`<tipo>/f<fase>-<slug-en-kebab-case>`**, con el *slug* **en
inglés**, igual que los mensajes de commit y las descripciones de PR: el nombre
de rama queda en el historial de git y lo leerá gente que no habla español.

Ejemplo: `fix/f0-protected-branches`, no `fix/f0-ramas-protegidas`.

Las ramas de tareas **ya cerradas** conservan el nombre con el que existieron
(`ci/f0-pipeline-propio`, `docs/f0-documentacion-base`). Son un hecho del
historial, y reescribirlas en este documento sería el mismo error que en F0-8
convirtió el nombre real de un competidor en uno inventado.

Tipos permitidos: `feat`, `fix`, `refactor`, `test`, `docs`, `build`, `ci`, `chore`.

```
develop ──┬── feat/f2-pack-python ──── PR ──┐
          ├── feat/f2-pack-go ─────── PR ───┼──> develop ──> PR ──> main (release)
          └── docs/f2-guia-packs ──── PR ───┘
```

La rama de releases se llama **`Prod`**, no `main`. Es la convención del equipo,
y el producto debe adaptarse a la convención del repositorio y no al revés — es
literalmente lo que vende. Nada en el código ni en los workflows puede dar por
hecho un nombre de rama.

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

**Al cerrar cada tarea**, el asistente entrega ya redactados el mensaje de
commit, el **título** de la PR y su descripción —los tres en inglés—, y pregunta
quién revisará la PR. Si no hay
nadie disponible y la PR se bloquearía, puede revisarla él **en contexto nuevo**
—nunca con el historial que produjo el código, porque reproduciría los mismos
puntos ciegos—, entregando hallazgos sin aprobar ni integrar. Detalle en
`CLAUDE.md`.

### 3.4 Cuerpo de la PR

Plantilla obligatoria (se genera en F0-5):

El **título** y la **descripción** de la Pull Request se redactan en inglés,
igual que los commits. El título va en una línea, con el mismo formato de
Conventional Commits y por debajo de 70 caracteres:

```
docs: switch to annual subscription and define the business model
```

La descripción sigue la plantilla:

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
- [ ] Se han entregado en inglés el mensaje de commit, el título de la PR y su
      descripción, y se ha preguntado quién revisa.
- [ ] Cada hallazgo de la revisión ha terminado en un **control mecánico**, o
      está registrado explícitamente como no mecanizable y por qué. Una regla
      escrita en prosa no cuenta: decae.

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
**Rama:** `build/f0-single-version-source` · **Depende de:** F0-1

**Por qué:** `CLI_VERSION` está hardcodeado como `'0.1.0'` en
[context.ts](../packages/cli/src/context.ts). En cuanto publiquemos, el journal
y las cabeceras de fichero gestionado mentirán sobre qué versión generó qué, y
`upgrade` (F4-2) depende de ese dato para decidir si regenera.

**Trabajo:**
1. Inyectar la versión en build time con `define` en
   [tsup.config.ts](../packages/cli/tsup.config.ts), leyendo `package.json`.
2. Sustituir la constante por la variable inyectada, con fallback legible en dev.
3. Test que compara la versión que reporta `plumbward --version` con la del
   `package.json` del CLI.

**Criterios de aceptación:**
- Cambiar la versión en `package.json` y reconstruir cambia la salida de
  `plumbward --version` sin tocar código.
- El test falla si alguien vuelve a hardcodearla.

---

### [x] F0-3 — Pipeline de integración continua propio
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
- [ ] Una PR con un test roto queda bloqueada en rojo. **No se cumple.** La CI
      pinta el rojo, pero sin protección de rama ni ruleset la PR sigue siendo
      mergeable. Requiere configuración en GitHub, que no vive en el
      repositorio: tarea **F0-13**.
- [ ] El pipeline completo baja de 5 minutos con caché caliente. *Pendiente de
      medir en la primera ejecución real.*
- [x] Node 18 pasa, o se sube `engines` conscientemente y se documenta. **Se
      subió a `>=22`, con el motivo verificado en CI.**

**Cerrada el 2026-09-10.** Entregado: `ci.yml` (matriz de Node, build,
typecheck y unitarios, más escaneo de secretos), `e2e.yml` y `dependabot.yml`
para las acciones de GitHub.

**Cuatro decisiones tomadas durante la ejecución:**

1. **Matriz 22 / 24 / 26, y `engines` a `>=22`.** El plan pedía 18 / 20 / 22.
   Node 18 y 20 llevan sin soporte de seguridad desde abril de 2025 y abril de
   2026, así que se descartaron por coherencia con lo que vende el producto.
   Node 20 se intentó igualmente como suelo pragmático, y **la primera ejecución
   real de la CI lo tumbó**: pnpm 11 usa `node:sqlite` y exige Node >= 22.13, de
   modo que en 20 no se pueden ni instalar las dependencias.

   La lección importante no es el número: es que estábamos a punto de declarar
   en `engines` un soporte que **no podíamos verificar**. Se soporta lo que se
   prueba. Se añadió 26 a la matriz porque es sobre lo que se desarrolla en
   local, y un fallo exclusivo de 26 se descubriría tarde.

2. **Pruebas partidas en `test:unit` y `test:e2e`.** Las unitarias tardan menos
   de un segundo y corren en las tres versiones de Node; las de punta a punta
   crean repositorios git reales y corren una sola vez. La división sale gratis
   de la estructura que ya había: `src/` frente a `test/`.

3. **`fail-fast: false` en la matriz.** Interesa saber si un fallo es de una
   versión concreta o de todas; cancelar el resto oculta esa información.

4. **Dependabot sólo para acciones de GitHub, por ahora.** Son código de
   terceros que se ejecuta con acceso al repositorio. Las dependencias de npm
   esperan a que exista el flujo de changesets (F0-6), para no generar ruido de
   PRs sin forma de versionarlas.

**Dos cosas que conviene que sepas:**

- **El repositorio se hizo público el 2026-09-11**, lo que deja los minutos de
  Actions sin límite y alinea el repositorio con la licencia BUSL y con el
  argumento comercial de que el código es auditable. Consecuencia que hay que
  asumir: **todo el historial anterior es visible para cualquiera**, y el
  escaneo de secretos por PR sólo mira los commits de esa PR. De ahí el job
  `historial`, que revisa el historial completo semanalmente.
- Si el repositorio se mueve a una **organización** de GitHub,
  `gitleaks-action` pasa a exigir un secreto `GITLEAKS_LICENSE`. Mientras sea
  una cuenta personal es gratuita. Está anotado en el propio workflow.

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
   (`npx @plumbward/cli scan`), qué instala, los tres invariantes, y el enlace a
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

El hallazgo más grave: el README indicaba `npx aegiscode`, que entonces era el
nombre del producto y **un paquete real de otro autor** publicado en npm. Se
corrigió, y el conflicto de nombre acabó provocando el renombrado a Plumbward
en F0-8.

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
**Rama:** `test/f0-coverage-threshold` · **Depende de:** F0-3

**Trabajo:**
1. Activar `coverage` en [vitest.config.ts](../vitest.config.ts) con proveedor `v8`.
2. Umbrales: **90% en `@plumbward/core`** (es el que puede corromper el repo de
   un cliente), 80% en el resto, sin umbral en las plantillas de texto.
3. Publicar el informe como artefacto de la PR.

**Criterios de aceptación:**
- CI falla si la cobertura de `core` baja del 90%.
- Los umbrales reflejan la cobertura real actual, no un número aspiracional.

---

### [x] F0-8 — Renombrar el scope de los paquetes a Plumbward
**Rama:** `refactor/f0-scope-plumbward` · **Depende de:** F0-1 · **Bloquea:** Fase 2

**Por qué antes de la Fase 2:** los seis paquetes nacieron bajo `@governance/*`,
un scope provisional. Cada pack nuevo multiplica los imports que habría que
reescribir después, así que el momento más barato para renombrar es antes de que
existan cinco packs.

**Trabajo:**
1. **Registrar la organización en npm antes de tocar nada.**
   Comprobado el 2026-09-09: el nombre que se barajaba entonces, `aegiscode`,
   estaba **ocupado** —igual que `aegiscode-cli` y `aegiscode-gui`— y, lo más
   grave, existía `@save3asy/aegiscode`, publicado tres semanas antes y descrito
   como *"AI Code Governance & Architecture Guardrails"*: un competidor
   homónimo en nuestra categoría exacta. Eso obligó a cambiar de nombre.
   `plumbward` se comprobó libre en npm y en los dominios `.com`, `.dev` e
   `.io`. La organización `plumbward` quedó registrada el 2026-09-09.
2. Renombrar los seis paquetes a `@plumbward/*` y actualizar las dependencias
   `workspace:*` de todos los `package.json`.
3. Renombrar el binario de `governance` a `plumbward`.
4. Decidir si el directorio de estado en el repositorio del cliente pasa de
   `.governance/` a `.plumbward/`. **Recomendación: mantener `.governance/`** —
   describe la función, no la marca, y así una migración de marca futura no
   obliga a tocar los repositorios ya configurados.
5. Actualizar README, plan y textos de la CLI.

**Criterios de aceptación:**
- `pnpm build && pnpm test` en verde tras el renombrado.
- Ni una referencia a `@plumbward/` fuera del historial de git.
- El scope de NPM queda registrado a nombre de la empresa.

---

### [ ] F0-9 — Guarda de exhaustividad en el simulador y el renderizador
**Rama:** `fix/f0-simulate-exhaustiveness` · **Depende de:** F0-1

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
**Rama:** `feat/f0-install-rollback` · **Depende de:** F0-1

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

### [ ] F0-12 — Convertir en controles los hallazgos de nuestras revisiones
**Rama:** `test/f0-review-controls` · **Depende de:** F0-3

**Origen:** las dos revisiones en contexto nuevo de septiembre de 2026
produjeron 30 hallazgos. Repasándolos, **cinco controles habrían evitado unos
dos tercios**.

**Por qué en forma de control y no de regla escrita:** `CLAUDE.md` ya ronda las
130 líneas. A las 400 nadie las aplica de forma fiable, porque cada regla nueva
diluye a las demás. Un test que falla, falla siempre. Es la misma tesis que
vende el producto, aplicada a nosotros.

**Trabajo — los cinco controles, como tests:**

1. **Términos prohibidos.** Tras un renombrado, ninguna aparición del nombre
   viejo sobrevive salvo en contextos declarados. Habría cazado
   `GOVERNANCE_DEBUG`, `$AEGIS`, el prefijo `governance-e2e-` y el
   `governance --version` de los criterios de F0-6.

2. **Hechos protegidos.** Una lista de nombres de terceros y registros fechados
   que un reemplazo masivo **nunca** puede tocar. Es el que habría parado el
   fallo más grave: renombrar `@save3asy/aegiscode`, el paquete real de un
   competidor, a un nombre que no existe. **El más importante de los cinco.**

3. **Los comandos documentados existen.** Cada `plumbward <x>` en documentación
   o en el `LICENSE` debe corresponder a un comando registrado en el CLI. Habría
   cazado el *Additional Use Grant* nombrando `report` e `init`, y `upgrade`
   descrito en presente sin existir.

4. **Snapshots de lo generado.** Ficheros dorados con la salida exacta de cada
   pack, para que cualquier cambio en marcadores, identificadores de bloque o
   tokens persistidos aparezca en el diff. Habría cazado el cambio silencioso
   del identificador del bloque de `.gitignore`.

5. **Tablas derivadas, no escritas.** El diagrama de dependencias se genera
   desde los `package.json`. Habría cazado el diagrama que inventaba una arista
   y omitía dos.

**Lo que NO es mecanizable, y hay que aceptarlo:** afirmar en la documentación
que existe una frontera de seguridad que el código no implementa. Ningún linter
detecta eso. Para esa clase, la única defensa es la revisión en contexto nuevo.

**Ya entregado (en F0-3):** `scripts/verificar-coherencia.mjs`, que comprueba
que el suelo de Node declarado en `package.json` coincide con el más bajo que
prueba la CI, que README y CONTRIBUTING dicen esa misma versión, y que cada
paquete publicable declara su propio `engines`. Nació de tres hallazgos de la
revisión de F0-3 y encontró el tercero solo, en su primera ejecución.

**Criterios de aceptación:**
- Reintroducir a propósito cada uno de los cuatro fallos citados hace fallar su
  control correspondiente.
- La lista de hechos protegidos y la de términos prohibidos viven en un fichero
  legible y se revisan en la PR, no escondidas en un test.

---

### [x] F0-13 — Proteger las ramas para que el rojo bloquee de verdad
**Rama:** configuración de GitHub, sin rama de código · **Depende de:** F0-3

**Origen:** la revisión de F0-3. La CI pinta el rojo pero no impide nada: con
una PR en rojo, `gh pr view --json mergeable` devuelve `MERGEABLE`. Un control
que se puede ignorar no es un control.

**Trabajo:**
1. ~~Renombrar `Prod` a `main`.~~ **Descartado.** `Prod` es la convención del
   equipo y es perfectamente válida; había que arreglar los workflows, no la
   rama. Ya apuntan a `Prod`, y hay un control que impide que vuelva a pasar.
2. Ruleset sobre `Prod` y `develop`: prohibir push directo, exigir Pull Request
   y exigir los checks en verde.
3. Los nombres de check obligatorios son `Node 22.13`, `Node 24`, `Node 26`,
   `Tipos y coherencia`, `Escaneo de secretos` y `Ciclo completo sobre
   repositorios reales`.
   **Cuidado:** vienen del campo `name` de cada job, así que **cualquier cambio
   en la matriz invalida la lista**. Un check obligatorio que ya no existe
   bloquea todas las PRs para siempre.
4. Borrar del remoto las ramas de tareas ya integradas.

**Criterios de aceptación:**
- [x] Una PR con un check en rojo no se puede mergear desde la interfaz.
- [x] `gh api repos/.../rulesets` devuelve las reglas configuradas.
- [x] Las reglas cubren `Prod` y `develop`, los nombres reales de las ramas.

**Cerrada el 2026-09-11**, configurada a mano en GitHub. Ruleset activo sobre
`develop` y `Prod`: bloqueo de borrado y de force push, PR obligatoria con **0
aprobaciones** —con 1, un desarrollador en solitario no podría mergear nunca sus
propias PRs— y los seis checks obligatorios, verificados uno a uno contra los
nombres reales de los jobs. Un push directo a `develop` es rechazado; probado.

Llegó tarde: horas antes, F0-14 había entrado en `develop` por un push directo,
porque la rama local se creó enganchada a `origin/develop`. Con esta regla un
push directo ya no es posible. **Una PR sin revisión, sí**: con 0 aprobaciones,
la revisión depende de que se pida. Para un desarrollador en solitario es lo
correcto, pero conviene no confundir las dos cosas.

Lo aprendido al configurarla a mano es la base de la versión automática, en
F3-5.

---

### [x] F0-14 — La detección de ramas protegidas no puede estar cableada
**Rama:** `fix/f0-protected-branches` (la versión que se cierra, en
`fix/f0-protected-branches-rework`, PR #7) · **Depende de:** nada · **Prioridad: alta**

**Origen:** al renombrar la rama de releases de este repositorio a `Prod`,
quedó a la vista que el CLI no la reconoce.

**El fallo, y es grave:**

```ts
const PROTECTED_BRANCHES = new Set(['main', 'master', 'production', 'prod'])
if (!PROTECTED_BRANCHES.has(currentBranch)) { /* trabaja sobre la rama actual */ }
```

1. **Distingue mayúsculas.** `Prod` no coincide con `prod`, así que `apply`
   escribiría **directamente sobre la rama de producción** en lugar de crear la
   rama aislada. Es una violación de la garantía principal del producto —
   *"nunca se trabaja sobre main"*— y ocurre en silencio.
2. **Es una lista cerrada.** No contempla `trunk`, `produccion`, `desarrollo`
   ni ninguna convención de equipo. Vendemos adaptarnos a cualquier repositorio
   y damos por hecho cuatro nombres en inglés.
3. **`recommendedProfile` adivina mal:** `scan.git.branch === 'master' ? 'master'
   : 'main'` decide que la rama principal se llama `main` en cuanto no se llama
   `master`. Con `Prod`, el perfil generado miente.

**Trabajo:**
1. ~~Detectar la rama por defecto **real** del repositorio
   (`git symbolic-ref refs/remotes/origin/HEAD`, con `init.defaultBranch` y la
   rama actual como respaldo) en lugar de deducirla de una lista.~~
   Sustituido: `origin/HEAD` sólo propone `integration` al generar el
   `config.yml`, y `init.defaultBranch` no se usa. La protección ya no depende
   de la rama por defecto.
2. ~~`prepareBranch` decide a partir de `profile.branches`, que es la fuente de
   verdad configurada, más la rama por defecto detectada. La lista cableada pasa
   a ser sólo un respaldo, y **sin distinguir mayúsculas**.~~
   Sustituido por la protección invertida: no queda lista de ramas protegidas,
   ni siquiera como respaldo. Las ramas del perfil se aíslan siempre, sin
   distinguir mayúsculas.
3. ~~`recommendedProfile` rellena `branches.main` con la rama detectada.~~
   Descartado: ver la tercera versión más abajo y la ADR 0005.
4. ~~Tests con `Prod`, `PROD`, `trunk`, `produccion` y un repositorio sin remoto.~~
   Sustituido: con la protección invertida, cualquier nombre sin prefijo de
   trabajo se aísla. Los tests prueban `Prod`, una etiqueta homónima, HEAD
   desacoplado, un repositorio sin commits y otro sin remoto, y nombres fuera de
   toda lista (`pro`, `pre`, `live`, `release/prod`…).

**Criterios de aceptación:**
- [x] `apply` no escribe directamente en ninguna rama que no sea claramente de
      trabajo: tampoco con una etiqueta homónima, con HEAD desacoplado, en un
      repositorio sin commits ni con nombres fuera de toda lista (`pro`, `pre`,
      `live`, `release/prod`).
- [x] La decisión no depende de una lista de ramas de larga duración. La única
      lista que decide es la de prefijos de trabajo, que es cerrada.

**Cerrada a la tercera.** Queda escrito entero para no repetirlo.

**Primera versión** (entró en `develop` sin PR el 2026-09-11; la desmontó la
revisión posterior al merge):

1. Leía la rama con `git rev-parse --abbrev-ref HEAD`, que devuelve `heads/Prod`
   si existe una etiqueta `Prod`. `symbolic-ref --short` tiene el mismo defecto;
   se comprobó antes de elegir la solución.
2. Tomaba la rama por defecto de GitHub como rama de releases. En git-flow es
   `develop`, y la CI generada desplegaba a producción desde `develop`.
3. **Su verificación no demostraba nada**: "el commit de `Prod` no se mueve" se
   cumplía también con el fallo, porque `apply` nunca hace commit.
4. Los tests repetían la lista: quitar una fuente entera no rompía ninguno.

**Segunda versión** (PR #7, bloqueada por la revisión previa al merge): arregló
la lectura de la rama, pero deducía la rama de releases del primer nombre de una
lista de prioridad. Con `main` (donde van las PRs) y `Prod` (despliegue), la CI
generada sólo revisaba `Prod` y **las PRs a `main` quedaban sin revisar**. Y
cualquier nombre fuera de la lista seguía desprotegido.

**La lección de las tres:** cada heurística para deducir "cuál es la rama de
releases" arreglaba unos repositorios y rompía otros. No se puede deducir. De ahí
el principio de la **[ADR 0005](adr/0005-inference-fails-safe.md)**: cuando una
deducción falla, debe fallar hacia más protección, nunca hacia una acción.

**Tercera versión, la que se cierra:**

- **Protección invertida.** Se aísla el trabajo siempre, salvo en ramas de
  trabajo reconocibles por su prefijo (`feat/`, `fix/`, `chore/`…). Un nombre
  desconocido cae del lado seguro.
- **El perfil separa los dos papeles** que antes mezclaba `branches.main`:
  `integration` (a qué rama van las PRs, deducida de `origin/HEAD`) y `release`
  (desde cuál se despliega, **nunca deducida**). Sin `release`, no se genera el
  workflow de despliegue y `doctor` lo avisa.
- **La CI generada revisa todas las Pull Requests**, sin filtrar por rama.
- La rama actual se lee con `git symbolic-ref -q HEAD` sin abreviar; con HEAD
  desacoplado se aísla igualmente.
- Un `config.yml` antiguo sigue funcionando: `dev` pasa a `integration`, pero
  `main` **no** pasa a `release`, porque era un valor adivinado.
- Todos los tests aíslan git de la configuración global de la máquina.

**Cuarta ronda** (segunda revisión previa al merge de la PR #7): el núcleo
aguantó —no encontró forma de escribir en una rama de larga duración—, pero
bloqueó por otras cuatro cosas, ya corregidas:

- Las ramas de push de la CI salían de las referencias locales: dos copias con
  el mismo `config.yml` generaban workflows distintos. **Rompía el invariante 2.**
  Ahora salen sólo del perfil, con un test que lo comprueba.
- Se afirmaba que los tests estaban aislados de la configuración global de git,
  y sólo lo estaba uno. Ahora lo están todos desde la configuración de vitest: con una
  configuración que firma commits con un `gpg` que siempre falla, pasan los 75.
- `claude/add-lint` se aislaba, y si la rama aislada ya existía, `apply`
  escribía en ella aunque estuviera desfasada. Ahora los prefijos de asistentes
  de IA son ramas de trabajo, y con la rama aislada existente `apply` se detiene
  sin escribir.
- `doctor` decía que no había workflow de despliegue cuando uno antiguo seguía
  en el repositorio. Ahora mira el fichero.

**Quinta ronda** (tercera revisión previa al merge de la PR #7): tampoco
encontró forma de escribir en una rama de larga duración. Bloqueó por cuatro
cosas, ya corregidas:

- `doctor` daba por bueno un `ci-prod.yml` antiguo sin mirar desde qué rama
  desplegaba. Ahora lee sus disparadores y los compara con `branches.release`.
  También avisa si `ci-dev.yml` filtra las Pull Requests por rama.
- Con un `config.yml` que no definía ramas, se rellenaban con el estado local:
  el invariante 2 seguía roto por otra puerta. Ahora salen sólo del fichero.
- En un `git init` sin remoto, la CI generada no se ejecutaba en ningún push.
  Ahora se propone como integración la rama actual, si no es de trabajo, o
  `main`/`master` si existen.
- El principio estaba mal enunciado en el título de la ADR, en el nombre del
  fichero y en este plan. Ahora dice lo mismo en todas partes, y el fichero se
  llama `0005-inference-fails-safe.md`.

De los seguimientos, corregidos aquí:

- Si la rama aislada ya existe, `apply` se detiene **antes** de pedir
  confirmación y propone lo seguro: aplicar desde esa rama, o borrarla con
  `git branch -d`, que no borra trabajo sin integrar.
- La rama aislada se crea con `--no-track`. Con `branch.autoSetupMerge=inherit`
  heredaba el upstream de `Prod`, y un `git push` enviaba el commit a
  producción. Es el mismo patrón que el push directo a `develop` de F0-13.
- Los tests borran `GIT_DIR`, `GIT_WORK_TREE` y el resto de variables de git
  antes de empezar: heredadas de un hook, reescribían la configuración del
  repositorio real.
- `release: ""` y `dev: null` cuentan como "sin configurar".
- `GitState.branches` ya no dice servir para deducir el papel de cada rama:
  sólo alimenta la propuesta inicial de `integration`.

Pasan a otras tareas: el mensaje de "repositorio intacto" tras un fallo con HEAD
en la rama aislada y las mutaciones en CI (F0-15), y los filtros de PR de un
`ci-dev.yml` antiguo (F4-2).

**No mecanizable:** esta rama también cierra F0-13 y anota F0-16, F3-5, F4-1 y
F4-2, contra "una rama, una tarea". Son anotaciones derivadas de F0-14, pero
ningún control distingue una anotación legítima de un cambio de ámbito. La
defensa es la revisión.

**Sexta ronda** (cuarta revisión previa al merge): bloqueó por dos cosas, ya
corregidas:

- Si alguien cambiaba de rama mientras `apply` esperaba la confirmación —otro
  terminal, el IDE, un agente en paralelo—, el plan calculado para `feat/x` se
  aplicaba sobre `Prod`. Existía también en `develop`. Ahora, tras confirmar, se
  relee HEAD y, si la rama o el commit han cambiado, se aborta sin escribir. El
  test sustituye la confirmación por una que cambia de rama: reproduce la
  carrera sin temporizadores.
- El plan decía que los tests borraban "el resto de variables de git", y sólo
  borraban cinco: `GIT_CONFIG_COUNT`, que `git -c` exporta a los hooks, seguía
  entrando. Ahora `vitest.setup.ts` borra todas las `GIT_*` y fija después las
  dos que aíslan.

Sus seguimientos pasan a F0-15 sin tocar más código en esta PR: es la primera
aplicación del protocolo de conservación de tokens (una PR sólo corrige
bloqueantes).

**Cómo se verificó:** tests en rojo antes de cada cambio, y **30 mutaciones**
deliberadas de la lógica, registradas en `scripts/check-mutations.mjs`
(`pnpm check:mutations`) y ejecutadas bajo una configuración de git hostil,
global e inyectada por el entorno. La ejecución completa detectó 28 de 28; las
tres añadidas en la sexta ronda se ejecutaron por separado
(`pnpm check:mutations <nombre>`) y también se detectan. Las rondas anteriores usaban mutaciones que
no quedaban en el repositorio, y la revisión no pudo reproducirlas; por eso son
ahora un script. Varias resultaron ser mutantes equivalentes —`??` también salta
`null`, o un test que ya configuraba el nombre en minúsculas— y se sustituyeron
por mutaciones o tests fieles.

**La CI no comprobaba los tipos**, descubierto de paso: los pasos de typecheck y
coherencia tenían `if: matrix.node == '22'` y la matriz era `'22.13'`. Son ahora
un job propio, `Tipos y coherencia`.

**Pendiente, anotado para `doctor` (F4-3):** avisar cuando `origin/HEAD` pueda
estar desfasado y sugerir `git remote set-head origin --auto`. La herramienta no
debe ejecutarlo sola: modifica el estado de git y necesita red.

---

### [x] F0-15 — Corregir el control de nombres de rama tras la revisión de la PR #6
**Rama:** `fix/f0-branch-control-review` · **Depende de:** F0-14

**Origen:** la PR #6 se mergeó sin revisión y se revisó después, en contexto
nuevo. El hallazgo más grave —la CI nunca ejecutaba el control— se corrigió en
F0-14. Quedan estos, y su conclusión general es incómoda: **el control de
nombres de rama, tal como está, es más frágil de lo que parece.**

La revisión dejó catorce puntos, y sólo cinco son el control de nombres de rama.
Los demás —la plantilla de cliente, la decisión de estrategia de merge, los
restos del plan y los seguimientos de las revisiones de F0-14 y de la PR #7— se
han repartido en F0-19 a F0-24: una rama implementa exactamente una tarea (§3 de
`CLAUDE.md`).

**Trabajo:**

1. **No bloquear las ramas legítimas.** En cuanto el control corre en CI, una PR
   de `develop` a `Prod` —una release— falla, porque `develop` no sigue el
   formato de rama de tarea. También fallarían `revert-*` (el botón *Revert* de
   GitHub) y `<usuario>-patch-*` (el editor web, que usarán colaboradores
   externos al ser el repositorio público). Además, el prefijo `dependabot/` es
   una puerta trasera: `dependabot/../fix/f0-ramas` lo supera. Exención por
   **autor** (`github.actor`), no por nombre, y lista explícita de ramas
   permanentes.

2. **La heurística de idioma falla en los dos sentidos.** Deja pasar 15 de los 33
   nombres españoles que la propia PR renombró (`version-unica`,
   `cobertura-umbral`, `trinquete-metricas`, `suscripcion-anual`…) y rechaza
   nombres ingleses válidos (`access-control`, `de-duplicate`, `y-axis`).
   `control` era especialmente mala señal: rechazó el nombre de rama de **esta
   misma tarea** en cuanto se escribió en el plan. Se retiró de la lista en
   F0-14 para poder mergearla; el resto se rehace aquí.
   El formato acepta `f00` y `f999`. Rehacerla con un **corpus de prueba**: los
   33 nombres renombrados como positivos y una lista de nombres ingleses reales
   como negativos. Si no alcanza una precisión aceptable, **quitarla** y dejar
   sólo el formato: una heurística que falla la mitad de las veces es peor que
   ninguna, porque da una falsa sensación de control.

3. **El analizador del plan falla en silencio.** Se salta líneas de rama con
   formatos ligeramente distintos, acepta un plan vacío, no reconoce `### [X]`
   con mayúscula y no reinicia el estado en cabeceras que no son tareas. Añadir
   una aserción de mínimo: si encuentra menos ramas de las que hay tareas, falla.

4. **El control no tiene tests.** Los cinco casos de la PR se probaron a mano.
   Además el script no se puede testear tal como está: todo se ejecuta al cargar
   y termina con `process.exit`. Separar la lógica en funciones exportadas y
   cubrirla con tests unitarios.

5. **La sección 0 de `CLAUDE.md` no funciona literalmente en un clon limpio.**
   Le falta `pnpm install`, usa `git branch --show-current` que no está en la
   lista de comandos de sólo lectura permitidos del §1 y dice "primera sesión en
   esta conversación".

**Qué se convierte en control mecánico:** los puntos 1, 2, 3 y 4 —las
exenciones del 1 se cubren con tests igual que el corpus y el analizador—. Del
5, que los comandos `git` de la §0 estén permitidos por la §1: es un choque
entre dos secciones del mismo fichero, y sólo se ve leyendo las dos a la vez.

**Cómo ha quedado:**
- La lógica vive en `scripts/branch-names.mjs`: funciones puras, sin
  `process.exit`. `scripts/verificar-coherencia.mjs` sólo conecta las entradas.
- El corpus está en `scripts/branch-names-corpus.json`: 33 nombres españoles, 43
  ingleses. La heurística nueva detecta 32 de 33 y no rechaza ninguno de los 43;
  la anterior dejaba pasar 15 y rechazaba 2. El único no detectado,
  `feat/f3-ci-solo-diff`, está declarado en el propio corpus con su test: todos
  sus componentes son también palabras inglesas.
- La señal de idioma ya no es sólo una lista de palabras: son terminaciones que
  no existen en inglés (`-cion`, `-dad`, `-miento`, `-cia`, `-ido`), y las
  palabras funcionales (`de`, `y`, `al`…) sólo cuentan **entre** otros dos
  componentes, que es lo que separa `gobierno-de-ramas` de `de-duplicate`.
- Exención por autor: `[bot]` en el login, `<login>-patch-<n>` sólo si el login
  es el del autor, y `revert-<pr>-<rama>` sólo si la rama revertida era válida.
  `Prod` y `develop` son una lista explícita, no un patrón.
- La aserción de mínimo cuenta **por tarea**, no totales: una línea `**Rama:**`
  bajo una cabecera que no es tarea compensaba a la que faltaba, y la tarea sin
  rama seguía sin juzgarse. Lo encontró la revisión de esta PR.
- El control 8 recorre la §0 entera, no sólo sus bloques ```bash: un comando
  escrito en prosa entre acentos graves se colaba, y la afirmación de la §1
  —"todo comando `git` de la §0"— era falsa. También lo encontró la revisión.
  La segunda pasada añadió las opciones globales: `git -C ruta push` y
  `git -c k=v commit` no casaban con el patrón y desaparecían enteros. Nueve
  mutantes probados a mano; automatizarlos es el punto 4 de F0-25.

**No mecanizable:** un commit `docs:` de la PR #6 metió un cambio de producto
(las reglas de IA generadas) y un control nuevo de CI, y la descripción de la PR
se saltó los apartados de criterios y Definition of Done de la plantilla. No hay
control que vea el ámbito de un commit ni que lea una descripción; la defensa es
la revisión en contexto nuevo. Queda registrado para no repetirlo.

**Criterios de aceptación:**
- [x] Una PR de `develop` a `Prod` pasa el control. Verificado simulando
  `GITHUB_HEAD_REF=develop`, junto con las ramas de bot, del editor web y del
  botón *Revert*.
- [x] El corpus de nombres está en el repositorio y el control lo pasa.
- [x] El script de coherencia tiene tests que se ejecutan en `test:unit`
  (`scripts/branch-names.test.mjs`, 97 casos).
- [x] La sección 0 de `CLAUDE.md` funciona copiando y pegando en un clon limpio,
  y un control lo vigila: `check:coherencia` falla si la §0 propone un comando
  `git` que la §1 no permite. Probado con el mutante.

---

### [ ] F0-16 — Nombres de ficheros e identificadores en inglés
**Rama:** `refactor/f0-english-names` · **Depende de:** F0-15

**Origen:** decisión del 2026-09-11. Los nombres no son documentación: acaban en
rutas, imports e historial, y los lee cualquier desarrollador. La documentación
y los comentarios de este proyecto siguen en español.

**Trabajo:**
1. Renombrar a inglés los ficheros con nombre en español —`scripts/verificar-coherencia.mjs`,
   `docs/PLAN_DE_EJECUCION.md`, `docs/ARQUITECTURA.md`, `docs/MODELO_DE_NEGOCIO.md`,
   las ADR 0001 a 0004 y el `GOBERNANZA.md` que genera el pack de Node— y
   **actualizar en el mismo cambio todos los enlaces y referencias**.
2. Pasar a inglés las variables y funciones con nombre en español.
3. **El control, no sólo la regla.** En la misma sesión en que se acordó, se creó
   un fichero nuevo con nombre en español (`0005-lo-inferido-solo-amplia.md`,
   corregido antes de commitear). Una regla recién escrita se incumple con
   facilidad: `check:coherencia` debe fallar ante un fichero nuevo cuyo nombre
   parezca español, y ante enlaces rotos tras el renombrado.
4. **En el producto:** el wizard (F4-1) pregunta a la empresa si trabaja en `es`
   o en `en`, y **todo gira en torno a esa elección**: el contenido generado, los
   comentarios y lo que las reglas de IA piden al asistente para nombres y
   comentarios. Es configuración de la empresa, no imposición nuestra.

**Criterios de aceptación:**
- Ningún fichero ni identificador en español fuera del contenido en prosa.
- Ningún enlace roto en la documentación.
- El control falla al añadir un fichero con nombre en español.

---

### [x] F0-17 — Protocolo de conservación de tokens y herramientas de agente
**Rama:** `chore/f0-agent-tooling` · **Depende de:** F0-14

**Origen:** la sesión de la PR #7 (F0-14) gastó más del 80 % de la ventana de
uso de cinco horas. Cada paso reenviaba la conversación entera (~130k tokens),
hubo cinco rondas de revisión en contexto nuevo, y cada seguimiento corregido
dentro de la PR provocaba otra ronda. Caveman sólo recorta la salida, menos del
1 % del gasto: la palanca es abrir sesiones nuevas.

**Trabajo:**
1. Sección 6 de `CLAUDE.md`: una tarea, una sesión; lo pesado a la CI; lecturas
   dirigidas; en una PR abierta sólo bloqueantes. La sección 0 deja de pedir la
   batería completa en local y consulta la CI.
2. Integrar napkin (`blader/napkin`): skill en `.agents/skills/napkin/` fijada en
   `skills-lock.json`, enlace simbólico `.claude/skills/napkin` —Claude Code no
   lee `.agents/`— y runbook versionado en `.claude/napkin.md`.
3. Documentar caveman como plugin opcional de cada desarrollador, y prohibir su
   gateway en la nube (`caveman-setup`) por la ADR 0002.
4. **El control, no sólo la regla.** `check:coherencia` falla si una skill no
   coincide con el hash del lock, si falta en el lock, si falta su enlace en
   `.claude/skills/`, o si el runbook incumple sus reglas de curación.
5. Llevar el protocolo al producto: ampliar F2-9 y F2-12.

**Criterios de aceptación:**
- [x] `CLAUDE.md` recoge el protocolo y cómo se usan napkin y caveman.
- [x] Claude Code carga la skill napkin desde `.claude/skills/`. Verificado en
  una sesión nueva: las skills se descubren al arrancar.
- [x] `check:coherencia` falla al editar la skill, meter un enlace simbólico en
  ella, borrar el enlace de `.claude/skills/`, añadir una skill sin lock, quitar
  un "Do instead", quitar una fecha o pasar de 10 entradas en una categoría.
  Probado con los mutantes.
- [x] F2-9 y F2-12 incluyen el protocolo y las herramientas de agente.

**No mecanizable:** la duración de una sesión y lo que se lee en ella. Ningún
control del repositorio lo observa; la defensa es la sección 6 de `CLAUDE.md`.
Tampoco lo es cuándo se cura el runbook: la skill pide curarlo en cada lectura y
nuestra regla, sólo al añadir una entrada. Ningún control ve cuántas veces se
reescribe; prevalece `CLAUDE.md`, que lo dice expresamente.

**Limitación conocida:** el enlace simbólico no funciona en Windows con
`core.symlinks=false`, donde git lo deja como un fichero de texto. Hoy nadie del
equipo desarrolla en Windows; el control lo detectaría.

---

### [ ] F0-18 — Documentación del repositorio en inglés
**Rama:** `docs/f0-english-documentation` · **Depende de:** F0-16

**Origen:** decisión del 2026-09-11. El código, los comentarios y la
documentación de este repositorio están en español porque así se decidió al
empezar (CLAUDE.md, §"Mensajes de commit..."). Se revierte: la industria y el
propio asistente trabajan en inglés, y cada documento en español que el
asistente lee o reescribe (el plan tiene más de 2.000 líneas) se paga en
tokens en cada sesión. Es distinto de la Fase 1: aquella traduce lo que el
producto **genera** para el cliente según su perfil; esto traduce **nuestra
propia** documentación.

**No es retroactivo.** Un ADR ya cerrado, o una entrada de este plan ya
marcada, es un hecho histórico —como las alternativas descartadas o las fechas
de cierre— y no se reescribe, igual que un reemplazo de marca no toca hechos
fechados. Esta tarea traduce el documento que ya existe hoy; lo que se escriba
después, se escribe directamente en inglés.

**Trabajo:**
1. Traducir a inglés, conservando su estructura y enlaces: `README.md`,
   `CONTRIBUTING.md`, `CLAUDE.md`, `.claude/napkin.md`,
   `.github/PULL_REQUEST_TEMPLATE.md`, `docs/PLAN_DE_EJECUCION.md`,
   `docs/ARQUITECTURA.md`, `docs/MODELO_DE_NEGOCIO.md` y las cinco ADR de
   `docs/adr/`. **Depende de F0-16** porque esos ficheros ya tienen que llevar
   nombre en inglés antes de traducir su contenido: traducir y renombrar a la
   vez duplica el churn y complica revisar el diff.
2. Revertir en `CLAUDE.md` la regla que fija el español para comentarios y
   documentación (§"Mensajes de commit..." y §4). El propio fichero que impone
   la regla es el primero que hay que cambiar.
3. Actualizar la tabla de la §0 y cualquier referencia cruzada a los nombres de
   fichero que cambien de contenido (no de ruta: eso ya lo cubrió F0-16).
4. Dado el tamaño (el plan solo pasa de 2.000 líneas), esta tarea probablemente
   se ejecuta en más de una sesión: una tanda por fichero o grupo de ficheros,
   cada una cerrando su propio commit dentro de la misma rama, seguida de
   `pnpm check:coherencia`. Sigue siendo una sola tarea del plan y una sola PR.
5. Comprobación de coherencia: ningún fichero de los listados en el punto 1
   puede contener texto en español fuera de citas literales (por ejemplo, un
   nombre propio o un hecho histórico ya fechado).

**Criterios de aceptación:**
- Los nueve documentos y las cinco ADR están en inglés; los hechos históricos
  fechados (alternativas descartadas, fechas de cierre) no se reescriben.
- `CLAUDE.md` ya no exige español para comentarios ni documentación.
- `pnpm check:coherencia` sigue en verde.
- Ningún enlace interno queda roto tras la traducción.

---

### [ ] F0-19 — La plantilla de ramas para clientes se contradice en español
**Rama:** `docs/f0-branch-naming-templates` · **Depende de:** F0-15

**Origen:** revisión de la PR #6, puntos 5 y 6. Salieron de F0-15 para no
mezclar el control del repositorio con lo que se le genera al cliente.

**Trabajo:**
1. Con `commitLanguage: 'es'` la plantilla dice que las ramas van en español y
   pone como ejemplo `fix/protected-branch-detection`, en inglés fijo. El test
   sólo cubre `en`, y dos aserciones incluyen un salto de línea literal que se
   romperá al reajustar el párrafo. Con `git: false` sigue diciendo "la persona
   que ejecuta git".
2. La cabecera que se escribe en el `config.yml` del cliente y el JSDoc de
   `commitLanguage` siguen diciendo que sólo afecta a commits y PRs; ahora
   también a ramas y títulos.

**Qué se convierte en control mecánico:** el test de la plantilla se amplía a
`es` y a `git: false`, y deja de comparar párrafos con saltos de línea
literales.

**Criterios de aceptación:**
- La plantilla dice lo mismo en `es` y en `en`, y el test cubre los dos idiomas.
- Con `git: false` no aparece ninguna mención a quien ejecuta git.
- La cabecera del `config.yml` y el JSDoc de `commitLanguage` nombran ramas y
  títulos.

---

### [ ] F0-20 — Decidir la estrategia de merge y reformular el argumento
**Rama:** `docs/f0-merge-strategy` · **Depende de:** F0-15

**Origen:** revisión de la PR #6, punto 7. El argumento de la regla de nombres
de rama es "el nombre de rama queda en el historial de git". Con *squash merge*
y borrado de rama, que es lo que dice el §3.2, no queda. Sólo queda porque en la
práctica se está mergeando con *merge commit*.

**Trabajo:** decidir cuál de las dos es la regla y dejarla escrita en un sitio.
Reformular el argumento: el nombre de rama se ve en la PR, en la CI y en el
mensaje del merge, y lo lee todo el equipo.

**Qué se convierte en control mecánico:** nada por sí mismo; es una decisión. Si
se elige *squash merge*, el consejo `git branch -d` de la CLI deja de funcionar
y eso sí es un control (queda en F0-24).

**Criterios de aceptación:**
- El §3.2 y `CLAUDE.md` dicen la misma estrategia de merge.
- El argumento de la regla de nombres de rama no afirma nada que la estrategia
  elegida desmienta.

---

### [ ] F0-21 — Restos del plan y del diagrama de flujo
**Rama:** `docs/f0-plan-leftovers` · **Depende de:** F0-15

**Origen:** revisión de la PR #6, punto 9.

**Trabajo:** el diagrama del §3.2 sigue diciendo `docs/f2-guia-packs` y
`main (release)`; F3-5 tiene dos puntos numerados `2.`; la lista de "ya
entregado" de F0-12 no incluye los controles que se han ido añadiendo, y F0-12
sigue diciendo que `CLAUDE.md` "ronda las 130 líneas" cuando pasa de 250.

**Qué se convierte en control mecánico:** extender el control de nombres de rama
al diagrama del §3.2, que hoy no mira. El recuento de controles de F0-12 se
deriva de `verificar-coherencia.mjs` en vez de escribirse a mano, que es lo que
lo deja caducado cada vez que se añade uno. El resto es corrección puntual.

**Criterios de aceptación:**
- El diagrama del §3.2 usa nombres de rama que pasan el control, y el control
  los mira.
- F3-5 numera sus puntos sin repetir.
- F0-12 no afirma ningún número —de controles ni de líneas— que el repositorio
  desmienta.

---

### [ ] F0-22 — Seguimientos de la revisión de F0-14
**Rama:** `fix/f0-f014-review-followups` · **Depende de:** F0-15

**Origen:** revisión de la PR #7, punto 11 de F0-15.

**Trabajo:**
1. El control de que existe el job `calidad` se ejecuta **dentro de ese mismo
   job**: con `if: false`, `continue-on-error: true` o quitándole los pasos, el
   control desaparece con él. Debe comprobarse desde otro job, o mejor, que el
   job sea un check obligatorio (lo es desde F0-13) y verificar que lo sigue
   siendo leyendo el ruleset.
2. La comprobación de condiciones `if` no reconoce `- if:` en forma de elemento
   de lista, operandos invertidos ni `startsWith`, y no mira `e2e.yml`.
3. La rama por defecto sólo se lee de `origin`: un repo cuyo remoto se llame
   `upstream` no aporta esa fuente.
4. Los tests de `packages/*/test/` no pasan por el typecheck: los `tsconfig`
   sólo incluyen `src/`.
5. `listBranchNames` quita sólo el primer segmento del nombre de un remoto: un
   remoto con `/` en el nombre produce nombres de rama erróneos.
6. Los tests que ejecutan `runApply` imprimen toda la salida del CLI en el log
   de la CI.

**Qué se convierte en control mecánico:** los puntos 1 a 5. El 6 es ergonomía,
no corrección. Un `integration` deducido de un `origin/HEAD` desfasado y escrito
en `config.yml` **no** es mecanizable —depende de que el equipo lea el fichero—
y lo resuelve la confirmación del wizard (F4-1).

**Criterios de aceptación:**
- Vaciar el job `calidad` hace fallar la CI desde otro job.
- Hay un test por cada uno de los puntos 2 a 5, y falla al revertir su
  corrección.

---

### [ ] F0-23 — Sacar el escaneo del historial completo a su propio workflow
**Rama:** `ci/f0-history-scan-workflow` · **Depende de:** F0-15

**Origen:** revisión de la PR #6, punto 12. Vive en `ci.yml` con una condición,
así que aparece como *Skipped* en todas las PRs y genera la duda de si algo
falla. En un workflow que sólo se dispare por calendario y a mano, no
aparecería. Se ejecutó por primera vez el 2026-09-11: el historial completo
está limpio.

**Qué se convierte en control mecánico:** nada. Es un cambio de estructura sin
regla nueva que vigilar.

**Criterios de aceptación:**
- El escaneo vive en su propio workflow, con disparadores `schedule` y
  `workflow_dispatch`.
- Ninguna PR muestra un job *Skipped* por esta causa.

---

### [ ] F0-24 — Seguimientos de las revisiones de la PR #7
**Rama:** `fix/f0-pr7-review-followups` · **Depende de:** F0-15

**Origen:** puntos 13 y 14 de F0-15, de la tercera y la cuarta revisión previas
al merge de la PR #7.

**Trabajo:**
1. **Prioridad alta.** `rollback` en `Prod` sobrescribe ficheros de `Prod` con
   un journal de un `apply` que escribió en la rama aislada: el journal guarda
   la rama de partida, no la escrita, está ignorado por git y sobrevive a los
   checkouts. Reproducido: devuelve el `package.json` de `Prod` a una versión
   anterior. Existe también en `develop`. El journal debe guardar la rama en la
   que se escribió, y `rollback` negarse en cualquier otra.
2. Tras un fallo de `apply` —un `EACCES`, por ejemplo—, la reversión automática
   deja HEAD en `chore/setup-ai-governance` y el mensaje dice "el repositorio
   está intacto". Los ficheros lo están, pero la rama actual ya no es la de
   partida. El mensaje debe decir en qué rama queda y cómo volver. Lo mismo tras
   `rollback`.
3. `doctor` da por revisadas todas las PRs con `branches-ignore` o `paths` en
   `pull_request`, y avisa en falso con `on: pull_request` y
   `on: [push, pull_request]`.
4. Con una rama llamada `chore`, `apply` falla tras confirmar con un error crudo
   de git (`refs/heads/chore' exists`). No escribe nada, pero la comprobación
   previa no lo detecta.
5. Un valor no textual en `branches` (`release: 2024`) se descarta sin avisar.
6. El consejo `git branch -d` no funciona tras un *squash merge* (depende de
   F0-20).
7. `ciPushBranches` deduplica sin distinguir mayúsculas, y los filtros de GitHub
   sí distinguen: `integration: prod` y `release: Prod` dejan fuera `Prod`.
8. `pnpm check:mutations` no se ejecuta en CI, así que todavía no es un control:
   depende de que alguien lo lance. Añadirlo como job, al menos en las PRs que
   tocan `branches.ts`, `context.ts`, `commands.ts` o las plantillas de CI. Así
   deja de ejecutarse dentro de la sesión del asistente, que es lo que más tarda.

**Qué se convierte en control mecánico:** un test por punto; el del `rollback`,
reproduciendo el caso de la revisión. El 8 es el propio job de mutaciones.

**Criterios de aceptación:**
- `rollback` se niega a actuar en una rama distinta de aquella en la que
  `apply` escribió, y hay un test que reproduce el caso de `Prod`.
- Hay un test por cada uno de los puntos 2 a 7, y falla al revertir su
  corrección.
- `check:mutations` corre en CI.

---

### [ ] F0-25 — Seguimientos de la revisión de la PR #10
**Rama:** `fix/f0-branch-control-followups` · **Depende de:** F0-15

**Origen:** revisión en contexto nuevo de la PR #10 (F0-15). Los dos
bloqueantes se corrigieron dentro de la PR; estos son los no bloqueantes, que
van al plan y no a la rama abierta (§6.4 de `CLAUDE.md`).

**Trabajo:**
1. **Dos exenciones siguen siendo por nombre, no por autor.** `branchExemption`
   exime `Prod`/`develop` y `revert-<n>-<rama válida>` sin mirar el autor:
   cualquiera puede llamar a su rama `revert-1-develop` y saltarse el control
   entero. El impacto real es bajo —es un control de convención, no de
   seguridad— pero la puerta trasera que cerró el punto 1 de F0-15 sigue
   entreabierta con otra forma. Decidir si se ata también al autor (la rama
   `revert-*` la crea quien pulsa el botón, que es alguien con permiso de
   escritura) o si se acepta, y dejarlo escrito donde se pueda leer.
2. **Regresión operativa con Dependabot, sin anotar.** La exención exige ahora
   `GITHUB_ACTOR` terminado en `[bot]`. Si una persona empuja un commit a una
   rama `dependabot/...`, el actor es esa persona y la rama falla el formato:
   CI roja en una rama legítima. Con el prefijo anterior no pasaba. La decisión
   es deliberada y correcta, pero no está anotada ni en el plan ni en el JSDoc.
3. **La lista de permitidos del control 8 se corta en el primer punto.** El
   patrón `/Sí puedes usar los de sólo lectura:([\s\S]*?)\./` trunca la lista
   en silencio si alguien añade a la §1 un `git log --format=%h` o cualquier
   comando con un punto. Falla en voz alta, que es la dirección segura, pero el
   mensaje apunta al sitio equivocado y cuesta de diagnosticar.

4. **El control 8 no tiene ni un test automático.** Se ha validado con nueve
   mutantes a mano, en dos revisiones. Es el argumento textual del punto 4 de
   F0-15 —lógica en línea dentro de un script que acaba en `process.exit`—
   aplicado al control que nació de esa misma revisión, y la rama de error
   nueva (el `git` cuyo subcomando no se sabe leer) tampoco tiene prueba. La
   solución ya está demostrada en F0-15: sacar el cuerpo a una función pura,
   en un módulo propio, y cubrirla con los mutantes que hoy se lanzan a mano.

5. **Cosmético.** El mensaje de la aserción de mínimo dice "1 de las 1 tareas".

**Qué se convierte en control mecánico:** el 1, el 3 y el 4, con tests. El 2 es
una anotación: ningún control puede ver que una rama de bot ha dejado de serlo
porque una persona ha empujado a ella.

**Criterios de aceptación:**
- La decisión del punto 1 está escrita, y si se ata al autor hay un test que
  rechaza `revert-1-develop` de un autor sin permiso.
- El punto 2 está anotado en el JSDoc de `branchExemption`.
- Añadir a la §1 un comando con un punto no trunca la lista de permitidos, y
  hay un test que lo fija.
- El control 8 vive en un módulo propio con tests que cubren, como mínimo, los
  nueve mutantes ya probados a mano: comando en prosa, en bloque, en tabla,
  con `-C` y con `-c`, permitido con `=`, subcomando ilegible, `gitlab`/`legit`
  que no son comandos, y la lista de la §1 recortada.

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

### [ ] F1-1 — Paquete `@plumbward/i18n`
**Rama:** `feat/f1-i18n-package` · **Depende de:** Fase 0 completa

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
   `plumbward plan`, la pantalla más importante del producto.

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
3. `plumbward scan` debe poder elegir idioma **antes** de que exista config.

**Criterios de aceptación:**
- `plumbward scan --lang en` en un repo sin configurar sale íntegro en inglés.

---

### [ ] F1-4 — Test de paridad entre idiomas
**Rama:** `test/f1-language-parity` · **Depende de:** F1-2, F1-3

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
**Rama:** `feat/f1-rule-provenance` · **Depende de:** F1-1

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
**Criterio de salida:** `plumbward apply` produce valor real en repos de Node,
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
- `plumbward apply` sobre un repo de un lenguaje sin pack (p. ej. Elixir)
  instala escaneo de secretos, CODEOWNERS y reglas de IA, y no falla.
- El pack `base` nunca duplica lo que ya aporta un pack específico (lo verifica
  el `PlanBuilder`, que debe reportar conflicto si ocurre).

---

### [ ] F2-3 — Kit de pruebas de conformidad reutilizable
**Rama:** `test/f2-conformance-kit` · **Depende de:** F2-2

**Por qué antes de escribir cuatro packs:** sin esto, cada pack se testea de una
forma distinta y la calidad diverge. Y cuando abramos el catálogo a terceros
(el eje de escalado del negocio), esta suite es lo único que impide que un pack
mal escrito destroce el repositorio de un cliente.

**Trabajo:**
1. Paquete `@plumbward/pack-testkit`.
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
   `@plumbward/ast`**, que hoy sólo tiene JSON y YAML. Es la parte cara de esta
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
3. Parcheo no destructivo de `composer.json` (es JSON: reutiliza `@plumbward/ast`).
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
**Rama:** `docs/f2-pack-authoring-guide` · **Depende de:** F2-7

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
**Rama:** `feat/f2-agent-skills` · **Depende de:** F2-2

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
4. **Proponer herramientas de agente de terceros** (origen: F0-17, donde las
   usamos nosotros): napkin como runbook del repositorio y la parte local de
   caveman para comprimir las respuestas. Se proponen, nunca se instalan sin
   confirmación (ADR 0005), con versión y hash fijados en un lock y el enlace
   que cada asistente necesita para cargarlas.
5. **No recomendar ningún gateway en la nube** que enrute las peticiones del
   asistente por un tercero, como `caveman-setup`: contradice la postura
   local-first y sin telemetría (ADR 0002) y es un problema de cumplimiento para
   el cliente.
6. Una skill o plugin de terceros ejecuta con acceso al repositorio del cliente:
   revisar sus hooks y scripts antes de incluirla en el catálogo.
7. Portar a `doctor` los controles de F0-17: hash de cada skill contra su lock,
   enlace presente, y runbook dentro de sus reglas de curación.

**Criterios de aceptación:**
- Un repositorio de Node/TS recibe skills y reglas coherentes entre los tres
  asistentes, sin instrucciones contradictorias entre ficheros.
- Nada se conecta a un servicio externo sin confirmación explícita.
- Una skill alterada respecto a su lock hace fallar `doctor`.

---

### [ ] F2-13 — Snapshots dorados de lo que genera cada pack
**Rama:** `test/f2-pack-snapshots` · **Depende de:** F2-3, F0-12

**Por qué:** un pack produce ficheros que acaban dentro del repositorio del
cliente. Hoy nada impide que un refactor cambie un marcador, un identificador de
bloque o el nombre de un script generado **sin que ningún test se entere** —
exactamente lo que pasó en F0-8 con el identificador del bloque de `.gitignore`.

**Trabajo:**
1. Extender el kit de conformidad con snapshots de la salida completa de cada
   pack sobre repositorios sintéticos representativos.
2. Marcar explícitamente qué partes de esa salida son **tokens persistidos** —
   los que se escriben en ficheros del cliente y no pueden cambiar sin
   migración— y hacer que su cambio falle con un mensaje que lo explique, en
   lugar de simplemente actualizar el snapshot.
3. Cubrir también el diff entre versiones: qué cambiaría un `upgrade`.

**Criterios de aceptación:**
- Cambiar un marcador o un identificador de bloque falla con un mensaje que
  nombra la migración que haría falta.
- Actualizar un snapshot exige una acción consciente, nunca un `--update` a
  ciegas en la CI.

---

### [ ] F2-11 — Frontera real para packs de terceros
**Rama:** `feat/f2-pack-isolation` · **Depende de:** F2-8

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
**Rama:** `refactor/f2-boundaries-to-base-pack` · **Depende de:** F2-2

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
6. **Protocolo de conservación de tokens** (origen: F0-17), en la misma sección y
   en todos los ficheros de reglas de IA: una tarea por sesión, lo pesado a la
   CI, lecturas dirigidas con `grep` y rangos de líneas, y en una PR abierta
   sólo bloqueantes. Es independiente del stack y del asistente: se escribe una
   vez en la configuración central y se traduce a `CLAUDE.md`, `AGENTS.md`,
   `.cursorrules` y `.github/copilot-instructions.md`.

**Criterios de aceptación:**
- Un repositorio de cualquier stack recibe los límites, con los comandos de
  migración propios de su ecosistema nombrados explícitamente.
- Desactivar `agentBoundaries.git` en el perfil los elimina de todos los
  ficheros generados a la vez, y la numeración de secciones sigue siendo válida.
- La sección aparece igual en español y en inglés.
- El protocolo de conservación de tokens aparece en todos los ficheros de
  reglas de IA generados, con el mismo contenido.

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
3. Comando `plumbward baseline --update`, que exige que el árbol esté limpio
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
**Rama:** `feat/f3-diff-only-ci` · **Depende de:** F3-2

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
**Rama:** `feat/f3-ratchet-metrics` · **Depende de:** F3-3

**Por qué:** es la diferencia entre "instalamos linters" y "gobernanza". Y es lo
que hace que la licencia se renueve: el valor se acumula mes a mes de forma medible.

**Trabajo:**
1. La CI compara las métricas de la PR contra el baseline y **falla si la deuda
   sube**, aunque los valores absolutos sigan siendo altos.
2. Cuando una PR reduce la deuda, el baseline se actualiza automáticamente a la
   baja: el trinquete nunca retrocede.
3. `plumbward report` muestra la evolución de la puntuación de madurez y de la
   deuda en el tiempo.

**Criterios de aceptación:**
- Una PR que añade un `any` nuevo falla, aunque el repo tenga 3.000.
- Una PR que elimina 10 infracciones baja el baseline en el mismo merge.

---

### [ ] F3-5 — Gobierno del flujo de ramas (feature de producto)
**Rama:** `feat/f3-branch-governance` · **Depende de:** F2-2

**Por qué:** es la pregunta 1 del wizard en el PDF y hoy no existe nada.
Nosotros estamos usando este flujo internamente (§3): esta tarea convierte esa
práctica en producto.

**Trabajo:**
1. El pack `base` genera y documenta la estrategia de ramas elegida en el perfil,
   **con los nombres de rama del perfil** —configurados, o propuestos y
   confirmados, nunca supuestos:
   `Prod`, `main`, `trunk` o lo que use el equipo (ver F0-14).
2. Convención de nombres de rama en el idioma del historial
   (`agentBoundaries.commitLanguage`, inglés por defecto), con formato
   `<tipo>/<descripción>`, y **un control que la verifique en CI** leyendo la
   rama desde `GITHUB_HEAD_REF` —nunca interpolándola en un `run:`, porque el
   nombre de rama lo controla quien abre la PR—. Las reglas de IA generadas ya lo
   piden desde el 2026-09-11; falta el control en el repo del cliente.
2. Genera las **reglas de protección de rama** como fichero declarativo
   (ruleset de GitHub) más las instrucciones para aplicarlas. Aplicarlas
   automáticamente requiere token de administración: se ofrece, **nunca se
   asume**, y sólo con confirmación explícita.
3. Genera plantillas de PR e issues, y `CODEOWNERS` a partir de los autores
   reales que devuelve el historial de git.
4. Documenta el flujo en el `GOBERNANZA.md` que ya genera el pack de Node.

**Lo aprendido configurándolo a mano en F0-13**, que concreta el diseño:

- **Los checks obligatorios salen de los workflows generados.** Deben coincidir
  exactamente con el `name` de cada job, y los de matriz se expanden (`Node
  22.13`, `Node 24`…). Si la matriz cambia y la regla no, todas las PRs quedan
  bloqueadas para siempre. Como Plumbward genera las dos cosas, calcula la lista
  exacta y en cada `upgrade` actualiza ambas a la vez. **Es la ventaja que no
  tiene una herramienta que sólo protege ramas.** `doctor` avisa si un check
  obligatorio no corresponde a ningún job.
- **Aprobaciones según el equipo:** 0 para un desarrollador solo, que con 1 no
  podría mergear nunca sus propias PRs; 1 o más para equipos.
- **Qué ramas proteger:** `integration` y `release` del perfil, más la rama por
  defecto de GitHub, que se lee de la API. Proteger una rama de más es barato;
  lo que nunca se deduce es desde cuál se despliega. Si falta `release`, se
  protege lo que se sabe y se avisa (ADR 0005).
- **Es una operación remota nueva**, fuera de las seis operaciones locales del
  núcleo, así que requiere una **ADR**. Debe conservar las garantías: `plan`
  muestra la regla exacta, se leen primero las existentes para no pisarlas,
  `apply` sólo con confirmación explícita, y el journal guarda su identificador
  para que `rollback` la borre.
- **Requiere permisos de administración:** se usa la sesión de `gh` que ya
  tenga el usuario, sin guardar nunca el token.
- **Límite de GitHub:** las reglas se aplican en repositorios públicos con
  cualquier plan, pero en privados exigen Pro, Team o Enterprise. Detectarlo y
  explicarlo, en lugar de crear una regla que GitHub ignora sin avisar.
- Multiplataforma: GitLab y Bitbucket tienen APIs equivalentes.

**Criterios de aceptación:**
- Tras aplicar, el repo del cliente tiene documentado su flujo y las
  protecciones listas para activar.
- Nada toca la configuración remota del repositorio sin confirmación explícita.
- Los checks obligatorios coinciden con los jobs generados, y cambiar la matriz
  actualiza la regla en el mismo `upgrade`.

---

### [ ] F3-6 — Flujo de entrega y revisión asistida en las reglas generadas
**Rama:** `feat/f3-delivery-workflow` · **Depende de:** F3-5

**Por qué:** el cuello de botella que el producto promete resolver no es escribir
el código, es **revisarlo**. Un equipo pequeño, o uno en el que sólo queda una
persona un viernes por la tarde, acumula PRs sin revisar y acaba mergeando sin
mirar. Esta tarea convierte en producto el flujo que ya usamos internamente
(§3.3): el asistente del cliente entrega los textos y, si hace falta, revisa.

**Trabajo:**
1. El pack base añade a las reglas de IA generadas una sección de **flujo de
   entrega**: al cerrar una unidad de trabajo, el asistente entrega el mensaje de
   commit, el **título** de la PR y su descripción, en el idioma que indique
   `agentBoundaries.commitLanguage`, con el formato de la plantilla de PR que
   genere el propio pack. El título en una línea y bajo 70 caracteres: es lo
   único que se ve en la lista de PRs.
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
6. **Revisión proporcional** (origen: F0-17). La primera revisión es completa;
   las siguientes se limitan al diff de las correcciones y usan un modelo ligero.
   Una corrección pequeña ya probada no lleva otra ronda. Al cerrar, el
   asistente recuerda que el merge es del desarrollador y que lo siguiente
   empieza en una sesión nueva (F3-10 lo automatiza).

**Criterios de aceptación:**
- Un repositorio configurado recibe el flujo de entrega en sus ficheros de reglas
  de IA, coherente con la plantilla de PR y el flujo de ramas que se le generan.
- Desactivar `assistedReview` elimina la parte de revisión pero mantiene la
  entrega de los mensajes.
- La sección deja explícito que la revisión asistida es una válvula contra el
  bloqueo, no un sustituto de la revisión humana.
- Las reglas generadas limitan las revisiones de seguimiento al diff de las
  correcciones.

---

### [ ] F3-7 — Leyes de testing acopladas al cambio
**Rama:** `feat/f3-test-coupling` · **Depende de:** F3-3

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
**Rama:** `feat/f3-security-posture` · **Depende de:** F3-3

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

### [ ] F3-9 — Controles derivados de incidentes
**Rama:** `feat/f3-incident-derived-controls` · **Depende de:** F3-7, F0-12

**Por qué es la funcionalidad con más foso de todo el plan:** el trinquete
impide empeorar en métricas. Esto impide **repetir un fallo concreto**. Al año,
la configuración de Plumbward de un cliente contiene los errores que su equipo
ya no comete — y eso no lo replica un competidor publicando un repositorio, ni
lo regala una plataforma. Es coste de cambio real.

**Trabajo:**
1. Un **catálogo de controles parametrizables**: cadena prohibida, fichero
   obligatorio, acoplamiento símbolo-test, coherencia entre documentación y
   comandos, token persistido que no puede cambiar, configuración insegura.
2. Flujo que convierte un hallazgo en una instancia de uno de esos controles con
   dos o tres respuestas. **No se deriva un control de prosa arbitraria**: se
   elige plantilla y se parametriza. Prometer lo contrario sería vender magia.
3. Los controles resultantes se versionan en el repositorio del cliente, en
   formato legible, y se revisan en una PR como cualquier otro cambio.
4. El registro de controles derivados alimenta el informe de F4-4: *"este año
   convertisteis 23 incidencias en controles; ninguna se ha repetido"*. **Es el
   informe de renovación, no hay que construirlo aparte.**

**Criterios de aceptación:**
- Un hallazgo típico se convierte en control en menos de un minuto.
- El control resultante es legible por una persona que no estuvo en la
  incidencia.
- Desactivar un control exige motivo escrito, visible en la revisión.

---

### [ ] F3-10 — Cierre de sesión guiado: `plumbward session close`
**Rama:** `feat/f3-session-close` · **Depende de:** F3-6, F1-3

**Origen:** F0-17. El protocolo de conservación de tokens pide abrir una sesión
nueva al cerrar cada tarea, pero hacerlo a mano es fricción: hay que recordar
qué sigue y redactar el arranque. Un paso manual y farragoso se salta; un
comando que lo deja todo en el portapapeles se usa. Es la tesis del producto
—los controles vencen a las reglas— aplicada al coste.

**Trabajo:**
1. `plumbward session close [--next="<tarea>"]`, como subcomando: el resto de la
   CLI usa verbos sueltos (`scan`, `plan`, `apply`), no `session:close`.
2. **Precondiciones.** Árbol limpio —ni cambios ni ficheros sin seguimiento— y
   rama empujada. Si algo falla, lo lista y no hace nada más.
3. **Siguiente tarea.** Sin `--next`, la primera pendiente cuyas dependencias
   estén cerradas, leída del plan que declare `.governance/config.yml`
   (`session.plan`: ruta y patrón de cabecera; por defecto `### [ ] <ID> — <título>`).
   El cliente no tiene nuestro `PLAN_DE_EJECUCION.md`: la fuente es configurable.
4. **Prompt de arranque con punteros, no con contenido.** Repositorio, tarea y
   su rama, último commit (hash y `--stat`) y qué leer y en qué orden. **Nunca el
   diff**: meterlo en el prompt es justo el contexto arrastrado que se quiere
   evitar; la sesión nueva lo pide si lo necesita. En el idioma del perfil.
5. Copia al portapapeles (`pbcopy`, `wl-copy`/`xclip`, `clip.exe`). Sin
   portapapeles (SSH, CI), lo imprime. No escribe en disco, así que no emite
   `Operation[]`; mismo config y mismo repo dan el mismo prompt (invariante 2).
6. Mensaje final: el merge lo hace el desarrollador, y hay que abrir una sesión
   nueva del asistente y pegar el prompt.
7. **Sin `clear`.** Limpiar la terminal no vacía el contexto del asistente: lo
   vacía la sesión nueva. Borrar la pantalla sólo esconde lo que el desarrollador
   quizá quería leer.

**Lo que no se puede prometer:**
- "Cero tokens": la sesión nueva sigue cargando las reglas y el prompt de
  sistema. Se promete **sin contexto acumulado**, que es lo que cuesta.
- "El cliente ve cuánto ahorra": no hay telemetría (ADR 0002). Medirlo exigiría
  un informe local leyendo los registros de cada asistente. Es otra tarea, y hay
  que decidir antes si entra en `MODELO_DE_NEGOCIO.md`.

**Criterios de aceptación:**
- Con el árbol sucio o la rama sin empujar, falla, lista la causa y no copia nada.
- Mismo config y mismo repositorio producen el mismo prompt, byte a byte.
- El prompt no contiene ningún diff y cabe en menos de 20 líneas.
- Sin portapapeles disponible, imprime el prompt y termina con éxito.
- Mensajes en español y en inglés.

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

### [ ] F4-1 — Wizard interactivo `plumbward init`
**Rama:** `feat/f4-wizard-init` · **Depende de:** Fase 3 completa

**Trabajo:**
1. Comando `init` con `@clack/prompts` (ya es dependencia del CLI).
2. Preguntas, **con un valor por defecto derivado del escaneo** para que pulsar
   Enter dé un resultado correcto —salvo la rama de despliegue, que no lo tiene
   a propósito—:
   - Estrategia de ramas (F3-5).
   - Destino de despliegue por entorno **y la rama desde la que se despliega**
     (`branches.release`). Es lo único que Plumbward nunca deduce (ADR 0005): se
     pregunta siempre, sin valor por defecto.
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

### [ ] F4-2 — `plumbward upgrade` con detección de personalizaciones
**Rama:** `feat/f4-upgrade-drift` · **Depende de:** F4-1

**Por qué:** es el corazón del modelo de suscripción, y el mecanismo ya está
medio construido: las cabeceras de fichero gestionado (`withManagedHeader`) y
los bloques delimitados (`ensureBlock`) existen precisamente para esto.

**Trabajo:**
1. Comparar el hash registrado en la cabecera de cada fichero gestionado con el
   contenido actual para clasificar: **intacto** (se regenera), **modificado por
   el cliente** (se respeta y se avisa) o **borrado** (se pregunta).
2. En ficheros con bloques delimitados, actualizar sólo el interior del bloque.
3. `plumbward upgrade --dry-run` que muestre el diff exacto, igual que `plan`.
4. Informe claro de qué se actualizó, qué se respetó y qué requiere decisión humana.
5. Migraciones entre versiones del formato de `config.yml`.

**Caso concreto que ya existe:** un `ci-prod.yml` generado por una versión
anterior de Plumbward desde una rama deducida sigue ahí tras actualizar, porque
`apply` no pisa ficheros existentes. Hoy sólo lo detecta `doctor` (F0-14);
`upgrade` debe poder regenerarlo o retirarlo. Lo mismo con un `ci-dev.yml`
antiguo que filtre `pull_request` por rama: las Pull Requests a otras ramas no
se revisan. `doctor` lo avisa desde F0-14; `upgrade` debe quitar el filtro.

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

### [ ] F4-4 — Informe comercial `plumbward report`
**Rama:** `feat/f4-sales-report` · **Depende de:** F4-3

**Por qué:** el que decide la compra no es quien ejecuta el CLI, y no va a leer
una salida de terminal. Este informe es la herramienta de venta: se genera
gratis, se comparte por correo y crea la necesidad que el producto resuelve.

**Trabajo:**
1. `plumbward report --html` produce un informe autocontenido: puntuación de
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
**Rama:** `feat/f4-version-detection` · **Depende de:** F4-2

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
**Rama:** `feat/f4-targeted-changelog` · **Depende de:** F4-5

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
**Rama:** `feat/f4-capability-catalog` · **Depende de:** F4-6

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
**Rama:** `feat/f4-guided-flows` · **Depende de:** F4-7

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

### [ ] F5-1 — Paquete `@plumbward/licensing`
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
**Rama:** `feat/f5-offline-grace` · **Depende de:** F5-3

**Trabajo:**
1. Si la API no responde durante un `upgrade`, se usa la licencia firmada en
   caché mientras siga vigente.
2. Ninguna caída de nuestra infraestructura puede bloquear el trabajo de un cliente.
3. Test que simula la API caída y verifica que todo sigue.

**Criterios de aceptación:**
- Con la API apagada, todos los comandos funcionan con una licencia válida en caché.

---

### [ ] F5-5 — Suscripción anual y tramos por volumen
**Rama:** `feat/f5-annual-subscription` · **Depende de:** F5-3

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
**Criterio de salida:** un cliente ejecuta `npx @tu-empresa/plumbward scan`, ve
el valor, paga y aplica.

---

### [ ] F6-1 — Publicación en NPM
**Rama:** `build/f6-npm-publishing` · **Depende de:** Fase 5 completa

**Trabajo:**
1. Scope y organización ya resueltos en F0-8: `@plumbward/*`, organización
   registrada en npm el 2026-09-09.
2. Empaquetado: un único ejecutable por `tsup`, arranque rápido, `bin` correcto.
3. Verificar `npx` en macOS, Linux y Windows, con las versiones de Node que
   la CI pruebe en ese momento (hoy 22.13, 24 y 26).
4. Publicación automática desde `main` con changesets y provenance.
5. Comprobar el tamaño del paquete: `npx` se ejecuta en cada demo y una descarga
   lenta arruina la primera impresión.

**Criterios de aceptación:**
- `npx @tu-empresa/plumbward scan` funciona en las tres plataformas.
- Arranque por debajo de 2 segundos.

---

### [ ] F6-2 — Validación E2E sobre repositorios reales
**Rama:** `test/f6-real-repo-e2e` · **Depende de:** F6-1

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
**Rama:** `docs/f6-landing-and-demo` · **Depende de:** F6-2

**Trabajo:**
1. Landing con la propuesta de valor, el precio y un `asciinema` de la demo real.
2. Informe de ejemplo (F4-4) publicado como muestra.
3. Documentación de usuario final, separada de la de contribuidores.
4. Caso de uso escrito con los números reales medidos en F6-2 — no estimaciones.

**Criterios de aceptación:**
- La landing responde en 30 segundos qué es, para quién y cuánto cuesta.

---

### [ ] F6-4 — Lanzamiento 1.0
**Rama:** `chore/f6-launch` · **Depende de:** F6-3

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
| ~~R1~~ | **Cerrado el 2026-09-10.** El nombre que se barajaba, `aegiscode`, estaba ocupado en npm, incluido `@save3asy/aegiscode`: un competidor homónimo en nuestra misma categoría | — | Renombrado a Plumbward, organización registrada en npm y dominios adquiridos. Tarea F0-8 completada |
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
2. ~~**Nombre del producto**~~ — se cerró como "AegisCode" el 2026-09-08 y se reabrió al descubrir que el nicho estaba ocupado por un competidor homónimo. Cerrado definitivamente el 2026-09-09: **Plumbward**, con la organización de npm y los dominios ya registrados.
3. **Telemetría**: la recomendación es **ninguna por defecto**, opt-in explícito.
   Vendemos confianza; instrumentar el CLI la contradice.

---

## 7. Cómo se mide que el plan va bien

| Indicador | Objetivo |
|---|---|
| Stacks con pack propio | 5 al terminar la Fase 2 |
| Repositorios en los que la herramienta no hace nada | 0 tras F2-2 |
| Cobertura de `@plumbward/core` | ≥ 90% |
| Tiempo de `scan` en un repo de 100k SLOC | < 10 s |
| Tiempo del ciclo completo en un repo medio | < 5 min (verificado, no estimado) |
| Incidentes de corrupción de repositorio de cliente | 0 |
