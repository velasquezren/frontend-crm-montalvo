import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VentasService } from '../ventas.service';
import { FormularioVentaComponent } from './formulario-venta.component';

/**
 * El formulario ÚNICO de venta (página de Ventas y panel del chat).
 *
 * Se fija lo que costó caro cuando había dos copias:
 * - la del chat no mandaba el lead de origen: 0 de 18 ventas atribuidas;
 * - «4.500» se guardaba como Bs 4,50;
 * - `GET /clientes` es paginado y el buscador lo leía como array (no pintaba
 *   ningún resultado aunque el backend los devolviera).
 */

const CLIENTE = { id: 'c1', nombre: 'Paciente Prueba', telefono: '+59170000000', categoria: 'PROSPECTO', ci: '12345678', pac: 'PAC-001' };
const pagina = <T>(datos: T[]) => ({ datos, total: datos.length, pagina: 1, limite: 20, totalPaginas: 1 });
const lead = (id: string, estado: string) => ({ id, estado, origen: 'WHATSAPP_DIRECTO', createdAt: '2026-09-20T10:00:00Z', cliente: CLIENTE, agente: null });

describe('formulario de venta', () => {
  let fixture: ComponentFixture<FormularioVentaComponent>;
  let form: FormularioVentaComponent;
  let http: HttpTestingController;
  let crear: ReturnType<typeof vi.fn>;

  async function asentar(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await Promise.resolve();
      TestBed.tick();
    }
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    crear = vi.fn(async () => ({ id: 'v1', producto: 'Consulta' }));
    TestBed.configureTestingModule({
      imports: [FormularioVentaComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.overrideProvider(VentasService, {
      useValue: { catalogoRequest: () => undefined, crear, subirComprobante: vi.fn() },
    });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(FormularioVentaComponent);
    form = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => TestBed.resetTestingModule());

  /** Abre el formulario con la paciente puesta (como el chat) y responde sus leads. */
  async function conPaciente(leads: ReturnType<typeof lead>[], extra: Record<string, unknown> = {}): Promise<void> {
    fixture.componentRef.setInput('paciente', CLIENTE);
    fixture.componentRef.setInput('pacienteFijo', true);
    for (const [clave, valor] of Object.entries(extra)) fixture.componentRef.setInput(clave, valor);
    fixture.detectChanges();
    await asentar();
    http.match(r => r.url.includes('/leads')).forEach(r => r.flush(pagina(leads)));
    await asentar();
  }

  async function enviar(): Promise<void> {
    form['producto'].set('Consulta externa');
    form['monto'].set('4.500');
    await form['guardar'](new Event('submit'));
  }

  it('desde el chat, con UN lead abierto, la venta sale atribuida a ese lead', async () => {
    await conPaciente([lead('l1', 'CONTACTADO'), lead('l0', 'CONVERTIDO')]);
    await enviar();
    expect(crear).toHaveBeenCalledWith(expect.objectContaining({ clienteId: 'c1', leadId: 'l1' }));
  });

  it('con dos leads abiertos no inventa el origen', async () => {
    await conPaciente([lead('l1', 'NUEVO'), lead('l2', 'CONTACTADO')]);
    await enviar();
    expect(crear.mock.calls[0]![0].leadId).toBeUndefined();
  });

  it('el lead de contexto manda sobre la preselección', async () => {
    await conPaciente([lead('l1', 'NUEVO')], { leadIdContexto: 'l9' });
    await enviar();
    expect(crear.mock.calls[0]![0].leadId).toBe('l9');
  });

  it('«4.500» se registra como cuatro mil quinientos, con clave de intención', async () => {
    await conPaciente([]);
    await enviar();
    const dto = crear.mock.calls[0]![0];
    expect(dto.monto).toBe(4500);
    expect(dto.clientRequestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('un segundo envío mientras el primero viaja no registra otra venta', async () => {
    await conPaciente([]);
    let terminar!: () => void;
    crear.mockImplementationOnce(() => new Promise(r => (terminar = () => r({ id: 'v1' }))));
    form['producto'].set('Consulta');
    form['monto'].set('100');
    const primero = form['guardar'](new Event('submit'));
    await form['guardar'](new Event('submit'));
    terminar();
    await primero;
    expect(crear).toHaveBeenCalledTimes(1);
  });

  describe('buscador de paciente', () => {
    beforeEach(async () => {
      fixture.detectChanges();
      await asentar();
    });

    async function buscar(termino: string): Promise<boolean> {
      form['busqueda'].set(termino);
      await asentar();
      const peticiones = http.match(r => r.url.includes('/clientes'));
      if (peticiones.length === 0) return false;
      peticiones[peticiones.length - 1]!.flush(pagina([CLIENTE]));
      await asentar();
      return true;
    }

    it('desenvuelve `datos`: la respuesta paginada NO es un array', async () => {
      expect(await buscar('12345678')).toBe(true);
      expect(form['resultados'].value().datos[0]!.ci).toBe('12345678');
    });

    it('el término viaja como `busqueda`, que es lo que el DTO acepta', async () => {
      form['busqueda'].set('Paciente');
      await asentar();
      const peticiones = http.match(r => r.url.includes('/clientes'));
      expect(peticiones[peticiones.length - 1]!.request.urlWithParams).toContain('busqueda=Paciente');
    });

    it('con menos de 2 caracteres no consulta', async () => {
      form['busqueda'].set('1');
      await asentar();
      expect(http.match(r => r.url.includes('/clientes'))).toHaveLength(0);
    });
  });
});
