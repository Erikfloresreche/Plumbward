# ADR 0002 — Validación de licencia local, sin lógica remota

- **Estado:** aceptada
- **Fecha:** 2026-09-08
- **Afecta a:** Fase 5 (licenciamiento) y al empaquetado

## Contexto

La especificación original proponía dos medidas anti-piratería:

1. **Ejecución remota**: las reglas y plantillas no residirían en el paquete
   NPM, sino que se descargarían de nuestra API tras validar el token, para
   evitar la copia no autorizada.
2. **`ci-guard`**: inyectar en el repositorio del cliente un paquete de
   validación que **haría fallar sus pipelines de GitHub Actions** si el token
   dejaba de ser válido.

El objetivo —proteger el ingreso— es legítimo. Los medios son el problema.

## Decisión

Todo el código y todas las reglas viajan en el paquete NPM. La licencia se
valida contra la API **únicamente** en `init` y `upgrade`, y el resultado queda
firmado criptográficamente en `.governance/config.yml`, verificable en local
contra una clave pública embebida.

`scan`, `plan`, `apply`, `rollback` y `doctor` funcionan **offline y para
siempre**. No se inyecta ninguna dependencia capaz de hacer fallar la CI del
cliente. Una licencia caducada deja de traer reglas nuevas; nunca degrada ni
bloquea un repositorio ya configurado.

## Alternativa descartada

La del PDF, tal cual. Se descarta por dos motivos independientes, cada uno
suficiente por sí solo:

**Bloquea la venta.** Descargar y ejecutar lógica en tiempo de ejecución desde
un servidor externo es de las primeras cosas que un departamento de seguridad
corporativo veta en una revisión de proveedor. Habríamos construido un producto
que el comprador objetivo no puede aprobar.

**Contradice el producto.** Vendemos "puedes ver exactamente qué va a pasar
antes de que pase". Un binario que descarga instrucciones opacas es lo contrario
de eso. Y un paquete que rompe deliberadamente la CI de un cliente se lee, desde
su lado, como sabotaje: destruye la confianza que es el activo del producto.

## Consecuencias

**A favor:**

- El producto pasa una revisión de proveedor.
- Funciona en entornos aislados de red, que son habituales en banca y sanidad
  —dos sectores que pagan bien.
- Ninguna caída de nuestra infraestructura puede bloquear el trabajo de un
  cliente.

**El coste que asumimos:**

- El código es copiable. Alguien con la voluntad de hacerlo puede extraer las
  reglas y usarlas sin pagar.

Lo aceptamos conscientemente: lo que se vende no es el binario, es la
**actualización continua** de unas reglas que caducan (ESLint 10 saldrá, `ruff`
cambiará de opciones) y el soporte. Un cliente que copia el paquete se queda con
una foto que envejece. La licencia de código elegida (ver ADR 0003) cubre además
el caso grave, que no es la copia interna sino la reventa.
