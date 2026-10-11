# Préstamos

App web (PWA) para llevar préstamos con rédito quincenal desde el celular. No usa servidor: todo se guarda en el dispositivo.

## Qué hace

- Clientes (nombre, teléfono) y sus préstamos (monto, fecha, % de rédito quincenal).
- Registro de pagos con reparto automático entre rédito y capital.
- Por cliente: capital pendiente, rédito de la quincena, rédito atrasado e historial de pagos.
- Estado de cuenta por corte, listo para enviar por WhatsApp.
- Resumen: total prestado, capital pendiente y rédito a cobrar en el próximo corte.
- Exportar e importar respaldo (archivo `.json`).

## Cómo calcula

- Cortes: día 15 y día 30 de cada mes (en febrero, el último día del mes).
- En cada corte se genera el rédito: capital pendiente al inicio de la quincena × porcentaje del préstamo.
- La primera quincena va desde la fecha del préstamo hasta el primer corte, y se cobra completa.
- Un pago cubre primero el rédito atrasado, luego el de la quincena en curso, y lo que sobra se descuenta del capital.
- El abono a capital baja el rédito a partir de la quincena siguiente.

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
