## ADDED Requirements

### Requirement: Generación de 9 ads por hero SKU
El Creative Engine SHALL generar 9 ads por cada hero SKU: 3 imágenes distintas × 3 variantes de copy por imagen.

#### Scenario: SKU con imagen original
- **WHEN** el engine recibe un hero SKU con `primary_image_url` válida
- **THEN** genera 3 prompts de imagen (lifestyle, contexto, comparativa), corre image-to-image en Replicate Flux Kontext para cada uno, y para cada imagen genera 3 copys (PAS, AIDA, curiosity hook) — total 9 registros en `creatives` con `status = 'ready'`.

#### Scenario: SKU sin imagen original
- **WHEN** el SKU no tiene `primary_image_url`
- **THEN** el engine skipea la generación de imagen, genera solo los 3 copys con un placeholder visual, marca los registros con `variant_label` indicando "copy-only", y emite un warning.

### Requirement: Image-to-image fiel al producto
El Creative Engine SHALL usar image-to-image (no text-to-image) para mantener fidelidad del producto en todas las variantes.

#### Scenario: Imagen original es producto en fondo blanco
- **WHEN** la imagen de input es un packshot
- **THEN** las 3 variantes generadas mantienen el producto reconocible y solo cambian el contexto/escena.

#### Scenario: Replicate retorna error o timeout
- **WHEN** la llamada a Replicate falla
- **THEN** el engine reintenta una vez, si falla de nuevo marca el creative como `status = 'failed'` con el error, y continúa con el siguiente prompt sin abortar el batch completo.

### Requirement: Copy alineado a brand brief y SKU
El Creative Engine SHALL generar copy con GPT-4o-mini usando el brand brief como contexto, respetando `tone_of_voice` y `do_not_say`.

#### Scenario: Brief con palabras prohibidas
- **WHEN** el brief incluye `do_not_say: ['revolutionary', 'game-changer']`
- **THEN** ningún copy generado contiene esas palabras o cognados obvios.

#### Scenario: Tres frameworks por copy
- **WHEN** se generan los 3 copys para una imagen
- **THEN** cada uno sigue uno de tres frameworks: PAS (problem-agitate-solution), AIDA (attention-interest-desire-action), curiosity hook; el `variant_label` lo identifica.

### Requirement: Streaming incremental de outputs
El Creative Engine SHALL emitir un evento `artifact.created` al bus por cada imagen y cada copy generado, no en batch al final.

#### Scenario: Frontend conectado durante ejecución
- **WHEN** el engine empieza a generar para un hero SKU
- **THEN** el frontend recibe el primer `artifact.created` apenas el primer ad esté listo (~30-90s) y va llenando la galería incrementalmente.

### Requirement: Persistencia de creatives
El sistema SHALL persistir cada output en la tabla `creatives` con `project_id, product_id, type, asset_url, copy_text, prompt_used, variant_label, status, created_at`.

#### Scenario: Imagen generada exitosamente
- **WHEN** Replicate devuelve una URL de imagen válida
- **THEN** se inserta una fila con `type = 'image'` o `type = 'pair'` (imagen+copy unidos) y `status = 'ready'`.

### Requirement: Modo mock para desarrollo y demo de fallback
El Creative Engine SHALL respetar una flag `MOCK_IMAGE_GEN` que, cuando está activa, devuelve placeholders pre-armados sin llamar a Replicate.

#### Scenario: Flag activa
- **WHEN** `MOCK_IMAGE_GEN=true`
- **THEN** las llamadas a Replicate se sustituyen por URLs de imágenes placeholder y `prompt_used` registra el prompt que se hubiera enviado.
