# Plumbward

**Gobernanza de IA y DevSecOps para equipos que programan con asistentes.**

Analiza cualquier repositorio y le instala un entorno DevSecOps completo
adaptado a su stack y a su tamaño: integración continua, linters, hooks de
pre-commit, escaneo de secretos y reglas de contexto para asistentes de IA.

> **Estado: en desarrollo activo, antes de la versión 1.0.** Todavía **no está
> publicado en npm**: se usa clonando el repositorio (ver
> [Desarrollo](#desarrollo)). Hoy sólo existe el pack de Node.js/TypeScript; el
> resto llega en la Fase 2. El plan completo está en
> [docs/PLAN_DE_EJECUCION.md](docs/PLAN_DE_EJECUCION.md).
>
> Cuando publiquemos será bajo el scope `@plumbward/`.

---

## El problema

Los asistentes de IA han multiplicado el volumen de código y la velocidad de las
Pull Requests. Las consecuencias son siempre las mismas:

- Los desarrolladores senior se convierten en cuello de botella revisando código
  mal estructurado.
- La deuda técnica se acelera y los estándares de arquitectura se diluyen.
- Los secretos acaban en el historial de git.

Configurar la defensa —CI, linters, hooks, escaneo de secretos, reglas de
contexto— cuesta entre 8 y 16 horas por repositorio. Casi nadie las dedica.

## Cómo funciona

```bash
plumbward scan       # Diagnostica y puntúa la madurez de 0 a 100
plumbward plan       # Muestra el diff exacto de lo que cambiaría
plumbward apply      # Aplica los cambios, con journal para poder deshacerlos
plumbward rollback   # Deshace la última ejecución
plumbward doctor     # Comprueba que la configuración sigue sana
```

Un ciclo típico son tres comandos: `scan` para ver dónde estás, `plan` para ver
qué cambiaría, `apply` para hacerlo. Y si algo no encaja, `rollback` deja el
repositorio como estaba.

Si estás en `main`, `master`, `production` o `prod`, `apply` crea antes una rama
dedicada (`chore/setup-ai-governance`) y trabaja allí. En cualquier otra rama
trabaja sobre la que ya tengas activa y te lo dice.

## Tres garantías

**Nada se escribe sin enseñarlo antes.** Ningún módulo escribe en disco por su
cuenta: todos declaran su intención emitiendo operaciones que se agregan en un
plan auditable. `plan` calcula y muestra el resultado exacto —no una
estimación—, y sólo `apply` materializa.

**Los ficheros son reversibles.** Antes de tocar un fichero se guarda su
contenido anterior en un journal. `rollback` lo restaura hasta el último byte, y
el criterio es verificable: tras un `apply --no-install`, `git status
--porcelain` queda vacío. Si `apply` falla a mitad, los ficheros se revierten
solos: no existe el estado "medio configurado".

La instalación de dependencias es la excepción conocida: lo que hace tu gestor
de paquetes en el lockfile y en `node_modules` no pasa por el journal y
`rollback` no lo deshace. Está registrado como pendiente (F0-11).

**Tus ediciones se respetan.** Los ficheros generados llevan un hash en su
cabecera; los fragmentos insertados en ficheros tuyos van entre marcadores. Al
actualizar, lo que hayas modificado a mano nunca se pisa: se te avisa.

## Qué instala

Depende del stack y del tamaño del repositorio, pero en un proyecto de
Node/TypeScript incluye pipelines de CI comentados, ESLint y Prettier, hooks de
pre-commit con Husky y lint-staged, escaneo de secretos con Gitleaks,
Conventional Commits, DevContainer, un `Makefile` unificado, reglas de contexto
para Cursor, Claude y Copilot, y un `GOBERNANZA.md` que explica al equipo qué se
ha instalado.

La dureza se adapta al tamaño: en un proyecto pequeño se aplica todo desde el
primer fichero; en uno de 200.000 líneas sólo se audita lo que cambia, para que
la CI no se ponga en rojo el primer día.

## Arquitectura

Monorepo de paquetes con dependencias en una sola dirección, de forma que el
núcleo sea reutilizable fuera de la CLI:

| Paquete | Responsabilidad |
|---|---|
| `core` | Motor transaccional: plan, simulación, aplicación, journal y rollback |
| `ast` | Edición no destructiva de JSON y YAML, y bloques delimitados |
| `scanner` | Estado de git, SLOC, detección de stack e informe de madurez |
| `packs-sdk` | Contrato `StackPack`, DSL de operaciones y suite de conformidad |
| `packs/*` | Un paquete por stack. Añadir soporte no requiere tocar el núcleo |
| `cli` | Interfaz de terminal |

La explicación completa, con el porqué de cada decisión, está en
[docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

## Desarrollo

Requiere Node.js >= 22.13 y pnpm.

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

Antes de contribuir, lee [CONTRIBUTING.md](CONTRIBUTING.md). Si trabajas con un
asistente de IA en este repositorio, sus límites operativos están en
[CLAUDE.md](CLAUDE.md) y son de obligado cumplimiento.

## Licencia

[Business Source License 1.1](LICENSE). El código es legible y auditable por
cualquiera —es parte de la propuesta de valor—, pero no puede revenderse ni
ofrecerse como servicio competidor.

Los comandos que no modifican tu repositorio (`scan`, `plan`, `doctor`) son de
uso libre en producción y sin límite de repositorios. Los que sí lo modifican
(`apply`, `rollback`) requieren licencia comercial por repositorio.

Cada versión pasa a Apache-2.0 en la fecha de conversión indicada en el
`LICENSE`, o a los cuatro años de publicarse, lo que ocurra antes.
