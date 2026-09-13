# ADR 0001 — Separar el plan de la ejecución

- **Estado:** aceptada
- **Fecha:** 2026-09-08
- **Afecta a:** todo el núcleo

## Contexto

La especificación original describía un `init` monolítico: analizar el
repositorio e ir escribiendo la configuración. Es lo que hacen la mayoría de
generadores de proyectos, y es lo que un desarrollador espera.

Pero nuestro comprador no es un desarrollador probando una herramienta en su
proyecto personal. Es una empresa que va a ejecutar un binario descargado con
`npx` sobre un repositorio de producción con años de historia.

## Decisión

Ningún módulo escribe en disco. Todos declaran su intención emitiendo
`Operation[]`, que se agregan en un `ChangePlan`. El plan se puede renderizar
sin tocar nada, y sólo `applyPlan` materializa, dejando rastro en un journal.

Las operaciones son una unión cerrada de seis tipos. Añadir un séptimo obliga al
compilador a exigir su tratamiento en el simulador, el ejecutor, el rollback y
el renderizador.

## Alternativa descartada

Escribir directamente, con una opción `--dry-run` que imprima lo que *habría*
hecho.

Se descarta porque un `--dry-run` implementado aparte del camino real **miente
tarde o temprano**: son dos rutas de código que divergen en cuanto alguien
añade un caso especial. Aquí no hay dos rutas: `plan` y `apply` consumen el
mismo `ChangePlan`, y la simulación calcula el resultado leyendo los ficheros
reales.

## Consecuencias

**A favor:**

- `plan` puede existir de verdad y ser auditable en una Pull Request. Sin esto
  no hay venta enterprise.
- `apply` es reversible, porque cada operación se ejecuta una a una y se sabe
  qué fichero toca antes de tocarlo.
- Un pack de terceros no tiene acceso al sistema de ficheros: sólo puede pedir.
  Esto es lo que hará viable abrir el catálogo.
- El resultado es determinista y por tanto ejecutable en CI.

**El coste que asumimos:**

- Más código y más indirección que escribir con `fs.writeFile`.
- Toda capacidad nueva hay que expresarla como operación. Si mañana hiciera
  falta, por ejemplo, renombrar ficheros, no basta con llamar a `fs.rename`:
  hay que añadir el tipo de operación y hacerlo reversible.

Ese coste es exactamente el punto. Es lo que impide que la herramienta adquiera
capacidades que no se pueden deshacer.
