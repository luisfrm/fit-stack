# Próximas Tareas de Facturación e Internacionalización

Lista de pendientes para preparar el sistema para facturación fiscal formal multi-país, alineada con los requerimientos regulatorios locales de cada país.

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
- [ ] **Filtro de Adaptadores**: Crear interfaz genérica de adaptadores para integrarse con PAC/PAD, Proveedores Tecnológicos u otros sistemas fiscales locales según el `country_code` de la organización.
- [ ] **Gestión de Impuestos Dinámicos**: Implementar lógica que calcule impuestos locales dinámicamente (ej. IGTF 3%, IVA 16%, etc.) según el `country_code` de la organización y el tipo de pago.

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
## 5. Integridad de Base de Datos y CI/CD
- [ ] **Flujo de Migraciones Estricto**: Implementar regla de "Generate -> Review -> Migrate" para evitar discrepancias en entornos compartidos. Prohibir `db:push` en producción.
- [ ] **Script de Verificación (`db:check`)**: Implementar comando para validar estáticamente que el esquema coincide con el folder de migraciones.
- [ ] **GitHub Actions (Integridad)**: Configurar workflow para ejecutar `db:check` automáticamente en cada Pull Request.
- [ ] **GitHub Actions (Despliegue)**: Automatizar la ejecución de `db:migrate` al hacer merge a `master` para actualizar bases de datos de producción/dev sin intervención manual mediante GitHub Secrets.

---
> [!NOTE]
> Estos cambios permiten que el sistema sea un software de gestión segura sin "pisar la raya" fiscal, pero dejando el camino 100% libre para la facturación electrónica formal en el futuro.
