import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { InteraccionPreviewComponent, InteraccionVista } from './interaccion-preview.component';

async function montar(vista: InteraccionVista | null, { historial = false, habilitada = true, cargando = false } = {}) {
  const f = TestBed.createComponent(InteraccionPreviewComponent);
  f.componentRef.setInput('interaccion', vista);
  f.componentRef.setInput('habilitada', habilitada);
  f.componentRef.setInput('historial', historial);
  f.componentRef.setInput('cargando', cargando);
  await f.whenStable();
  return f;
}
const texto = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ');

describe('mensaje interactivo de WhatsApp en el CRM', () => {
  it('no se activa por defecto', async () => {
    const f = TestBed.createComponent(InteraccionPreviewComponent);
    await f.whenStable();
    expect((f.nativeElement as HTMLElement).querySelector('section')).toBeNull();
  });

  it('una selección vinculada se lee como respuesta, sin jerga ni identificadores internos', async () => {
    const f = await montar(
      { tipo: 'seleccion', cuerpo: 'Ver promociones', estado: 'CORRELACIONADA', seleccionId: 'PROMOCIONES-1', contextoId: 'msg-1' },
      { historial: true },
    );
    const el = f.nativeElement as HTMLElement;
    expect(texto(el)).toContain('Tocó una opción');
    expect(el.querySelector('.ia-eleccion')?.textContent).toBe('Ver promociones');
    /* Lo que decía antes: falso cuando el CRM ya había contestado solo, y ruido. */
    expect(texto(el)).not.toMatch(/Atención por el personal|Respuesta vinculada|Interacción de WhatsApp|Ver referencias|PROMOCIONES-1|msg-1/);
    expect(el.querySelector('[role="status"]')).toBeNull();
  });

  it('«Ver mensaje» pide ir al mensaje citado; sin vínculo o fuera del chat no aparece', async () => {
    const f = await montar({ tipo: 'seleccion', cuerpo: 'Horarios', estado: 'CORRELACIONADA', contextoId: 'msg-7' }, { historial: true });
    const pedidos: string[] = [];
    f.componentInstance.irAMensaje.subscribe(id => pedidos.push(id));
    const boton = (f.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button[aria-label="Ir al mensaje al que responde"]');
    boton?.click();
    expect(pedidos).toEqual(['msg-7']);

    const sinVinculo = await montar({ tipo: 'seleccion', cuerpo: 'Horarios', estado: 'NO_CORRELACIONADA' }, { historial: true });
    expect((sinVinculo.nativeElement as HTMLElement).querySelector('button')).toBeNull();
    const previa = await montar({ tipo: 'seleccion', cuerpo: 'Horarios', contextoId: 'msg-7' });
    expect((previa.nativeElement as HTMLElement).querySelector('button')).toBeNull();
  });

  it('solo avisa cuando hay algo que revisar, y lo dice en lenguaje de la agente', async () => {
    const f = await montar({ tipo: 'seleccion', cuerpo: 'Recepción', estado: 'CADUCADA' }, { historial: true });
    const aviso = (f.nativeElement as HTMLElement).querySelector('[role="status"]');
    expect(aviso?.textContent).toContain('mensaje vencido');
  });

  it('una oferta con botones: texto con formato, pie y un renglón por botón, sin controles', async () => {
    const f = await montar({
      tipo: 'botones',
      cuerpo: '*Ecografía* ~Bs 300~ <img src=x>',
      pie: 'Código PRM-12',
      opciones: [{ id: 'PAGAR', titulo: 'Pagar ahora' }, { id: 'PERSONA', titulo: 'Hablar con alguien' }],
    }, { historial: true });
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('.ia-cuerpo strong')?.textContent).toBe('Ecografía');
    expect(el.querySelector('.ia-cuerpo del')?.textContent).toBe('Bs 300');
    /* El formato pasa; el HTML del texto no. */
    expect(el.querySelector('.ia-cuerpo img')).toBeNull();
    expect(el.querySelector('.ia-pie')?.textContent).toBe('Código PRM-12');
    expect([...el.querySelectorAll('.ia-accion')].map(b => b.textContent?.trim())).toEqual(['Pagar ahora', 'Hablar con alguien']);
    expect(el.querySelector('button')).toBeNull();
  });

  it('el banner de una promoción se muestra, y si ya no existe no deja un ícono roto', async () => {
    const f = await montar({ tipo: 'botones', cuerpo: 'Promo', imagen: 'https://cdn.test/banner.jpg', opciones: [{ id: 'P', titulo: 'Hablar con alguien' }] }, { historial: true });
    const el = f.nativeElement as HTMLElement;
    const img = el.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://cdn.test/banner.jpg');
    img?.dispatchEvent(new Event('error'));
    await f.whenStable();
    expect(el.querySelector('img')).toBeNull();
  });

  it('una lista muestra su botón con la cantidad y despliega las opciones con su descripción', async () => {
    const f = await montar({
      tipo: 'lista',
      cuerpo: 'Estas son nuestras promociones vigentes:',
      boton: 'Ver promociones',
      opciones: [{ id: 'A', titulo: 'Tres controles eco', descripcion: 'Incluye informe' }, { id: 'B', titulo: 'Paquete parto' }],
    }, { historial: true });
    const el = f.nativeElement as HTMLElement;
    expect(texto(el.querySelector('summary') as HTMLElement)).toContain('Ver promociones 2 opciones');
    expect(el.querySelectorAll('.ia-opciones li')).toHaveLength(2);
    expect(el.querySelector('.ia-opcion-descripcion')?.textContent).toBe('Incluye informe');
  });

  it('una oferta guardada antes del rótulo usa el de WhatsApp por defecto', async () => {
    const lista = await montar({ tipo: 'lista', cuerpo: 'Elige', opciones: [{ id: 'A', titulo: 'Horarios' }] }, { historial: true });
    expect(texto(lista.nativeElement as HTMLElement)).toContain('Ver opciones');
    const flow = await montar({ tipo: 'flow', cuerpo: 'Te ayudamos con tu cita' }, { historial: true });
    expect(texto(flow.nativeElement as HTMLElement)).toContain('Abrir formulario');
  });

  it('el formulario ofrecido se ve con su botón', async () => {
    const f = await montar({ tipo: 'flow', cuerpo: 'Cuéntanos para qué es la cita.', cta: 'Solicitar cita', opciones: [] }, { historial: true });
    const accion = (f.nativeElement as HTMLElement).querySelector('.ia-accion');
    expect(texto(accion as HTMLElement)).toBe('Solicitar cita formulario');
  });

  it('el formulario recibido muestra lo que eligió y no se presenta como cita confirmada', async () => {
    const f = await montar({
      tipo: 'respuesta_flow',
      cuerpo: 'Solicitud de cita recibida. Pendiente: no hay ninguna cita reservada.',
      proposito: 'SOLICITUD_CITA',
      estado: 'CORRELACIONADA',
      datos: [{ etiqueta: 'Especialidad', valor: 'Maternidad' }, { etiqueta: 'Turno', valor: 'Mañana' }],
    }, { historial: true });
    const el = f.nativeElement as HTMLElement;
    expect(texto(el)).toContain('Completó el formulario');
    expect([...el.querySelectorAll('.ia-datos dt')].map(d => d.textContent)).toEqual(['Especialidad', 'Turno']);
    expect([...el.querySelectorAll('.ia-datos dd')].map(d => d.textContent)).toEqual(['Maternidad', 'Mañana']);
    expect(texto(el)).toContain('no hay ninguna cita reservada');
  });

  it('no interpreta HTML de la respuesta de la paciente', async () => {
    const el = (await montar({ tipo: 'seleccion', cuerpo: '<img src=x onerror=alert(1)>' }, { historial: true })).nativeElement as HTMLElement;
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('<img');
  });

  it('vista previa suelta: título propio o el de demostración; nunca en el chat', async () => {
    const f = await montar({ tipo: 'botones', cuerpo: 'Hola', opciones: [{ id: 'A', titulo: 'Cita' }] });
    expect(texto(f.nativeElement as HTMLElement)).toContain('Demostración local');
    f.componentRef.setInput('titulo', 'Así lo verá la paciente');
    await f.whenStable();
    expect(texto(f.nativeElement as HTMLElement)).toContain('Así lo verá la paciente');
    const chat = await montar({ tipo: 'botones', cuerpo: 'Hola', opciones: [{ id: 'A', titulo: 'Cita' }] }, { historial: true });
    expect((chat.nativeElement as HTMLElement).querySelector('.ia-previa-titulo')).toBeNull();
  });

  it('diferencia carga, ausencia, lápida caducada y respuesta ilegible', async () => {
    expect(texto((await montar(null, { cargando: true })).nativeElement)).toContain('Preparando');
    expect(texto((await montar(null)).nativeElement)).toContain('No hay');
    const lapida = (await montar({ tipo: 'error', cuerpo: 'Detalle de interacción caducado.' }, { historial: true })).nativeElement as HTMLElement;
    expect(texto(lapida)).toContain('Detalle de interacción caducado.');
    expect(lapida.querySelector('[role="status"]')).toBeNull();
    const ilegible = (await montar({ tipo: 'error', cuerpo: 'Respuesta interactiva recibida; requiere revisión humana.', estado: 'DESCONOCIDA' }, { historial: true })).nativeElement as HTMLElement;
    expect(ilegible.querySelector('[role="status"]')?.textContent).toContain('todavía no entiende');
  });
});
