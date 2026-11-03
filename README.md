# Socio · completa por vos

> **El empleado administrativo por WhatsApp para cualquier pyme.** Le mandás un audio, una foto o un texto como se lo dirías a un empleado, y Socio lo carga en tu sistema: stock, ventas, pedidos, cuentas corrientes, cobros, gastos y precios. Verifica cada dato antes de tocar nada y te pide OK con un botón cuando algo es delicado.

Construido para el **Meta Global AI Developer Hackathon 2026**, track *Build for Your World*, sobre **Meta Model API** (Muse Spark, Muse Voice Transcribe y SAM 3.1).

---

## English summary (for judges)

**Problem.** Millions of small businesses in Latin America run on WhatsApp voice notes and a notebook. Owners do have software: an ERP, a spreadsheet, a POS, a Mercado Libre store. Keeping it updated is the job nobody has time for, so stock, credit accounts and orders drift from reality.

**Solution.** Socio is a WhatsApp-native back-office agent that plugs into any business system through a connector. The owner says *"llegaron 3 cajas de yerba y se llevó 2 fernet el de la esquina, anotale fiado"* and Socio:

1. transcribes it with **Muse Voice Transcribe**, biased toward the catalog's brand names;
2. turns it into structured actions with **Muse Spark** (JSON schema), each one quoting the literal words that justify it;
3. counts items in shelf photos with **SAM 3.1**;
4. **verifies every action in code** (closed product IDs, literal evidence, stock never negative, pack→unit conversion, totals, known customers, connector capabilities);
5. runs an **independent Muse Spark auditor** that re-reads the message against the resolved actions;
6. auto-executes low-risk actions and asks the owner for a **one-tap WhatsApp approval** on anything sensitive, then re-verifies against fresh state before executing.

**Any business.** Socio isn't tied to one trade. A business profile (corner store, wholesale distributor and hardware store ship as templates) tells the planner how that business talks and sets the approval policy. Connectors cover a demo ERP, a Supabase connector for the *Maxikiosco 24/7* e-commerce (read-only by default, pending verification against the production store) and a generic REST protocol any ERP, CRM or SaaS can implement in an afternoon.

**What makes it different.** Socio works for the owner and the team, not for the customer: it writes what happened in the business into the system of record (stock, sales, orders, credit accounts, expenses), checks every write against live data (catalog, stock, balances), counts stock from a shelf photo, and speaks the language of a Latin American store counter.

**Everything in this repository was built during the hackathon.**

---

## Qué problema resuelve

En LatAm, la pyme funciona por WhatsApp. El kiosquero anota el fiado en un cuaderno. El vendedor de la distribuidora manda los pedidos por audio desde la calle. La ferretería lleva la cuenta corriente del plomero de memoria. Muchos ya tienen un sistema, pero nadie tiene tiempo de cargarlo, así que el stock, los pedidos y las deudas se desfasan de la realidad.

Socio es el empleado que completa ese sistema por vos, en el mismo canal que ya usás.

## Qué hace distinto a Socio

- **Trabaja para el dueño y su equipo**, no para el cliente: el cajero, el encargado o el vendedor en la calle le cuentan qué pasó.
- **Escribe en el sistema donde vive la información**, ya sea tu ERP, POS, e-commerce o planilla, y no se queda en el chat.
- **Verifica contra datos vivos**: el catálogo real, el stock y las cuentas corrientes, más lo que el sistema conectado sabe hacer.
- **Usa las fotos para contar**: SAM 3.1 cuenta la mercadería en la góndola o el depósito y propone el conteo de stock.
- **Habla el idioma del mostrador**: fiado, bultos, cajones, "8 lucas", "para el jueves".
- **Se integra con cualquier sistema** a través de un conector, y ya funciona contra un e-commerce real en producción.

## Cómo funciona

```
 WhatsApp ─┐                       ┌─ Muse Voice Transcribe ── audio → texto
 Panel web ┴→  Socio  ─────────────┼─ SAM 3.1 ─────────────── foto → conteo
                │                  └─ Muse Spark ──────────── texto → acciones (JSON)
                ├→ verificación en código ──→ auditor independiente (Muse Spark)
                ├→ política de riesgo: automático | pedir OK | bloquear
                ├→ OK del dueño (botón de WhatsApp o panel) → re-verificación
                └→ Conector ── ERP demo | Supabase (Maxikiosco 24/7) | REST: cualquier ERP / CRM / SaaS
```

