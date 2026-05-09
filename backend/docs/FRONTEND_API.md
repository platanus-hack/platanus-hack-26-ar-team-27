# Frontend ↔ Backend API

## Base URLs

- **Producción**: `https://platanus-hack-26-ar-team-27.onrender.com`
- **Desarrollo local**: `http://localhost:8000`

Health check público: `GET /health` → `{"status":"ok"}` (sin auth).

## Auth

Todos los endpoints excepto `/health` y `/webhooks/mailgun/*` requieren el header:

```
X-Api-Key: <BACKEND_API_KEY>
```

`BACKEND_API_KEY` se comparte fuera de banda (chat / 1Password).

CORS: el origin del frontend debe estar listado en la env var `CORS_ORIGINS` del
backend (CSV). Default ya incluye `http://localhost:3000`,
`http://localhost:5173` y `https://retail-growth-engine-one.vercel.app`.

---

## Flujo principal: input → diagnóstico → confirmación

### 1. Pedir un token de streaming

El backend acepta:

- `application/json` para requests sin archivos
- `multipart/form-data` para requests con adjuntos

Límites de adjuntos en v1:

- hasta `3` archivos
- formatos `PDF`, `MD`, `TXT`
- hasta `5 MB` por archivo

```http
POST /companies/analyze/stream-token
Content-Type: multipart/form-data
X-Api-Key: ...
```

Campos `multipart`:

- `raw_input` (string, obligatorio)
- `files` (repetido por cada archivo, opcional)

Ejemplo con `curl`:

```bash
curl -X POST "$API/companies/analyze/stream-token" \
  -H "X-Api-Key: $BACKEND_API_KEY" \
  -F 'raw_input=Helio Robotics is a B2B SaaS for predictive maintenance.' \
  -F 'files=@./pitch-deck.pdf' \
  -F 'files=@./icp-notes.md'
```

Si no enviás archivos, podés seguir usando JSON:

```http
POST /companies/analyze/stream-token
Content-Type: application/json
X-Api-Key: ...

{
  "raw_input": "<descripción de la empresa>",
  "files": []
}
```

Respuesta:

```json
{
  "token": "abc...XYZ",
  "ttl_seconds": 60,
  "stream_url": "/companies/analyze/stream?token=abc...XYZ"
}
```

El token es **single-use** y vive 60s. Si expira, pide otro.

### 2. Conectarse al stream

```js
const { stream_url } = await postAnalyzeStreamToken(rawInput);
const es = new EventSource(`${API_BASE}${stream_url}`);

es.addEventListener("start",  e => console.log(JSON.parse(e.data)));
es.addEventListener("step",   e => updateLoaderLabel(JSON.parse(e.data).message));
es.addEventListener("done",   e => {
  const { company } = JSON.parse(e.data);
  showConfirmEditor(company);   // company.confirmation_status === "pending_user_confirmation"
  es.close();
});
es.addEventListener("error",  e => {
  showError(JSON.parse(e.data).message);
  es.close();
});
```

> EventSource no soporta headers personalizados — por eso el flujo de dos pasos
> con token. NO uses `fetch` con `Accept: text/event-stream`: usá `EventSource`.

### 3. Eventos del stream

| event   | payload                                        | cuándo                          |
|---------|------------------------------------------------|---------------------------------|
| `start` | `{message, use_anthropic}`                     | Apenas conectás                 |
| `step`  | `{label, message}`                             | Cada vez que el agente avanza   |
| `done`  | `{company: CompanyOut}`                        | Diagnóstico completo, status pending_user_confirmation |
| `error` | `{message}`                                    | Falla. Cerrá el EventSource.    |

`label` posibles: `input`, `company`, `icp`, `domains`. Útil para resaltar
visualmente qué paso está corriendo.

### 4. Confirmación humana

El frontend muestra un editor con los campos del diagnóstico. Cuando el usuario
guarda:

```http
POST /companies/{company_id}/confirm
Content-Type: application/json
X-Api-Key: ...

{
  "company_name": "Helio Robotics",
  "icp_description": "Plant managers en LATAM, 50–500 empleados",
  "campaign_target_company_count": 50,
  "internal_company_size_range": "11-50",
  "suggested_domain_names": ["heliorobotics.com", "tryhelio.com"]
}
```

Todos los campos son opcionales; lo que no mandás conserva el valor del diagnóstico.

Respuesta: `CompanyOut` con `confirmation_status: "confirmed"`. A partir de aquí
los endpoints de domains / dns / warmup / campaigns dejan de devolver
`409 company_not_confirmed`.

---

## Esquemas relevantes

### `CompanyOut`

```ts
type CompanyOut = {
  id: string;
  name: string;
  business_context_summary: string | null;
  icp_description: string | null;
  internal_company_size_range:
    | "solo" | "2-10" | "11-50" | "51-200" | "201+" | "unknown";
  target_company_count: number;
  suggested_domain_names: string[] | null;
  confirmation_status:
    | "pending_user_confirmation" | "confirmed" | "rejected";
  agent_run_id: string | null;
};
```

---

## Otros endpoints (post-confirmación)

Todos requieren `X-Api-Key`. Lista breve, ver código fuente para detalles.

```
POST /companies/{id}/domains/plan
POST /companies/{id}/domains/purchase   { "execute": false }
GET  /companies/{id}/domains
POST /domains/{id}/dns/configure        { "execute": true }
POST /domains/{id}/dns/verify           { "execute": true }
POST /warmup/run            ?company_id=...   { "execute": false, "accelerated": true }
GET  /warmup/status/{domain_id}
POST /campaigns/{company_id}/research   { "csv_path": null, "limit": 5 }
POST /campaigns/{id}/drafts
POST /campaigns/{id}/approve            { "draft_ids": [], "approve_all": true }
POST /campaigns/{id}/send               { "execute": false }
GET  /campaigns/{id}
```

> Endpoints que disparan acciones reales (purchase, send, dns/configure):
> requieren `execute: true` y la `ALLOW_*` env var correspondiente prendida en
> el backend. Si alguna falta, el endpoint corre en dry-run y graba un AuditLog.

---

## Ejemplos rápidos (fetch)

```ts
const API = "https://platanus-hack-26-ar-team-27.onrender.com";
const KEY = import.meta.env.VITE_BACKEND_API_KEY;

async function startAnalysis(rawInput: string) {
  const res = await fetch(`${API}/companies/analyze/stream-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": KEY },
    body: JSON.stringify({ raw_input: rawInput, files: [] }),
  });
  if (!res.ok) throw new Error(`token ${res.status}`);
  return await res.json();   // {token, ttl_seconds, stream_url}
}

async function confirmCompany(id: string, fields: Partial<CompanyOut>) {
  const res = await fetch(`${API}/companies/${id}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": KEY },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`confirm ${res.status}`);
  return await res.json();
}
```

---

## Errores comunes

| HTTP | Significado                                         |
|------|-----------------------------------------------------|
| 401  | Falta o no matchea `X-Api-Key` (o token expirado)   |
| 404  | `company_id` / `domain_id` / `campaign_id` no existe |
| 409  | `code: "company_not_confirmed"` — confirmá primero  |
| 422  | Body inválido, archivo no soportado, demasiado grande o PDF sin texto extraíble |
| 500  | Bug. Tomá nota de `request_id` (ver headers).       |
