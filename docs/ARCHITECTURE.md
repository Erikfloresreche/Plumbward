# Arquitectura de Plumbward

Documento de referencia: qué hace el producto, cómo está construido y **por qué
cada pieza está donde está**. Si vas a tocar el código, léelo antes.

Para saber qué se construye a continuación, ve a
[EXECUTION_PLAN.md](EXECUTION_PLAN.md).

---

## 1. El problema y la respuesta

Los asistentes de IA generan código mucho más rápido de lo que un humano puede
revisarlo. El volumen de Pull Requests se dispara, los desarrolladores senior se
convierten en cuello de botella y los estándares del proyecto se diluyen. La
solución conocida —configurar CI, linters, hooks y escaneo de secretos— cuesta
entre 8 y 16 horas por repositorio, y casi nadie las dedica.

Plumbward automatiza ese trabajo. Pero lo que define el producto no es *qué*
instala, sino **cómo lo instala sin que puedas perder nada**. Todo el diseño
parte de una sola idea:

> Nunca escribir en el repositorio de alguien sin haberle enseñado antes
> exactamente qué va a pasar, y sin poder deshacerlo por completo después.

## 2. El ciclo de comandos

| Comando | Qué hace | ¿Escribe en disco? |
|---|---|---|
| `scan` | Diagnostica el repositorio y lo puntúa de 0 a 100 | **Nunca** |
| `plan` | Muestra el diff exacto de lo que haría | **Nunca** |
| `apply` | Materializa el plan dejando registro reversible | Sí, con journal |
| `rollback` | Deshace la última ejecución por completo | Sí, restaurando |
| `doctor` | Verifica que lo instalado sigue sano | No |

`scan` no requiere licencia por diseño: es el gancho comercial. El informe crea
la necesidad que el resto del producto resuelve.

---

## 3. La decisión central: separar el plan de la ejecución

Es la decisión de la que se derivan casi todas las demás.

Lo intuitivo sería recorrer el repositorio y, según lo que se encuentre, ir
escribiendo ficheros. Es lo que hacen la mayoría de generadores.

**Aquí está prohibido.** Ningún módulo escribe en disco. Los módulos *describen
su intención* devolviendo objetos:

```ts
{
  kind: 'createFile',
  path: '.gitleaks.toml',
  content: '…',
  managed: true,
  reason: 'Configura la detección de secretos antes de que lleguen al historial.',
}
```

Eso son **datos, no acciones**. Y los datos se pueden inspeccionar, ordenar,
deduplicar, simular, mostrar y revertir. Un `fs.writeFile()` disperso por el
código no permite nada de eso.

De ahí salen las cuatro propiedades que constituyen el producto:

**`plan` puede existir.** El usuario ve el resultado antes de autorizarlo. Sin
esto no hay venta enterprise: ninguna empresa deja que un binario descargado con
`npx` toque su repositorio a ciegas.

**`apply` puede revertirse.** Como cada operación se ejecuta una a una y se sabe
qué fichero toca, puede fotografiarse su estado anterior antes de tocarlo.

**Los packs declaran, no actúan.** Un pack sólo devuelve operaciones; quien
decide y escribe es el núcleo. Es una convención, no todavía una frontera
técnica: ver §4.5 y la tarea F2-11 antes de aceptar packs de terceros.

**El resultado es determinista.** Mismo repositorio + misma configuración =
mismo plan, siempre. Es lo que permite ejecutarlo en CI y confiar en el
resultado.

---

## 4. Los cinco mecanismos de seguridad

### 4.1 Las operaciones son una unión cerrada — [core/src/types.ts](../packages/core/src/types.ts)

Existen exactamente **seis** tipos de operación: `createFile`, `patchJson`,
`patchYaml`, `ensureBlock`, `addDependency` y `execCommand`.

Que sea una unión cerrada permite que el compilador exija tratar los casos
nuevos, pero **hoy esa garantía sólo es real en parte del código**:

