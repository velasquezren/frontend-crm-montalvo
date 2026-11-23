# 2. Retención de Estado Instantánea (0 ms) & Reactividad

> Parte de la skill `crm-finanzas`: lee antes su [índice](../SKILL.md).

- **Montaje bajo demanda, y una vez montado no se desmonta.** `@if (estaMontada()(tab))`
  decide si el componente EXISTE —y por tanto si pide sus datos—; se enciende al
  visitar la pestaña o al pasar el cursor por encima (`precargarTab`), y ya no se
  apaga. Alternar entre pestañas no repite ninguna petición y conserva el mes
  elegido y la posición del usuario.
- **Ocultar NO es `display: none`.** El panel inactivo lleva la clase
  `.finanzas-tab-panel--oculto`: fuera de flujo, `height: 0`, `overflow: hidden`,
  `visibility: hidden` y el atributo `inert`.

  > **Esta es la cicatriz del parpadeo.** El hub usó `[hidden]` desde el
  > principio, o sea `display: none`, y eso no oculta un panel: lo saca del
  > renderizado. Al volver a él el navegador rehace su layout entero, y con eso
  > venían tres cosas visibles a la vez —**reinicia las animaciones CSS de
  > dentro** (las porciones de las donas de Analítica se redibujaban desde cero
  > en cada visita), **pierde el scroll horizontal** de las tablas anchas, y
  > **dispara cualquier `@defer (on viewport)`** justo en el instante del cambio
  > de pestaña, porque hasta entonces el bloque no había estado nunca en el
  > viewport. Eso era el parpadeo, y por eso los cinco intentos anteriores de
  > quitarlo tocando esqueletos y animaciones no lo quitaron: ninguno tocaba la
  > causa.
  >
  > `visibility: hidden` conserva el layout y el estado de pintado —volver es un
  > cambio de visibilidad, no un reconstruir— y sigue sacando el contenido del
  > árbol de accesibilidad y del orden de tabulación, que era lo único que
  > aportaba `hidden`. El `position: absolute` + `height: 0` + `overflow: hidden`
  > es lo que impide que el panel oculto aporte altura al hub o alargue la barra
  > de scroll del área de trabajo.
  >
  > **Corolario: dentro del hub no se pone `@defer (on viewport)`.** El
  > disparador no puede cumplirse antes de que la pestaña se muestre, así que
  > por construcción coincide con el cambio de pestaña.
- **Sincronización Reactiva con `toSignal`**: `tabActiva` es un `signal` que se
  fija de forma síncrona al pulsar (0 ms) y un `effect` lo re-sincroniza si el
  usuario usa Atrás/Adelante del navegador. La URL se actualiza después, con
  `replaceUrl`, para que la navegación del router no sea lo que pinta.
- **Redirecciones Transparentes**: Marcadores y enlaces anteriores (`/reportes`, `/planilla-comisiones`, `/comisiones-anual`) redirigen limpiamente a `/finanzas` sin romper enlaces guardados.

---