### Lo que entiende

| Le decís | Socio hace |
|---|---|
| "llegaron dos cajas de playadito" | Suma 20 unidades (2 cajas × 10, según el catálogo) |
| "vendí 2 fernet fiado a rubén" | Registra la venta, baja el stock y suma la deuda en la cuenta de Rubén (con tu OK) |
| "el almacén don pepe pide 5 bultos de coca para el jueves" | Arma el pedido PED-0001, reserva stock y lo carga a la cuenta del comercio (con tu OK) |
| "kiosco la esquina me transfirió 120 lucas" | Descuenta $120.000 de su cuenta corriente (con tu OK) |
| "pagué 38 lucas de luz" | Registra el gasto |
| "subile la coca grande a 4500" | Cambia el precio y avisa si el salto es inusual (con tu OK) |
| 📷 foto de la góndola + "contame las coca" | SAM 3.1 cuenta las botellas y propone el conteo de stock (con tu OK) |
| "¿cuántas oreo quedan?" | Responde al instante |

### Por qué se puede confiar en lo que carga

El modelo **propone** y el código **decide**:

1. **Catálogo cerrado.** El planificador solo puede usar IDs de artículos que el código le pasó. Si inventa uno, se rechaza.
2. **Evidencia literal.** Cada acción cita el fragmento exacto del mensaje que la justifica, y se comprueba que ese fragmento exista.
3. **Reglas del negocio.**
   - El stock nunca queda negativo.
   - Las cajas o bultos se pasan a unidades con el dato del catálogo.
   - Los totales cierran.
   - Los saltos de precio inusuales se marcan.
   - Si el cliente no existe, se avisa antes de crearle una cuenta.
   - Las acciones que el sistema conectado no soporta se bloquean.
4. **Auditor independiente.** Un segundo llamado a Muse Spark, sin ver el plan, relee el mensaje y cada acción resuelta. Si no coincide, la acción pasa a pedir OK.
5. **Política de riesgo por negocio.**
   - Se cargan solas las entradas de mercadería, las consultas y las ventas o gastos chicos.
   - Piden OK el fiado, los cobros, los pedidos, los precios, las bajas de stock y los conteos.
   - Cualquier control fallido bloquea la acción.
6. **Re-verificación al confirmar.** Si el stock cambió entre la propuesta y el OK, se vuelve a chequear. Un doble toque no ejecuta dos veces.
7. **Auditoría completa.** Mensajes, acciones, controles, decisiones y resultados quedan en el estado propio de Socio, nunca en la base del cliente.

## Para cualquier pyme

**Perfil del negocio** (`lib/business.ts`): nombre, rubro, cómo nombra a sus artículos y clientes, cómo trabaja y desde qué monto pide OK. Vienen tres plantillas, y en el panel demo se cambian en vivo:

| Plantilla | Ejemplo de uso |
|---|---|
| `kiosco` | Venta por unidad, compra por caja, fiado a vecinos |
| `distribuidora` | Pedidos por bulto de comercios, reparto por día, cuenta corriente, todo con OK |
| `ferreteria` | Venta por bolsa o rollo, cuenta corriente con constructoras y oficios |

Cualquier otro rubro se configura con `SOCIO_BUSINESS_NAME`, `SOCIO_BUSINESS_RUBRO`, `SOCIO_BUSINESS_NOTES` y `SOCIO_AUTO_LIMIT`, o sumando una plantilla.

**Conectores** (`lib/connectors/`), elegidos con `SOCIO_CONNECTOR`:

| Conector | Para qué |
|---|---|
| `demo` | ERP de prueba con la plantilla del rubro elegido |
| `mk247` | El e-commerce Maxikiosco 24/7 (Supabase, tabla `mk_products`). Arranca en **solo lectura**: las escrituras se simulan salvo `MK247_ALLOW_WRITES=1` |
| `rest` | **Protocolo Socio**: cualquier ERP, CRM o SaaS que exponga 4 endpoints. También sirve un flujo de n8n o Zapier frente a una planilla |

Protocolo REST (`Authorization: Bearer {REST_TOKEN}`):

```
GET  /socio/capabilities  → { "capabilities": ["sale.record", "order.create", ...] }
GET  /socio/products      → [{ "id", "name", "price", "stock", "unitsPerPack?", "aliases?" }]
GET  /socio/customers     → [{ "id", "name", "balance" }]
POST /socio/actions       → body: acción ya verificada  ·  respuesta: { "result": "texto para el dueño" }
```

