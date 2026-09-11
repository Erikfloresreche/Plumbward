# Napkin Runbook

## Curation Rules
- Re-prioritize on every read.
- Keep recurring, high-value notes only.
- Max 10 items per category.
- Each item includes date + "Do instead".
- Lo mecanizable va a un control (test o CI), no aquí. Aquí sólo lo que no se puede mecanizar.
- El repositorio es público: nada personal en este fichero.
- Se cura al añadir una entrada, no en cada lectura: cada reescritura es un diff y tokens (CLAUDE.md §6).

## Ejecución y validación (máxima prioridad)
1. **[2026-09-11] Una verificación que también pasaría con el código antiguo no prueba nada**
   Do instead: escribe primero el test que falla contra el código anterior y enséñalo en rojo.
2. **[2026-09-11] turbo imprime "N successful, M total" aunque falle una tarea**
   Do instead: juzga build, typecheck y tests por código de salida, nunca con `grep successful`.
3. **[2026-09-11] Un test que no falla al romper la pieza que dice cubrir no la cubre**
   Do instead: muta la pieza, ejecuta, restaura. Descarta mutantes equivalentes (`??` también salta `null`).
   Si sobrevive, mira si el test usa datos que hacen la mutación invisible (nombre ya en minúsculas).
4. **[2026-09-11] Las ediciones por script fallan en silencio si el texto ancla no existe**
   Do instead: `assert` sobre el ancla antes de reemplazar y `grep` del resultado después.
   Si el ancla está en un template literal con `\n` escritos, cópiala del fichero, no la reescribas.
5. **[2026-09-11] Tras `apply`, el journal ignorado en una rama aparece como sin seguimiento en otra**
   Do instead: compara el estado antes y después, no contra un árbol vacío.

## Shell y comandos
1. **[2026-09-11] `sed` de macOS es BSD: `\b` no funciona y no da error**
   Do instead: usa `perl -pi -e` para reemplazos con límites de palabra.
2. **[2026-09-11] zsh expande `--include=*.ts` sin comillas y el `grep` falla**
   Do instead: cita siempre los patrones: `--include='*.ts'`.
3. **[2026-09-11] `rev-parse --abbrev-ref HEAD` y `symbolic-ref --short` devuelven `heads/X` si existe una etiqueta `X`**
   Do instead: `git symbolic-ref -q HEAD` sin abreviar y quita `refs/heads/`.
4. **[2026-09-11] `git checkout -b X origin/develop` engancha la rama a `develop` y VS Code sube a `develop`**
   Do instead: crea las ramas desde `develop` local actualizado: `git checkout develop && git pull && git checkout -b X`.
5. **[2026-09-11] `origin/HEAD` local no se actualiza al renombrar la rama por defecto en GitHub**
   Do instead: no lo uses como única fuente; `git remote set-head origin --auto` lo corrige (lo lanza una persona).

## Guardarraíles del dominio
1. **[2026-09-11] Toda heurística para deducir la rama de releases rompe algún repositorio**
   Do instead: ADR 0005: la deducción debe fallar hacia más protección; `branches.release` nunca se deduce.
2. **[2026-09-11] Un `if: matrix.node == 'X'` se desajusta al cambiar la matriz y el paso desaparece sin fallar**
   Do instead: pasos que deben correr siempre, en un job propio sin condiciones. `check:coherencia` lo vigila.
3. **[2026-09-11] Un reemplazo global de la marca reescribe hechos: nombres de terceros, registros fechados**
   Do instead: excluye los hechos históricos del reemplazo y revísalos a mano.
4. **[2026-09-11] Los tests que crean repositorios git dependen de la configuración global (gpgsign, hooks)**
   Do instead: `GIT_CONFIG_GLOBAL=/dev/null` y `GIT_CONFIG_NOSYSTEM=1` en `vitest.config.ts`.
5. **[2026-09-11] Una CLI con salida que depende de refs locales rompe el invariante de determinismo**
   Do instead: todo lo generado sale de `config.yml`; el estado local sólo puede proponer.
   Con `config.yml` parcial tampoco se rellena desde el estado local.

## Directivas del equipo
1. **[2026-09-11] El asistente no ejecuta comandos git que cambien estado ni escrituras en base de datos**
   Do instead: entrega los comandos y el mensaje de commit listos para copiar (CLAUDE.md §1).
2. **[2026-09-11] Commits, títulos y descripciones de PR, nombres de rama, ficheros e identificadores, en inglés**
   Do instead: prosa (docs, comentarios) en español; todo nombre en inglés.
3. **[2026-09-11] Toda PR se revisa en contexto nuevo antes del merge**
   Do instead: lanza la revisión antes de decir que se puede mergear. Las correcciones, sólo su diff y con modelo ligero.
4. **[2026-09-11] Una sesión larga cuesta por lo que arrastra, no por lo que escribe**
   Do instead: una tarea por sesión; en una PR abierta sólo bloqueantes, los seguimientos al plan (CLAUDE.md §6).
