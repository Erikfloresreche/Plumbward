# Cómo contribuir a AegisCode

## Antes de nada

Lee [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md). El proyecto tiene tres
invariantes que no son estilo, son la razón de existir del producto, y una
contribución que los rompa se rechaza aunque funcione:

1. **Ningún módulo escribe en disco por su cuenta.** Se declaran operaciones;
   sólo `applyPlan` materializa, y deja journal.
2. **`.governance/config.yml` es la fuente de verdad.** La CLI es una función
   determinista de él.
3. **Soportar un stack nuevo no toca el núcleo.** Es publicar un pack.

## Puesta en marcha

Requiere Node.js >= 18 y pnpm.

```bash
git clone https://github.com/Erikfloresreche/AegisCode.git
cd AegisCode
pnpm install
pnpm build
pnpm test
```

## Flujo de trabajo

El desarrollo se guía por [docs/PLAN_DE_EJECUCION.md](docs/PLAN_DE_EJECUCION.md).
Cada tarea tiene identificador, rama, dependencias y criterios de aceptación.

### Ramas

| Rama | Papel |
|---|---|
| `main` | Sólo releases. Cada commit es una versión etiquetada |
| `develop` | Integración. Siempre debe estar en verde |

Las ramas de tarea nacen de `develop` y se nombran
**`<tipo>/f<fase>-<slug>`** — por ejemplo `feat/f2-pack-python`. Tipos
permitidos: `feat`, `fix`, `refactor`, `test`, `docs`, `build`, `ci`, `chore`.

Una rama implementa **exactamente una tarea**. Si aparece trabajo imprevisto, se
añade una tarea nueva al plan; no se amplía la que está en curso.

### Commits

Conventional Commits **en inglés**, referenciando la tarea. El código y la
documentación están en español; el historial de git no, porque es la convención
dominante y sobrevive a un cambio de equipo.

```
feat(pack-python): detect Poetry and uv and generate their pipeline

Implements F2-4. Adds the Python pack with ruff, mypy and pytest support,
selecting the dependency manager from the files present in the repository.
```

### Asistentes de IA

Si trabajas con un asistente en este repositorio, sus límites operativos están
en [CLAUDE.md](CLAUDE.md) y son de obligado cumplimiento. En resumen: **un
asistente no ejecuta comandos git que modifiquen el estado ni escrituras en base
de datos**. Deja los cambios en el árbol de trabajo y una persona los commitea.

Quien firma el commit responde de lo que entra en el historial.

## Definition of Done

Una tarea no está terminada hasta que cumple todo esto, además de sus criterios
propios:

- `pnpm build`, `pnpm typecheck` y `pnpm test` en verde.
- Cero `any` implícitos. Cero `@ts-expect-error` sin comentario que lo justifique.
- Todo retorno público con su interfaz declarada.
- Todo fichero generado para el cliente con comentarios explicativos en su idioma.
- Toda ruta de error nueva es reversible: o participa del journal, o no escribe.
- Tests para el comportamiento nuevo. Un bug se corrige empezando por el test
  que lo reproduce.
- La casilla de la tarea marcada en el plan, en la misma PR.

## Escribir un pack

Un pack implementa la interfaz `StackPack` de
[packs-sdk](packages/packs-sdk/src/contract.ts) con tres métodos:

- **`detect(context)`** — ¿este pack aplica a este repositorio, y con qué confianza?
- **`contribute(context)`** — qué operaciones quiere aportar. **Nunca escribe en disco.**
- **`validate(context)`** — comprobaciones de salud para `doctor`.

Usa el DSL de [dsl.ts](packages/packs-sdk/src/dsl.ts) (`file`, `json`, `yaml`,
`block`, `dep`, `cmd`) en lugar de construir objetos a mano.

Todo pack debe pasar `checkPackConformance`. La regla que más sorprende es el
**determinismo**: se llama a `contribute()` dos veces y se comparan los
resultados. Si difieren, `plan` estaría mintiendo sobre lo que `apply` va a
hacer, y todo el modelo de confianza del producto se cae.

La guía completa llegará con la tarea F2-8. Mientras tanto,
[packs/node-ts](packages/packs/node-ts/) es la referencia.

## Hooks de pre-commit

El repositorio tendrá hooks a partir de la tarea F0-4. Cuando existan, se pueden
saltar con `--no-verify` en una emergencia real —una corrección urgente en
producción a las tres de la madrugada—, pero **la PR siguiente debe arreglar lo
que el hook habría detectado**. Saltárselos por costumbre convierte la
herramienta en decorado.
