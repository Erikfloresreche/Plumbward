# Modelo de negocio de Plumbward

Documento de estrategia. Define qué vendemos, a quién, por cuánto y —tan
importante como lo anterior— **qué no podemos prometer**.

Es un documento vivo: cada decisión que cambie el modelo se refleja aquí y, si
es estructural, en una ADR.

**Última actualización:** 2026-09-09

---

## 1. El problema que compra el cliente

No es *"a mi repositorio le falta integración continua"*. Eso no duele lo
suficiente como para pagar.

Lo que duele es:

> Mi equipo genera código con asistentes de IA más rápido de lo que yo puedo
> revisarlo, y no sé qué se está colando.

Las consecuencias son concretas y todas cuestan dinero: desarrolladores senior
convertidos en cuello de botella, deuda técnica que se acelera, secretos en el
historial de git, y una arquitectura distinta por cada desarrollador que le pide
lo mismo a un asistente distinto.

## 2. El posicionamiento

> **La capa de control de calidad para equipos que programan con IA.**

Cubrimos las tres fases del ciclo. Ningún competidor cubre las tres:

| Fase | Qué hacemos |
|---|---|
| **Antes** de que la IA escriba | Reglas de contexto, *skills* de agente instaladas según el stack, cada regla anclada a documentación oficial |
| **Mientras** escribe | Límites operativos: el asistente no ejecuta git ni escribe en base de datos; esas acciones las lanza una persona |
| **Después** | Controles mecánicos en hooks y CI: lo que no cumple, no entra |

**La frase que diferencia:** las reglas de un fichero `.cursorrules` son
sugerencias que el asistente puede ignorar. Nosotros las convertimos en
**controles que no puede saltarse**. Un competidor que sólo genera ficheros de
reglas se queda en la mitad de arriba de esa tabla.

## 3. Qué prometemos y qué no

Esta sección existe para que nadie escriba en una landing algo que un CTO
técnico pueda desmontar en treinta segundos.

### No prometemos

- **Código sin errores.** No existe forma mecánica de demostrar que un programa
  es correcto. Cualquiera que lo prometa está mintiendo o no lo sabe.
- **Sustituir la revisión humana.** Reducimos su coste; no la eliminamos.
- **Detectar fallos de lógica de negocio.** Un control mecánico no sabe qué
  querías construir.

### Sí prometemos

- **Cada categoría de fallo conocida tiene un control que la detiene**, la lista
  es pública y auditable, y cada control cita la documentación oficial en la que
  se apoya.
- **Nada se escribe en tu repositorio sin enseñarlo antes**, y todo es
  reversible.
- **La calidad no retrocede**: el trinquete impide que una Pull Request empeore
  las métricas, aunque los valores absolutos sigan siendo altos.
- **Valor medible**: cuánta deuda bajó, cuántas PRs se auditaron, cuántos
  secretos se detuvieron antes de llegar al historial.

Esta honestidad es un **argumento de venta**, no una limitación. Un comprador
técnico confía antes en quien delimita su alcance que en quien promete magia.

---

## 4. Modelo de precios

**Suscripción anual por repositorio, con tramos por volumen.**
Decisión tomada el 2026-09-09; sustituye al pago único con 12 meses de
actualizaciones. El razonamiento está en [ADR 0004](adr/0004-annual-subscription.md).

| Plan | Precio orientativo | Para quién |
|---|---|---|
| **Diagnóstico** | Gratis para siempre | `scan` y `report`. Sin límite de repositorios |
| **Equipo** | 400-600 €/repositorio/año | Producto único, equipo pequeño |
| **Agencia** | Tramos de 10 y de 50 repositorios | Agencias y consultoras. Es la vía natural de expansión |
| **Enterprise** | A medida | Packs privados con los estándares internos del cliente, SSO, SLA de soporte |

### Por qué el diagnóstico es gratis, y para siempre

`scan` y `report` son el gancho comercial: generan la necesidad que el resto del
producto resuelve, y se comparten por correo con quien firma la compra.

