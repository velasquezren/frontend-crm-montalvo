/**
 * Los meses del año, en el idioma del CRM.
 *
 * **Vivían en `features/planilla-comisiones/planilla.model.ts`**, y de ahí los
 * importaban seis vistas — incluido `<app-selector-periodo-empty>`, que es un
 * átomo de `shared/`: un componente compartido dependiendo de un feature, que es
 * la dependencia al revés. Acá quedan donde les toca; `planilla.model` los
 * reexporta para no romper a quien ya los importaba de allí.
 */
export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
] as const;

export const MESES_CORTOS = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
] as const;

/**
 * Nombre de un mes 1-12.
 *
 * **Estaba escrito SEIS veces** —Servicios, Planilla, Analítica, Desempeño de
 * Ejecutivas, Configuración de Comisiones y el selector de periodo— y las copias
 * ya habían divergido en el caso raro, cada una a su manera:
 *
 * | Copia | Con un mes fuera de 1-12 |
 * |---|---|
 * | Desempeño | `Mes 13` |
 * | Servicios · Planilla · Analítica | `13` |
 * | **Configuración de comisiones** | **cadena vacía** |
 *
 * La tercera es la que obliga a unificar: un mes inválido salía **invisible** en
 * el módulo de comisiones, así que una etiqueta de periodo podía quedarse en
 * blanco sin que nada lo señalara. Un mes fuera de rango es un dato roto y se
 * dice: `Mes 13` se ve, `13` se confunde con un día y `''` miente callando.
 */
export function nombreMes(mes: number): string {
  return MESES[mes - 1] ?? `Mes ${mes}`;
}

/** Igual que `nombreMes`, abreviado — para ejes de gráficos y columnas estrechas. */
export function nombreMesCorto(mes: number): string {
  return MESES_CORTOS[mes - 1] ?? `M${mes}`;
}

/**
 * Igual que `nombreMesCorto`, en minúscula — para una fecha escrita en línea
 * («13 oct 2026», «mar 13 oct»), que es como la pinta `es-BO`.
 *
 * Existe para que no haya un SEGUNDO array. El de abajo estaba copiado en
 * cuatro archivos —uno dentro de este mismo `shared/models/`— y las copias ya
 * daban tres respuestas distintas a un mes fuera de rango:
 *
 * | Copia | Con un mes inválido |
 * |---|---|
 * | `catalogo.ts` (`MESES[mes - 1]`) | **`undefined`** → «13 undefined 2026» |
 * | `servicios-medico-drawer` (`?? '—'`) | `'—'` |
 * | este archivo | `M13` |
 *
 * Es la misma cicatriz de `nombreMes`, regenerada: se consolidó una vez en
 * mayúscula y volvió a crecer en minúscula porque faltaba esta función. Un mes
 * fuera de rango es un dato roto y se dice; `undefined` miente en voz alta y
 * `'—'` miente callando.
 */
export function nombreMesCortoMinuscula(mes: number): string {
  return nombreMesCorto(mes).toLowerCase();
}

/**
 * Los días de la semana en minúscula, empezando en LUNES (`1`), como
 * `Temporal.PlainDate.dayOfWeek` y como se lee un calendario aquí.
 */
const DIAS_CORTOS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'] as const;

/** Nombre corto de un día 1-7 (lunes a domingo). */
export function nombreDiaCorto(dia: number): string {
  return DIAS_CORTOS[dia - 1] ?? `D${dia}`;
}
