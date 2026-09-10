import { GrupoPlanes, Objetivo, TipoPlan, Vendedora, VentaImportada } from './planilla.model';

/**
 * Qué planes se marcan como «comisiona» en la pantalla de Selección de planes.
 *
 * ## Por qué vive fuera de la página
 *
 * Es la **segunda copia** de una regla que manda dinero: la primera es
 * `seleccionarPlanesComisionables()` del backend
 * (`reglas-calculo.ts`), que es la que decide lo que de verdad se paga. Esta
 * solo reproduce esa decisión para que administración pueda verla y corregirla
 * antes de calcular — pero si las dos dejan de coincidir, la pantalla marca
 * unos planes y la planilla paga otros, y nadie se entera hasta que alguien
 * cuadra su liquidación a mano.
 *
 * Vivía dentro de un `computed` de `planilla-comisiones.page.ts`, donde no había
 * forma de probarla sin montar la página entera, y así fue como se le escapó la
 * divergencia que documenta `filtrarComisionables()`. Acá es una función pura
 * con sus casos fijados en `agrupar-planes.spec.ts`.
 *
 * **La deuda de fondo sigue abierta y conviene no olvidarla**: son dos
 * implementaciones de la misma regla en dos lenguajes. Si tocas
 * `seleccionarPlanesComisionables` en el backend, esto se toca en el mismo
 * cambio.
 */

/** El número dentro de un `Cod. Origen`: "VE1462" → 1462. */
function correlativo(codOrigen: string | null | undefined): number | null {
  if (!codOrigen) return null;
  const digitos = codOrigen.replace(/\D+/g, '');
  return digitos === '' ? null : Number(digitos);
}

/**
 * Ordena los planes del último registrado al primero, igual que el motor.
 *
 * Se compara el NÚMERO del correlativo, no el texto: como texto "VE999" iría
 * después de "VE1000" y el último plan del mes dejaría de serlo justo al cruzar
 * el millar. La fecha solo desempata cuando no hay correlativo, porque las dos
 * cosas se contradicen —en diciembre 2025 la venta VE1458 es del 22/12 y la
 * VE1462, posterior, del 13/12— y la planilla siempre siguió el correlativo.
 */
export function ultimoPrimero(a: VentaImportada, b: VentaImportada): number {
  const ca = correlativo(a.codOrigen);
  const cb = correlativo(b.codOrigen);
  if (ca !== null && cb !== null && ca !== cb) return cb - ca;

  const fa = a.fecha ? Date.parse(a.fecha) : NaN;
  const fb = b.fecha ? Date.parse(b.fecha) : NaN;
  if (!Number.isNaN(fa) && !Number.isNaN(fb) && fa !== fb) return fb - fa;

  return b.id.localeCompare(a.id);
}

/**
 * Agrupa los planes por vendedora y tipo, y resuelve objetivo, cupo y elegidos.
 *
 * `planesPaq`/`planesNin` llegan tal cual del endpoint de ventas, que **no**
 * filtra por `comisionable`: ese filtro se aplica aquí, ver `GrupoPlanes.planes`.
 */
export function agruparPlanes(
  planesPaq: readonly VentaImportada[],
  planesNin: readonly VentaImportada[],
  vendedoras: readonly Vendedora[],
  objetivos: readonly Objetivo[],
): GrupoPlanes[] {
  /* `excluidos` se acumula mientras se agrupa, así que el mapa guarda la forma
     mutable de `GrupoPlanes`. */
  const porVendedora = new Map<string, GrupoPlanes & { excluidos: number }>();

  const agregar = (venta: VentaImportada, tipo: TipoPlan): void => {
    if (!venta.vendedora) return;
    const clave = `${venta.vendedora.id}·${tipo}`;
    const grupo = porVendedora.get(clave) ?? {
      clave,
      vendedoraId: venta.vendedora.id,
      vendedoraNombre: venta.vendedora.nombre,
      tipo,
      objetivo: 0,
      cupo: 0,
      planes: [],
      excluidos: 0,
    };
    /*
     * El motor solo ve las comisionables — su candidato sale de
     * `where: { periodoId, comisionable: true, vendedoraId: { not: null } }`.
     *
     * Contarlas aquí inflaba el cupo: con 5 paquetes de los que 1 estaba
     * excluido y objetivo 4, la pantalla marcaba 1 plan como «comisiona»
     * mientras la liquidación pagaba cero. Se cuentan aparte, no se tiran, para
     * poder decir cuántas faltan.
     */
    if (venta.comisionable) grupo.planes.push(venta);
    else grupo.excluidos += 1;
    porVendedora.set(clave, grupo);
  };

  for (const venta of planesPaq) agregar(venta, 'PLANPAQ');
  for (const venta of planesNin) agregar(venta, 'PLANNIN');

  const vendedorasPorId = new Map(vendedoras.map(v => [v.id, v]));

  return [...porVendedora.values()]
    .map(grupo => {
      const vendedora = vendedorasPorId.get(grupo.vendedoraId);
      const meta = objetivos.find(objetivo => objetivo.tipo === (vendedora?.tipo ?? 'VENDEDORA'));
      const objetivo =
        grupo.tipo === 'PLANPAQ' ? (meta?.planpaqMinimos ?? 0) : (meta?.planninMinimos ?? 0);

      // Mismo orden que usa el motor: del último registrado al primero.
      const planes = [...grupo.planes].sort(ultimoPrimero);
      const cupo = Math.max(0, planes.length - objetivo);

      // Reproduce la selección del backend: lo marcado a mano primero.
      const elegidos = new Set<string>();
      for (const plan of planes) {
        if (plan.comisionaPlan === true && elegidos.size < cupo) elegidos.add(plan.id);
      }
      for (const plan of planes) {
        if (elegidos.size >= cupo) break;
        if ((plan.comisionaPlan ?? null) === null) elegidos.add(plan.id);
      }

      return { ...grupo, objetivo, cupo, planes, elegidos };
    })
    .sort(
      (a, b) => a.vendedoraNombre.localeCompare(b.vendedoraNombre) || a.tipo.localeCompare(b.tipo),
    );
}
