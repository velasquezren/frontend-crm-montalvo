/** Explicaciones operativas a partir del código de Meta, sin respuestas crudas. */
export function explicacionErrorWhatsapp(codigo?: number | null): string {
  switch (codigo) {
    case 130497:
      return 'Meta restringe los envíos al país de este número. Contacta al administrador; reenviar no elimina la restricción.';
    case 131042:
      return 'Meta reporta un problema de facturación. El administrador debe revisar el método de pago de esta línea.';
    case 131047:
      return 'La ventana de 24 horas está cerrada. Usa una plantilla aprobada o espera un nuevo mensaje del paciente.';
    case 131026:
      return 'WhatsApp no pudo entregar a este destinatario. Confirma el número y coordina por otro medio si es necesario.';
    case 190:
    case 10:
    case 200:
      return 'La credencial de esta línea necesita revisión. Contacta al administrador.';
    case 368:
    case 131031:
      return 'Meta restringió esta cuenta. El administrador debe revisar su estado en WhatsApp Manager.';
    case 132001:
    case 132015:
    case 132016:
      return 'La plantilla no está disponible para enviar. Actualiza las plantillas y elige una aprobada.';
    case 130429:
    case 131056:
      return 'WhatsApp está limitando la frecuencia de envío. Espera antes de volver a enviar.';
    default:
      return 'WhatsApp rechazó el envío. Revisa la conexión de la línea y consulta al administrador si persiste.';
  }
}
