# ADR 0005 — Cuando una deducción falla, falla hacia más protección

- **Estado:** aceptada
- **Fecha:** 2026-09-11
- **Afecta a:** la decisión de aislar el trabajo en una rama propia, el perfil
  (`branches`), la CI que se genera, y cualquier funcionalidad futura que deduzca
  algo del repositorio para actuar

## Contexto

La tarea F0-14 debía impedir que `apply` escribiera directamente sobre una rama
de larga duración. Fracasó tres veces seguidas, y las tres por la misma razón:
**intentaba deducir cuál es la rama de releases**.

| Versión | Cómo lo deducía | Qué rompía |
|---|---|---|
| Original | Lista cableada de cuatro nombres, distinguiendo mayúsculas | Una rama `Prod` recibía los cambios directamente |
| 1 | La rama por defecto de GitHub (`origin/HEAD`) | En git-flow esa rama es `develop`: la CI generada desplegaba a producción desde `develop` |
| 2 | El primer nombre de una lista de prioridad entre las ramas existentes | Con `main` (donde van las PRs) y `Prod` (despliegue), la CI sólo revisaba `Prod` y las PRs a `main` quedaban sin revisar. Y cualquier nombre fuera de la lista —`pro`, `pre`, `live`, `release/prod`— seguía desprotegido |

Cada heurística arreglaba unos repositorios y rompía otros. No es un defecto de
una heurística concreta: **"cuál es la rama de releases" no se puede deducir de
forma fiable a partir de nombres ni de la rama por defecto**. Y el perfil tenía un
solo campo, `branches.main`, que mezclaba dos papeles distintos: a qué rama van
las Pull Requests y desde cuál se despliega.

## Decisión

> **Cuando una deducción de Plumbward falla, debe fallar hacia más protección,
> nunca hacia una acción.**

Una primera redacción decía "lo deducido sólo puede ampliar protecciones". No era
literalmente cierta, y la revisión lo señaló: decidir que una rama es de trabajo
por su prefijo **también es una deducción, y es la que quita protección**. Lo que
la hace aceptable no es que no deduzca, sino hacia dónde falla: un nombre que no
se reconoce se aísla. Esa es la propiedad que importa, y es la que se exige.

Aplicado a las ramas:

1. **La protección se invierte.** En lugar de "protejo las ramas que conozco", se
   aísla el trabajo **siempre**, salvo en una rama de trabajo reconocible por su
   prefijo (`feat/`, `fix/`, `chore/`…). Los prefijos de trabajo son una
   convención cerrada y estable; los nombres de ramas de larga duración no se
   pueden enumerar. Un nombre desconocido cae del lado seguro. Incluye los
   prefijos de los asistentes de IA (`claude/`, `copilot/`, `codex/`,
   `cursor/`): son usuarios directos del producto.

2. **El perfil separa los dos papeles.**
   - `integration`: a qué rama van las Pull Requests. Cuando no hay
     `config.yml`, se propone a partir de `origin/HEAD`, porque en GitHub eso es
     lo que significa la rama por defecto; sin remoto, la rama actual si no es de
     trabajo, o `main`/`master` si existen. La propuesta queda escrita en el
     `config.yml` generado, que pide revisarla porque `origin/HEAD` puede estar
     desfasado. Con un `config.yml`, las ramas salen sólo de él, aunque no las
     defina: rellenarlas con el estado local haría que el mismo fichero diera
     planes distintos en dos copias del repositorio. Si falla, el daño es menor: las
     Pull Requests se revisan todas igualmente, sea cual sea su destino.
   - `release`: desde qué rama se despliega. **Nunca** se deduce. Queda en `null`
     hasta que el equipo la configure, y sin ella no se genera el workflow de
     despliegue; `doctor` lo avisa.

3. **La CI generada revisa todas las Pull Requests**, sin filtrar por rama de
   destino. Las ramas en las que se ejecuta al hacer push salen **sólo del
   perfil**. Una versión intermedia añadía las ramas remotas existentes, y dos
   copias del mismo repositorio con el mismo `config.yml` generaban workflows
   distintos: rompía el invariante de que la CLI es una función determinista de
   su configuración. Ampliar protecciones no justifica romper un invariante.

4. **Si la rama aislada ya existe, `apply` se detiene sin escribir.** Podría
   estar desactualizada, y el plan que se enseñó se calculó sobre la rama de
   partida: escribir en ella sería aplicar algo distinto de lo aprobado.

## Alternativas descartadas

**Una heurística mejor.** Tres intentos demuestran que siempre habrá una
disposición de ramas que la rompa. Seguir afinándola es seguir desplazando el
fallo de un repositorio a otro.

**Preguntar siempre.** Correcto para lo que desencadena acciones —la rama de
despliegue la preguntará el wizard (F4-1)—, pero excesivo para lo que sólo
protege: obligar a contestar preguntas para obtener una protección que se puede
dar por defecto empeora la experiencia sin ganar seguridad.

## Consecuencias

**A favor:**

- Una rama con un nombre que nadie previó queda protegida, no expuesta.
- Con los workflows que genera esta versión, ninguna Pull Request queda sin
  revisar porque el perfil se equivoque. Un `ci-dev.yml` anterior que filtre
  `pull_request` por rama sigue en el repositorio; `doctor` lo detecta y avisa,
  y quitar el filtro es F4-2.
- Plumbward no genera un despliegue desde una rama que nadie eligió. Un
  `ci-prod.yml` generado por una versión anterior puede seguir existiendo —`apply`
  no pisa ficheros existentes, y actualizarlos es F4-2—, pero `doctor` lo
  detecta y avisa.
- Es un argumento de venta concreto y verificable: **Plumbward nunca adivina
  dónde desplegar**. Es la misma idea que el `plan` antes del `apply`, aplicada a
  las decisiones que no se pueden deshacer.

**El coste que asumimos:**

- **Más ramas aisladas de las estrictamente necesarias.** Una rama de trabajo sin
  prefijo convencional (`arreglo-rapido`, `user-patch-1`) recibe una rama aislada.
  Es barato y hay `--no-branch` para quien sepa lo que hace.
- **La CI generada se ejecuta en todas las Pull Requests**, no sólo en las
  dirigidas a la rama de integración. Cuesta minutos de CI. Las ramas en las que
  se ejecuta al hacer push no aumentan: salen sólo del perfil.
- **Un equipo que quiera desplegar tiene que configurar una línea más.** Es
  deliberado.
- **Cambia el formato de `config.yml`:** `main` y `dev` se sustituyen por
  `integration`, `release` y `staging`. Un fichero antiguo sigue funcionando:
  `dev` pasa a `integration` y, si no hay `dev`, también `main`, que es donde
  iban las Pull Requests. Pero `main` **no** se traduce a `release`, porque era un valor
  adivinado y convertirlo en rama de despliegue sería justo el error que esta
  decisión evita.

## Cómo aplicarla en adelante

Ante cualquier funcionalidad que deduzca algo del repositorio, preguntarse:
*si la deducción es errónea, ¿el resultado es una protección de más o una acción
equivocada?* Si es lo segundo, la deducción sólo puede **proponerse**, nunca
aplicarse sin confirmación explícita.