| Dónde | ¿El compilador obliga? |
|---|---|
| `executeOperation` en `apply.ts` | Sí: cada rama retorna, sin `return` final |
| `targetKey` y `describeOperation` en `plan.ts` | Sí |
| `simulatePlan` en `simulate.ts` | **No**: el `switch` no tiene guarda, y un tipo nuevo se ignoraría en silencio |
| `render.ts` | **No**: no discrimina por `kind` de forma exhaustiva |
| `revertEntries` | No aplica: reproduce snapshots, no razona por tipo |

El hueco de `simulate.ts` es el peligroso: un tipo nuevo no aparecería en `plan`
pero sí se ejecutaría en `apply`, que es exactamente la divergencia que todo este
diseño existe para evitar. Está registrado como tarea **F0-9**.

El campo `reason` es **obligatorio** en todas. No es documentación: es lo que se
imprime en el plan. La suite de conformidad rechaza cualquier operación con un
`reason` vacío. Un cambio que no se puede explicar no se aplica.

### 4.2 La simulación usa una capa superpuesta — [core/src/simulate.ts](../packages/core/src/simulate.ts)

`plan` no estima el resultado: lo **calcula**. Lee los ficheros reales, aplica
todas las transformaciones en memoria sobre un `overlay` y muestra el resultado
final.

Importa porque las operaciones se acumulan: si tres operaciones parchean
`package.json`, la simulación debe reflejar las tres encadenadas, no la última.
Por eso el plan puede distinguir entre "modificar" y "ya al día".

### 4.3 El journal guarda fotografías — [core/src/apply.ts](../packages/core/src/apply.ts)

Antes de tocar un fichero, `apply` guarda su contenido anterior en base64 dentro
de `.governance/journal.json`, junto con si el fichero existía o no.

`rollback` no tiene que adivinar: recorre el journal al revés, restaura los
contenidos y borra los ficheros que no existían. El criterio de éxito es
literal: tras un `apply --no-install`, `git status --porcelain` debe quedar
vacío.

**El journal recuerda en qué rama se escribió, y `rollback` sólo actúa ahí.**
`apply` aísla los cambios en `chore/setup-ai-governance`, y el journal entra en
el `.gitignore` que instala el pack, así que sobrevive a los checkouts. Un
journal que recordase la rama de *partida* haría que `rollback` en `Prod`
restaurase en `Prod` fotografías tomadas en la rama aislada: no revierte nada,
borra lo que `Prod` tuviera desde entonces. Por eso `writtenOnBranch` se lee
**después** de cambiar de rama, y en cualquier otra rama `rollback` se niega sin
escribir y conserva el journal para poder revertir desde el sitio correcto.

Con `--no-branch` y HEAD desacoplado no hay rama que anotar, y `writtenOnBranch`
queda `null`. **Ese `null` se compara como cualquier otro nombre** (F0-29): el
journal se revierte con HEAD desacoplado sobre el mismo commit, y se niega desde
una rama aunque apunte a ese commit, por simetría con un journal con rama, que se
niega con HEAD desacoplado. **Esa negativa no protege el trabajo sin
commitear:** volver al commit con `git checkout` arrastra los cambios del árbol,
y el `rollback` siguiente los sobrescribe, igual que con journals de rama. Ni la
rama ni el commit dicen si los ficheros siguen siendo los que dejó `apply`;
comprobarlo es la tarea **F0-38**. Se descartaron dos alternativas. Rechazar la combinación antes
de escribir castiga un uso legítimo —las CI hacen checkout desacoplado— para
proteger algo que el commit ya protege. Aceptarla sin `rollback`, como dejó
F0-24, convertía en irreversible lo que antes se revertía.

**El nombre de la rama dice dónde estás, no si es el mismo sitio.** Una rama
borrada y recreada con el mismo nombre sobre otro commit, o un commit hecho en
la rama aislada después del `apply`, pasan una comprobación por nombre y pierden
datos igual: las fotografías son del árbol que había en aquel commit. Por eso el
journal guarda además `writtenOnCommit`, leído a la vez que `writtenOnBranch`, y
`rollback` exige las dos cosas. Ese commit es también el de partida —`headMoved`
aborta si HEAD se mueve entre el plan y la confirmación, y la rama aislada se
crea desde HEAD sin commitear—, así que no hay un segundo campo que mantener, y
el aviso de vuelta lo usa para nombrar adónde volver cuando se empezó con HEAD
desacoplado.

