---
name: crm-ui-kit
description: Guía y biblioteca de componentes atómicos, moléculas y patrones UI/UX del CRM Montalvo. Usar para construir vistas elegantes, ultrarrápidas, sin emojis y manteniendo fidelidad absoluta al diseño médico-comercial.
---

# Skill: CRM Montalvo UI Kit & Atomic Design System

Este skill define los estándares inmutables, la jerarquía de componentes atómicos y las mejores prácticas de UI/UX para el desarrollo en el CRM Montalvo.

---

## 🎨 Paleta de Colores & Tokens CSS

Usar siempre las variables CSS nativas y clases de Tailwind preconfiguradas:

- **Primario (Verde Institucional):** `var(--color-primary)` / `text-primary`, `bg-primary`, `border-primary` (`#006156`)
- **Secundario (Turquesa Accent):** `var(--color-secondary)` / `text-secondary`, `bg-secondary` (`#39ADA3`)
- **Texto Principal:** `var(--color-text-dark)` / `text-text-dark` (`#1F2937`)
- **Texto Atenuado:** `var(--color-text-muted)` / `text-text-muted` (`#6B7280`)
- **Fondo de Trabajo:** `var(--color-bg-workspace)` / `bg-bg-workspace` (`#F8FAFC`)
- **Fondo Blanco:** `white` / `bg-white` (`#FFFFFF`)
- **Crítico / Alerta:** `var(--color-critical)` / `text-critical`, `bg-critical` (`#EF4444`)

---

## 🚫 Reglas Inmutables de Diseño

1. **Cero Emojis:** Prohibido el uso de emojis en etiquetas, botones, títulos o modales. Utilizar siempre el componente vectorial `<app-icon name="...">`.
2. **Iconografía Cerrada (`<app-icon>`):** Nunca insertar SVGs sueltos en las plantillas HTML. Todos los iconos deben provenir del catálogo atómico de `IconComponent`.
3. **Animaciones Fluidas (Spring 2026):** Usar `transition-all duration-200` y curvas spring para hover y aperturas de modales (`animate-modal-pop`).
4. **Carga Diferida sin CLS:** Envolver gráficos pesados bajo el pliegue con `@defer (on viewport)` y colocar esqueletos `<app-loading-skeleton>` de altura exacta en la sección `@placeholder`.
5. **Formato Tabular de Números:** Aplicar `font-variant-numeric: tabular-nums` o `font-mono` para montos, teléfonos, fechas y números en tablas.

---

## 🧩 Biblioteca de Componentes Atómicos & Moléculas

### 1. Botones (`<app-button>`)
```html
<app-button variant="primary" icon="user-plus" [loading]="subiendo()" (clicked)="onGuardar()">
  Guardar Registro
</app-button>

<app-button variant="ghost" (clicked)="cerrar()">
  Cancelar
</app-button>
```

### 2. Insignias / Badges (`<app-badge>`)
```html
<app-badge variant="success" icon="check-circle">
  Calculado
</app-badge>
```

### 3. Iconos Vectoriales (`<app-icon>`)
```html
<app-icon name="message-circle" [size]="16" class="text-primary" />
```

### 4. Entradas de Texto (`<app-input>`)
```html
<app-input label="Nombre Completo *" placeholder="Ej. Juan Pérez" [(value)]="editNombre" />
```

### 5. Chips de Filtro (`<app-filter-chip>`)
```html
<app-filter-chip [active]="filtro() === 'GOLD'" (clicked)="cambiarFiltro('GOLD')">
  Gold (VIP)
</app-filter-chip>
```

### 6. Encabezado de Página (`<app-page-header>`)
```html
<app-page-header title="Clientes y Pacientes" description="Gestión integral de contactos.">
  <app-button icon="plus" (clicked)="abrirCreacion()">Nuevo</app-button>
</app-page-header>
```

### 7. Tablas de Datos (`<app-table>`)
```html
<app-table [dense]="true" [maxHeight]="'calc(100dvh - 220px)'">
  <thead>
    <tr>
      <th class="text-left">Nombre</th>
      <th class="text-right">Monto</th>
    </tr>
  </thead>
  <tbody>
    @for (item of datos; track item.id) {
      <tr>
        <td class="text-left">{{ item.nombre }}</td>
        <td class="text-right font-mono">{{ item.monto | moneda }}</td>
      </tr>
    }
  </tbody>
</app-table>
```

---

## ⚡ Patrón de Rendimiento & Estado Síncrono

- Al abrir modales o paneles laterales, derivar los datos **de forma síncrona en memoria** usando `computed()` o señales basadas en el objeto seleccionado.
- Evitar disparar peticiones HTTP innecesarias que muestren spinners o bloqueen la pantalla al abrir un modal.
