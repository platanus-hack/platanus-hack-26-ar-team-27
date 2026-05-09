## ADDED Requirements

### Requirement: Botón "Launch to Meta" en dashboard
El sistema SHALL ofrecer un botón "Launch to Meta" en el dashboard del proyecto, habilitado cuando hay al menos un creative `status = 'ready'`.

#### Scenario: Sin creatives listos
- **WHEN** no hay registros en `creatives` con `status = 'ready'` para el proyecto
- **THEN** el botón aparece deshabilitado con un tooltip "Generá creativos primero".

#### Scenario: Click con creatives listos
- **WHEN** el usuario hace click en el botón
- **THEN** se abre un modal con la animación de launch.

### Requirement: Animación realista de launch
El sistema SHALL mostrar una animación de launch en pasos discretos: "Creating campaign... Creating ad set... Uploading creatives... Live ✓" con timings progresivos (~3-5s por paso, total 10-15s).

#### Scenario: Flujo completo
- **WHEN** el modal se abre
- **THEN** los 4 pasos se muestran secuencialmente con check ✓ al completarse cada uno, sin saltear ninguno y sin acelerar más rápido que ~3s/paso.

#### Scenario: Cancelación mid-launch
- **WHEN** el usuario cierra el modal antes de que termine
- **THEN** la animación se detiene, no se persiste el campaign, y el botón queda re-habilitado.

### Requirement: Persistencia del campaign mock
El sistema SHALL persistir el resultado del mock launch en la tabla `campaigns` con `project_id, mock_meta_id, status, creative_ids, created_at`.

#### Scenario: Launch completado
- **WHEN** la animación termina exitosamente
- **THEN** se inserta una fila en `campaigns` con `mock_meta_id = 'mock_' + uuid`, `status = 'live'`, y `creative_ids` con los IDs de los creatives lanzados.

### Requirement: NO llamadas a Meta Marketing API
El sistema SHALL NO realizar ninguna llamada HTTP a `graph.facebook.com` ni endpoints de Meta Marketing API en el flujo de launch del MVP.

#### Scenario: Inspección de network
- **WHEN** se ejecuta el flujo de launch completo
- **THEN** no hay requests salientes a dominios de Meta.

### Requirement: Emisión de eventos al bus
El flujo de launch SHALL emitir eventos `agent.started`, `agent.thinking` (con el paso actual), y `agent.completed` para que el frontend pueda mostrar el progreso vía el agent event bus, igual que los demás agentes.

#### Scenario: Consistencia con otros agentes
- **WHEN** el launch corre
- **THEN** desde el punto de vista del bus se ve como un "agente" más, manteniendo la UX consistente.