No es una promesa de marketing revocable: está escrito en el *Additional Use
Grant* del `LICENSE`, así que es un compromiso legal. Eso lo hace creíble.

### Por qué por repositorio y no por desarrollador

El valor se entrega por repositorio: cada uno tiene su configuración, su
baseline y su historial de métricas. Además encaja con lo ya construido —la
huella del repositorio en `scanner/git.ts` vincula licencias a repositorios uno
a uno— y da una vía de expansión limpia: se entra por un proyecto y se crece
dentro de la cuenta.

---

## 5. Por qué suscripción y no pago único

### La trampa del modelo perpetuo

Con licencia perpetua más doce meses de actualizaciones, el mes 13 llega y **la
herramienta sigue funcionando perfectamente**. Los hooks siguen ahí, la CI sigue
pasando. El cliente no percibe pérdida, así que no renueva.

Sólo hay dos salidas, y una es inaceptable:

1. **Degradar lo instalado** para forzar la renovación. Hostil, y contradice
   frontalmente la [ADR 0002](adr/0002-local-first-licensing.md).
2. **Hacer que lo nuevo valga lo suficiente** como para pagar otra vez.

Elegimos la segunda, y de ahí sale todo el motor de recurrencia del §6.

### Los números

Para llegar a **1 M€ al año**:

| Modelo | Qué hace falta |
|---|---|
| Pago único de 2.000 € | **500 ventas nuevas cada año, indefinidamente.** Cada enero se empieza desde cero |
| Suscripción de 600 €/repo/año | ~1.700 repositorios activos, pero **se acumulan** |

Con 500 repositorios nuevos al año y 90% de retención:

| Año | Repositorios activos | Ingreso |
|---|---|---|
| 1 | 500 | 300 k€ |
| 2 | 950 | 570 k€ |
| 3 | 1.355 | 813 k€ |
| 4 | 1.720 | **1,03 M€** |

Mismo esfuerzo comercial. La diferencia es que la base no se evapora.

### El efecto que pesa más que el ingreso

**1 M€ de ARR se valora en 5-15 M€. 1 M€ de ingresos de pago único se valora en
1-3 M€.** Un inversor suscribe recurrencia, no facturación. Con los mismos euros
ingresados, es la diferencia entre poder levantar una ronda y no poder.

### Cómo se gestiona la fricción comercial

Una agencia española acostumbrada a comprar herramientas una sola vez puede
resistirse a la suscripción. Se admite el pago único como **oferta de entrada**,
pero el producto se diseña para suscripción desde el primer día: convertirlo
después es mucho más caro.

---

## 6. El motor de recurrencia

Una suscripción se renueva por una de dos razones: porque perderla duele, o
porque lo nuevo compensa. La primera está descartada por la ADR 0002. Toda
nuestra recurrencia depende de la segunda.

Cuatro piezas, todas en el plan de ejecución:

**Detección de versión sin telemetría** (F4-5). El CLI sabe que hay una versión
nueva consultando el registro de npm. Nunca llama a casa.

**Changelog dirigido** (F4-6). No *"qué hay de nuevo"*, sino **"qué hay de nuevo
para tu repositorio"**: de catorce cambios, tres te aplican porque usas Next.js y
no tienes contenedores. El resto no se muestra. Nadie hace esto.

**Catálogo de capacidades** (F4-7). Al actualizar se vuelve a escanear y se
compara contra lo que sabemos hacer: *"ahora sabemos dockerizar proyectos como el
tuyo, ¿lo hacemos?"*. Valor nuevo, visible, sin que el cliente tenga que
enterarse de nada por su cuenta.

**Flujos guiados** (F4-8). Para lo que necesita decisiones humanas —dockerizar
requiere saber servicios, puertos, base de datos, cómo se construye—. El
resultado sigue siendo un `ChangePlan` revisable y reversible.

### El eslabón que cierra la renovación

Nada de lo anterior sirve si el valor no es **medible**. El trinquete (F3-4)
produce el informe que justifica renovar:

> Tu deuda técnica bajó un 38%. Se auditaron 240 Pull Requests. Se detuvieron 12
> secretos antes de llegar al historial.

