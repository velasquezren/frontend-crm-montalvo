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
