# ADR 0003 — Business Source License 1.1 para el código

- **Estado:** aceptada
- **Fecha:** 2026-09-09
- **Afecta a:** `LICENSE`, la estrategia comercial y la Fase 5

## Contexto

Hay que elegir bajo qué licencia se publica el código. La decisión está
condicionada por una tensión real del producto:

- Nuestro argumento de venta más fuerte es **"puedes auditar exactamente lo que
  hace"**. Eso empuja hacia código legible por el cliente.
- El modelo de negocio es vender licencias por repositorio. Eso empuja hacia
  proteger el código.

## Decisión

**Business Source License 1.1**, con estos parámetros:

- **Change Date:** 2030-09-09 (o el cuarto aniversario de cada versión, lo que
  ocurra antes).
- **Change License:** Apache-2.0.
- **Additional Use Grant:** todo comando que **no modifique** el repositorio
  destino es de uso libre en producción y sin límite de repositorios. A día de
  hoy son `scan`, `plan` y `doctor`. El resto queda bajo los términos por
  defecto de la licencia, que exigen adquirir una licencia comercial.

  El grant se redacta por **propiedad** ("no modifica el repositorio") y no por
  lista cerrada, para que no caduque cada vez que añadamos un comando. La
  enumeración es ilustrativa y va fechada.

## Alternativas descartadas

**Núcleo abierto (Apache-2.0) con packs de pago.** Maximiza la adopción, que es
el canal de venta. Se descarta porque el motor transaccional —plan, journal,
rollback, bloques gestionados— es la parte difícil y diferencial. Regalarlo
permite a un competidor construir encima sin haber pagado el coste de diseñarlo,
y los packs, que serían lo de pago, son la parte fácil de replicar.

**Todo propietario en un repositorio privado.** Máxima protección, pero pierde
el canal de adopción orgánica y, sobre todo, obliga a pedirle a un equipo de
seguridad que confíe en una caja negra que va a escribir en su repositorio. Es
pedir demasiado.

## Consecuencias

**A favor:**

- El repositorio puede ser público. Un cliente potencial audita el código antes
  de comprar, que es exactamente lo que queremos que haga.
- Nadie puede revenderlo ni ofrecerlo como servicio competidor.
- El `scan` gratuito queda amparado por la licencia, no sólo por una decisión de
  producto que podríamos revertir. Es un compromiso creíble.
- Cada versión acaba siendo Apache-2.0. Eso desactiva la objeción de
  "¿y si desapareces?", que en una compra enterprise se pregunta siempre.

**El coste que asumimos:**

- BUSL **no es una licencia de código abierto** según la definición de la OSI.
  Habrá quien lo critique, y no aparecerá en listados de software libre.
- Algunas empresas tienen políticas que prohíben dependencias no-OSI. Perderemos
  a esos clientes o tendremos que negociar una licencia comercial aparte.
- Es una licencia menos conocida que MIT o Apache, y eso genera preguntas en el
  proceso de compra. Conviene tener preparada la explicación en una frase.

## Verificación del texto

Contrastado el 2026-09-09 contra dos fuentes canónicas: la prosa publicada en
https://mariadb.com/bsl11/ y, sobre todo, el fichero `LICENSE25.TXT` de MaxScale
en el repositorio de MariaDB, que es la **forma de plantilla para adoptantes** —
bloque de parámetros más cuatro covenants numerados— y por tanto el artefacto
con el que hay que comparar.

Se corrigieron dos cosas: la palabra `Section` por `License` en el párrafo de
marcas, y la restauración del bloque `Notice` completo, que faltaba entero. Ese
bloque contiene la declaración de que la BUSL **no es una licencia de código
abierto**, que es precisamente el coste que esta ADR dice asumir; omitirla habría
sido incoherente.

**Dos trampas documentadas, para que nadie las "corrija" de vuelta:**

1. La atribución de copyright de un fichero de adoptante es
   `(c) 2020 MariaDB Corporation Ab`, **no** el `(c) 2024 MariaDB plc` que hoy
   muestra la web. Son artefactos distintos. Nuestro fichero es correcto.
2. La web de MariaDB renderiza los covenants como **dos** en lugar de cuatro,
   soldando el `(b) insert the text "None"` del segundo con el tercero y el
   cuarto. Es un fallo de maquetación de la web. Nuestros cuatro covenants son
   correctos.

**Sigue pendiente:** una revisión legal antes de facturar la primera licencia.
Queda por decidir si los dos enlaces a las FAQ de MariaDB, incluidos aquí
verbatim por fidelidad, se mantienen o se retiran: muchos adoptantes los quitan.
