# Política de seguridad

## Reportar una vulnerabilidad

Si encuentras una vulnerabilidad en AegisCode, **no abras una issue pública**.
Escribe a **erikfloresreche@gmail.com** con el asunto `[SECURITY] AegisCode`.

Incluye, en la medida de lo posible:

- Una descripción del problema y de su impacto.
- Los pasos para reproducirlo.
- La versión afectada y el sistema operativo.

Recibirás acuse de recibo en **72 horas** y una evaluación inicial en **7 días
naturales**. Si la vulnerabilidad se confirma, acordaremos contigo una fecha de
publicación y te acreditaremos en el aviso salvo que prefieras lo contrario.

## Por qué esta herramienta merece atención especial

AegisCode **escribe en el repositorio de sus usuarios** y **ejecuta comandos** en
su máquina. Eso la convierte en un objetivo interesante. Las áreas donde un
fallo sería más grave:

- **Escritura fuera del repositorio.** `resolveInRepo()` en
  [core/src/fs.ts](packages/core/src/fs.ts) rechaza rutas absolutas y las que
  escapan con `../`. Cualquier forma de sortearlo es crítica.
- **Ejecución de comandos.** Se usa `execa` sin shell precisamente para evitar
  inyección. Un camino que permita inyectar un comando es crítico.
- **Packs de terceros.** Un pack sólo puede *declarar* operaciones; no tiene
  acceso al sistema de ficheros. Cualquier forma de que un pack escriba
  directamente es crítica.
- **Fuga de información.** El CLI no envía telemetría. Cuando exista validación
  de licencia, enviará únicamente el token, la huella del repositorio y la
  versión. Nunca código, rutas ni nombres de fichero.

## Alcance

Entra en el alcance el código de este repositorio y los paquetes publicados
desde él.

Queda fuera: las herramientas de terceros que AegisCode configura (ESLint,
Gitleaks, Husky y demás) —repórtalas a sus mantenedores—, y las
vulnerabilidades que requieran que el atacante ya tenga acceso de escritura al
repositorio o a la máquina de la víctima.
