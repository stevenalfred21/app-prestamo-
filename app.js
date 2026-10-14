(function () {
  'use strict';

  const CLAVE = 'prestamos-datos-v1';
  const $ = (sel, el = document) => el.querySelector(sel);

  // ---------- Datos ----------

  function datosVacios() {
    return {
      version: 2,
      ajustes: {
        moneda: '$', codigoPais: '', formato: 'punto', negocio: '', diasGracia: 5,
        pinHash: '', pinSal: '', ultimoRespaldo: '',
      },
      clientes: [], prestamos: [], pagos: [], movimientos: [],
    };
  }

  function cargar() {
    try {
      const txt = localStorage.getItem(CLAVE);
      if (!txt) return datosVacios();
      return normalizar(JSON.parse(txt));
    } catch (e) {
      console.error(e);
      return datosVacios();
    }
  }

  // Acepta respaldos de versiones anteriores (sin movimientos ni ajustes nuevos).
  function normalizar(d) {
    const base = datosVacios();
    if (!d || typeof d !== 'object') throw new Error('Archivo no válido');
    if (!Array.isArray(d.clientes) || !Array.isArray(d.prestamos) || !Array.isArray(d.pagos)) {
      throw new Error('El archivo no tiene el formato de respaldo de esta app');
    }
    return {
      version: 2,
      ajustes: Object.assign(base.ajustes, d.ajustes || {}),
      clientes: d.clientes,
      prestamos: d.prestamos,
      pagos: d.pagos,
      movimientos: Array.isArray(d.movimientos) ? d.movimientos : [],
    };
  }

  let db = cargar();

  function guardar() {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(db));
    } catch (e) {
      alert('No se pudieron guardar los datos en este dispositivo: ' + e.message);
    }
  }

  // App instalada en Android (Capacitor): sin descargas ni Web Share, se usan los plugins nativos.
  const cap = window.Capacitor;
  const esAndroid = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  const nativo = (plugin, metodo, opciones) => cap.nativePromise(plugin, metodo, opciones);

  const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---------- Utilidades ----------

  function hoy() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // 'punto' = 1,234.56 · 'coma' = 1.234,56
  const formatos = {
    punto: new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    coma: new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  };
  const fmtNum = { format: (n) => (formatos[db.ajustes.formato] || formatos.punto).format(n || 0) };
  const dinero = (n) => db.ajustes.moneda + fmtNum.format(n);
  const pct = (n) => (db.ajustes.formato === 'coma' ? String(Number(n)).replace('.', ',') : String(Number(n))) + '%';

  function fecha(s) {
    if (!s) return '';
    const [y, m, d] = s.split('-');
    return d + '/' + m + '/' + y;
  }

  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const nombreMes = (ym) => MESES[Number(ym.slice(5, 7)) - 1] + ' ' + ym.slice(0, 4);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function numero(v) {
    const n = parseFloat(String(v).replace(',', '.'));
    return isFinite(n) ? n : NaN;
  }

  function aviso(txt) {
    const el = $('#aviso');
    el.textContent = txt;
    el.classList.add('visible');
    clearTimeout(aviso.t);
    aviso.t = setTimeout(() => el.classList.remove('visible'), 2200);
  }

  const cliente = (id) => db.clientes.find((c) => c.id === id);
  const prestamo = (id) => db.prestamos.find((p) => p.id === id);
  const prestamosDe = (clienteId) =>
    db.prestamos.filter((p) => p.clienteId === clienteId).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  const diasGracia = () => Number(db.ajustes.diasGracia) || 0;

  // Palabras según la frecuencia del préstamo
  const frec = (p) => (Calc.esMensual(p) ? 'mensual' : 'quincenal');
  const delPeriodo = (p) => (Calc.esMensual(p) ? 'del mes' : 'de la quincena');
  const estePeriodo = (p) => (Calc.esMensual(p) ? 'este mes' : 'esta quincena');

  const calc = (p, hasta) => Calc.calcularPrestamo(p, db.pagos, hasta || hoy(), db.movimientos);

  // Días que lleva vencido el rédito más viejo sin pagar (null si está al día).
  const diasVencido = (r) => (r.vencidoDesde ? Calc.diasEntre(r.vencidoDesde, hoy()) : null);
  const enMora = (r) => r.vencidoDesde !== null && diasVencido(r) > diasGracia();

  function resumenCliente(clienteId) {
    let capital = 0, atrasado = 0, enCurso = 0, mora = 0, activos = 0, moroso = false;
    for (const p of prestamosDe(clienteId)) {
      const r = calc(p);
      capital += r.capital;
      atrasado += r.reditoAtrasado;
      enCurso += r.reditoActualPendiente;
      mora += r.moraPendiente;
      if (!r.saldado) activos++;
      if (enMora(r)) moroso = true;
    }
    return { capital: Calc.r2(capital), atrasado: Calc.r2(atrasado), enCurso: Calc.r2(enCurso), mora: Calc.r2(mora), activos, moroso };
  }

  function telefonoWhatsApp(tel) {
    if (!tel) return '';
    const conMas = tel.trim().startsWith('+');
    let dig = tel.replace(/\D/g, '');
    if (!dig) return '';
    const cod = (db.ajustes.codigoPais || '').replace(/\D/g, '');
    if (!conMas && cod && !dig.startsWith(cod)) dig = cod + dig.replace(/^0+/, '');
    return dig;
  }

  const enlaceWhatsApp = (tel, texto) => `https://wa.me/${telefonoWhatsApp(tel)}?text=${encodeURIComponent(texto)}`;
  const firma = () => (db.ajustes.negocio ? `\n\n${db.ajustes.negocio}` : '');

  // ---------- Archivos (respaldo y Excel) ----------

  // Android: se guarda en caché y se abre el menú de compartir. Web/Windows: descarga.
  async function guardarArchivo(nombre, texto, tipo, titulo) {
    if (esAndroid) {
      try {
        const { uri } = await nativo('Filesystem', 'writeFile', { path: nombre, data: texto, directory: 'CACHE', encoding: 'utf8' });
        await nativo('Share', 'share', { title: nombre, files: [uri], dialogTitle: titulo });
        return true;
      } catch (e) {
        if (!/cancel/i.test(e.message || '')) alert('No se pudo guardar el archivo: ' + (e.message || e));
        return false;
      }
    }
    const archivo = new File([texto], nombre, { type: tipo });
    if (navigator.canShare && navigator.canShare({ files: [archivo] }) && confirm(`¿Compartir el archivo (Drive, WhatsApp, correo…)?\n\nCancelar = descargarlo.`)) {
      try {
        await navigator.share({ files: [archivo], title: nombre });
        return true;
      } catch (e) {
        if (e.name === 'AbortError') return false;
      }
    }
    const url = URL.createObjectURL(archivo);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return true;
  }

  // CSV que Excel abre directo: separador y decimales según el formato de números escogido.
  function csv(filas) {
    const coma = db.ajustes.formato === 'coma';
    const sep = coma ? ';' : ',';
    const celda = (v) => {
      if (typeof v === 'number') return coma ? v.toFixed(2).replace('.', ',') : v.toFixed(2);
      const t = String(v == null ? '' : v);
      return /[";,\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
    };
    return '﻿' + filas.map((f) => f.map(celda).join(sep)).join('\r\n');
  }

  // ---------- Navegación ----------

  const vista = $('#vista');

  function poner(titulo, html, { atras = false, tab = '' } = {}) {
    $('#titulo').textContent = titulo;
    $('#btn-atras').hidden = !atras;
    vista.innerHTML = html;
    document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('activo', a.dataset.tab === tab));
    window.scrollTo(0, 0);
  }

  $('#btn-atras').addEventListener('click', () => {
    if (history.length > 1) history.back();
    else location.hash = '#/clientes';
  });

  function rutear() {
    const [ruta, id] = (location.hash.replace(/^#\/?/, '') || '').split('/');
    if (ruta === 'cobros') return vistaCobros();
    if (ruta === 'clientes') return vistaClientes();
    if (ruta === 'c' && cliente(id)) return vistaCliente(id);
    if (ruta === 'p' && prestamo(id)) return vistaPrestamo(id);
    if (ruta === 'estado' && cliente(id)) return vistaEstado(id);
    if (ruta === 'reporte') return vistaReporte();
    if (ruta === 'ajustes') return vistaAjustes();
    return vistaResumen();
  }
  window.addEventListener('hashchange', rutear);

  // Acciones con data-accion en cualquier botón de la vista o del modal
  const acciones = {};
  function despachar(e) {
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    e.preventDefault();
    const fn = acciones[b.dataset.accion];
    if (fn) fn(b.dataset.id, b);
  }
  vista.addEventListener('click', despachar);
  $('#modal-form').addEventListener('click', despachar);

  // ---------- Resumen ----------

  function alertaRespaldo() {
    if (!db.clientes.length) return '';
    const ultimo = db.ajustes.ultimoRespaldo;
    const dias = ultimo ? Calc.diasEntre(ultimo, hoy()) : null;
    if (dias !== null && dias < 7) return '';
    return `<div class="alerta">
      <b>${dias === null ? 'Nunca has hecho un respaldo.' : `Hace ${dias} días que no haces un respaldo.`}</b>
      Si se pierde o se daña este equipo, se pierden todos los datos.
      <div class="botones"><button class="btn chico primario" data-accion="exportar">Hacer respaldo ahora</button></div>
    </div>`;
  }

  function vistaResumen() {
    const h = hoy();
    let prestado = 0, capital = 0, atrasado = 0, enCurso = 0, mora = 0, reditoCobrado = 0, activos = 0, morosos = 0, pendientes = 0;
    for (const p of db.prestamos) {
      const r = calc(p, h);
      prestado += Number(p.monto) + r.capitalAgregado;
      capital += r.capital;
      atrasado += r.reditoAtrasado;
      enCurso += r.reditoActualPendiente;
      mora += r.moraPendiente;
      reditoCobrado += r.reditoPagado + r.moraPagada;
      if (!r.saldado) activos++;
      if (enMora(r)) morosos++;
      if (r.vencidoDesde || r.moraPendiente > 0) pendientes++;
    }
    let html = alertaRespaldo() + `
      <div class="cifras">
        <div class="cifra ancha">
          <div class="et">Rédito por cobrar</div>
          <div class="val">${dinero(atrasado + enCurso)}</div>
          <div class="suave">${atrasado > 0 ? `Vencido: ${dinero(atrasado)} · ` : ''}Próximos cortes: ${dinero(enCurso)}</div>
        </div>
        ${mora > 0 ? `<div class="cifra"><div class="et">Mora por cobrar</div><div class="val rojo">${dinero(mora)}</div></div>` : ''}
        <div class="cifra"><div class="et">Capital pendiente</div><div class="val">${dinero(capital)}</div></div>
        <div class="cifra"><div class="et">Total prestado</div><div class="val">${dinero(prestado)}</div></div>
        <div class="cifra"><div class="et">Préstamos activos</div><div class="val">${activos}</div></div>
        <div class="cifra"><div class="et">Cobrado (rédito y mora)</div><div class="val">${dinero(reditoCobrado)}</div></div>
      </div>
      <div class="botones">
        <a class="btn primario" href="#/cobros">Cobros pendientes${pendientes ? ` (${pendientes})` : ''}</a>
        <a class="btn" href="#/reporte">Ganancias por mes</a>
      </div>`;
    if (morosos) html += `<p class="rojo">${morosos} préstamo(s) pasaron los ${diasGracia()} días de gracia. Míralos en Cobros.</p>`;
    if (!db.clientes.length) {
      html += `<div class="vacio">Todavía no hay clientes.<br><br><a class="btn primario" href="#/clientes">Agregar el primero</a></div>`;
    }
    poner('Resumen', html, { tab: 'resumen' });
  }

  // ---------- Cobros ----------

  function textoRecordatorio(p, r, tipo) {
    const c = cliente(p.clienteId);
    const nombre = c.nombre.split(' ')[0];
    const lineas = [];
    if (tipo === 'proximo') {
      lineas.push(`Hola ${nombre}, le recordamos que el ${fecha(r.actual.corte)} es su corte.`);
      lineas.push(`Rédito a pagar: ${dinero(r.reditoActualPendiente)}`);
    } else {
      lineas.push(tipo === 'hoy'
        ? `Hola ${nombre}, le recordamos que hoy ${fecha(hoy())} es su corte.`
        : r.vencidoDesde
          ? `Hola ${nombre}, le recordamos que tiene rédito pendiente desde el ${fecha(r.vencidoDesde)}.`
          : `Hola ${nombre}, le recordamos que tiene un pago pendiente.`);
      if (r.reditoAtrasado > 0) lineas.push(`Rédito pendiente: ${dinero(r.reditoAtrasado)}`);
      if (r.moraPendiente > 0) lineas.push(`Mora: ${dinero(r.moraPendiente)}`);
      if (r.moraPendiente > 0) lineas.push(`*Total a pagar: ${dinero(r.reditoAtrasado + r.moraPendiente)}*`);
    }
    lineas.push(`Capital pendiente: ${dinero(r.capital)}`);
    return lineas.join('\n') + firma();
  }

  function filaCobro(p, r, tipo) {
    const c = cliente(p.clienteId);
    const dias = diasVencido(r);
    const monto = tipo === 'proximo' ? r.reditoActualPendiente : r.reditoAtrasado + r.moraPendiente;
    let detalle;
    if (tipo === 'proximo') detalle = `Corte ${fecha(r.actual.corte)}`;
    else if (tipo === 'hoy') detalle = 'Corte de hoy';
    else if (!r.vencidoDesde) detalle = 'Mora pendiente';
    else detalle = `Vencido desde ${fecha(r.vencidoDesde)} (${dias} día${dias === 1 ? '' : 's'})`;
    const mora = tipo === 'atrasado' && enMora(r);
    return `<li class="cobro">
      <div class="fila"><span><a href="#/c/${c.id}" style="color:inherit">${esc(c.nombre)}</a>${mora ? ' <span class="etiqueta mal">En mora</span>' : ''}</span><span>${dinero(monto)}</span></div>
      <div class="suave">${detalle} · préstamo de ${dinero(p.monto)} ${frec(p)}${r.moraPendiente > 0 ? ` · incluye mora ${dinero(r.moraPendiente)}` : ''}</div>
      <div class="botones">
        <a class="btn chico whatsapp" href="${enlaceWhatsApp(c.telefono, textoRecordatorio(p, r, tipo))}" target="_blank" rel="noopener">Recordar</a>
        <button class="btn chico primario" data-accion="nuevoPago" data-id="${p.id}">Pago</button>
        ${mora ? `<button class="btn chico peligro" data-accion="nuevaMora" data-id="${p.id}">Agregar mora</button>` : ''}
      </div>
    </li>`;
  }

  function vistaCobros() {
    const h = hoy();
    const grupos = { atrasado: [], hoy: [], proximo: [] };
    for (const p of db.prestamos) {
      const r = calc(p, h);
      if (r.saldado) continue;
      if (r.vencidoDesde || r.moraPendiente > 0) {
        grupos[r.vencidoDesde === h ? 'hoy' : 'atrasado'].push({ p, r });
      } else if (r.reditoActualPendiente > 0 && Calc.diasEntre(h, r.actual.corte) <= 7) {
        grupos.proximo.push({ p, r });
      }
    }
    grupos.atrasado.sort((a, b) => (a.r.vencidoDesde || h).localeCompare(b.r.vencidoDesde || h));
    grupos.proximo.sort((a, b) => a.r.actual.corte.localeCompare(b.r.actual.corte));

    const seccion = (titulo, lista, tipo, total) => (lista.length
      ? `<h2 class="seccion">${titulo} · ${dinero(total)}</h2><div class="tarjeta"><ul class="lista">${lista.map(({ p, r }) => filaCobro(p, r, tipo)).join('')}</ul></div>`
      : '');
    const suma = (lista, f) => lista.reduce((s, x) => s + f(x.r), 0);

    let html = seccion('Les toca hoy', grupos.hoy, 'hoy', suma(grupos.hoy, (r) => r.reditoAtrasado + r.moraPendiente));
    html += seccion('Atrasados', grupos.atrasado, 'atrasado', suma(grupos.atrasado, (r) => r.reditoAtrasado + r.moraPendiente));
    html += seccion('Próximos 7 días', grupos.proximo, 'proximo', suma(grupos.proximo, (r) => r.reditoActualPendiente));
    if (!html) html = `<div class="vacio">No hay cobros pendientes para hoy ni para los próximos 7 días.</div>`;
    else html = `<p class="suave">"En mora" = más de ${diasGracia()} días sin pagar el rédito. Puedes cambiar los días de gracia en Ajustes.</p>` + html;
    poner('Cobros', html, { tab: 'cobros' });
  }

  // ---------- Clientes ----------

  function vistaClientes() {
    const filtro = (vistaClientes.filtro || '').toLowerCase();
    const lista = db.clientes
      .filter((c) => !filtro || c.nombre.toLowerCase().includes(filtro) || (c.telefono || '').includes(filtro) || (c.cedula || '').includes(filtro))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

    let html = `<input class="buscar" type="search" id="buscar" placeholder="Buscar por nombre, teléfono o cédula" value="${esc(vistaClientes.filtro || '')}">`;
    if (!db.clientes.length) html += `<div class="vacio">No hay clientes registrados.</div>`;
    for (const c of lista) {
      const r = resumenCliente(c.id);
      let estado = '';
      if (r.moroso) estado = `<span class="etiqueta mal">En mora</span>`;
      else if (r.atrasado > 0) estado = `<span class="etiqueta pend">Pendiente</span>`;
      else if (r.activos === 0 && prestamosDe(c.id).length) estado = `<span class="etiqueta ok">Saldado</span>`;
      else if (!prestamosDe(c.id).length) estado = `<span class="etiqueta pend">Sin préstamo</span>`;
      html += `<a class="tarjeta" href="#/c/${c.id}">
        <h3>${esc(c.nombre)} ${estado}</h3>
        <div class="fila"><span class="suave">Capital pendiente</span><span>${dinero(r.capital)}</span></div>
        <div class="fila"><span class="suave">Por cobrar (rédito${r.mora > 0 ? ' y mora' : ''})</span><span>${dinero(r.atrasado + r.enCurso + r.mora)}</span></div>
      </a>`;
    }
    html += `<button class="btn primario flotante" data-accion="nuevoCliente">+ Cliente</button>`;
    poner('Clientes', html, { tab: 'clientes' });

    const b = $('#buscar');
    b.addEventListener('input', () => {
      vistaClientes.filtro = b.value;
      const pos = b.selectionStart;
      vistaClientes();
      const nb = $('#buscar');
      nb.focus();
      nb.setSelectionRange(pos, pos);
    });
  }

  acciones.nuevoCliente = () => formCliente();
  acciones.editarCliente = (id) => formCliente(cliente(id));

  const CAMPOS_CLIENTE = ['nombre', 'telefono', 'cedula', 'direccion', 'garante', 'garanteTel', 'garantia', 'nota'];

  function formCliente(c) {
    const v = (k) => esc(c ? c[k] || '' : '');
    abrirModal(`
      <h2>${c ? 'Editar cliente' : 'Nuevo cliente'}</h2>
      <label>Nombre<input name="nombre" required autocomplete="off" value="${v('nombre')}"></label>
      <label>Teléfono (WhatsApp)<input name="telefono" type="tel" inputmode="tel" value="${v('telefono')}" placeholder="Ej: 8095551234"></label>
      <label>Cédula (opcional)<input name="cedula" inputmode="numeric" value="${v('cedula')}"></label>
      <label>Dirección (opcional)<input name="direccion" value="${v('direccion')}"></label>
      <label>Garante (opcional)<input name="garante" value="${v('garante')}" placeholder="Nombre del garante"></label>
      <label>Teléfono del garante (opcional)<input name="garanteTel" type="tel" inputmode="tel" value="${v('garanteTel')}"></label>
      <label>Garantía (opcional)<input name="garantia" value="${v('garantia')}" placeholder="Ej: matrícula de motor, título, etc."></label>
      <label>Nota (opcional)<input name="nota" value="${v('nota')}"></label>
    `, (f) => {
      const datos = {};
      for (const k of CAMPOS_CLIENTE) datos[k] = f[k].value.trim();
      if (!datos.nombre) return 'Escribe el nombre';
      if (c) {
        Object.assign(c, datos);
        guardar();
        rutear();
      } else {
        const nuevo = Object.assign({ id: nuevoId(), creado: Date.now() }, datos);
        db.clientes.push(nuevo);
        guardar();
        location.hash = '#/c/' + nuevo.id;
      }
    });
  }

  acciones.borrarCliente = (id) => {
    const c = cliente(id);
    const n = prestamosDe(id).length;
    if (!confirm(`¿Borrar a ${c.nombre}${n ? ` y sus ${n} préstamo(s) con todos sus pagos` : ''}? Esto no se puede deshacer.`)) return;
    const ids = new Set(prestamosDe(id).map((p) => p.id));
    db.pagos = db.pagos.filter((p) => !ids.has(p.prestamoId));
    db.movimientos = db.movimientos.filter((m) => !ids.has(m.prestamoId));
    db.prestamos = db.prestamos.filter((p) => p.clienteId !== id);
    db.clientes = db.clientes.filter((x) => x.id !== id);
    guardar();
    location.hash = '#/clientes';
  };

  function vistaCliente(id) {
    const c = cliente(id);
    const prestamos = prestamosDe(id);
    const tel = telefonoWhatsApp(c.telefono);
    const dato = (etiqueta, valor) => (valor ? `<div><span class="suave">${etiqueta}:</span> ${esc(valor)}</div>` : '');

    let html = `<div class="tarjeta">
      <div class="suave">${c.telefono ? esc(c.telefono) : 'Sin teléfono'}</div>
      <div class="datos-cliente">
        ${dato('Cédula', c.cedula)}
        ${dato('Dirección', c.direccion)}
        ${dato('Garante', [c.garante, c.garanteTel].filter(Boolean).join(' · '))}
        ${dato('Garantía', c.garantia)}
        ${dato('Nota', c.nota)}
      </div>
      <div class="botones">
        ${c.telefono ? `<a class="btn chico" href="tel:${esc(c.telefono.replace(/[^\d+]/g, ''))}">Llamar</a>` : ''}
        ${tel ? `<a class="btn chico" href="https://wa.me/${tel}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        <button class="btn chico" data-accion="editarCliente" data-id="${id}">Editar</button>
        <button class="btn chico peligro" data-accion="borrarCliente" data-id="${id}">Borrar</button>
      </div>
    </div>`;

    if (prestamos.length) {
      const r = resumenCliente(id);
      html += `<div class="cifras">
        <div class="cifra"><div class="et">Capital pendiente</div><div class="val">${dinero(r.capital)}</div></div>
        <div class="cifra"><div class="et">Rédito del próximo corte</div><div class="val">${dinero(r.enCurso)}</div></div>
        ${r.atrasado > 0 ? `<div class="cifra" style="background:var(--rojo-claro)"><div class="et">Rédito vencido</div><div class="val rojo">${dinero(r.atrasado)}</div></div>` : ''}
        ${r.mora > 0 ? `<div class="cifra" style="background:var(--rojo-claro)"><div class="et">Mora pendiente</div><div class="val rojo">${dinero(r.mora)}</div></div>` : ''}
      </div>
      <a class="btn primario bloque" style="margin-top:12px" href="#/estado/${id}">Estado de cuenta para WhatsApp</a>`;
    }

    html += `<h2 class="seccion">Préstamos</h2>`;
    if (!prestamos.length) html += `<div class="vacio">Este cliente no tiene préstamos.</div>`;
    for (const p of prestamos) html += tarjetaPrestamo(p);
    html += `<button class="btn bloque" data-accion="nuevoPrestamo" data-id="${id}">+ Nuevo préstamo</button>`;

    // Historial de pagos de todos sus préstamos
    const filas = [];
    for (const p of prestamos) for (const d of calc(p).detalle) filas.push({ d, p });
    if (filas.length) {
      filas.sort((a, b) => (a.d.pago.fecha < b.d.pago.fecha ? 1 : a.d.pago.fecha > b.d.pago.fecha ? -1 : (b.d.pago.creado || 0) - (a.d.pago.creado || 0)));
      html += `<h2 class="seccion">Historial de pagos</h2><div class="tarjeta"><ul class="lista">`;
      for (const { d, p } of filas) html += filaPago(d, prestamos.length > 1 ? p : null);
      html += `</ul></div>`;
    }
    poner(c.nombre, html, { atras: true, tab: 'clientes' });
  }

  function etiquetaPrestamo(r) {
    if (r.saldado) return '<span class="etiqueta ok">Saldado</span>';
    if (enMora(r)) return '<span class="etiqueta mal">En mora</span>';
    if (r.vencidoDesde || r.moraPendiente > 0) return '<span class="etiqueta pend">Pendiente</span>';
    return '<span class="etiqueta ok">Al día</span>';
  }

  function tarjetaPrestamo(p) {
    const r = calc(p);
    return `<div class="tarjeta">
      <h3>${dinero(p.monto)} al ${pct(p.pct)} ${frec(p)} ${etiquetaPrestamo(r)}</h3>
      <div class="suave" style="margin-bottom:6px">Desde ${fecha(p.fecha)}${Calc.esMensual(p) ? ` · cobra el día ${Calc.diaCobro(p)}` : ''}${r.capitalAgregado > 0 ? ` · + ${dinero(r.capitalAgregado)} adicional` : ''}${p.nota ? ' · ' + esc(p.nota) : ''}</div>
      <div class="fila"><span class="suave">Capital pendiente</span><span>${dinero(r.capital)}</span></div>
      ${r.saldado ? '' : `<div class="fila"><span class="suave">Rédito ${delPeriodo(p)} (corte ${fecha(r.actual.corte)})</span><span>${dinero(r.reditoActualPendiente)}</span></div>`}
      ${r.reditoAtrasado > 0 ? `<div class="fila rojo"><span>Rédito vencido</span><span>${dinero(r.reditoAtrasado)}</span></div>` : ''}
      ${r.moraPendiente > 0 ? `<div class="fila rojo"><span>Mora</span><span>${dinero(r.moraPendiente)}</span></div>` : ''}
      <div class="botones">
        ${r.saldado ? '' : `<button class="btn primario" data-accion="nuevoPago" data-id="${p.id}">Registrar pago</button>`}
        <a class="btn" href="#/p/${p.id}">Detalle</a>
      </div>
    </div>`;
  }

  function reparto(d, minusculas) {
    const et = (t) => (minusculas ? t.toLowerCase() : t);
    const partes = [];
    if (d.aMora > 0) partes.push(`${et('Mora')} ${dinero(d.aMora)}`);
    partes.push(`${et('Rédito')} ${dinero(d.aRedito)}`);
    partes.push(`${et('Capital')} ${dinero(d.aCapital)}`);
    if (d.sobrante > 0) partes.push(`${et('Sobrante')} ${dinero(d.sobrante)}`);
    return partes.join(' · ');
  }

  function filaPago(d, p, botones) {
    return `<li>
      <div class="fila"><span>${fecha(d.pago.fecha)}</span><span>${dinero(d.pago.monto)}</span></div>
      <div class="suave">${reparto(d)}${p ? ` · Préstamo de ${dinero(p.monto)}` : ''}</div>
      ${d.pago.nota ? `<div class="suave">${esc(d.pago.nota)}</div>` : ''}
      ${botones || ''}
    </li>`;
  }

  // ---------- Préstamos ----------

  acciones.nuevoPrestamo = (clienteId) => formPrestamo(null, clienteId);
  acciones.editarPrestamo = (id) => formPrestamo(prestamo(id));

  function formPrestamo(p, clienteId) {
    const ultimo = db.prestamos.length ? db.prestamos[db.prestamos.length - 1] : null;
    const mensual = p ? Calc.esMensual(p) : !!(ultimo && Calc.esMensual(ultimo));
    const ultimoPct = ultimo && Calc.esMensual(ultimo) === mensual ? ultimo.pct : '';
    abrirModal(`
      <h2>${p ? 'Editar préstamo' : 'Nuevo préstamo'}</h2>
      <label>Monto prestado<input name="monto" type="number" inputmode="decimal" step="0.01" min="0.01" required value="${p ? p.monto : ''}"></label>
      <label>Fecha del préstamo<input name="fecha" type="date" required value="${p ? p.fecha : hoy()}"></label>
      <label>Cobro
        <select name="frecuencia">
          <option value="quincenal" ${mensual ? '' : 'selected'}>Quincenal (15 y 30)</option>
          <option value="mensual" ${mensual ? 'selected' : ''}>Mensual</option>
        </select>
      </label>
      <label id="campo-dia" ${mensual ? '' : 'hidden'}>Día de cobro cada mes
        <input name="diaCobro" type="number" inputmode="numeric" min="1" max="31" value="${p && p.diaCobro ? p.diaCobro : ''}" placeholder="Ej: 5, 15, 30">
      </label>
      <label><span id="et-pct">Rédito ${mensual ? 'mensual' : 'quincenal'} (%)</span><input name="pct" type="number" inputmode="decimal" step="0.01" min="0" required value="${p ? p.pct : ultimoPct}"></label>
      <div class="vista-previa suave" id="prev-prestamo"></div>
      <label>Nota (opcional)<input name="nota" value="${esc(p ? p.nota || '' : '')}"></label>
    `, (f) => {
      const monto = numero(f.monto.value);
      const tasa = numero(f.pct.value);
      if (!(monto > 0)) return 'Escribe un monto válido';
      if (!(tasa >= 0)) return 'Escribe un porcentaje válido';
      if (!f.fecha.value) return 'Escoge la fecha';
      const datos = { monto, pct: tasa, fecha: f.fecha.value, nota: f.nota.value.trim(), frecuencia: f.frecuencia.value };
      if (datos.frecuencia === 'mensual') {
        const dia = parseInt(f.diaCobro.value, 10);
        if (!(dia >= 1 && dia <= 31)) return 'Escribe el día de cobro (1 a 31)';
        datos.diaCobro = dia;
      } else {
        datos.diaCobro = null;
      }
      if (p) Object.assign(p, datos);
      else db.prestamos.push(Object.assign({ id: nuevoId(), clienteId, creado: Date.now() }, datos));
      guardar();
      rutear();
    }, (f) => {
      const monto = numero(f.monto.value);
      const tasa = numero(f.pct.value);
      const prev = $('#prev-prestamo');
      const esMes = f.frecuencia.value === 'mensual';
      $('#campo-dia').hidden = !esMes;
      $('#et-pct').textContent = `Rédito ${esMes ? 'mensual' : 'quincenal'} (%)`;
      // Al escoger mensual por primera vez, el día de cobro sugerido es el día del préstamo
      if (esMes && !f.diaCobro.value && f.fecha.value) f.diaCobro.value = Number(f.fecha.value.slice(8));
      const dia = parseInt(f.diaCobro.value, 10);
      if (monto > 0 && tasa >= 0 && f.fecha.value && (!esMes || (dia >= 1 && dia <= 31))) {
        const primero = Calc.siguienteCorteDe({ fecha: f.fecha.value, frecuencia: f.frecuencia.value, diaCobro: dia }, f.fecha.value);
        prev.innerHTML = `Rédito por ${esMes ? 'mes' : 'quincena'}: <b>${dinero(Calc.r2(monto * tasa / 100))}</b><br>Primer corte: ${fecha(primero)}`;
      } else prev.textContent = 'Llena monto, fecha y porcentaje para ver el rédito.';
    });
  }

  acciones.borrarPrestamo = (id) => {
    const p = prestamo(id);
    if (!confirm(`¿Borrar el préstamo de ${dinero(p.monto)} con todos sus pagos y movimientos? Esto no se puede deshacer.`)) return;
    db.pagos = db.pagos.filter((x) => x.prestamoId !== id);
    db.movimientos = db.movimientos.filter((x) => x.prestamoId !== id);
    db.prestamos = db.prestamos.filter((x) => x.id !== id);
    guardar();
    location.hash = '#/c/' + p.clienteId;
  };

  const NOMBRE_MOV = { capital: 'Préstamo adicional', mora: 'Mora', descuento: 'Rédito perdonado' };

  function vistaPrestamo(id) {
    const p = prestamo(id);
    const c = cliente(p.clienteId);
    const r = calc(p);
    const paraSaldar = Calc.r2(r.capital + r.reditoAtrasado + r.reditoActualPendiente + r.moraPendiente);

    let html = `<div class="tarjeta">
      <div class="fila"><span class="suave">Cliente</span><span><a href="#/c/${c.id}">${esc(c.nombre)}</a></span></div>
      <div class="fila"><span class="suave">Monto prestado</span><span>${dinero(p.monto)}</span></div>
      ${r.capitalAgregado > 0 ? `<div class="fila"><span class="suave">Prestado adicional</span><span>${dinero(r.capitalAgregado)}</span></div>` : ''}
      <div class="fila"><span class="suave">Fecha</span><span>${fecha(p.fecha)}</span></div>
      <div class="fila"><span class="suave">Rédito ${frec(p)}</span><span>${pct(p.pct)}</span></div>
      ${Calc.esMensual(p) ? `<div class="fila"><span class="suave">Día de cobro</span><span>${Calc.diaCobro(p)} de cada mes</span></div>` : ''}
      <div class="fila"><span class="suave">Capital pagado</span><span>${dinero(r.capitalPagado)}</span></div>
      <div class="fila"><span class="suave">Rédito pagado</span><span>${dinero(r.reditoPagado)}</span></div>
      ${r.moraPagada > 0 ? `<div class="fila"><span class="suave">Mora pagada</span><span>${dinero(r.moraPagada)}</span></div>` : ''}
      <div class="fila total"><span>Capital pendiente</span><span>${dinero(r.capital)}</span></div>
      ${r.saldado ? '' : `
      <div class="fila"><span>Rédito ${delPeriodo(p)} (corte ${fecha(r.actual.corte)})</span><span>${dinero(r.reditoActualPendiente)}</span></div>
      ${r.reditoAtrasado > 0 ? `<div class="fila rojo"><span>Rédito vencido${r.vencidoDesde ? ` desde ${fecha(r.vencidoDesde)}` : ''}</span><span>${dinero(r.reditoAtrasado)}</span></div>` : ''}
      ${r.moraPendiente > 0 ? `<div class="fila rojo"><span>Mora pendiente</span><span>${dinero(r.moraPendiente)}</span></div>` : ''}
      <div class="fila total"><span>Para saldar hoy</span><span>${dinero(paraSaldar)}</span></div>`}
      <div class="botones">
        ${r.saldado ? '' : `<button class="btn primario" data-accion="nuevoPago" data-id="${id}">Registrar pago</button>`}
        <button class="btn" data-accion="nuevoCapital" data-id="${id}">Prestar más</button>
        ${r.saldado ? '' : `<button class="btn" data-accion="nuevaMora" data-id="${id}">Agregar mora</button>`}
        ${r.reditoAtrasado + r.reditoActualPendiente > 0 ? `<button class="btn" data-accion="nuevoDescuento" data-id="${id}">Perdonar rédito</button>` : ''}
        <button class="btn" data-accion="editarPrestamo" data-id="${id}">Editar</button>
        <button class="btn peligro" data-accion="borrarPrestamo" data-id="${id}">Borrar</button>
      </div>
    </div>`;

    if (r.detalle.length) {
      html += `<h2 class="seccion">Pagos</h2><div class="tarjeta"><ul class="lista">`;
      for (const d of r.detalle.slice().reverse()) {
        html += filaPago(d, null, `<div class="botones">
          <button class="btn chico" data-accion="verRecibo" data-id="${d.pago.id}">Recibo</button>
          <button class="btn chico" data-accion="editarPago" data-id="${d.pago.id}">Editar</button>
          <button class="btn chico peligro" data-accion="borrarPago" data-id="${d.pago.id}">Borrar</button>
        </div>`);
      }
      html += `</ul></div>`;
    }

    const movs = db.movimientos.filter((m) => m.prestamoId === id).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    if (movs.length) {
      html += `<h2 class="seccion">Otros movimientos</h2><div class="tarjeta"><ul class="lista">`;
      for (const m of movs) {
        html += `<li>
          <div class="fila"><span>${fecha(m.fecha)} · ${NOMBRE_MOV[m.tipo] || m.tipo}</span><span>${dinero(m.monto)}</span></div>
          ${m.nota ? `<div class="suave">${esc(m.nota)}</div>` : ''}
          <div class="botones"><button class="btn chico peligro" data-accion="borrarMovimiento" data-id="${m.id}">Borrar</button></div>
        </li>`;
      }
      html += `</ul></div>`;
    }

    const filas = r.periodos.concat(r.saldado ? [] : [r.actual]).reverse();
    if (filas.length) {
      html += `<h2 class="seccion">${Calc.esMensual(p) ? 'Meses' : 'Quincenas'}</h2><div class="tarjeta tabla-scroll"><table>
        <tr><th>Corte</th><th>Capital</th><th>Rédito</th><th>Pagado</th><th></th></tr>`;
      for (const q of filas) {
        const enCurso = q === r.actual;
        const est = Calc.pendiente(q) <= 0
          ? '<span class="etiqueta ok" title="Pagado">✓</span>'
          : enCurso ? '<span class="etiqueta pend" title="En curso">…</span>' : '<span class="etiqueta mal" title="Debe">!</span>';
        const pagado = q.pagado + q.descontado;
        html += `<tr><td>${fecha(q.corte)}</td><td>${fmtNum.format(q.base)}</td><td>${fmtNum.format(q.redito)}</td><td>${fmtNum.format(pagado)}${q.descontado > 0 ? '*' : ''}</td><td>${est}</td></tr>`;
      }
      html += `</table><p class="suave" style="margin:8px 0 0">✓ pagado · … en curso · ! debe${r.periodos.concat([r.actual]).some((q) => q.descontado > 0) ? ' · * incluye rédito perdonado' : ''}</p></div>`;
    }
    poner('Préstamo de ' + c.nombre, html, { atras: true, tab: 'clientes' });
  }

  // ---------- Movimientos: prestar más, mora, perdonar rédito ----------

  function formMovimiento(prestamoId, tipo) {
    const p = prestamo(prestamoId);
    const r = calc(p);
    const textos = {
      capital: { titulo: 'Prestar más', ayuda: 'Se suma al capital. Genera rédito desde el próximo corte.', boton: 'Prestar' },
      mora: { titulo: 'Agregar mora', ayuda: `Se cobra antes que el rédito en el próximo pago.${r.vencidoDesde ? ` Rédito vencido desde ${fecha(r.vencidoDesde)}.` : ''}`, boton: 'Agregar' },
      descuento: { titulo: 'Perdonar rédito', ayuda: `Rebaja el rédito pendiente, del más viejo al más nuevo. Pendiente hoy: ${dinero(r.reditoAtrasado + r.reditoActualPendiente)}.`, boton: 'Perdonar' },
    }[tipo];
    abrirModal(`
      <h2>${textos.titulo}</h2>
      <div class="suave" style="margin-bottom:12px">${esc(cliente(p.clienteId).nombre)} · préstamo de ${dinero(p.monto)}</div>
      <p class="suave">${textos.ayuda}</p>
      <label>Monto<input name="monto" type="number" inputmode="decimal" step="0.01" min="0.01" required></label>
      <label>Fecha<input name="fecha" type="date" required value="${hoy()}" max="${hoy()}"></label>
      <label>Nota (opcional)<input name="nota"></label>
    `, (f) => {
      const monto = numero(f.monto.value);
      if (!(monto > 0)) return 'Escribe el monto';
      if (!f.fecha.value || f.fecha.value < p.fecha) return 'La fecha no puede ser anterior al préstamo';
      if (f.fecha.value > hoy()) return 'La fecha no puede ser futura';
      if (tipo === 'descuento') {
        const rr = calc(p, f.fecha.value);
        const max = Calc.r2(rr.reditoAtrasado + rr.reditoActualPendiente);
        if (monto > max) return `A esa fecha solo hay ${dinero(max)} de rédito pendiente`;
      }
      db.movimientos.push({ id: nuevoId(), prestamoId, tipo, fecha: f.fecha.value, monto, nota: f.nota.value.trim(), creado: Date.now() });
      guardar();
      rutear();
      aviso(textos.titulo + ': listo');
    }, null, textos.boton);
  }

  acciones.nuevoCapital = (id) => formMovimiento(id, 'capital');
  acciones.nuevaMora = (id) => formMovimiento(id, 'mora');
  acciones.nuevoDescuento = (id) => formMovimiento(id, 'descuento');

  acciones.borrarMovimiento = (id) => {
    const m = db.movimientos.find((x) => x.id === id);
    if (!confirm(`¿Borrar "${NOMBRE_MOV[m.tipo]}" de ${dinero(m.monto)} del ${fecha(m.fecha)}?`)) return;
    db.movimientos = db.movimientos.filter((x) => x.id !== id);
    guardar();
    rutear();
  };

  // ---------- Pagos ----------

  function formPago(p, pago) {
    const r = calc(p);
    const debe = Calc.r2(r.reditoAtrasado + r.reditoActualPendiente + r.moraPendiente);
    abrirModal(`
      <h2>${pago ? 'Editar pago' : 'Registrar pago'}</h2>
      <div class="suave" style="margin-bottom:12px">${esc(cliente(p.clienteId).nombre)} · préstamo de ${dinero(p.monto)} al ${pct(p.pct)} ${frec(p)}</div>
      <label>Monto pagado<input name="monto" type="number" inputmode="decimal" step="0.01" min="0.01" required value="${pago ? pago.monto : ''}"></label>
      ${pago ? '' : `<div class="botones" style="margin:-4px 0 12px">
        ${debe > 0 ? `<button type="button" class="btn chico" data-llenar="${debe}">${r.moraPendiente > 0 ? 'Rédito y mora' : 'Rédito pendiente'} ${dinero(debe)}</button>` : ''}
        <button type="button" class="btn chico" data-llenar="${Calc.r2(debe + r.capital)}">Saldar hoy ${dinero(debe + r.capital)}</button>
      </div>`}
      <label>Fecha<input name="fecha" type="date" required value="${pago ? pago.fecha : hoy()}" max="${hoy()}"></label>
      <div class="vista-previa" id="prev-pago"></div>
      <label>Nota (opcional)<input name="nota" value="${esc(pago ? pago.nota || '' : '')}"></label>
    `, (f) => {
      const monto = numero(f.monto.value);
      if (!(monto > 0)) return 'Escribe el monto pagado';
      if (!f.fecha.value) return 'Escoge la fecha';
      if (f.fecha.value < p.fecha) return 'La fecha del pago es anterior al préstamo';
      if (f.fecha.value > hoy()) return 'La fecha del pago no puede ser futura';
      let id;
      if (pago) {
        Object.assign(pago, { monto, fecha: f.fecha.value, nota: f.nota.value.trim() });
        id = pago.id;
      } else {
        id = nuevoId();
        db.pagos.push({ id, prestamoId: p.id, fecha: f.fecha.value, monto, nota: f.nota.value.trim(), creado: Date.now() });
      }
      guardar();
      rutear();
      if (pago) aviso('Pago actualizado');
      else setTimeout(() => mostrarRecibo(id, true), 0);
    }, (f) => {
      const prev = $('#prev-pago');
      const monto = numero(f.monto.value);
      if (!(monto > 0) || !f.fecha.value || f.fecha.value < p.fecha) {
        prev.innerHTML = `<span class="suave">Debe hoy: ${dinero(debe)} · Capital: ${dinero(r.capital)}</span>`;
        return;
      }
      const prueba = { id: '__prueba', prestamoId: p.id, fecha: f.fecha.value, monto, creado: pago ? pago.creado : Date.now() };
      const pagos = db.pagos.filter((x) => !pago || x.id !== pago.id).concat([prueba]);
      const rr = Calc.calcularPrestamo(p, pagos, hoy(), db.movimientos);
      const d = rr.detalle.find((x) => x.pago.id === '__prueba');
      prev.innerHTML = `
        ${d.aMora > 0 ? `<div class="fila"><span>A mora</span><span>${dinero(d.aMora)}</span></div>` : ''}
        <div class="fila"><span>A rédito</span><span>${dinero(d.aRedito)}</span></div>
        <div class="fila"><span>A capital</span><span>${dinero(d.aCapital)}</span></div>
        ${d.sobrante > 0 ? `<div class="fila rojo"><span>Sobra (paga más de lo que debe)</span><span>${dinero(d.sobrante)}</span></div>` : ''}
        <div class="fila total"><span>Capital después</span><span>${dinero(d.capitalDespues)}</span></div>`;
    });
    $('#modal-form').querySelectorAll('[data-llenar]').forEach((b) =>
      b.addEventListener('click', () => {
        const f = $('#modal-form');
        f.monto.value = b.dataset.llenar;
        f.monto.dispatchEvent(new Event('input', { bubbles: true }));
      })
    );
  }

  acciones.nuevoPago = (prestamoId) => formPago(prestamo(prestamoId));
  acciones.editarPago = (id) => {
    const pg = db.pagos.find((x) => x.id === id);
    formPago(prestamo(pg.prestamoId), pg);
  };

  acciones.borrarPago = (id) => {
    const pg = db.pagos.find((x) => x.id === id);
    if (!confirm(`¿Borrar el pago de ${dinero(pg.monto)} del ${fecha(pg.fecha)}?`)) return;
    db.pagos = db.pagos.filter((x) => x.id !== id);
    guardar();
    rutear();
    aviso('Pago borrado');
  };

  // ---------- Recibo de pago ----------

  function textoRecibo(pagoId) {
    const pg = db.pagos.find((x) => x.id === pagoId);
    const p = prestamo(pg.prestamoId);
    const c = cliente(p.clienteId);
    // Estado justo después de este pago (incluye los pagos del mismo día registrados antes)
    const r = calc(p, pg.fecha);
    const d = r.detalle.find((x) => x.pago.id === pagoId);
    const lineas = [];
    if (db.ajustes.negocio) lineas.push(`*${db.ajustes.negocio}*`);
    lineas.push('*RECIBO DE PAGO*');
    lineas.push(`Cliente: ${c.nombre}`);
    lineas.push(`Fecha: ${fecha(pg.fecha)}`);
    lineas.push(`Préstamo de ${dinero(p.monto)} (${pct(p.pct)} ${frec(p)})`);
    lineas.push('');
    lineas.push(`*Monto pagado: ${dinero(pg.monto)}*`);
    if (d.aMora > 0) lineas.push(`- A mora: ${dinero(d.aMora)}`);
    lineas.push(`- A rédito: ${dinero(d.aRedito)}`);
    lineas.push(`- A capital: ${dinero(d.aCapital)}`);
    lineas.push('');
    lineas.push(`Capital pendiente: ${dinero(d.capitalDespues)}`);
    const pendiente = Calc.r2(r.reditoAtrasado + r.moraPendiente);
    if (pendiente > 0) lineas.push(`Queda pendiente (rédito vencido${r.moraPendiente > 0 ? ' y mora' : ''}): ${dinero(pendiente)}`);
    if (r.saldado) lineas.push('✅ Préstamo saldado');
    else if (r.reditoActualPendiente > 0) lineas.push(`Próximo corte ${fecha(r.actual.corte)}: rédito ${dinero(r.reditoActualPendiente)}`);
    else lineas.push(`Rédito del corte ${fecha(r.actual.corte)} ya pagado`);
    if (pg.nota) lineas.push(`Nota: ${pg.nota}`);
    lineas.push('');
    lineas.push('Gracias por su pago.');
    return lineas.join('\n');
  }

  function mostrarRecibo(pagoId, recien) {
    const pg = db.pagos.find((x) => x.id === pagoId);
    const c = cliente(prestamo(pg.prestamoId).clienteId);
    const texto = textoRecibo(pagoId);
    mostrarTexto(recien ? 'Pago registrado' : 'Recibo de pago', texto, c.telefono);
  }
  acciones.verRecibo = (id) => mostrarRecibo(id, false);

  // Modal con un texto listo para enviar por WhatsApp, copiar o compartir.
  function mostrarTexto(titulo, texto, telefono) {
    mostrarTexto.texto = texto;
    abrirModal(`
      <h2>${titulo}</h2>
      <pre class="mensaje" id="mensaje">${esc(texto)}</pre>
      <div class="botones">
        <a class="btn whatsapp" href="${enlaceWhatsApp(telefono, texto)}" target="_blank" rel="noopener">Enviar por WhatsApp</a>
        <button type="button" class="btn" data-accion="copiarTexto">Copiar</button>
        ${navigator.share || esAndroid ? '<button type="button" class="btn" data-accion="compartirTexto">Compartir</button>' : ''}
      </div>
    `, null, null, 'Cerrar');
  }

  acciones.copiarTexto = async () => {
    try {
      await navigator.clipboard.writeText(mostrarTexto.texto);
      aviso('Copiado');
    } catch (e) {
      const sel = window.getSelection();
      const rango = document.createRange();
      rango.selectNodeContents($('#mensaje'));
      sel.removeAllRanges();
      sel.addRange(rango);
      aviso('Selecciona y copia el texto');
    }
  };

  acciones.compartirTexto = async () => {
    try {
      if (esAndroid) return await nativo('Share', 'share', { text: mostrarTexto.texto });
      await navigator.share({ text: mostrarTexto.texto });
    } catch (e) { /* cancelado */ }
  };

  // ---------- Estado de cuenta ----------

  function cortesCliente(clienteId) {
    // Todos los cortes de sus préstamos (quincenales y mensuales) hasta el próximo de cada uno
    const h = hoy();
    const todos = new Set();
    for (const p of prestamosDe(clienteId)) {
      for (const c of Calc.cortesDe(p, Calc.siguienteCorteDe(p, h))) todos.add(c);
    }
    return [...todos].sort().reverse();
  }

  function corteCercano(cortes) {
    const t = Date.parse(hoy());
    let mejor = cortes[0];
    for (const c of cortes) if (Math.abs(Date.parse(c) - t) < Math.abs(Date.parse(mejor) - t)) mejor = c;
    return mejor;
  }

  function textoEstado(clienteId, corte) {
    const c = cliente(clienteId);
    const lineas = [];
    if (db.ajustes.negocio) lineas.push(`*${db.ajustes.negocio}*`);
    lineas.push('*ESTADO DE CUENTA*');
    lineas.push('Cliente: ' + c.nombre);
    lineas.push('Corte: ' + fecha(corte));
    let totalPagar = 0, totalCapital = 0;
    const incluidos = [];
    const prestamos = prestamosDe(clienteId).filter((p) => p.fecha < corte).reverse();

    for (const p of prestamos) {
      const r = Calc.calcularPrestamo(p, db.pagos, corte, db.movimientos);
      const per = r.periodos.find((x) => x.corte === corte);
      // Se omite si ese día no es corte de este préstamo o si ya estaba saldado antes
      if (!per) continue;
      const pagosPeriodo = r.detalle.filter((d) => d.pago.fecha > per.inicio && d.pago.fecha <= corte);
      if (r.saldado && !pagosPeriodo.length && per.base <= 0) continue;
      incluidos.push(p);
      const atrasadoPrevio = Calc.r2(r.periodos.filter((x) => x !== per).reduce((s, x) => s + Math.max(0, Calc.pendiente(x)), 0));
      const aPagar = Calc.r2(atrasadoPrevio + Math.max(0, Calc.pendiente(per)) + r.moraPendiente);
      totalPagar += aPagar;
      totalCapital += r.capital;
      const adicional = db.movimientos.filter((m) => m.prestamoId === p.id && m.tipo === 'capital' && m.fecha > per.inicio && m.fecha <= corte);

      lineas.push('');
      lineas.push(`*Préstamo de ${dinero(p.monto)}* (${pct(p.pct)} ${frec(p)}, desde ${fecha(p.fecha)})`);
      for (const m of adicional) lineas.push(`Préstamo adicional ${fecha(m.fecha)}: ${dinero(m.monto)}`);
      lineas.push(`Rédito de ${estePeriodo(p)}: ${dinero(per.redito)}`);
      if (per.pagado > 0) lineas.push(`Rédito pagado: ${dinero(per.pagado)}`);
      if (per.descontado > 0) lineas.push(`Rédito perdonado: ${dinero(per.descontado)}`);
      if (atrasadoPrevio > 0) lineas.push(`Rédito atrasado: ${dinero(atrasadoPrevio)}`);
      if (r.moraPendiente > 0) lineas.push(`Mora: ${dinero(r.moraPendiente)}`);
      if (pagosPeriodo.length) {
        lineas.push(`Pagos ${delPeriodo(p)}:`);
        for (const d of pagosPeriodo) lineas.push(`- ${fecha(d.pago.fecha)}: ${dinero(d.pago.monto)} (${reparto(d, true)})`);
      }
      lineas.push(`Capital pendiente: ${dinero(r.capital)}`);
      if (r.saldado) lineas.push('✅ Préstamo saldado');
      else lineas.push(aPagar > 0 ? `*Pendiente por pagar: ${dinero(aPagar)}*` : '✅ Rédito al día');
    }

    if (!incluidos.length) return null;
    if (incluidos.length > 1) {
      lineas.push('');
      lineas.push(`*Total capital pendiente: ${dinero(totalCapital)}*`);
      lineas.push(`*Total pendiente por pagar: ${dinero(totalPagar)}*`);
    }
    // Próximos cortes de los préstamos incluidos, agrupados por fecha
    const proximos = {};
    for (const p of incluidos) {
      const r = Calc.calcularPrestamo(p, db.pagos, corte, db.movimientos);
      if (!r.saldado) proximos[r.actual.corte] = (proximos[r.actual.corte] || 0) + r.actual.redito;
    }
    const fechas = Object.keys(proximos).sort();
    if (fechas.length) lineas.push('');
    for (const f of fechas) lineas.push(`Próximo corte ${fecha(f)}: rédito ${dinero(proximos[f])}`);
    return lineas.join('\n');
  }

  function vistaEstado(clienteId) {
    const c = cliente(clienteId);
    const cortes = cortesCliente(clienteId);
    if (!cortes.length) {
      poner('Estado de cuenta', `<div class="vacio">Este cliente no tiene préstamos.</div>`, { atras: true, tab: 'clientes' });
      return;
    }
    const elegido = vistaEstado.corte && cortes.includes(vistaEstado.corte) ? vistaEstado.corte : corteCercano(cortes);
    const h = hoy();
    const opciones = cortes.map((x) => `<option value="${x}" ${x === elegido ? 'selected' : ''}>${fecha(x)}${x > h ? ' (próximo)' : x === h ? ' (hoy)' : ''}</option>`).join('');
    const texto = textoEstado(clienteId, elegido);
    const tel = telefonoWhatsApp(c.telefono);
    mostrarTexto.texto = texto;

    let html = `<label>Corte<select id="sel-corte">${opciones}</select></label>`;
    if (elegido > h) html += `<p class="suave">Este corte todavía no ha llegado: el estado muestra lo que tocará pagar con los pagos registrados hasta hoy.</p>`;
    if (!texto) {
      html += `<div class="vacio">No hay préstamos activos en ese corte.</div>`;
    } else {
      html += `<pre class="mensaje" id="mensaje">${esc(texto)}</pre>
      <div class="botones">
        <a class="btn whatsapp" href="${enlaceWhatsApp(c.telefono, texto)}" target="_blank" rel="noopener">Enviar por WhatsApp</a>
        <button class="btn" data-accion="copiarTexto">Copiar</button>
        ${navigator.share || esAndroid ? '<button class="btn" data-accion="compartirTexto">Compartir</button>' : ''}
      </div>
      ${tel ? '' : '<p class="suave">El cliente no tiene teléfono guardado: WhatsApp te pedirá escoger el contacto.</p>'}
      ${tel && !db.ajustes.codigoPais && tel.length <= 10 ? '<p class="suave rojo">El teléfono no tiene código de país y WhatsApp lo necesita. Ponlo en <a href="#/ajustes">Ajustes</a>.</p>' : ''}`;
    }
    poner('Estado de ' + c.nombre, html, { atras: true, tab: 'clientes' });
    $('#sel-corte').addEventListener('change', (e) => {
      vistaEstado.corte = e.target.value;
      vistaEstado(clienteId);
    });
  }

  // ---------- Ganancias por mes ----------

  function datosReporte() {
    const meses = {};
    const mes = (ym) => (meses[ym] = meses[ym] || { prestado: 0, redito: 0, mora: 0, capital: 0 });
    const h = hoy();
    for (const p of db.prestamos) {
      mes(p.fecha.slice(0, 7)).prestado += Number(p.monto);
      for (const d of calc(p, h).detalle) {
        const m = mes(d.pago.fecha.slice(0, 7));
        m.redito += d.aRedito;
        m.mora += d.aMora;
        m.capital += d.aCapital;
      }
    }
    for (const mv of db.movimientos) if (mv.tipo === 'capital') mes(mv.fecha.slice(0, 7)).prestado += Number(mv.monto);
    return Object.keys(meses).sort().reverse().map((ym) => {
      const m = meses[ym];
      for (const k in m) m[k] = Calc.r2(m[k]);
      return Object.assign({ ym, ganancia: Calc.r2(m.redito + m.mora) }, m);
    });
  }

  function vistaReporte() {
    const filas = datosReporte();
    if (!filas.length) {
      poner('Ganancias por mes', `<div class="vacio">Todavía no hay préstamos ni pagos.</div>`, { atras: true, tab: 'resumen' });
      return;
    }
    const total = filas.reduce((t, f) => {
      for (const k of ['prestado', 'redito', 'mora', 'capital', 'ganancia']) t[k] = Calc.r2((t[k] || 0) + f[k]);
      return t;
    }, {});
    let html = `<div class="cifras">
        <div class="cifra ancha"><div class="et">Ganancia total (rédito + mora cobrados)</div><div class="val">${dinero(total.ganancia)}</div></div>
        <div class="cifra"><div class="et">Capital recuperado</div><div class="val">${dinero(total.capital)}</div></div>
        <div class="cifra"><div class="et">Total prestado</div><div class="val">${dinero(total.prestado)}</div></div>
      </div>
      <div class="botones">
        <button class="btn primario" data-accion="excelMeses">Exportar a Excel</button>
        <button class="btn" data-accion="excelPagos">Exportar todos los pagos</button>
      </div>
      <h2 class="seccion">Por mes</h2>`;
    for (const f of filas) {
      html += `<div class="tarjeta">
        <h3>${nombreMes(f.ym)}</h3>
        <div class="fila"><span class="suave">Rédito cobrado</span><span>${dinero(f.redito)}</span></div>
        ${f.mora > 0 ? `<div class="fila"><span class="suave">Mora cobrada</span><span>${dinero(f.mora)}</span></div>` : ''}
        <div class="fila total"><span>Ganancia</span><span>${dinero(f.ganancia)}</span></div>
        <div class="fila"><span class="suave">Capital recuperado</span><span>${dinero(f.capital)}</span></div>
        <div class="fila"><span class="suave">Prestado</span><span>${dinero(f.prestado)}</span></div>
      </div>`;
    }
    poner('Ganancias por mes', html, { atras: true, tab: 'resumen' });
  }

  acciones.excelMeses = async () => {
    const filas = [['Mes', 'Rédito cobrado', 'Mora cobrada', 'Ganancia', 'Capital recuperado', 'Prestado']];
    for (const f of datosReporte()) filas.push([nombreMes(f.ym), f.redito, f.mora, f.ganancia, f.capital, f.prestado]);
    if (await guardarArchivo(`ganancias-por-mes-${hoy()}.csv`, csv(filas), 'text/csv', 'Ganancias por mes')) aviso('Archivo listo');
  };

  acciones.excelPagos = async () => {
    const filas = [['Fecha', 'Cliente', 'Préstamo', 'Frecuencia', 'Monto pagado', 'A mora', 'A rédito', 'A capital', 'Capital después', 'Nota']];
    const todos = [];
    for (const p of db.prestamos) {
      const c = cliente(p.clienteId);
      for (const d of calc(p).detalle) todos.push([d.pago.fecha, c ? c.nombre : '', Number(p.monto), frec(p), d.pago.monto, d.aMora, d.aRedito, d.aCapital, d.capitalDespues, d.pago.nota || '']);
    }
    todos.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    for (const t of todos) t[0] = fecha(t[0]);
    if (await guardarArchivo(`pagos-${hoy()}.csv`, csv(filas.concat(todos)), 'text/csv', 'Pagos')) aviso('Archivo listo');
  };

  // ---------- Ajustes y respaldo ----------

  function vistaAjustes() {
    const a = db.ajustes;
    const html = `
      <div class="tarjeta">
        <h3>Preferencias</h3>
        <label>Nombre del negocio (sale en recibos y estados de cuenta)<input id="aj-negocio" value="${esc(a.negocio)}" placeholder="Opcional"></label>
        <label>Símbolo de moneda<input id="aj-moneda" value="${esc(a.moneda)}" maxlength="5"></label>
        <label>Código de país para WhatsApp (sin +)
          <input id="aj-codigo" inputmode="numeric" value="${esc(a.codigoPais)}" placeholder="Ej: 1 para Rep. Dominicana, 52 México, 57 Colombia">
        </label>
        <p class="suave">Se agrega delante de los teléfonos que no lo tengan. Si escribes el teléfono con + al inicio, se usa tal cual.</p>
        <label>Formato de números
          <select id="aj-formato">
            <option value="punto" ${a.formato !== 'coma' ? 'selected' : ''}>1,234.56</option>
            <option value="coma" ${a.formato === 'coma' ? 'selected' : ''}>1.234,56</option>
          </select>
        </label>
        <label>Días de gracia antes de marcar en mora<input id="aj-gracia" type="number" inputmode="numeric" min="0" max="60" value="${diasGracia()}"></label>
        <button class="btn primario" data-accion="guardarAjustes">Guardar</button>
      </div>

      <div class="tarjeta">
        <h3>Respaldo</h3>
        <p class="suave">Los datos se guardan solo en este dispositivo. Exporta un respaldo con frecuencia y guárdalo en Drive, WhatsApp o tu correo.</p>
        <p class="suave">Último respaldo: ${a.ultimoRespaldo ? fecha(a.ultimoRespaldo) : 'nunca'}</p>
        <div class="botones">
          <button class="btn primario" data-accion="exportar">Exportar respaldo</button>
          <button class="btn" data-accion="importar">Importar respaldo</button>
        </div>
        <input type="file" id="archivo" accept=".json,application/json" hidden>
        <p class="suave">${db.clientes.length} clientes · ${db.prestamos.length} préstamos · ${db.pagos.length} pagos</p>
      </div>

      <div class="tarjeta">
        <h3>PIN de entrada</h3>
        <p class="suave">${a.pinHash ? 'La app pide PIN al abrirla y después de 2 minutos sin usarla.' : 'Sin PIN: cualquiera que abra la app ve tus datos.'}</p>
        <p class="suave">El PIN evita que alguien que agarre el equipo vea tus cuentas. Si lo olvidas no se puede recuperar: tendrías que reinstalar la app e importar tu respaldo.</p>
        <div class="botones">
          <button class="btn primario" data-accion="ponerPin">${a.pinHash ? 'Cambiar PIN' : 'Poner PIN'}</button>
          ${a.pinHash ? '<button class="btn peligro" data-accion="quitarPin">Quitar PIN</button>' : ''}
        </div>
      </div>

      <div class="tarjeta">
        <h3>Cómo se calcula</h3>
        <p class="suave">Quincenales: los cortes son el 15 y el 30 de cada mes (en febrero, el último día). Mensuales: un corte al mes, el día de cobro que escojas (si el mes no tiene ese día, el último del mes).</p>
        <p class="suave">En cada corte se cobra el rédito: capital pendiente al inicio del período × porcentaje del préstamo. El primer período va desde la fecha del préstamo hasta el primer corte y se cobra completo.</p>
        <p class="suave">Cada pago cubre primero la mora, luego el rédito atrasado, luego el del período en curso, y lo que sobre se descuenta del capital. Los abonos a capital y el dinero adicional prestado cambian el rédito desde el período siguiente.</p>
      </div>

      <div class="tarjeta">
        <h3>Zona peligrosa</h3>
        <button class="btn peligro" data-accion="borrarTodo">Borrar todos los datos</button>
      </div>`;
    poner('Ajustes', html, { tab: 'ajustes' });
    $('#archivo').addEventListener('change', importarArchivo);
  }

  acciones.guardarAjustes = () => {
    db.ajustes.negocio = $('#aj-negocio').value.trim();
    db.ajustes.moneda = $('#aj-moneda').value.trim() || '$';
    db.ajustes.codigoPais = $('#aj-codigo').value.replace(/\D/g, '');
    db.ajustes.formato = $('#aj-formato').value;
    const g = parseInt($('#aj-gracia').value, 10);
    db.ajustes.diasGracia = g >= 0 ? g : 5;
    guardar();
    aviso('Ajustes guardados');
  };

  acciones.exportar = async () => {
    const ok = await guardarArchivo(`respaldo-prestamos-${hoy()}.json`, JSON.stringify(db, null, 2), 'application/json', 'Guardar respaldo');
    if (!ok) return;
    db.ajustes.ultimoRespaldo = hoy();
    guardar();
    aviso('Respaldo listo');
    rutear();
  };

  acciones.importar = () => $('#archivo').click();

  function importarArchivo(e) {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const lector = new FileReader();
    lector.onload = () => {
      try {
        const nuevo = normalizar(JSON.parse(lector.result));
        const resumen = `${nuevo.clientes.length} clientes, ${nuevo.prestamos.length} préstamos y ${nuevo.pagos.length} pagos`;
        if (!confirm(`El respaldo tiene ${resumen}.\n\nSe reemplazarán TODOS los datos actuales. ¿Continuar?`)) return;
        // El PIN de este equipo se conserva; el del respaldo no se trae.
        nuevo.ajustes.pinHash = db.ajustes.pinHash;
        nuevo.ajustes.pinSal = db.ajustes.pinSal;
        db = nuevo;
        guardar();
        aviso('Respaldo importado');
        vistaAjustes();
      } catch (err) {
        alert('No se pudo importar: ' + err.message);
      }
    };
    lector.readAsText(f);
  }

  acciones.borrarTodo = () => {
    if (!confirm('¿Borrar TODOS los clientes, préstamos y pagos de este dispositivo?')) return;
    if (!confirm('Última confirmación: esto no se puede deshacer. ¿Exportaste un respaldo?')) return;
    db = datosVacios();
    guardar();
    vistaAjustes();
    aviso('Datos borrados');
  };

  // ---------- PIN ----------

  async function hashPin(pin, sal) {
    const datos = new TextEncoder().encode(sal + ':' + pin);
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', datos);
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    // Sin crypto.subtle (raro): hash simple, suficiente para un PIN local
    let h = 5381;
    for (const b of datos) h = ((h << 5) + h + b) >>> 0;
    return 'd' + h.toString(16);
  }

  acciones.ponerPin = () => {
    abrirModal(`
      <h2>${db.ajustes.pinHash ? 'Cambiar PIN' : 'Poner PIN'}</h2>
      <label>PIN nuevo (4 a 8 números)<input name="pin1" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="new-password"></label>
      <label>Repite el PIN<input name="pin2" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="new-password"></label>
    `, (f) => {
      const pin = f.pin1.value;
      if (!/^\d{4,8}$/.test(pin)) return 'El PIN debe tener de 4 a 8 números';
      if (pin !== f.pin2.value) return 'Los dos PIN no coinciden';
      const sal = nuevoId();
      hashPin(pin, sal).then((h) => {
        db.ajustes.pinHash = h;
        db.ajustes.pinSal = sal;
        guardar();
        aviso('PIN guardado');
        rutear();
      });
    });
  };

  acciones.quitarPin = () => {
    if (!confirm('¿Quitar el PIN? La app abrirá sin pedir código.')) return;
    db.ajustes.pinHash = '';
    db.ajustes.pinSal = '';
    guardar();
    rutear();
    aviso('PIN quitado');
  };

  const bloqueo = $('#bloqueo');
  let ocultoDesde = 0;

  function bloquear() {
    if (!db.ajustes.pinHash) return;
    if ($('#modal').open) $('#modal').close();
    bloqueo.hidden = false;
    $('#pin-error').hidden = true;
    $('#pin-entrada').value = '';
    setTimeout(() => $('#pin-entrada').focus(), 50);
  }

  $('#form-pin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const h = await hashPin($('#pin-entrada').value, db.ajustes.pinSal);
    if (h === db.ajustes.pinHash) {
      bloqueo.hidden = true;
      rutear();
    } else {
      $('#pin-error').hidden = false;
      $('#pin-entrada').value = '';
    }
  });

  $('#pin-olvido').addEventListener('click', () => {
    alert('El PIN no se puede recuperar.\n\nPara volver a entrar: desinstala la app (o borra los datos del sitio en el navegador), vuelve a instalarla e importa tu último respaldo.');
  });

  // Se vuelve a pedir el PIN si la app estuvo en segundo plano más de 2 minutos.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) ocultoDesde = Date.now();
    else if (ocultoDesde && Date.now() - ocultoDesde > 2 * 60 * 1000) bloquear();
  });

  // ---------- Modal ----------

  // alGuardar = null: el modal solo muestra información y tiene un botón para cerrar.
  function abrirModal(contenido, alGuardar, alCambiar, textoBoton) {
    const dlg = $('#modal');
    const f = $('#modal-form');
    f.innerHTML = contenido + `
      <p class="rojo" id="modal-error" hidden></p>
      <div class="botones" style="justify-content:flex-end">
        ${alGuardar ? '<button type="button" class="btn" id="modal-cancelar">Cancelar</button>' : ''}
        <button type="submit" class="btn ${alGuardar ? 'primario' : ''}" value="ok">${textoBoton || 'Guardar'}</button>
      </div>`;
    f.onsubmit = (e) => {
      e.preventDefault();
      const error = alGuardar ? alGuardar(f) : null;
      if (typeof error === 'string') {
        const el = $('#modal-error');
        el.textContent = error;
        el.hidden = false;
        return;
      }
      dlg.close();
    };
    f.oninput = alCambiar ? () => alCambiar(f) : null;
    const cancelar = $('#modal-cancelar');
    if (cancelar) cancelar.onclick = () => dlg.close();
    if (alCambiar) alCambiar(f);
    if (!dlg.open) dlg.showModal();
    const primero = f.querySelector('input');
    if (primero && !primero.value) primero.focus();
  }

  // ---------- Inicio ----------

  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !esAndroid) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e));
  }
  if (db.ajustes.pinHash) bloquear();
  else rutear();
})();
