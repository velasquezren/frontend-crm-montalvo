# Autenticación: refresh silencioso ante un 401, con freno anti-bucle

> Parte de la skill `crm-feature-page`: lee antes su [índice](../SKILL.md).

`token.interceptor.ts` adjunta el JWT a cada petición. Ante un 401 que **no**
venga de `/auth/login`, `/auth/refresh` ni `/auth/logout`
(`esPeticionDeAutenticacion` los excluye — si no, cerrar sesión podría
resucitarla), intenta UN refresco silencioso vía `AuthService.refrescarToken()`
y reintenta la petición original con el token nuevo. Solo desloguea y manda a
`/auth/login` si:

- el refresco responde 401 (credencial inválida, revocada o expirada), o
- la petición reintentada con el token **nuevo** vuelve a dar 401 — ahí el
  problema no es el token, es la sesión (usuario desactivado, permisos
  revocados), y sin este freno la agente quedaba en una pantalla que fallaba
  en bucle sin explicación.

**`refrescarToken()` deduplica con una promesa compartida** (`AuthService`,
campo `refrescoEnCurso`): si varias peticiones reciben 401 a la vez —típico al
volver de segundo plano con el `access_token` ya vencido—, todas esperan el
MISMO refresco en vuelo en vez de disparar N peticiones a `/auth/refresh` para
pedir, todas, lo mismo. Ver `crm-backend-module` (repo del backend) para el
otro lado: por qué la cookie es `SameSite=None` en producción y qué hace
`logout()` de verdad.

Los errores de red y 5xx se propagan sin borrar la sesión. Cada login/logout
cambia `generacionSesion`; el servicio y el interceptor descartan respuestas de
una generación anterior. Login usa `withCredentials`, igual que refresh/logout,
para recibir la cookie cross-site. No se lee ni guarda el refresh desde JavaScript.
`RealtimeService` conserva un socket por sesión con conteo de consumidores, lee
el access actual en cada handshake y comparte el refresh ante un rechazo 401.
Los fallos transitorios reintentan con espera acotada; logout desconecta el socket.
