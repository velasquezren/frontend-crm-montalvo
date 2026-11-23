# 8. Ciclo de vida de un mes: quién puede cerrarlo y cuándo

> Parte de la skill `crm-finanzas`: lee antes su [índice](../SKILL.md).

```
BORRADOR ──calcular──▶ CALCULADO ──enviar a revisión──▶ EN_REVISION
    ▲                    │  ▲                            │      │
    └──reimportar────────┘  └───rechazar (con motivo)─────┘      │ aprueban todos
                            ▲                                    ▼
                            └──reabrir (SUPER_ADMIN + motivo)── CERRADO ──pagar──▶ PAGADO
```

**Las transiciones legales viven en `estados-periodo.ts` (backend) y se validan
ahí.** No las repliques en el frontend: la página pide `GET /periodos/:id/revision`
y pinta lo que le digan. Dos copias de la tabla acaban diciendo cosas distintas
y gana la que no manda.

### Por qué no hay un endpoint que reciba el estado destino

Lo hubo (`PATCH /periodos/:id/estado`) y era el agujero principal:
`update({ data: { estado } })` con el valor que llegara, sin comprobar el salto.
`CERRADO → BORRADOR` era legal, así que el candado de un mes pagado dependía de
que nadie eligiera mal en un desplegable. Y los permisos estaban al revés:
borrar un periodo pedía SUPER_ADMIN, pero reabrirlo —que permite recalcular y
cambiar lo que a alguien ya se le pagó— se conformaba con ADMIN.

Ahora cada paso es su propia ruta (`revision`, `aprobar`, `rechazar`, `reabrir`,
`pagar`) con sus permisos y los datos que exige. **Preparar es ADMIN; decidir es
SUPER_ADMIN**, rechazar incluido: invalida las firmas de los demás y no puede
quedar en manos de quien preparó la planilla.

### La compuerta importa más que el número de estados

`bloqueosParaRevision()` impide mandar a revisar un mes con filas sin clasificar,
sin vendedora, con vendedoras sin configurar, o sin liquidar. Un flujo de
aprobaciones que deja firmar un mes con cuarenta filas sin clasificar no protege
nada: solo reparte la firma de un número que ya estaba mal. Los datos ya los
calculaba `alertas()` desde antes; lo que faltaba era que alguno bloqueara algo.

Se devuelven también en el `GET`, para que la pantalla diga qué falta **antes**
de que alguien pulse y se lleve un 409.

### "Todos aprobaron" se evalúa contra los SUPER_ADMIN de AHORA

Las aprobaciones son filas de `AprobacionPeriodo`, no un valor del enum: con un
estado "medio aprobado" no se puede responder *quién falta*. El conjunto exigido
se recalcula en cada lectura, **nunca se congela al abrir la revisión**, porque
un SUPER_ADMIN puede bajar a ADMIN en cualquier momento:

- **Baja a ADMIN o se desactiva** → deja de sumar y también de bloquear.
- **Entra un SUPER_ADMIN nuevo** → el mes vuelve a pendiente: no ha visto las cifras.
- **Cero SUPER_ADMIN activos** → NO se da por aprobado. "Todos aprobaron" sobre
  un conjunto vacío es verdadero, y sin el `aprobaron.length > 0` el mes se
  cerraría solo, sin una sola firma, el día que la clínica se quedara sin
  SUPER_ADMIN.

Un rechazo o una reapertura **borran todas las aprobaciones**, también las de
quien no rechazó: una firma vale para las cifras que se firmaron.

### Detalles que no son cosméticos

- **`EN_REVISION` congela la edición.** Las guardas de `importar`, `ajustarVenta`,
  `eliminarPeriodo`, `reclasificarConRegla` y `calcular` pasaron de comparar con
  `CERRADO` a llamar a `esEditable()`. Eran cinco comprobaciones idénticas
  escritas a mano; con el estado nuevo, las cinco habrían seguido dejando editar
  un mes en revisión, cada una en su archivo y sin que nada avisara.
- **`PAGADO` es terminal.** Un error se corrige con un ajuste en el mes
  siguiente, no reescribiendo el mes pagado.
- **Reabrir guarda en `AuditLog` la foto de configuración que va a perderse.**
  `configuracionUsada` se pisa en cada cálculo, así que reabrir y recalcular
  borraba la única respuesta a "¿con qué reglas se pagó este mes?". El schema ya
  dice que el historial de intentos vive en `AuditLog`: la foto viaja ahí.
- **El cierre no es un botón.** Es la consecuencia de que se complete el
  conjunto de firmas. Con un paso manual habría un hueco en el que el mes está
  aprobado y todavía editable.

Pruebas: `estados-periodo.spec.ts` (reglas puras, incluido el SUPER_ADMIN que
baja a ADMIN) y `cierre-periodo.spec.ts` (que el servicio las use).

- **Exclusiones con Auditoría**: Para marcar `comisionable = false`, el backend exige obligatoriamente `motivoExclusion` (3 a 200 caracteres), registrando autor, fecha y motivo en `AuditLog`. Al reincluir (`comisionable = true`), el motivo se limpia.
- **Estado del Plan Informativo**: El campo `estadoPlan` (`APROBADO`, `TERMINADO`, etc.) informa el avance clínico/administrativo pero **no excluye** la venta del cálculo de comisión.
