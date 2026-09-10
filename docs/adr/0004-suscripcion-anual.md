# ADR 0004 — Suscripción anual en lugar de licencia perpetua

- **Estado:** aceptada
- **Fecha:** 2026-09-09
- **Afecta a:** toda la Fase 5, el `LICENSE`, y el diseño del ciclo de vida (Fase 4)

## Contexto

El modelo original era una licencia perpetua por repositorio de 1.500-2.500 €
con doce meses de actualizaciones de reglas incluidas.

Al diseñar la Fase 5 apareció la pregunta de qué ocurre el mes 13, y la
respuesta es incómoda: **la herramienta sigue funcionando perfectamente**. Los
hooks siguen instalados, la CI sigue pasando, las reglas siguen aplicándose. El
cliente no percibe ninguna pérdida, y por tanto no renueva.

Las tasas de renovación de contratos de mantenimiento sobre licencia perpetua
rondan el 30-60% y decaen cada año. Es un modelo que sólo funciona si vendes
licencias nuevas indefinidamente al mismo ritmo.

## Decisión

**Suscripción anual por repositorio**, con tramos por volumen para agencias.

`scan` y `report` quedan gratuitos para siempre y sin límite de repositorios,
garantizado por el *Additional Use Grant* del `LICENSE` y no sólo por una
decisión de producto.

Se admite el pago único como **oferta de entrada** para clientes que se resistan
a la suscripción, pero el producto se diseña para suscripción desde el primer
día.

## Alternativas descartadas

**Mantener el perpetuo con doce meses.** Se descarta porque obliga a elegir entre
dos salidas malas: degradar lo instalado para forzar la renovación —hostil, y
contradice frontalmente la ADR 0002— o aceptar una tasa de renovación baja y
decreciente.

**Suscripción por desarrollador.** Encaja peor: el valor se entrega por
repositorio, cada uno con su configuración, su baseline y su histórico. Además,
la huella de repositorio que ya calcula el escáner vincula licencias a
repositorios de forma natural.

**Modelo por uso, por Pull Request auditada.** Atractivo sobre el papel, pero
introduce incertidumbre de coste en el cliente justo en el momento en que le
pides que confíe en que no le vas a romper el repositorio. Descartado por ahora;
reconsiderable si aparece un segmento de alto volumen.

## Consecuencias

**A favor:**

- El ingreso se acumula en lugar de reiniciarse cada enero. Con 500
  repositorios nuevos al año y 90% de retención se superan los 1,03 M€ en el
  cuarto año, frente a un ingreso plano con el mismo esfuerzo comercial.
- Multiplica la valoración: el ARR se valora entre 5 y 15 veces; los ingresos de
  pago único, entre 1 y 3. Es la diferencia entre poder levantar una ronda y no
  poder, con los mismos euros ingresados.
- Alinea los incentivos. Con el perpetuo, el mes 13 dejamos de tener obligación
  de mejorar. Con suscripción, mejorar es la única forma de cobrar el año que
  viene.

**El coste que asumimos:**

- **Más fricción comercial**, sobre todo en el mercado español de agencias,
  acostumbrado a comprar herramientas una sola vez.
- **Obligación real de entregar valor continuo.** Ya no basta con configurar el
  repositorio una vez y desaparecer. Toda la Fase 4 —detección de versión,
  changelog dirigido, catálogo de capacidades, flujos guiados— pasa de ser
  deseable a ser **la razón por la que el cliente paga el segundo año**.
- **La medición deja de ser opcional.** Sin el informe del trinquete que
  demuestre cuánta deuda bajó, la conversación de renovación es una cuestión de
  fe. F3-4 pasa a ser crítico para el negocio, no sólo para el producto.

## Compatibilidad con la ADR 0002

La ADR 0002 establece que la licencia se valida en local y que ninguna caída de
nuestra infraestructura puede bloquear el trabajo de un cliente. Una suscripción
necesita comprobar vigencia periódicamente, lo que aparentemente choca.

No choca, si se implementa así:

1. La licencia firmada criptográficamente **lleva fecha de expiración** y se
   verifica en local contra una clave pública embebida en el paquete.
2. Se revalida contra la API **únicamente en `upgrade`**, nunca en `plan`,
   `apply`, `scan`, `doctor` ni `rollback`.
3. El margen de gracia offline es amplio: si la API no responde, se usa la
   licencia en caché mientras siga vigente.
4. Una suscripción caducada **deja de traer reglas nuevas**. Nunca degrada,
   bloquea ni desinstala nada de lo ya aplicado.

El cliente que deja de pagar se queda exactamente con lo que tenía el último día
que pagó, funcionando para siempre. Eso es lo que hace el modelo defendible ante
un departamento de compras, y lo que separa una suscripción de un rehén.
