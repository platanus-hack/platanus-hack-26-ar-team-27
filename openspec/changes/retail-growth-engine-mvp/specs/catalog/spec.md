## ADDED Requirements

### Requirement: Subir catálogo CSV
El sistema SHALL permitir al usuario subir un archivo CSV con su catálogo de productos desde la pantalla de onboarding.

#### Scenario: Subida exitosa de CSV válido
- **WHEN** el usuario selecciona un CSV con columnas `sku, name, description, price, cost, stock, category, image_url`
- **THEN** el sistema parsea cada fila, persiste un registro en la tabla `products` asociado al `project_id` actual, y muestra un resumen con cantidad de SKUs cargados.

#### Scenario: CSV con columnas faltantes
- **WHEN** el usuario sube un CSV al que le faltan columnas opcionales (ej. `cost`, `stock`)
- **THEN** el sistema persiste los productos con esos campos en `null`, NO falla, y muestra un warning con la lista de columnas faltantes.

#### Scenario: CSV con columnas obligatorias faltantes
- **WHEN** el CSV no tiene `sku` o `name`
- **THEN** el sistema rechaza el archivo, muestra un error claro indicando qué columna falta, y no crea registros parciales.

### Requirement: Almacenamiento de productos
El sistema SHALL persistir cada producto del catálogo en la tabla `products` con los campos `sku, name, description, price, cost, stock, category, primary_image_url, project_id, created_at`.

#### Scenario: Persistencia de fila
- **WHEN** el parser procesa una fila válida del CSV
- **THEN** se inserta una fila en `products` con `project_id` igual al del proyecto activo y `created_at = now()`.

#### Scenario: SKU duplicado dentro del mismo proyecto
- **WHEN** el CSV contiene dos filas con el mismo `sku`
- **THEN** el sistema usa la última fila como fuente de verdad y registra el conflicto en logs.

### Requirement: Imágenes de producto referenciadas por URL
El sistema SHALL aceptar `image_url` como URL pública (https) y NO subir/copiar la imagen al storage propio en el MVP.

#### Scenario: URL accesible
- **WHEN** la fila trae `image_url` con una URL https válida
- **THEN** el sistema almacena la URL tal cual en `primary_image_url`.

#### Scenario: URL faltante
- **WHEN** la fila no trae `image_url`
- **THEN** el campo `primary_image_url` queda `null` y el producto se marca como "sin imagen" en la UI; los agentes de creative skipean este SKU para image-to-image.

### Requirement: UI de upload con feedback
El sistema SHALL ofrecer una UI con drag-and-drop o file picker, validación cliente (extensión `.csv`, tamaño máx. 5MB), y feedback de progreso.

#### Scenario: Archivo no-CSV
- **WHEN** el usuario intenta subir un archivo `.xlsx` o `.txt`
- **THEN** la UI bloquea el upload antes de mandarlo al backend y muestra "Solo archivos .csv".

#### Scenario: Archivo > 5MB
- **WHEN** el archivo excede 5MB
- **THEN** la UI rechaza el upload y sugiere reducir el catálogo.
