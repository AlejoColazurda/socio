# Socio · completa por vos

**El empleado administrativo por WhatsApp para PyMEs de LatAm.** El dueño de un comercio manda un audio, una foto o un texto
("che, llegaron 3 cajas de yerba y se llevó 2 fernet el de la esquina, anotale fiado") y Socio lo carga en su sistema:
stock, ventas, cuentas corrientes y precios. Cada acción se verifica en código antes de tocar datos, y lo sensible
espera el OK del dueño con un botón en WhatsApp.

Se conecta a cualquier ERP, CRM o SaaS a través de un conector. Incluye tres: un ERP demo, el
Maxikiosco 24/7 (Supabase) y un conector REST genérico.

## Cómo usa los modelos de Meta

| Paso | Modelo (Meta Model API) | Qué hace |
|---|---|---|
| Audio | **Muse Voice Transcribe** (`/v1/asr/transcribe`) | Transcribe las notas de voz en español rioplatense, sesgando el reconocimiento con las marcas del catálogo (`keywords`). |
| Plan | **Muse Spark** (Chat Completions + `json_schema`) | Convierte el mensaje en acciones estructuradas, citando literalmente el fragmento que las justifica. |
| Foto | **SAM 3.1** (`/v1/responses`) | Cuenta productos en una foto del depósito o la góndola para hacer conteos de stock. |
| Auditoría | **Muse Spark** (llamado independiente) | Relee el mensaje y cada acción ya resuelta. Si no coincide, la acción pasa a requerir aprobación. |

## Por qué se puede confiar en lo que carga

El modelo **propone** y el código **decide**:

1. **Candidatos cerrados.** El planificador solo puede referenciar IDs de productos que el código le pasó; cualquier otro se rechaza.
2. **Evidencia literal.** Cada acción trae el fragmento del mensaje que la respalda, y se comprueba que exista en el mensaje.
3. **Reglas del negocio.** Stock que no puede quedar negativo, cajas convertidas a unidades con el dato del catálogo, montos que cierran, saltos de precio fuera de lo normal, clientes inexistentes, acciones que el sistema conectado no soporta.
4. **Auditor independiente.** Un segundo llamado al modelo, sin ver el plan, confirma cada acción.
5. **Política de riesgo.** Lo que suma stock o es una venta chica en efectivo se ejecuta solo; fiado, pagos, precios, bajas de stock y conteos piden OK. Cualquier chequeo fallido bloquea.
6. **Re-verificación al confirmar.** Si el stock cambió entre la propuesta y el OK, se vuelve a chequear antes de ejecutar.
7. **Auditoría completa.** Cada mensaje, acción, chequeo, decisión y resultado queda registrado en el estado propio de Socio, nunca en la base del cliente.

## Arquitectura

```
WhatsApp Cloud API ─┐                     ┌─ Muse Voice Transcribe (audio)
Panel web (simul.) ─┴→ pipeline ──────────┼─ SAM 3.1 (foto)
                         │                └─ Muse Spark (plan + auditor)
                         ├→ verificación en código → política de riesgo
                         ├→ aprobación humana (botones de WhatsApp / panel)
                         └→ Connector ── demo | mk247 (Supabase) | REST (cualquier ERP/CRM/SaaS)
```

- `lib/agent/` planificador, verificación, auditor y pipeline
- `lib/meta/` clientes de Meta Model API (Spark, Voice Transcribe, SAM 3.1 con su parser)
- `lib/connectors/` interfaz `Connector` y adaptadores
- `lib/channels/whatsapp.ts` webhook, firma, descarga de medios, botones de aprobación
- `app/` panel con simulador de chat, feed de "qué hizo Socio y por qué" y el sistema en vivo

## Correrlo

```bash
npm install
cp .env.example .env.local   # completar MODEL_API_KEY
npm run dev                  # http://localhost:3000
```

- Sin clave: `SOCIO_MOCK=1` usa respuestas simuladas para todo el circuito.
- Con clave: abrí `/api/health` para confirmar que los IDs de modelo configurados existen en tu cuenta.
- Tests: `npm test`.

### WhatsApp

1. En developers.facebook.com, crear una app con el producto WhatsApp y usar el número de prueba.
2. Webhook: `https://TU-DOMINIO/api/whatsapp`, token de verificación = `WHATSAPP_VERIFY_TOKEN`, suscribir `messages`.
3. Completar `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET` y `SOCIO_OWNER_NUMBERS`.

### Conectar tu sistema

- `SOCIO_CONNECTOR=mk247`: lee `mk_products` del Maxikiosco 24/7. Arranca en **solo lectura**; las escrituras se simulan salvo `MK247_ALLOW_WRITES=1`.
- `SOCIO_CONNECTOR=rest`: tu sistema expone `GET /socio/capabilities`, `GET /socio/products`, `GET /socio/customers` y `POST /socio/actions` (ver `lib/connectors/rest.ts`).

## Estado

- Circuito completo probado en modo simulado (tests + panel).
- Pendiente de validar con clave real: formato de `languageBias`/`keywords` en Voice Transcribe (hay reintento sin ellos si el servidor los rechaza) y si SAM 3.1 acepta la imagen como data URL.
- El estado propio usa un archivo JSON (`.data/`). Para producción en Vercel hace falta una base persistente.
