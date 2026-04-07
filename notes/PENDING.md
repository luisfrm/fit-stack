# Próximas Tareas de Facturación e Internacionalización

Lista de pendientes para preparar el sistema para facturación formal (Venezuela) y escalabilidad internacional (Colombia, etc.).

## 1. Preparación de Base de Datos (Estructura de Localización)
- [ ] **Tabla `organization`**: Añadir campos legales:
  - `country_code` (ISO 3166-1 alpha-2, ej: 'VE').
  - `tax_id` (Campo genérico para RIF/NIT/RFC).
  - `legal_name` (Nombre jurídico de la empresa).
  - `fiscal_address` (Dirección fiscal completa).
  - `fiscal_config` (JSONB para resoluciones de la DIAN o números de control SENIAT).
- [ ] **Tabla `payment`**: Refactorizar para desglose fiscal:
  - `subtotal` (Monto neto).
  - `tax_total` (Suma de impuestos).
  - `tax_details` (JSONB con desglose: IVA 16%, IGTF 3%, etc.).
  - `exchange_rate` (Tasa de cambio aplicada al momento del pago).
- [ ] **Tabla `gym_member`**: Añadir `fiscal_address` opcional.

## 2. Ajustes de UI y Experiencia de Usuario
- [ ] **Adaptación de Labels**: Cambiar etiquetas como "Cédula/RIF" dinámicamente según el `country_code` de la organización (ej: NIT para Colombia).
- [ ] **Disclaimer Legal**: Añadir nota en pie de página de recibos/correos: *"Este documento no es factura fiscal. Exija su factura legal en el establecimiento"*.

## 3. Integraciones de Facturación (Fase 2)
- [ ] **Filtro de Adaptadores**: Crear interfaz para conectarse a PAC/PAD en Venezuela o Proveedores Tecnológicos en Colombia.
- [ ] **Gestión de Impuestos Dinámicos**: Implementar lógica que calcule el IGTF (3%) automáticamente para pagos en Divisas en organizaciones de Venezuela.

---
## 4. Control de Acceso Biométrico (Fase 2)
- [ ] **Optimización del Bridge (Python)**:
  - Refactorizar el código para mejorar la estabilidad de los hilos de fondo.
  - Implementar reconexión automática tras fallos de internet o API.
  - Añadir sistema de logs locales (SQLite) para asegurar que no se pierdan datos si el PC se apaga o pierde conexión.
  - Mejorar la gestión de errores específicos de la librería `requests` y `flet`.
- [ ] **Esquema de Base de Datos (Hardware)**:
  - Evaluar la creación de una tabla `access_control_device` para gestionar múltiples torniquetes/cámaras por organización.
  - Añadir campo `device_status` (heartbeat) para monitorear si el Bridge está online desde el CMS.
  - Considerar una tabla `access_rule` para lógica de horarios permitidos por fuera de la suscripción.

---
> [!NOTE]
> Estos cambios permiten que el sistema sea un software de gestión segura sin "pisar la raya" fiscal, pero dejando el camino 100% libre para la facturación electrónica formal en el futuro.