Acciones: `inventory.adjust`, `inventory.count`, `sale.record`, `order.create`, `customer.charge`, `customer.payment`, `expense.record`, `product.price` y `query.stock`. El sistema declara cuáles soporta y el resto se bloquea en la verificación.

## Uso de Meta Model API

| Modelo | Endpoint | Uso en Socio |
|---|---|---|
| **Muse Spark** (`muse-spark-1.3`) | `POST /v1/chat/completions` con `response_format: json_schema` | Planificador: mensaje → acciones estructuradas, con imagen si hay foto |
| **Muse Spark** | Ídem, llamado independiente | Auditor de segunda lectura |
| **Muse Voice Transcribe** (`muse-voice-transcribe-1.0`) | `POST /v1/asr/transcribe` (multipart, WAV 16 kHz) | Notas de voz de WhatsApp (OGG/Opus → WAV con ffmpeg), con `keywords` tomadas del catálogo |
| **SAM 3.1** (`sam-3.1`) | `POST /v1/responses` (stream) | Conteo de artículos en fotos, con un parser propio de la salida de cajas y máscaras |

Los IDs de modelo son configurables (`SOCIO_*_MODEL`), y `GET /api/health` confirma que existen en tu cuenta antes de usarlos.

## Correrlo

```bash
npm install
cp .env.example .env.local     # MODEL_API_KEY=... y SOCIO_MOCK=0
npm run dev                    # http://localhost:3000
npm test                       # 17 tests
```

- **Sin clave:** con `SOCIO_MOCK=1` todo el circuito corre con respuestas simuladas.
- **Panel:** a la izquierda, un simulador de chat con texto, audio desde el micrófono y foto. En el medio, "qué hizo Socio y por qué", con cada control. A la derecha, el sistema conectado en vivo (stock, pedidos, gastos y cuentas corrientes).

### WhatsApp

1. En developers.facebook.com, crear una app con el producto **WhatsApp** y usar el número de prueba.
2. Configurar el webhook en `https://TU-DOMINIO/api/whatsapp`, con el token de verificación `WHATSAPP_VERIFY_TOKEN` y la suscripción a `messages`.
3. Cargar `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET` (valida la firma) y `SOCIO_OWNER_NUMBERS` (quiénes pueden operar).

Socio responde 200 enseguida y procesa en segundo plano. No duplica si Meta reintenta, y las aprobaciones llegan como botones.

### Deploy en Vercel

**En vivo:** https://socio-xi-one.vercel.app

El estado tiene que ser compartido entre instancias. La forma recomendada es conectar **Upstash for Redis** desde Vercel → Storage. Socio detecta `KV_REST_API_URL` y `KV_REST_API_TOKEN` y lo usa automáticamente. Como alternativa, configurá `SOCIO_STORE=supabase` con un proyecto Supabase **propio de Socio** (nunca el del cliente) y esta tabla:

```sql
create table socio_kv (key text primary key, value jsonb not null, updated_at timestamptz default now());
```

## Estructura

```
lib/agent/      planificador, verificación, auditor, pipeline (+ planificador simulado)
lib/meta/       clientes de Meta Model API: Spark, Voice Transcribe, SAM 3.1 (+ parser)
lib/connectors/ interfaz Connector + demo, mk247 (Supabase) y REST
lib/channels/   WhatsApp Cloud API (firma, medios, botones, idempotencia)
lib/business.ts perfiles y plantillas por rubro
app/            panel web y API (/api/message, /api/actions/:id, /api/whatsapp, /api/health)
tests/          circuito completo, verificación, parser de SAM, conversión de audio
```

## Estado y próximos pasos

- ✅ Circuito completo (texto, audio, foto, verificación, aprobación y ejecución) con 17 tests en modo simulado.
- ✅ Tres rubros y tres conectores.
- ⏳ En verificación contra la API real: formato de `languageBias`/`keywords` en Voice Transcribe (si los rechaza, se reintenta sin ellos), imagen como data URL en SAM 3.1, y el conector `mk247` contra la base de producción.
- 🔜 Pilotos con el Maxikiosco 24/7 y con distribuidoras que ya son clientes.
- 🔜 Conectores nativos para Google Sheets, Tiendanube y Mercado Libre, y facturación electrónica (ARCA).