Los journals de versiones anteriores no se revierten: la v1 guardaba la rama de
partida y la v2 no guardaba el commit, y en ninguna de las dos se puede
comprobar que se sigue en el mismo sitio. `readJournal` lanza
`OutdatedJournalError` y remite a git, en la misma dirección que la ADR 0005:
ante la duda, menos acción.

Revertir tampoco deshace el `checkout`: los ficheros vuelven, la rama no. Por
eso el journal guarda también `startedOnBranch`, y tanto `rollback` como la
reversión automática de un `apply` fallido dicen en qué rama queda el
repositorio y con qué comando volver a la de partida. Si la reversión automática
**tampoco** pudo, el consejo cambia entero: quedan ficheros a medias, así que
primero se revierte donde se está y sólo después se vuelve. Ni se propone el
`checkout` todavía, ni se da el comando que borra la rama aislada: borrarla
dejaría el `rollback` imposible, porque sólo revierte desde ella.

**Hueco conocido:** las operaciones `execCommand` no registran snapshots. Lo que
el gestor de paquetes escriba en el lockfile y en `node_modules` durante la
instalación queda fuera del journal, y `rollback` no lo deshace. Tarea **F0-11**.
Por eso tanto el test E2E como el guion de prueba de §7 usan `--no-install`.

Y lo más importante: **si `apply` falla a mitad, se revierte solo**. No existe el
estado "medio configurado", que es el peor sitio donde dejar el repositorio de un
cliente.

### 4.4 Bloques gestionados y cabeceras con hash — [ast/src/blocks.ts](../packages/ast/src/blocks.ts)

Este mecanismo es lo que hará técnicamente posible el modelo de suscripción.

> **El comando `upgrade` todavía no existe** — es la tarea F4-2. Lo que sigue
> describe el mecanismo ya construido sobre el que se apoyará, no un
> comportamiento actual.

Hay dos casos:

**Ficheros enteramente nuestros** (`.gitleaks.toml`, `eslint.config.js`). Llevan
cabecera con hash del contenido generado:

```
# plumbward:managed v=0.1.0 hash=a3f2c81b0d94
# Fichero generado por la CLI de gobernanza.
# Si lo editas a mano, `plumbward upgrade` dejará de actualizarlo
# y te avisará del conflicto en lugar de sobrescribir tus cambios.
```

`upgrade` deberá recalcular el hash y compararlo. Si coincide, el cliente no
tocó el fichero y se regenera con las reglas nuevas; si no coincide, lo
personalizó y **se respeta y se avisa**, jamás se pisa.

**Cuidado al implementarlo:** `withManagedHeader` calcula el hash sobre el
contenido generado **antes** de anteponer la cabecera. El valor guardado en
`hash=` no es, por tanto, el hash del fichero tal como queda en disco. La
comparación tiene que hacerse contra el cuerpo sin cabecera, no contra el
fichero entero.

**Ficheros del cliente** (`.gitignore`, `tsconfig.json`). Sólo se inserta un
fragmento entre marcadores:

```
# >>> plumbward:begin gitignore-artifacts
# Bloque gestionado automáticamente. No edites dentro de los marcadores:
# `plumbward upgrade` regenerará su contenido.
.governance/journal.json
# <<< plumbward:end gitignore-artifacts
```

`upgrade` reescribe únicamente lo que hay **entre** los marcadores. Una sola
línea fuera de ellos no se toca nunca.

### 4.5 Contención de rutas — [core/src/fs.ts](../packages/core/src/fs.ts)

`resolveInRepo()` rechaza rutas absolutas y cualquier cosa que se escape con
`../`. Hay un test E2E que verifica ese caso.

**Lo que hoy NO cubre:** la comprobación es puramente léxica (`path.resolve` y
`path.relative`, sin `realpath`). Si el repositorio contiene un enlace simbólico
a un directorio de fuera, una ruta que pase por él supera la validación y la
escritura sale del repositorio. Tarea **F0-10**.

