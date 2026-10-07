# Recepción y Ventas — cambios locales del 6 de octubre de 2026

En **Líneas WhatsApp**, Atención conserva configuración y menú opcional de
servicio. **Cobro** aparece únicamente en líneas comerciales. El editor de
Atención no permite agregar ni restaurar promociones con «Deshacer».

Un menú incompatible que ya estuviera guardado muestra los errores del servidor.
No se elimina automáticamente ni se afirma que está funcionando. Guardar con los
envíos desactivados informa que quedó preparado, pero que todavía no se envía.

En el chat, los roles operativos pueden consultar el estado histórico de un pago;
confirmar, pedir otro comprobante y anular quedan para agentes y administradores
con acceso a la conversación. El servidor aplica las mismas restricciones.

Se conservan atención humana, historial, tiempo real y los formularios de solicitud
de cita ya autorizados. Ningún formulario confirma disponibilidad ni registra una
cita en la agenda. No se activó un menú o Flow nuevo en un número real.

La interfaz reutiliza los átomos y animaciones existentes. A 390 px el cajón deja
350 px útiles: los campos se apilan, los avisos ajustan líneas y los controles
mantienen sus etiquetas y foco. En escritorio el editor comparte espacio con la
vista previa; los campos también se apilan para evitar columnas de unos 165 px.
Validación mediante código y pruebas de componentes, sin navegador, según las
instrucciones del repositorio.

Cambios sin nuevas dependencias ni modificación del diseño global. Se requiere
despliegue autorizado para que esta separación se aplique en producción.
