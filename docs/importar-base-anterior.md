# Importar el catálogo de la base anterior

La base anterior usa tablas como `table_sessions`, `products` y `checkouts`, con un modelo distinto al del proyecto actual. La importación lee las tablas anteriores dentro de una transacción de solo lectura y copia el catálogo a una base nueva. Las dos bases deben usar el esquema `public`.

1. En DBeaver, termina cualquier reparación abierta en `restaurantes` con `ROLLBACK;`. En una conexión con autocommit, ejecuta por separado `CREATE DATABASE restaurantes_operacion;`.
2. En `.env`, conserva tu URL anterior bajo el nombre `LEGACY_DATABASE_URL` y apunta `DATABASE_URL` a la base nueva. Conserva el host, puerto y credenciales correspondientes. No compartas el archivo.
3. Desde la raíz del proyecto ejecuta, en orden:

   ```powershell
   npx prisma migrate deploy
   npx prisma generate
   npm run db:import-legacy
   npx prisma migrate status
   npx tsc --noEmit
   ```

Ejecuta la importación antes del seed. Un destino que ya contiene restaurantes se rechaza. Si se produce un error al escribir, PostgreSQL revierte la importación completa.

Se copian restaurantes, configuración Wi-Fi e impuestos, categorías, estaciones, mesas, productos, variantes y preguntas. Las mesas conservan `tableCode` y se numeran por nombre anterior en cada restaurante. Se crean libres. Las variantes se importan como tamaños. Los productos sin estación se asignan a una estación «Sin estación». Los productos activos con una máscara de alérgenos distinta de cero quedan desactivados hasta revisar sus etiquetas, ya que la introspección no identifica el significado de cada bit.

El historial de sesiones, pedidos, pagos, alertas y rondas permanece en `restaurantes`. Termina el servicio en curso allí antes de cambiar la aplicación a `restaurantes_operacion`. La base nueva tiene su propio historial de migraciones.