Y hay un límite más importante que conviene no malinterpretar: **esto no es un
sandbox**. Un pack es un objeto cargado en el mismo proceso de Node y nada le
impide importar `node:fs` y escribir por su cuenta. Que no lo haga es una
**convención verificada en revisión y en la suite de conformidad**, que sólo
inspecciona las operaciones devueltas, no los efectos secundarios. Antes de
aceptar packs de terceros hace falta una frontera real (tarea F2-11).

---

## 5. Mapa de paquetes

Se parte en seis paquetes para **forzar que las dependencias vayan en una sola
dirección**:

```
                    ast
                     ▲
                     │
                   core
                     ▲
                     │
                  scanner
                     ▲
                     │
                 packs-sdk
                     ▲
                     │
               packs/node-ts
                     ▲
                     │
                    cli
```

Las aristas exactas, tal como las declaran los `package.json`:

| Paquete | Depende de |
|---|---|
| `ast` | — (es una hoja) |
| `core` | `ast` |
| `scanner` | `core` |
| `packs-sdk` | `core`, `scanner` |
| `packs/node-ts` | `core`, `packs-sdk`, `scanner` |
| `cli` | `ast`, `core`, `scanner`, `packs-sdk`, `pack-node-ts` |

`ast` no sabe que existe `core`. `core` no sabe que existen los packs. Los packs
no saben que existe la CLI. Si mañana hace falta una interfaz web o una GitHub
Action, se reutiliza todo menos `cli`.

### `@plumbward/ast` — edición no destructiva

El problema: leer un `package.json` con `JSON.parse`, añadirle un script y
escribirlo con `JSON.stringify` **destruye el formato y los comentarios del
cliente**. En un `tsconfig.json` lleno de comentarios explicativos, eso es
inaceptable.

| Fichero | Por qué existe |
|---|---|
| [json.ts](../packages/ast/src/json.ts) | Parchea JSON con `comment-json`, preservando comentarios y orden de claves |
| [yaml.ts](../packages/ast/src/yaml.ts) | Lo mismo para YAML, preservando comentarios y anclas |
| [pointer.ts](../packages/ast/src/pointer.ts) | Punteros RFC-6901 (`/scripts/lint`) para señalar dónde parchear sin conocer la estructura |
| [blocks.ts](../packages/ast/src/blocks.ts) | Bloques con marcadores y cabeceras gestionadas (§4.4) |

### `@plumbward/core` — el motor transaccional

| Fichero | Por qué existe |
|---|---|
| [types.ts](../packages/core/src/types.ts) | Los seis tipos de operación y las estructuras de plan y journal |
| [plan.ts](../packages/core/src/plan.ts) | `PlanBuilder`: acumula, deduplica, detecta choques entre packs y ordena |
| [simulate.ts](../packages/core/src/simulate.ts) | Calcula el resultado sin escribir (§4.2) |
| [apply.ts](../packages/core/src/apply.ts) | Ejecuta, fotografía, registra y auto-revierte (§4.3) |
| [rollback.ts](../packages/core/src/rollback.ts) | Deshace desde el journal y lo borra para que no se aplique dos veces |
| [fs.ts](../packages/core/src/fs.ts) | Contención de rutas y estilo de comentario por extensión |
| [hash.ts](../packages/core/src/hash.ts) | SHA-256 para las cabeceras gestionadas y la baseline |

Dos detalles de `plan.ts` que conviene conocer:

**El orden de aplicación está codificado** y no es arbitrario: `createFile` →
`ensureBlock` → `patchJson` → `patchYaml` → `addDependency` → `execCommand`. Un
fichero debe existir antes de poder parchearlo, y las dependencias deben
declararse antes de ejecutar comandos que las usen.

**Los choques entre packs se detectan solos.** Si dos packs quieren escribir
cosas distintas en `/scripts/lint`, el builder lo detecta comparando huellas y lo
reporta como conflicto. Si quieren escribir lo mismo, lo deduplica en silencio.
Esto es lo que permitirá que un repositorio Django + Next.js reciba dos packs sin
que se pisen.

