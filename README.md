# AegisCode

**CLI de gobernanza de IA y DevSecOps para equipos que programan con asistentes.**

Analiza cualquier repositorio y le instala un entorno DevSecOps completo —
integración continua, linters, hooks de pre-commit, escaneo de secretos y reglas
de contexto para asistentes de IA— adaptado a su stack y a su tamaño.

> Estado: en desarrollo activo. El plan de ejecución completo está en
> [docs/PLAN_DE_EJECUCION.md](docs/PLAN_DE_EJECUCION.md).

## El problema

Los asistentes de IA han multiplicado el volumen de código y la velocidad de las
Pull Requests. Las consecuencias son siempre las mismas: los desarrolladores
senior se convierten en un cuello de botella revisando código mal estructurado,
la deuda técnica se acelera y los secretos acaban en el repositorio.

## Cómo funciona

```bash
npx aegiscode scan      # Diagnóstico de sólo lectura. No escribe nada.
npx aegiscode plan      # Muestra el diff exacto de lo que cambiaría.
npx aegiscode apply     # Aplica el plan en una rama aislada, con journal.
npx aegiscode rollback  # Deshace la última ejecución por completo.
npx aegiscode doctor    # Comprueba que la configuración sigue sana.
```

## Tres garantías

- **Nada se escribe sin enseñarlo antes.** Todo módulo declara su intención
  emitiendo operaciones que se agregan en un plan auditable. `plan` muestra el
  resultado exacto; sólo `apply` materializa, y deja constancia en un journal
  que permite revertir hasta el último byte.
- **La configuración es la fuente de verdad.** `.governance/config.yml` se
  versiona en el repositorio y se revisa en una Pull Request. El mismo fichero
  sobre el mismo repositorio produce siempre el mismo plan.
- **Nunca se trabaja sobre `main`.** Los cambios se integran en una rama
  dedicada, y los ficheros existentes se modifican con parsers sintácticos, no
  sobrescribiéndolos.

## Arquitectura

Monorepo de paquetes independientes:

| Paquete | Responsabilidad |
|---|---|
| `core` | Motor transaccional: plan, simulación, aplicación, journal y rollback |
| `ast` | Edición no destructiva de JSON y YAML, y bloques delimitados |
| `scanner` | Estado de git, SLOC, detección de stack e informe de madurez |
| `packs-sdk` | Contrato `StackPack`, DSL de operaciones y suite de conformidad |
| `packs/*` | Un paquete por stack. Añadir soporte no requiere tocar el núcleo |
| `cli` | Interfaz de terminal |

## Desarrollo

Requiere Node.js >= 18 y pnpm.

```bash
pnpm install
pnpm build
pnpm test
```

El flujo de ramas y las convenciones de commit están descritos en
[docs/PLAN_DE_EJECUCION.md](docs/PLAN_DE_EJECUCION.md), sección 3.
