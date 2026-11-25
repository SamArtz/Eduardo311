# API de operación

## Mesa NFC

El prefijo de las APIs de mesa es `/api/r/{restaurantSlug}/mesa/{tableCode}`. El enlace grabado en el tag sigue siendo `/r/{restaurantSlug}/mesa/{tableCode}`.

| Método y ruta | Operación |
| --- | --- |
| `GET /session` | Devuelve restaurante, Wi-Fi, mesa y sesión activa. La sesión incluye el rol, los pedidos y la última alerta. Los datos de cobro se limitan al anfitrión. |
| `POST /session` | Recibe `{ guestCount, hostName? }` al abrir una mesa libre. Con la mesa activa, un cuerpo `{}` reclama el control si se liberó y devuelve el rol actual en caso contrario. |
| `GET /menu` | Devuelve categorías, platillos disponibles, etiquetas, picante, imágenes y opciones. |
| `POST /orders` | Recibe `{ sessionId, requestId, items: [{ menuItemId, quantity, modifierIds, notes? }] }`. |
| `POST /alerts` | Recibe `{ sessionId }`. Dos solicitudes con una alerta pendiente devuelven la misma alerta. |
| `GET /trivia` | Devuelve la ronda activa sin la respuesta correcta, el resultado de la última ronda y las posiciones de las mesas activas. |
| `POST /trivia` | Recibe `{ sessionId, roundId, optionIndex }`. Anfitrión y acompañantes pueden responder. Se conserva la primera respuesta de la mesa por ronda. |
| `POST /checkout/quote` | Calcula `{ sessionId, split, tip }` sin registrar un pago. |
| `POST /checkout` | Recibe `{ sessionId, requestId, split, tip, method, receiptEmail?, review?: { stars, comment? } }`. |

El servidor devuelve `hostToken` únicamente a quien obtiene el control. La aplicación del comensal debe conservarlo por mesa y enviar `X-Host-Token` al consultar la sesión o ejecutar acciones del anfitrión. Una respuesta de sesión con rol `GUEST` o mesa libre indica que el navegador debe descartar su token anterior. El anfitrión puede enviar varias rondas hasta iniciar un pago. Cada orden y cada intento de pago usa un `requestId` UUID. Reutiliza el UUID para reintentar la misma operación mientras la sesión siga activa.

El campo `split` admite `{ kind: "FULL" }` para liquidar el saldo, `{ kind: "EQUAL", partySize, shareIndex }` con índice desde cero, o `{ kind: "ITEMS", items: [{ orderItemId, quantity }] }`. Una vez pagada una parte igual se mantiene el número de partes para ese plan. El campo `tip` admite `{ kind: "PERCENT", percent: 0 | 10 | 15 }` o `{ kind: "CUSTOM", tipCents }`. El servidor calcula precios e impuestos con los importes de cada orden y cierra la sesión cuando queda cubierta la cuenta.

`CARD_ONLINE` registra un pago simulado. `CASH` y `POS_AT_TABLE` esperan confirmación del mesero. Solo puede haber un pago pendiente por mesa. El servicio de recibos registra una simulación en desarrollo.

## Personal

Genera una credencial de desarrollo asociada a un restaurante y un rol:

```bash
npm run staff:token -- demo KITCHEN
npm run staff:token -- demo WAITER
npm run staff:token -- demo ADMIN
```

Usa el token devuelto como `Authorization: Bearer <token>`. El servidor guarda su hash en `StaffMembership.identityId`. Elimina la membresía correspondiente para revocar la credencial.

El prefijo es `/api/staff/{restaurantId}`. El rol `ADMIN` puede ejecutar todas las acciones del personal.

| Método y ruta | Operación | Rol adicional |
| --- | --- | --- |
| `GET /kds?stationId=…` | Estaciones y tarjetas por columna `NEW`, `PREPARING`, `READY`. El filtro de estación es opcional. | `KITCHEN` |
| `PATCH /kds` | Recibe `{ orderItemId, status }`. Permite avanzar un paso a `PREPARING`, `READY` o `DELIVERED`. | `KITCHEN`, `WAITER` solo para entregar |
| `GET /waiter?filter=…` | Mesas y bandeja de alertas por antigüedad. Filtros `ALL`, `ALERT`, `READY`, `ACTIVE` y `FREE`. | `WAITER` |
| `PATCH /alerts` | Recibe `{ alertId }` y registra el tiempo de respuesta. | `WAITER` |
| `POST /tables/release` | Recibe `{ tableId, sessionId }` e invalida el token sin cerrar la sesión. | `WAITER` |
| `POST /tables/close` | Recibe `{ tableId, sessionId, confirmUnpaid? }`. Un saldo pendiente exige confirmación explícita. Un pago pendiente exige confirmarlo o cancelarlo antes. | `WAITER` |
| `PATCH /payments` | Recibe `{ paymentId, decision }`, con decisión `CONFIRM` o `CANCEL`. | `WAITER` |
| `GET /trivia` | Lista las preguntas disponibles para iniciar una ronda. | — |
| `POST /trivia` | Recibe `{ questionId, durationSeconds }`. Solo puede haber una ronda abierta por restaurante. | — |

Un cierre cancela alertas pendientes sin registrarlas como atendidas. Los pedidos ya enviados conservan su estado de cocina.

## SSE

`GET /api/realtime/{restaurantId}?tableCode=…` se puede consumir con `EventSource`. Emite cambios de esa mesa y de la trivia del restaurante. El personal omite el parámetro y envía su credencial mediante `fetch` con lectura del stream.

Los eventos `change` llevan `{ topic }` con `session`, `orders`, `alerts`, `checkout` o `trivia`. El cliente vuelve a consultar las APIs correspondientes. `sync` se emite al conectar y cada 15 segundos para reconciliar desconexiones o cambios hechos por otro proceso. El EventEmitter entrega señales inmediatas entre conexiones atendidas por el mismo proceso Node.js.
