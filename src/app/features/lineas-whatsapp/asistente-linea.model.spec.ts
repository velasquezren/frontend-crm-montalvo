import { faltaEnElServidor, LIMITES_ASISTENTE, motivoParaNoGuardar } from './asistente-linea.model';

describe('asistente de la línea', () => {
  it('«Responder solo» exige el criterio de la clínica, como el backend', () => {
    expect(motivoParaNoGuardar({ modo: 'RESPONDER', criterioDerivacion: 'lo médico' })).not.toBeNull();
    expect(motivoParaNoGuardar({ modo: 'RESPONDER', criterioDerivacion: 'x'.repeat(LIMITES_ASISTENTE.criterioMinimo) })).toBeNull();
    expect(motivoParaNoGuardar({ modo: 'SUGERIR', criterioDerivacion: '' })).toBeNull();
  });

  it('dice qué falta en el servidor, en orden', () => {
    const listo = { encendido: true, proyecto: true, credenciales: 'ARCHIVO', ubicacion: 'global', modelo: 'm', modeloClasificador: 'c', listo: true } as const;
    expect(faltaEnElServidor(listo)).toBeNull();
    expect(faltaEnElServidor({ ...listo, encendido: false })).toContain('ASISTENTE_IA');
    expect(faltaEnElServidor({ ...listo, proyecto: false })).toContain('GOOGLE_CLOUD_PROJECT');
    expect(faltaEnElServidor({ ...listo, credenciales: 'ARCHIVO_INEXISTENTE' })).toContain('GOOGLE_APPLICATION_CREDENTIALS');
  });
});
