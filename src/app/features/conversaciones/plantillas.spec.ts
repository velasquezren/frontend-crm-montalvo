import { describe, expect, it } from 'vitest';

import { PlantillaResumen } from './conversacion.model';
import { etiquetaVariable, faltaParaEnviar, renderizarPlantilla } from './plantillas';

const plantilla = (extra: Partial<PlantillaResumen> = {}): PlantillaResumen => ({
  nombre: 'seguimiento',
  idioma: 'es',
  categoria: 'MARKETING',
  cuerpo: 'Hola {{1}}, tu cita es el {{2}}.',
  variables: 2,
  nombresVariables: ['1', '2'],
  formato: 'POSITIONAL',
  pie: 'Clínica Montalvo',
  botones: [],
  enviable: true,
  motivoNoEnviable: null,
  ...extra,
});

describe('plantillas de WhatsApp en el chat', () => {
  it('la vista previa es lo que lee el paciente, y lo que falta se ve', () => {
    expect(renderizarPlantilla(plantilla(), ['Ana', ''])).toBe('Hola Ana, tu cita es el [Dato 2].\n\nClínica Montalvo');
    expect(renderizarPlantilla(plantilla(), ['Ana', 'lunes'])).toBe('Hola Ana, tu cita es el lunes.\n\nClínica Montalvo');
  });

  it('las variables con nombre se muestran legibles', () => {
    const conNombre = plantilla({ cuerpo: 'Hola {{nombre_paciente}}', nombresVariables: ['nombre_paciente'], formato: 'NAMED', pie: null });
    expect(etiquetaVariable(conNombre, 0)).toBe('Nombre paciente');
    expect(renderizarPlantilla(conNombre, ['Eva'])).toBe('Hola Eva');
  });

  it('dice qué falta antes de enviar, igual que el servidor', () => {
    expect(faltaParaEnviar(plantilla(), ['Ana', ' '])).toBe('Completa «Dato 2».');
    expect(faltaParaEnviar(plantilla(), ['Ana', 'lunes\n10:00'])).toContain('saltos de línea');
    expect(faltaParaEnviar(plantilla(), ['Ana', 'lunes'])).toBeNull();
    expect(faltaParaEnviar(plantilla({ enviable: false, motivoNoEnviable: 'Lleva imagen' }), [])).toBe('Lleva imagen');
  });
});
