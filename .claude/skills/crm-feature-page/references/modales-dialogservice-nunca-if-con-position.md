# Modales: `DialogService` (CDK Overlay), nunca `@if` con `position: fixed`

> Parte de la skill `crm-feature-page`: lee antes su [índice](../SKILL.md).

Los modales se proyectan a `document.body` con Angular CDK Overlay, no con un `@if` en la propia
plantilla — así el backdrop cubre el viewport completo sin pelear con `overflow`/`z-index` de
contenedores padres.

```ts
private readonly dialogService = inject(DialogService);
private readonly vcr = inject(ViewContainerRef);
private activeOverlayRef?: OverlayRef;

abrirEdicion(cliente: Cliente, template: TemplateRef<unknown>): void {
  this.clienteSeleccionado.set(cliente);
  this.activeOverlayRef?.dispose();               // por si había otro modal abierto
  this.activeOverlayRef = this.dialogService.openTemplate(template, this.vcr);
}

cerrarEdicion(): void {
  this.activeOverlayRef?.dispose();
  this.activeOverlayRef = undefined;
}
```

```html
<ng-template #modalEditar>
  <div class="pointer-events-auto ...">…contenido del modal, usando los mismos signals…</div>
</ng-template>
```

### Al abrir un modal, deriva los datos en memoria — no dispares otra petición

El registro que el usuario acaba de tocar **ya está en el listado que cargaste**. Resuelve el
contenido del modal con `computed()` sobre el ítem seleccionado en vez de pedir el detalle al
servidor: un spinner al abrir una ficha que ya tenías en pantalla se siente lento y roto.

Reserva la petición para lo que de verdad no tienes (el historial completo de un chat, por
ejemplo), y muéstralo *dentro* del modal ya abierto, no como bloqueo previo a abrirlo.

**No hace falta implementar `OnDestroy` para evitar fugas**: `DialogService.openTemplate()` ya
registra la limpieza en el `DestroyRef` del componente dueño del `ViewContainerRef` — si el usuario
navega a otra vista con el modal abierto sin cerrarlo, el overlay se destruye solo. Antes de esto,
dos páginas dejaban un fondo oscuro huérfano bloqueando clics en la siguiente vista; ahora es
imposible que un nuevo modal reintroduzca ese bug, sin importar si la página se acuerda de limpiar.

### Un panel que entra por la derecha es `<app-drawer>` + `abrirCajon()`

```ts
this.activeOverlayRef = this.dialogService.abrirCajon(template, this.vcr, {
  onClose: () => this.cerrarFicha(),   // limpia la señal; corre con Escape y con clic al fondo
});
```

```html
<ng-template #fichaTpl>
  @if (seleccionado(); as item) {
    <app-drawer ancho="md" [titulo]="item.nombre" icono="user" (cerrar)="cerrarFicha()">
      <div class="p-6 overflow-y-auto flex-1">…</div>
      <div class="… border-t border-border shrink-0">…acciones…</div>
    </app-drawer>
  }
</ng-template>
```

**`onClose` no es opcional en la práctica.** El overlay ya se destruye solo, pero la señal que
decide si el cajón *debe* existir es tuya: sin `onClose`, cerrar con Escape deja la señal puesta y
el cajón no vuelve a abrirse hasta cambiar de fila.

**El `@if` va FUERA de `<app-drawer>`, no dentro.** Los slots `[cabecera]`/`[subcabecera]` se
resuelven sobre los hijos directos del componente: metidos en un bloque de control de flujo no
proyectan y el contenido acaba en el hueco por defecto, sin error de compilación.

Escape y la trampa de foco ya no son cosa de la página: `DialogService` cierra con Escape **todo**
overlay que no pase `disableClose`, y `<app-drawer>` lleva `cdkTrapFocus`. Si ves un
`@HostListener('document:keydown.escape')` nuevo en una página, sobra.
