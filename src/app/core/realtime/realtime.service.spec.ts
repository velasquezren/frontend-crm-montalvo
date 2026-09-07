import '@angular/compiler';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { RealtimeService } from './realtime.service';

const fabrica = vi.hoisted(() => ({ io: vi.fn() }));
vi.mock('socket.io-client', () => ({ io: fabrica.io }));
@Component({ template: '', changeDetection: ChangeDetectionStrategy.OnPush })
class Consumidor {
  readonly realtime = inject(RealtimeService);
  constructor() { this.realtime.conectar(inject(DestroyRef)); }
}
const user = signal<{ id: string } | null>({ id: 'A' });
const generacion = signal(0);
let token: string;
const auth = { user, generacionSesion: generacion, get token() { return token; }, refrescarToken: vi.fn<() => Promise<string | null>>(), logout: vi.fn() };
function socketFalso() {
  const eventos = new Map<string, (...args: unknown[]) => void>();
  return {
    on: vi.fn((nombre: string, callback: (...args: unknown[]) => void) => { eventos.set(nombre, callback); }),
    connect: vi.fn(), disconnect: vi.fn(), removeAllListeners: vi.fn(() => eventos.clear()),
    recibir: (nombre: string, ...args: unknown[]) => eventos.get(nombre)?.(...args),
  };
}
let socket: ReturnType<typeof socketFalso>;
beforeEach(() => {
  token = 'token-A'; user.set({ id: 'A' }); generacion.set(0); auth.logout.mockReset();
  auth.refrescarToken.mockReset().mockImplementation(async () => { token = 'token-renovado'; return token; });
  socket = socketFalso(); fabrica.io.mockReset().mockReturnValue(socket);
  TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: auth }, { provide: Router, useValue: { navigate: vi.fn() } }] });
});
afterEach(() => { TestBed.resetTestingModule(); vi.useRealTimers(); });

describe('F05 · ciclo de credenciales del socket', () => {
  it('cada handshake consulta el token actual', async () => {
    const f = TestBed.createComponent(Consumidor); await f.whenStable();
    const opciones = fabrica.io.mock.calls[0][1] as { auth: (cb: (p: { token: string }) => void) => void };
    expect(typeof opciones.auth).toBe('function');
    token = 'token-renovado'; const recibir = vi.fn(); opciones.auth(recibir);
    expect(recibir).toHaveBeenCalledWith({ token: 'token-renovado' });
  });
  it.each(['connect_error', 'disconnect'])('%s de autenticación renueva y reconecta', async evento => {
    const f = TestBed.createComponent(Consumidor); await f.whenStable(); socket.connect.mockClear();
    socket.recibir(evento, evento === 'disconnect' ? 'io server disconnect' : { data: { status: 401 } });
    await Promise.resolve(); await Promise.resolve();
    expect(auth.refrescarToken).toHaveBeenCalledTimes(1); expect(socket.connect).toHaveBeenCalledTimes(1);
    expect(auth.logout).not.toHaveBeenCalled();
  });
  it('un fallo transitorio de refresh programa reconexión y conserva la sesión', async () => {
    auth.refrescarToken.mockRejectedValue({ status: 503 });
    const f = TestBed.createComponent(Consumidor); await f.whenStable(); socket.connect.mockClear();
    vi.useFakeTimers();
    socket.recibir('connect_error', { data: { status: 401 } });
    await Promise.resolve(); await Promise.resolve(); await vi.advanceTimersByTimeAsync(1000);
    expect(socket.connect).toHaveBeenCalledTimes(1); expect(auth.logout).not.toHaveBeenCalled();
  });
  it('logout desconecta aunque el consumidor siga montado', async () => {
    const f = TestBed.createComponent(Consumidor); await f.whenStable();
    user.set(null); generacion.update(n => n + 1); await f.whenStable();
    expect(socket.disconnect).toHaveBeenCalled(); expect(f.componentInstance.realtime.actividad()).toBeNull();
  });
  it('destruir el último consumidor impide reconectar después de un refresh pendiente', async () => {
    let resolver!: (t: string) => void;
    auth.refrescarToken.mockReturnValue(new Promise(resolve => { resolver = resolve; }));
    const f = TestBed.createComponent(Consumidor); await f.whenStable(); socket.connect.mockClear();
    socket.recibir('connect_error', { data: { status: 401 } }); f.destroy();
    resolver('token-renovado'); await Promise.resolve(); await Promise.resolve();
    expect(socket.connect).not.toHaveBeenCalled();
  });
  it('dos consumidores comparten socket hasta destruir el último', async () => {
    const a = TestBed.createComponent(Consumidor); const b = TestBed.createComponent(Consumidor); await a.whenStable();
    expect(fabrica.io).toHaveBeenCalledTimes(1); a.destroy(); expect(socket.disconnect).not.toHaveBeenCalled();
    b.destroy(); expect(socket.disconnect).toHaveBeenCalledTimes(1);
  });
  it('si el socket rechaza también el token recién renovado, cierra una vez sin bucle', async () => {
    const f = TestBed.createComponent(Consumidor); await f.whenStable();
    socket.recibir('connect_error', { data: { status: 401 } });
    await Promise.resolve(); await Promise.resolve();
    socket.recibir('connect_error', { data: { status: 401 } });
    await Promise.resolve();
    expect(auth.refrescarToken).toHaveBeenCalledTimes(1); expect(auth.logout).toHaveBeenCalledTimes(1);
  });
  it('el refresh pendiente de A no cierra ni reconecta la sesión posterior de B', async () => {
    let resolver!: (t: null) => void;
    auth.refrescarToken.mockReturnValue(new Promise(resolve => { resolver = resolve; }));
    const f = TestBed.createComponent(Consumidor); await f.whenStable();
    socket.recibir('connect_error', { data: { status: 401 } });
    const nuevoSocket = socketFalso(); fabrica.io.mockReturnValue(nuevoSocket);
    token = 'token-B'; user.set({ id: 'B' }); generacion.update(n => n + 1); await f.whenStable();
    nuevoSocket.connect.mockClear(); resolver(null); await Promise.resolve(); await Promise.resolve();
    expect(auth.logout).not.toHaveBeenCalled(); expect(nuevoSocket.connect).not.toHaveBeenCalled();
  });
});