**Ese informe es la renovación.** Sin números, renovar es una conversación de fe.

---

## 7. Competencia

El mercado se está formando ahora mismo, lo cual es bueno y urgente a la vez.

**`@save3asy/aegiscode`** — publicado el 23 de agosto de 2026, descrito como *"AI
Code Governance & Architecture Guardrails"*. Prácticamente nuestra propuesta de
valor. Tres semanas de ventaja sobre nosotros.

**GitHub / Microsoft** — es el riesgo grande, no el pequeño. Ya tienen rulesets,
code scanning y Copilot Autofix. Si deciden empaquetar esto, lo regalan.

### Dónde está nuestra defensa

No en generar configuración: eso se commoditiza y GitHub lo puede regalar. Está
en tres sitios:

1. **Multiplataforma.** GitLab y Bitbucket existen, y GitHub no les va a dar
   soporte.
2. **Agnóstico de stack.** El catálogo de packs cubre lo que una plataforma
   concreta no prioriza.
3. **La capa de medición.** Nadie va a medir la deuda de un cliente mejor que
   quien lleva dos años midiéndola. El histórico acumulado es coste de cambio
   real, y es lo único que no se puede copiar publicando un repositorio.

---

## 8. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| N1 | GitHub lo hace nativo | Multiplataforma, multi-stack y ser dueños de la medición |
| N2 | Los flujos guiados son caros de mantener: si dices "yo te dockerizo", eres dueño de todos los modos de fallo en todos los stacks | Empezar por **un** stack (Node/TS) y no ampliar hasta que funcione sin soporte manual |
| N3 | Una persona no vende enterprise | Autoservicio con `scan` gratuito como gancho; agencias como primer segmento de pago; enterprise después o con socio |
| N4 | Sobreprometer ("código sin errores") destruye credibilidad en la primera reunión técnica | El §3 de este documento es de obligada lectura antes de escribir cualquier material comercial |
| N5 | La suscripción tiene más fricción que el pago único en el mercado español | Pago único como oferta de entrada, producto diseñado para suscripción |
| N6 | El competidor nos saca semanas | Su alcance es generar reglas; el nuestro incluye aplicarlas y medirlas. Ejecutar la Fase 3 es la respuesta |

---

## 9. Las métricas que de verdad importan

| Métrica | Por qué |
|---|---|
| **ARR** | Es lo que se valora, y lo que dice si el negocio existe |
| **Retención neta por cuenta** | Por encima del 100% significa que las cuentas crecen solas. Es la métrica que separa un buen negocio de uno mediocre |
| **Repositorios por cuenta** | Mide si la expansión dentro de agencias funciona |
| **Conversión de `scan` a plan de pago** | Mide si el gancho gratuito engancha |
| **Deuda reducida por cuenta** | El argumento de renovación. Si no baja, no renuevan |
| Coste de soporte por cuenta | El indicador temprano de que los flujos guiados se están comiendo el margen |

---

## 10. Decisiones tomadas y abiertas

**Tomadas:**

- Suscripción anual por repositorio ([ADR 0004](adr/0004-annual-subscription.md)).
- Licencia BUSL-1.1 ([ADR 0003](adr/0003-busl-license.md)).
- Validación de licencia local-first ([ADR 0002](adr/0002-local-first-licensing.md)).
- `scan` y `report` gratuitos para siempre, garantizado por licencia.

**Abiertas:**

- **Pasarela de cobro.** Lemon Squeezy o Paddle actúan como *merchant of record*
  y gestionan el IVA de cada país de la UE por ~5% de comisión; Stripe cobra ~2%
  pero el IVA intracomunitario y el OSS los llevas tú. Vendiendo B2B a varios
  países desde España, la primera opción probablemente compensa. A decidir antes
  de F5-2.
- **Precio exacto por tramo.** Los rangos del §4 son orientativos. Se cierran con
  los primeros tres clientes piloto (F6-4).
- **Registro de marca.** OEPM ~150 € por clase, EUIPO ~850 €. No es necesario
  para lanzar; tiene sentido cuando haya ventas que proteger.
