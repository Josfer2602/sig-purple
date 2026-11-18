# Estándares de Diseño UX/UI para ERP & CRM SIG Purple

Este documento define las reglas de diseño y consistencia que deben respetarse en todo el código frontend (React 19, CSS, Lucide icons) de la plataforma SIG Purple.

## 1. Ergonomía en Tablas de Datos
- Las columnas numéricas (montos en Soles, Dólares, cantidades, porcentajes) **siempre** deben alinearse a la derecha (`text-align: right; font-variant-numeric: tabular-nums`).
- Las acciones por fila deben agruparse en una columna con ancho fijo y `white-space: nowrap`, usando botones compactos con padding de 4px y bordes redondeados (6px).
- En pantallas móviles (<768px), las tablas que superen las 4 columnas deben contar con un modo de tarjeta (`mobile-card-view`) o contenedor con scroll horizontal suave e indicador visual de desplazamiento (`overflow-indicator`).

## 2. Botones y Jerarquía de Acciones
- **Acción Primaria:** Fondo violeta de marca (`var(--accent-primary)`, `#7c3aed`), texto blanco, sombra sutil. Solo DEBE haber 1 botón primario por vista o modal.
- **Acción Secundaria:** Borde sutil, fondo blanco/translúcido, texto `var(--text-primary)`.
- **Acción de Peligro:** Texto o fondo rojo (`var(--danger)`, `#ef4444`). Siempre debe requerir confirmación modal o popover.
- **Acción de Excel / Exportación:** Botón verde corporativo (`#10b981` / `.btn-excel`) con icono `FileSpreadsheet`.

## 3. Dispositivos Móviles y Breakpoints
- Breakpoint principal: `@media (max-width: 768px)`.
- La barra de navegación inferior (`mobile-bottom-nav`) debe fijarse en la parte inferior respetando `env(safe-area-inset-bottom)`.
- El área de contenido (`.content-area`) en móvil debe tener un padding inferior de al menos `80px` para que los últimos elementos de la tabla o lista no queden ocultos detrás de la barra de navegación flotante.
- Los touch targets en móvil (botones, selects, checkboxes, iconos de acción) deben tener una dimensión táctil mínima de 44x44px o margen compensatorio.

## 4. Estados del Sistema
- Durante cualquier petición asíncrona, el botón disparador debe mostrar un estado deshabilitado (`disabled`) con spinner o texto alternativo ("Guardando...", "Cargando...").
- Cuando una lista o tabla no tenga resultados, debe mostrar un `empty state` ilustrado o con icono, mensaje explicativo y botón para crear o limpiar filtros.
