# 7. Arquitectura Modular y Subcomponentes

> Parte de la skill `crm-finanzas`: lee antes su [índice](../SKILL.md).

Para evitar código espagueti y archivos monolíticos, `PlanillaComisionesPage` delega sus responsabilidades a subcomponentes `OnPush` reutilizables:

1. **`<app-tabla-liquidacion>` (`TablaLiquidacionComponent`)**:
   - Renderiza la matriz contable por vendedora.
   - Muestra Tipo A, Tipo B (cirugías), Tipo C (servicios), bonos de jefatura/trimestral, sueldo base, total USD y total BOB (calculado con `tipoCambio` oficial del periodo).

2. **`<app-configuracion-comisiones>` (`ConfiguracionComisionesComponent`)**:
   - Subcomponente aislado para las 9 secciones de configuración:
     1. Palancas globales (`PCT_TIPO_C_RA`, `FACTOR_BONO_JEFATURA`, `FACTOR_BONO_TRIMESTRAL`, `MESES_BONO_TRIMESTRAL`).
     2. Directorio de vendedoras (sueldo base, tipo y área).
     3. Tarifas Tipo A (Planes).
     4. Tarifas Tipo C (Servicios).
     5. Escala Tipo B (Cirugías por volumen mensual).
     6. Histórico RA (Procedimientos de reproducción asistida descontinuados).
     7. Canales de captación (Mapeo empresa vs. propia).
     8. Metas comerciales (Base vs. específicas del mes).
     9. Diccionario de clasificación por patrón de texto.

3. **`<app-seleccion-planes>` (`SeleccionPlanesComponent`)**:
   - Subcomponente que agrupa los planes por vendedora y tipo (`PLANPAQ`, `PLANNIN`).
   - Aplica la franquicia (`vendidos − objetivo`) y permite alternar planes elegidos a mano vs. automáticos (menor base).
   - La regla vive en **`agrupar-planes.ts`** (función pura, probada en
     `agrupar-planes.spec.ts`), no dentro del `computed` de la página. Ver §7b.

### 7b. La vista previa de planes es una SEGUNDA implementación de una regla que paga

`agruparPlanes()` reproduce en el navegador lo que decide
`seleccionarPlanesComisionables()` en el backend, para que administración pueda
ver y corregir la selección antes de calcular. **Son dos implementaciones de la
misma regla en dos lenguajes**: si dejan de coincidir, la pantalla marca unos
planes y la planilla paga otros, y nadie se entera hasta que alguien cuadra su
liquidación a mano. Tocar una obliga a tocar la otra en el mismo cambio.

**Lo que ya las separó (2026-09-10): el motor solo mira las filas
COMISIONABLES.** Sus candidatos salen de
`where: { periodoId, comisionable: true, vendedoraId: { not: null } }`; la
pantalla pedía `ventasRequest(id, { clasif: 'PLANPAQ', limite: 100 })`, que **no
filtra por `comisionable`**, y las contaba todas. Con 5 paquetes de los que 1
estaba excluido y objetivo 4:

| | vendidos que cuenta | cupo | resultado |
|---|---|---|---|
| Pantalla (antes) | 5 | 1 | marcaba 1 plan como «comisiona» |
| Motor | 4 | 0 | **pagaba cero** |

Las excluidas no se listan —el motor tampoco las ve— pero **se declaran**:
`GrupoPlanes.excluidos` y un badge en la cabecera del grupo. Mismo criterio que
las vendedoras ocultas (§9): quien cuente los planes en Clasificación y aquí
tiene que poder explicarse la diferencia sin buscar un error que no existe.

Se extrajo a un archivo propio precisamente porque vivía dentro de un `computed`
de `planilla-comisiones.page.ts`, donde no había forma de probarla sin montar la
página entera — y así fue como se le escapó la divergencia. **Otra cosa que
sigue sin cubrirse**: `limite: 100` es el tope del backend, y si un mes trajera
más de 100 planes de un tipo la pantalla vería solo los primeros y calcularía un
cupo corto, sin avisar. Hoy el mes más cargado trae 30.

---
