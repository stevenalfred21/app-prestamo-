# Préstamos

App para llevar préstamos con rédito quincenal o mensual desde el celular. No usa servidor: todo se guarda en el dispositivo.

## Qué hace

- Clientes con teléfono, cédula, dirección, garante y garantía.
- Préstamos quincenales (cortes 15 y 30) o mensuales (el día de cobro que escojas), cada uno con su porcentaje.
- Pagos con reparto automático entre mora, rédito y capital. Los pagos se pueden editar.
- Recibo de pago listo para WhatsApp al registrar cada pago.
- **Cobros:** quién paga hoy, quién está atrasado (marcado "en mora" después de los días de gracia) y quién paga en los próximos 7 días, con botón de recordatorio por WhatsApp.
- Prestar más dinero sobre un préstamo existente, anotar mora y perdonar rédito.
- Estado de cuenta por corte para WhatsApp.
- Resumen general y **ganancias por mes**, exportables a Excel (CSV).
- Respaldo exportable e importable, con aviso cuando pasa una semana sin respaldo.
- PIN opcional para abrir la app.

## Cómo calcula

- Cada préstamo es **quincenal** o **mensual**, con su propio porcentaje.
- Quincenal: cortes el día 15 y el 30 de cada mes (en febrero, el último día del mes).
- Mensual: un corte al mes, el día de cobro que escojas al crear el préstamo. Si el mes no tiene ese día (por ejemplo el 31), se cobra el último día del mes.
- En cada corte se genera el rédito: capital pendiente al inicio del período × porcentaje del préstamo.
- El primer período va desde la fecha del préstamo hasta el primer corte, y se cobra completo.
- Un pago cubre primero la mora anotada, luego el rédito atrasado, luego el del período en curso, y lo que sobra se descuenta del capital.
- El abono a capital y el dinero adicional prestado cambian el rédito a partir del período siguiente.
- La mora no se calcula sola: la anotas tú. La app marca "en mora" a quien pasa los días de gracia (5 por defecto, se cambia en Ajustes).
- El rédito perdonado no cuenta como cobrado en las ganancias.

## Instalar

Los instaladores se generan solos en GitHub cada vez que se suben cambios. Están en la sección **Releases** del repositorio (columna derecha de la página principal).

- **Android:** desde el celular descarga `Prestamos.apk` y ábrelo. Android pedirá permitir instalar apps de esa fuente (Chrome o Archivos): acepta y vuelve a abrir el archivo. Puede salir un aviso de Play Protect porque la app no viene de la Play Store: escoge instalar de todas formas.
- **Windows:** descarga `Prestamos-Windows.exe` y ejecútalo. Windows mostrará "Windows protegió su PC" porque el instalador no tiene firma comercial: pulsa **Más información → Ejecutar de todas formas**.
- **iPhone:** Apple no permite instalar apps fuera de la App Store sin una Mac y una cuenta de desarrollador. Usa la versión web: ábrela en Safari → **Compartir** → **Agregar a inicio**.

Para actualizar, instala el archivo nuevo encima del anterior. Los datos se conservan. **Si desinstalas la app, los datos se borran**, así que exporta un respaldo antes.

Cada instalación (celular, PC, navegador) guarda sus propios datos. Para pasar los datos de una a otra: Ajustes → Exportar respaldo en una, e Importar respaldo en la otra.

## Desarrollo

- `npm install` instala las herramientas.
- `npm test` corre las pruebas del cálculo.
- `npm run escritorio` abre la versión de escritorio.
- `npm run android:sync` copia la app web al proyecto Android (`android/`, se abre con Android Studio).

La firma del APK (`android/app/prestamos.keystore`) está en el repositorio para que todas las compilaciones usen la misma llave; sin eso, Android no dejaría actualizar la app sin desinstalarla.

## Publicar en GitHub Pages

1. En GitHub, entra al repositorio → **Settings** → **Pages**.
2. En **Source** escoge **Deploy from a branch**.
3. Escoge la rama donde están estos archivos y la carpeta `/ (root)`, y pulsa **Save**.
4. En uno o dos minutos aparece la dirección, algo como `https://USUARIO.github.io/app-prestamo-/`.

Cuando publiques cambios, sube la versión en `sw.js` (`prestamos-v1` → `prestamos-v2`) para que los celulares tomen la nueva.

## Instalar en el celular

- **Android (Chrome):** abre la dirección → menú ⋮ → **Instalar app** (o **Agregar a la pantalla principal**).
- **iPhone (Safari):** abre la dirección → botón **Compartir** → **Agregar a inicio**.

## Importante sobre los datos

Los datos viven solo en ese navegador de ese celular. Si borras los datos del navegador, desinstalas la app o cambias de teléfono, se pierden. Exporta un respaldo con frecuencia (Ajustes → Exportar respaldo) y guárdalo fuera del teléfono.
