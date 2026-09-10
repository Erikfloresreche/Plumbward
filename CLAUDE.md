# Plumbward — Instrucciones para asistentes de IA

CLI de gobernanza DevSecOps que analiza un repositorio y le instala CI, linters,
hooks, escaneo de secretos y reglas de contexto para asistentes de IA.

El plan de ejecución completo, con todas las tareas y sus criterios de
aceptación, está en [docs/PLAN_DE_EJECUCION.md](docs/PLAN_DE_EJECUCION.md). **Léelo antes de
empezar cualquier tarea** y marca su casilla al terminarla.

---

## 1. Límites operativos (innegociable)

### Prohibido ejecutar comandos git que modifiquen el estado

`commit`, `push`, `pull`, `fetch --prune`, `merge`, `rebase`, `checkout`,
`switch`, `reset`, `revert`, `cherry-pick`, `stash`, `tag`, `branch -d`,
`remote add/remove`, `clean`.

**Los ejecuta a mano el desarrollador que esté trabajando en ese momento.** Deja
los cambios en el árbol de trabajo, di con exactitud qué ficheros has tocado y
entrega el mensaje de commit listo para copiar.

Sí puedes usar los de sólo lectura: `status`, `log`, `diff`, `show`,
`branch --list`, `blame`, `ls-files`, `rev-parse`.

**Por qué:** quien firma el commit responde de lo que entra en el historial. Un
push automático mete código en un repositorio compartido sin que nadie lo haya
mirado, y deshacerlo ya es un problema de todo el equipo, no de una máquina.

### Prohibido ejecutar comandos de base de datos que escriban

Migraciones (`migrate`, `db:push`, `db:seed`, `upgrade`), `INSERT`, `UPDATE`,
`DELETE`, `DROP`, `TRUNCATE`, `ALTER`, restauraciones de copias de seguridad y
cualquier CLI de base de datos que altere datos o esquema.

**Los ejecuta a mano el desarrollador.** Escribe el fichero de migración o la
consulta y explica cómo lanzarla, pero no la lances.

Sí puedes hacer `SELECT` de inspección y consultar el esquema si hay una
conexión de desarrollo disponible.

**Por qué:** una migración no tiene botón de deshacer. El coste de equivocarse
no es un fichero mal escrito, son datos perdidos.

### Mensajes de commit y de Pull Request, siempre en inglés

Aunque el código, los comentarios y la documentación de este repositorio estén
en español, **todo mensaje de commit y toda descripción de PR se redacta en
inglés**. Se entregan como texto, para que el desarrollador los use al hacer el
commit él mismo.

Formato: Conventional Commits, con el identificador de la tarea en el cuerpo.

```
feat(pack-python): detect Poetry and uv and generate their pipeline

Implements F2-4. Adds the Python pack with ruff, mypy and pytest support,
selecting the dependency manager from the files present in the repository.
```

### Al terminar una tarea, entrega siempre estos tres textos

No basta con decir que la tarea está hecha. Se entregan, listos para copiar:

1. **El mensaje de commit**, en inglés, en Conventional Commits, citando el
   identificador de la tarea en el cuerpo.
2. **El título de la Pull Request**, en inglés y en una sola línea. Mismo
   formato de Conventional Commits que el commit, por debajo de 70 caracteres.
   Es lo único que se ve en la lista de PRs y en las notificaciones, así que
   tiene que decir qué cambia sin que haya que abrirla.
3. **La descripción de la Pull Request**, en inglés, siguiendo
   `.github/PULL_REQUEST_TEMPLATE.md`: tarea, qué cambia y por qué, criterios de
   aceptación copiados del plan, y cómo se ha verificado.

Y a continuación se pregunta al desarrollador, **sin darlo por hecho**:

> ¿Quieres que revise yo la Pull Request, o se ocupa otra persona del equipo?

### Revisar una Pull Request propia: sólo en contexto nuevo

Si el desarrollador pide la revisión porque no hay nadie más disponible y la PR
se quedaría bloqueada, se hace **abriendo un contexto nuevo, sin el historial de
la conversación que produjo el código**.

**Por qué:** revisar tu propio trabajo con el contexto que lo generó reproduce
exactamente los mismos puntos ciegos. Se dan por buenas las mismas suposiciones
y se pasan por alto los mismos casos. Un contexto limpio sólo tiene delante el
diff, y lo juzga por lo que dice, no por lo que se pretendía que dijera.

La revisión busca fallos de corrección, incumplimientos del Definition of Done,
choques con los invariantes de arquitectura e incoherencias con el plan.
**Entrega hallazgos; no aprueba ni integra.** El merge lo hace siempre una
persona.

Esto es una válvula de escape para no bloquear el trabajo, no un sustituto de la
revisión humana. Cuando hay otra persona disponible, revisa esa persona.

---

## 2. Invariantes de arquitectura

No se rompen sin una ADR en `docs/adr/` que lo justifique:

1. **Nadie escribe en disco por su cuenta.** Todo módulo declara su intención
   emitiendo `Operation[]`. Sólo `applyPlan` materializa, y deja journal para
   poder revertir.
2. **`.governance/config.yml` es la fuente de verdad.** La CLI es una función
   determinista de él: mismo config + mismo repo = mismo plan, siempre.
3. **El catálogo de packs es el eje de escalado.** Soportar un stack nuevo es
   publicar un paquete que implemente `StackPack` y pase la conformidad. El
   núcleo no se toca.

---

## 3. Flujo de trabajo

- Ramas: `main` (releases) y `develop` (integración). Una rama por tarea del
  plan, nombrada `<tipo>/f<fase>-<slug>`, nacida de `develop`.
- Una rama implementa **exactamente una tarea**. Si aparece trabajo imprevisto,
  se añade una tarea nueva al plan; no se amplía la actual.
- El desarrollador crea las ramas y hace los merges. Tú indicas cuál toca.

---

## 4. Estándares de código

- TypeScript estricto. `any` prohibido; usa `unknown` y estrecha el tipo.
- Toda función exportada declara su tipo de retorno. Interfaces para todo
  contrato público.
- Los ficheros que se generan **para el cliente** llevan comentarios
  explicativos en el idioma que indique su perfil, nunca literales sueltos.
- Todo comportamiento nuevo llega con su prueba. Un bug se corrige empezando por
  la prueba que lo reproduce.
- Ninguna ruta de error nueva puede dejar el repositorio a medias: o participa
  del journal, o no escribe.

## 5. Comandos

```bash
pnpm install
pnpm build       # turbo run build
pnpm typecheck
pnpm test        # vitest run
```
