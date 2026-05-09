## ADDED Requirements

### Requirement: Generación de 9 ads por hero SKU
El Creative Engine SHALL generar 9 ads por cada hero SKU: 3 imágenes distintas × 3 variantes de copy por imagen.

#### Scenario: SKU con imagen original
- **WHEN** el engine recibe un hero SKU con `primary_image_url` válida
- **THEN** genera 3 prompts de imagen (lifestyle, contexto, comparativa), corre image-to-image en Replicate Flux Kontext para cada uno, y para cada imagen genera 3 copys (PAS, AIDA, curiosity hook) — total 9 registros en `creatives` con `status = 'ready'`.

#### Scenario: SKU sin imagen original
- **WHEN** el SKU no tiene `primary_image_url`
- **THEN** el engine skipea la generación de imagen, genera solo los 3 copys con un placeholder visual, marca los registros con `variant_label` indicando "copy-only", y emite un warning.

### Requirement: Generación de imagen abstraída detrás de un wrapper
El Creative Engine SHALL exponer un wrapper `generateImage({ productImageUrl, prompt })` que es el único punto de la base de código que llama al modelo de imagen. La elección del modelo (mock, NVIDIA gratis, Replicate) vive detrás de este wrapper y se controla por feature flag.

#### Scenario: Modo mock (default actual)
- **WHEN** `MOCK_IMAGE_GEN=true` (default del MVP)
- **THEN** el wrapper devuelve una URL placeholder de `lib/mocks/images.ts` (sin llamar a ningún modelo externo) con `prompt_used` registrado para auditoría.

#### Scenario: Modo real
- **WHEN** `MOCK_IMAGE_GEN=false`
- **THEN** el wrapper invoca el modelo activo (NVIDIA gratis cuando esté integrado, Replicate Flux Kontext como fallback).

#### Scenario: Falla del modelo real
- **WHEN** la llamada al modelo activo falla o supera timeout
- **THEN** el engine reintenta una vez; si falla de nuevo marca el creative como `status = 'failed'` con el error y continúa con el siguiente prompt sin abortar el batch.

### Requirement: Fidelidad del producto cuando hay imagen real
Cuando el modo real está activo, el Creative Engine SHALL preferir image-to-image sobre text-to-image para mantener fidelidad del producto.

#### Scenario: Imagen original es packshot
- **WHEN** el SKU tiene `primary_image_url` y el modo real está activo
- **THEN** las 3 variantes generadas usan image-to-image y mantienen el producto reconocible, cambiando solo el contexto/escena.

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

### Requirement: Default de demo es mock
El Creative Engine SHALL respetar `MOCK_IMAGE_GEN=true` como **default del MVP** y solo desactivarlo cuando el modelo de imagen real (NVIDIA gratis) esté integrado y validado.

#### Scenario: Default del repo
- **WHEN** se clona el repo y se copia `.env.local.example` sin modificar
- **THEN** `MOCK_IMAGE_GEN=true` y la pipeline corre end-to-end sin requerir crédito ni API key de imagen.