### `@plumbward/scanner` — diagnóstico de sólo lectura

| Fichero | Por qué existe |
|---|---|
| [git.ts](../packages/scanner/src/git.ts) | Estado del repositorio y **huella** (hash del primer commit) para vincular la licencia |
| [walk.ts](../packages/scanner/src/walk.ts) | Recorrido de disco de respaldo cuando el directorio no es un repositorio git |
| [sloc.ts](../packages/scanner/src/sloc.ts) | Cuenta líneas reales de código y clasifica el tamaño |
| [stack.ts](../packages/scanner/src/stack.ts) | Detecta stack, gestor de paquetes y frameworks |
| [maturity.ts](../packages/scanner/src/maturity.ts) | Puntúa 0-100 con pesos por señal |

En `git.ts`, la función auxiliar `git()` **devuelve `undefined` cuando el comando
falla** en lugar de lanzar: un repositorio sin commits, sin remoto, o que no es
un repositorio, son casos normales y no errores.

En `sloc.ts` están los umbrales que deciden cuánta dureza se puede aplicar:
menos de 2.000 líneas es `greenfield`, hasta 50.000 es `ratchet`, por encima
`non-disruptive`.

`maturity.ts` es la pieza **comercial**: los pesos no reflejan lo difícil que es
implantar cada señal, sino **cuánto dolor evita**. Por eso el escaneo de secretos
pesa 14 y el DevContainer pesa 4. Cada señal ausente lleva un `hint` que es el
argumento de venta.

### `@plumbward/packs-sdk` — el contrato de extensión

Es el eje de escalado del negocio: añadir soporte para Laravel debe ser publicar
un paquete, no modificar el núcleo.

| Fichero | Por qué existe |
|---|---|
| [contract.ts](../packages/packs-sdk/src/contract.ts) | La interfaz `StackPack` (`detect`, `contribute`, `validate`), el `Profile` y `AgentBoundaries` |
| [dsl.ts](../packages/packs-sdk/src/dsl.ts) | `file()`, `json()`, `yaml()`, `block()`, `dep()`, `cmd()`: hacen que un pack se lea como una lista de requisitos |
| [registry.ts](../packages/packs-sdk/src/registry.ts) | Selecciona los packs aplicables, los ordena por confianza y agrega sus operaciones |
| [conformance.ts](../packages/packs-sdk/src/conformance.ts) | La suite que todo pack debe pasar para publicarse |

`conformance.ts` comprueba algo no obvio: **llama a `contribute()` dos veces y
compara los resultados**. Si difieren, el pack no es determinista y `plan` estaría
mintiendo sobre lo que `apply` va a hacer. Todo el modelo de confianza se cae por
ahí, y por eso es una regla de conformidad y no un consejo.

### `@plumbward/pack-node-ts` — el único pack real hoy

[index.ts](../packages/packs/node-ts/src/index.ts) implementa el contrato; las
plantillas están separadas por tema en `templates/`.

Las plantillas son **funciones del escaneo y del perfil**, no ficheros estáticos.
El ESLint generado difiere si el proyecto usa TypeScript, y la dureza de las
reglas cambia según `strictness`.

### `@plumbward/cli` — la interfaz

| Fichero | Por qué existe |
|---|---|
| [index.ts](../packages/cli/src/index.ts) | Define los comandos con `cac` y envuelve todo en `guard()` para que ningún error salga como traza cruda |
| [context.ts](../packages/cli/src/context.ts) | Escanea, carga el perfil y monta el registro de packs |
| [commands.ts](../packages/cli/src/commands.ts) | La lógica de los cinco comandos |
| [render.ts](../packages/cli/src/render.ts) | Todo el pintado de terminal, aislado del resto |
| [diff.ts](../packages/cli/src/diff.ts) | Diff por líneas propio, sin dependencias |

**`context.ts` fusiona el perfil guardado sobre el recomendado.** Así, un
`config.yml` escrito con una versión antigua sigue funcionando cuando se añaden
campos nuevos.

