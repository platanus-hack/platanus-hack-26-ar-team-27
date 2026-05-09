## ADDED Requirements

### Requirement: Captura del brief por formulario
El sistema SHALL permitir al usuario escribir el brand brief directamente en un formulario de texto libre durante el onboarding.

#### Scenario: Submit con texto libre
- **WHEN** el usuario completa el campo de texto y envía el formulario
- **THEN** el sistema persiste un registro en `brand_briefs` con `source = 'form'` y `raw_text` igual al texto ingresado.

#### Scenario: Submit vacío
- **WHEN** el usuario envía el formulario sin escribir nada y sin subir archivo
- **THEN** el sistema bloquea el submit con un mensaje "Necesitamos contexto de tu marca para personalizar los outputs".

### Requirement: Captura del brief por upload
El sistema SHALL permitir al usuario subir un archivo TXT, MD o PDF como fuente del brand brief.

#### Scenario: Upload de TXT/MD válido
- **WHEN** el usuario sube un archivo `.txt` o `.md`
- **THEN** el sistema lee el contenido como utf-8 y persiste un registro en `brand_briefs` con `source = 'upload'` y `raw_text` igual al contenido.

#### Scenario: Upload de PDF
- **WHEN** el usuario sube un archivo `.pdf`
- **THEN** el sistema extrae el texto con `pdf-parse`, lo persiste en `raw_text`, y procede al parsing semántico.

#### Scenario: Upload de formato no soportado
- **WHEN** el usuario sube un `.docx`, `.rtf`, u otro formato
- **THEN** la UI rechaza el archivo antes del upload con "Formatos aceptados: .txt, .md, .pdf".

### Requirement: Parsing semántico del brief
El sistema SHALL usar un LLM (GPT-4o-mini) para extraer estructura del `raw_text` y persistir los campos `brand_name, tone_of_voice, target_description, values, do_not_say` en `brand_briefs`.

#### Scenario: Brief con todos los campos identificables
- **WHEN** el `raw_text` menciona explícitamente nombre de marca, tono, target y valores
- **THEN** el LLM extrae cada campo y persiste el registro completo.

#### Scenario: Brief con campos parciales
- **WHEN** el `raw_text` solo menciona algunos campos (ej. solo nombre y tono)
- **THEN** el sistema persiste los campos identificados y deja los faltantes en `null`, sin fallar.

#### Scenario: Brief vacío o irrelevante
- **WHEN** el `raw_text` no contiene información de marca utilizable
- **THEN** el sistema persiste `raw_text` y todos los campos estructurados en `null`, y emite un warning visible al usuario.

### Requirement: Brief disponible para todos los agentes
El sistema SHALL inyectar el brand brief estructurado en los prompts de Strategy Agent, Creative Engine, e Influencer Matching/DM Generator.

#### Scenario: Strategy Agent usa el brief
- **WHEN** se ejecuta Strategy Agent
- **THEN** el system prompt incluye `brand_name`, `tone_of_voice`, `target_description`, `values`, y `do_not_say` del brief activo del proyecto.

#### Scenario: Brief modificado a mitad de ejecución
- **WHEN** un usuario edita el brief mientras un agente está corriendo
- **THEN** los agentes en ejecución NO se reinician; el cambio se aplica en la próxima invocación.