**`diff.ts` no usa una librería** a propósito: los ficheros generados son
configuraciones de unos cientos de líneas, y una LCS cuadrática con tope de
seguridad basta. Cada dependencia que no se arrastra es una vulnerabilidad menos
y un arranque de `npx` más rápido.

---

## 6. El stack técnico y por qué cada pieza

| Herramienta | Por qué ésa |
|---|---|
| **TypeScript estricto** | Con `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes`. Vendemos rigor: no podemos generarlo con código laxo |
| **pnpm workspaces** | Enlaces reales entre paquetes: se cambia `core` y `cli` lo ve sin republicar |
| **turbo** | Cachea builds; sin él cada cambio recompila los seis paquetes |
| **tsup** | Empaqueta a un ejecutable único. Crítico: `npx` se descarga entero en cada demo |
| **vitest** | Rápido, con ESM y TypeScript nativos |
| **cac** | Enrutador de comandos mínimo, sin el árbol de dependencias de alternativas más conocidas |
| **@clack/prompts** | Confirmación interactiva de `apply`; será la base del wizard (F4-1) |
| **execa** | Ejecuta procesos sin pasar por shell, lo que evita inyección de comandos |
| **picocolors** | Color en terminal en 2 KB |
| **comment-json** y **yaml** | Las dos únicas que preservan comentarios al reescribir |

---

## 7. Cómo verificar que funciona

### Nivel 1 — Suite automática

```bash
pnpm build && pnpm typecheck && pnpm test
```

Los tests E2E de [e2e.test.ts](../packages/cli/test/e2e.test.ts) crean un
repositorio real en un directorio temporal y verifican el ciclo completo:

- El escáner detecta stack, tamaño y modo correctos.
- **`plan` no escribe nada**: `git status` queda vacío después.
- `apply` escribe y **`rollback` deja el repositorio byte a byte idéntico**,
  incluido un comentario que el test inserta a mano en `tsconfig.json` para
  comprobar que el parcheo no lo destruye.
- **Un segundo `apply` no produce ningún cambio** (idempotencia).
- Si una operación falla a mitad, se revierte sola.
- El pack cumple la conformidad.
- Un pack no puede escribir fuera del repositorio.

### Nivel 2 — Dogfooding

```bash
node packages/cli/dist/index.js scan
node packages/cli/dist/index.js plan --diff
```

Ninguno escribe nada. `--diff` muestra el contenido exacto de cada fichero que se
generaría.

### Nivel 3 — Ciclo completo en un repositorio de usar y tirar

```bash
# Desde la raíz del repositorio clonado:
PLUMBWARD=$(pwd)/packages/cli/dist/index.js

mkdir -p /tmp/prueba-plumbward && cd /tmp/prueba-plumbward
git init -b main && npm init -y
echo "console.log('hola')" > index.js
git add -A && git commit -m "initial"

node "$PLUMBWARD" plan --diff
node "$PLUMBWARD" apply --no-install
git status --short
node "$PLUMBWARD" doctor
node "$PLUMBWARD" rollback
git status --porcelain   # debe quedar VACÍO
```

Esa última línea es la prueba definitiva. Conviene además ejecutar `apply` dos
veces seguidas: la segunda debe informar de que el repositorio ya está conforme.

### Nivel 4 — Repositorios reales

Tarea F6-2 del plan. Es el único filtro que detecta lo que los repositorios
sintéticos no ven.

---

## 8. Cuestiones abiertas conocidas

Están documentadas aquí para que nadie las descubra dos veces:

**Ser monorepo fuerza el modo `non-disruptive` sin mirar el tamaño.** Viene del
PDF original, que trata "monorepo" y "grande" como sinónimos. Sobre este mismo
repositorio, con ~4.300 líneas, aplica reglas suaves cuando podría permitirse las
estrictas. A revisar en F2-7.

**El pack de Node genera `GOVERNANCE.md` y `Makefile` en la raíz.** Sobre un
monorepo eso puede chocar con lo que ya exista. A resolver en la Fase 2.

**Los límites operativos del asistente sólo existen en el pack de Node.** Deben
vivir en el pack base, porque no dependen del lenguaje. Tarea F2-9.
