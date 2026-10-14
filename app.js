(function () {
  'use strict';

  const CLAVE = 'prestamos-datos-v1';
  const $ = (sel, el = document) => el.querySelector(sel);

  // ---------- Datos ----------

  function datosVacios() {
    return { version: 1, ajustes: { moneda: '$', codigoPais: '', formato: 'punto' }, clientes: [], prestamos: [], pagos: [] };
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

  function normalizar(d) {
    const base = datosVacios();
    if (!d || typeof d !== 'object') throw new Error('Archivo no válido');
    if (!Array.isArray(d.clientes) || !Array.isArray(d.prestamos) || !Array.isArray(d.pagos)) {
      throw new Error('El archivo no tiene el formato de respaldo de esta app');
    }
    return {
      version: 1,
      ajustes: Object.assign(base.ajustes, d.ajustes || {}),
      clientes: d.clientes,
      prestamos: d.prestamos,
      pagos: d.pagos,
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

  // Palabras según la frecuencia del préstamo
  const frec = (p) => (Calc.esMensual(p) ? 'mensual' : 'quincenal');
  const delPeriodo = (p) => (Calc.esMensual(p) ? 'del mes' : 'de la quincena');
  const estePeriodo = (p) => (Calc.esMensual(p) ? 'este mes' : 'esta quincena');

  const calc = (p, hasta) => Calc.calcularPrestamo(p, db.pagos, hasta || hoy());

  function resumenCliente(clienteId) {
    let capital = 0, atrasado = 0, enCurso = 0, activos = 0;
    for (const p of prestamosDe(clienteId)) {
      const r = calc(p);
      capital += r.capital;
      atrasado += r.reditoAtrasado;
      enCurso += r.reditoActualPendiente;
      if (!r.saldado) activos++;
    }
    return { capital: Calc.r2(capital), atrasado: Calc.r2(atrasado), enCurso: Calc.r2(enCurso), activos };
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
    const partes = (location.hash.replace(/^#\/?/, '') || '').split('/');
    const [ruta, id] = partes;
    if (ruta === 'clientes') return vistaClientes();
    if (ruta === 'c' && cliente(id)) return vistaCliente(id);
    if (ruta === 'p' && prestamo(id)) return vistaPrestamo(id);
    if (ruta === 'estado' && cliente(id)) return vistaEstado(id);
    if (ruta === 'ajustes') return vistaAjustes();
    return vistaResumen();
  }
  window.addEventListener('hashchange', rutear);

  // Acciones con data-accion en cualquier botón
  const acciones = {};
  vista.addEventListener('click', (e) => {
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    e.preventDefault();
    const fn = acciones[b.dataset.accion];
    if (fn) fn(b.dataset.id, b);
  });

  // ---------- Resumen ----------

  function vistaResumen() {
    const h = hoy();
    let prestado = 0, capital = 0, atrasado = 0, enCurso = 0, reditoCobrado = 0, activos = 0;
    const morosos = [];
    const proximos = [];
    for (const p of db.prestamos) {
      const r = calc(p, h);
      prestado += Number(p.monto);
      capital += r.capital;
      atrasado += r.reditoAtrasado;
      enCurso += r.reditoActualPendiente;
      reditoCobrado += r.reditoPagado;
      if (!r.saldado) activos++;
      if (!r.saldado && r.reditoActualPendiente > 0) proximos.push({ p, r });
      if (r.reditoAtrasado > 0) morosos.push({ p, r });
    }
    let html = `
      <div class="cifras">
        <div class="cifra ancha">
          <div class="et">Rédito por cobrar</div>
          <div class="val">${dinero(atrasado + enCurso)}</div>
          <div class="suave">${atrasado > 0 ? `Vencido (cortes hasta hoy): ${dinero(atrasado)} · ` : ''}Próximos cortes: ${dinero(enCurso)}</div>
        </div>
        <div class="cifra"><div class="et">Capital pendiente</div><div class="val">${dinero(capital)}</div></div>
        <div class="cifra"><div class="et">Total prestado</div><div class="val">${dinero(prestado)}</div></div>
        <div class="cifra"><div class="et">Préstamos activos</div><div class="val">${activos}</div></div>
        <div class="cifra"><div class="et">Rédito cobrado</div><div class="val">${dinero(reditoCobrado)}</div></div>
      </div>`;

    if (morosos.length) {
      html += `<h2 class="seccion">Con rédito atrasado</h2><div class="tarjeta"><ul class="lista">`;
      morosos.sort((a, b) => b.r.reditoAtrasado - a.r.reditoAtrasado);
      for (const { p, r } of morosos) {
        const c = cliente(p.clienteId);
        html += `<li><a href="#/c/${p.clienteId}" style="color:inherit;text-decoration:none">
          <div class="fila"><span>${esc(c ? c.nombre : '—')}</span><span class="rojo">${dinero(r.reditoAtrasado)}</span></div>
          <div class="suave">Préstamo de ${dinero(p.monto)} · ${r.periodos.filter((x) => x.redito > x.pagado).length} corte(s) sin pagar completo</div>
        </a></li>`;
      }
      html += `</ul></div>`;
    }

    if (proximos.length) {
      proximos.sort((a, b) => (a.r.actual.corte < b.r.actual.corte ? -1 : a.r.actual.corte > b.r.actual.corte ? 1 : 0));
      html += `<h2 class="seccion">Próximos cobros</h2><div class="tarjeta"><ul class="lista">`;
      for (const { p, r } of proximos.slice(0, 15)) {
        const c = cliente(p.clienteId);
        html += `<li><a href="#/c/${p.clienteId}" style="color:inherit;text-decoration:none">
          <div class="fila"><span>${fecha(r.actual.corte)} · ${esc(c ? c.nombre : '—')}</span><span>${dinero(r.reditoActualPendiente)}</span></div>
          <div class="suave">Préstamo de ${dinero(p.monto)} · ${frec(p)}</div>
        </a></li>`;
      }
      html += `</ul>${proximos.length > 15 ? `<p class="suave">Y ${proximos.length - 15} más…</p>` : ''}</div>`;
    }

    if (!db.clientes.length) {
      html += `<div class="vacio">Todavía no hay clientes.<br><br><a class="btn primario" href="#/clientes">Agregar el primero</a></div>`;
    }
    poner('Resumen', html, { tab: 'resumen' });
  }

  // ---------- Clientes ----------

  function vistaClientes() {
    const filtro = (vistaClientes.filtro || '').toLowerCase();
    const lista = db.clientes
      .filter((c) => !filtro || c.nombre.toLowerCase().includes(filtro) || (c.telefono || '').includes(filtro))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

    let html = `<input class="buscar" type="search" id="buscar" placeholder="Buscar cliente" value="${esc(vistaClientes.filtro || '')}">`;
    if (!db.clientes.length) {
      html += `<div class="vacio">No hay clientes registrados.</div>`;
    }
    for (const c of lista) {
      const r = resumenCliente(c.id);
      let estado = '';
      if (r.atrasado > 0) estado = `<span class="etiqueta mal">Atrasado</span>`;
      else if (r.activos === 0 && prestamosDe(c.id).length) estado = `<span class="etiqueta ok">Saldado</span>`;
      else if (!prestamosDe(c.id).length) estado = `<span class="etiqueta pend">Sin préstamo</span>`;
      html += `<a class="tarjeta" href="#/c/${c.id}">
        <h3>${esc(c.nombre)} ${estado}</h3>
        <div class="fila"><span class="suave">Capital pendiente</span><span>${dinero(r.capital)}</span></div>
        <div class="fila"><span class="suave">Rédito por cobrar</span><span>${dinero(r.atrasado + r.enCurso)}</span></div>
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

  function formCliente(c) {
    abrirModal(`
      <h2>${c ? 'Editar cliente' : 'Nuevo cliente'}</h2>
      <label>Nombre<input name="nombre" required autocomplete="off" value="${esc(c ? c.nombre : '')}"></label>
      <label>Teléfono (WhatsApp)<input name="telefono" type="tel" inputmode="tel" value="${esc(c ? c.telefono : '')}" placeholder="Ej: 8095551234"></label>
      <label>Nota (opcional)<input name="nota" value="${esc(c ? c.nota || '' : '')}"></label>
    `, (f) => {
      const nombre = f.nombre.value.trim();
      if (!nombre) return 'Escribe el nombre';
      if (c) {
        c.nombre = nombre;
        c.telefono = f.telefono.value.trim();
        c.nota = f.nota.value.trim();
        guardar();
        rutear();
      } else {
        const nuevo = { id: nuevoId(), nombre, telefono: f.telefono.value.trim(), nota: f.nota.value.trim(), creado: Date.now() };
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
    db.prestamos = db.prestamos.filter((p) => p.clienteId !== id);
    db.clientes = db.clientes.filter((x) => x.id !== id);
    guardar();
    location.hash = '#/clientes';
  };

  function vistaCliente(id) {
    const c = cliente(id);
    const prestamos = prestamosDe(id);
    const tel = telefonoWhatsApp(c.telefono);

    let html = `<div class="tarjeta">
      <div class="suave">${c.telefono ? esc(c.telefono) : 'Sin teléfono'}${c.nota ? ' · ' + esc(c.nota) : ''}</div>
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
        ${r.atrasado > 0 ? `<div class="cifra ancha" style="background:var(--rojo-claro)"><div class="et">Rédito atrasado</div><div class="val rojo">${dinero(r.atrasado)}</div></div>` : ''}
      </div>
      <a class="btn primario bloque" style="margin-top:12px" href="#/estado/${id}">Estado de cuenta para WhatsApp</a>`;
    }

    html += `<h2 class="seccion">Préstamos</h2>`;
    if (!prestamos.length) html += `<div class="vacio">Este cliente no tiene préstamos.</div>`;
    for (const p of prestamos) html += tarjetaPrestamo(p);
    html += `<button class="btn bloque" data-accion="nuevoPrestamo" data-id="${id}">+ Nuevo préstamo</button>`;

    // Historial de pagos de todos sus préstamos
    const filas = [];
    for (const p of prestamos) {
      for (const d of calc(p).detalle) filas.push({ d, p });
    }
    if (filas.length) {
      filas.sort((a, b) => (a.d.pago.fecha < b.d.pago.fecha ? 1 : a.d.pago.fecha > b.d.pago.fecha ? -1 : (b.d.pago.creado || 0) - (a.d.pago.creado || 0)));
      html += `<h2 class="seccion">Historial de pagos</h2><div class="tarjeta"><ul class="lista">`;
      for (const { d, p } of filas) html += filaPago(d, prestamos.length > 1 ? p : null);
      html += `</ul></div>`;
    }
    poner(c.nombre, html, { atras: true, tab: 'clientes' });
  }

  function tarjetaPrestamo(p) {
    const r = calc(p);
    const etiqueta = r.saldado
      ? '<span class="etiqueta ok">Saldado</span>'
      : r.reditoAtrasado > 0 ? '<span class="etiqueta mal">Atrasado</span>' : '<span class="etiqueta pend">Activo</span>';
    return `<div class="tarjeta">
      <h3>${dinero(p.monto)} al ${pct(p.pct)} ${frec(p)} ${etiqueta}</h3>
      <div class="suave" style="margin-bottom:6px">Desde ${fecha(p.fecha)}${Calc.esMensual(p) ? ` · cobra el día ${Calc.diaCobro(p)}` : ''}${p.nota ? ' · ' + esc(p.nota) : ''}</div>
      <div class="fila"><span class="suave">Capital pendiente</span><span>${dinero(r.capital)}</span></div>
      ${r.saldado ? '' : `<div class="fila"><span class="suave">Rédito ${delPeriodo(p)} (corte ${fecha(r.actual.corte)})</span><span>${dinero(r.reditoActualPendiente)}</span></div>`}
      ${r.reditoAtrasado > 0 ? `<div class="fila rojo"><span>Rédito atrasado</span><span>${dinero(r.reditoAtrasado)}</span></div>` : ''}
      <div class="botones">
        ${r.saldado ? '' : `<button class="btn primario" data-accion="nuevoPago" data-id="${p.id}">Registrar pago</button>`}
        <a class="btn" href="#/p/${p.id}">Detalle</a>
      </div>
    </div>`;
  }

  function filaPago(d, p) {
    return `<li>
      <div class="fila"><span>${fecha(d.pago.fecha)}</span><span>${dinero(d.pago.monto)}</span></div>
      <div class="suave">Rédito ${dinero(d.aRedito)} · Capital ${dinero(d.aCapital)}${d.sobrante > 0 ? ` · Sobrante ${dinero(d.sobrante)}` : ''}${p ? ` · Préstamo de ${dinero(p.monto)}` : ''}</div>
      ${d.pago.nota ? `<div class="suave">${esc(d.pago.nota)}</div>` : ''}
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
    if (!confirm(`¿Borrar el préstamo de ${dinero(p.monto)} y todos sus pagos? Esto no se puede deshacer.`)) return;
    db.pagos = db.pagos.filter((x) => x.prestamoId !== id);
    db.prestamos = db.prestamos.filter((x) => x.id !== id);
    guardar();
    location.hash = '#/c/' + p.clienteId;
  };

  function vistaPrestamo(id) {
    const p = prestamo(id);
    const c = cliente(p.clienteId);
    const r = calc(p);
    const paraSaldar = Calc.r2(r.capital + r.reditoAtrasado + r.reditoActualPendiente);

    let html = `<div class="tarjeta">
      <div class="fila"><span class="suave">Cliente</span><span><a href="#/c/${c.id}">${esc(c.nombre)}</a></span></div>
      <div class="fila"><span class="suave">Monto prestado</span><span>${dinero(p.monto)}</span></div>
      <div class="fila"><span class="suave">Fecha</span><span>${fecha(p.fecha)}</span></div>
      <div class="fila"><span class="suave">Rédito ${frec(p)}</span><span>${pct(p.pct)}</span></div>
      ${Calc.esMensual(p) ? `<div class="fila"><span class="suave">Día de cobro</span><span>${Calc.diaCobro(p)} de cada mes</span></div>` : ''}
      <div class="fila"><span class="suave">Capital pagado</span><span>${dinero(r.capitalPagado)}</span></div>
      <div class="fila"><span class="suave">Rédito pagado</span><span>${dinero(r.reditoPagado)}</span></div>
      <div class="fila total"><span>Capital pendiente</span><span>${dinero(r.capital)}</span></div>
      ${r.saldado ? '' : `
      <div class="fila"><span>Rédito ${delPeriodo(p)} (corte ${fecha(r.actual.corte)})</span><span>${dinero(r.reditoActualPendiente)}</span></div>
      ${r.reditoAtrasado > 0 ? `<div class="fila rojo"><span>Rédito atrasado</span><span>${dinero(r.reditoAtrasado)}</span></div>` : ''}
      <div class="fila total"><span>Para saldar hoy</span><span>${dinero(paraSaldar)}</span></div>`}
      <div class="botones">
        ${r.saldado ? '' : `<button class="btn primario" data-accion="nuevoPago" data-id="${id}">Registrar pago</button>`}
        <button class="btn" data-accion="editarPrestamo" data-id="${id}">Editar</button>
        <button class="btn peligro" data-accion="borrarPrestamo" data-id="${id}">Borrar</button>
      </div>
    </div>`;

    if (r.detalle.length) {
      html += `<h2 class="seccion">Pagos</h2><div class="tarjeta"><ul class="lista">`;
      for (const d of r.detalle.slice().reverse()) {
        html += filaPago(d).replace('</li>', `<div class="botones"><button class="btn chico peligro" data-accion="borrarPago" data-id="${d.pago.id}">Borrar pago</button></div></li>`);
      }
      html += `</ul></div>`;
    }

    const filas = r.periodos.concat(r.saldado ? [] : [r.actual]).reverse();
    if (filas.length) {
      html += `<h2 class="seccion">${Calc.esMensual(p) ? 'Meses' : 'Quincenas'}</h2><div class="tarjeta tabla-scroll"><table>
        <tr><th>Corte</th><th>Capital</th><th>Rédito</th><th>Pagado</th><th></th></tr>`;
      for (const q of filas) {
        const enCurso = q === r.actual;
        const est = q.pagado >= q.redito
          ? '<span class="etiqueta ok" title="Pagado">✓</span>'
          : enCurso ? '<span class="etiqueta pend" title="En curso">…</span>' : '<span class="etiqueta mal" title="Debe">!</span>';
        html += `<tr><td>${fecha(q.corte)}</td><td>${fmtNum.format(q.base)}</td><td>${fmtNum.format(q.redito)}</td><td>${fmtNum.format(q.pagado)}</td><td>${est}</td></tr>`;
      }
      html += `</table><p class="suave" style="margin:8px 0 0">✓ pagado · … en curso · ! debe</p></div>`;
    }
    poner('Préstamo de ' + c.nombre, html, { atras: true, tab: 'clientes' });
  }

  // ---------- Pagos ----------

  acciones.nuevoPago = (prestamoId) => {
    const p = prestamo(prestamoId);
    const r = calc(p);
    const sugerido = Calc.r2(r.reditoAtrasado + r.reditoActualPendiente);
    abrirModal(`
      <h2>Registrar pago</h2>
      <div class="suave" style="margin-bottom:12px">${esc(cliente(p.clienteId).nombre)} · préstamo de ${dinero(p.monto)} al ${pct(p.pct)}</div>
      <label>Monto pagado<input name="monto" type="number" inputmode="decimal" step="0.01" min="0.01" required></label>
      <div class="botones" style="margin:-4px 0 12px">
        ${sugerido > 0 ? `<button type="button" class="btn chico" data-llenar="${sugerido}">Rédito pendiente hoy ${dinero(sugerido)}</button>` : ''}
        <button type="button" class="btn chico" data-llenar="${Calc.r2(sugerido + r.capital)}">Saldar hoy ${dinero(sugerido + r.capital)}</button>
      </div>
      <label>Fecha<input name="fecha" type="date" required value="${hoy()}" max="${hoy()}"></label>
      <div class="vista-previa" id="prev-pago"></div>
      <label>Nota (opcional)<input name="nota"></label>
    `, (f) => {
      const monto = numero(f.monto.value);
      if (!(monto > 0)) return 'Escribe el monto pagado';
      if (!f.fecha.value) return 'Escoge la fecha';
      if (f.fecha.value < p.fecha) return 'La fecha del pago es anterior al préstamo';
      if (f.fecha.value > hoy()) return 'La fecha del pago no puede ser futura';
      db.pagos.push({ id: nuevoId(), prestamoId, fecha: f.fecha.value, monto, nota: f.nota.value.trim(), creado: Date.now() });
      guardar();
      rutear();
      aviso('Pago registrado');
    }, (f) => {
      const prev = $('#prev-pago');
      const monto = numero(f.monto.value);
      if (!(monto > 0) || !f.fecha.value || f.fecha.value < p.fecha) {
        prev.innerHTML = `<span class="suave">Pendiente de rédito: ${dinero(sugerido)} · Capital: ${dinero(r.capital)}</span>`;
        return;
      }
      const prueba = { id: '__prueba', prestamoId, fecha: f.fecha.value, monto, creado: Date.now() };
      const rr = Calc.calcularPrestamo(p, db.pagos.concat([prueba]), f.fecha.value > hoy() ? f.fecha.value : hoy());
      const d = rr.detalle.find((x) => x.pago.id === '__prueba');
      prev.innerHTML = `
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
  };

  acciones.borrarPago = (id) => {
    const pg = db.pagos.find((x) => x.id === id);
    if (!confirm(`¿Borrar el pago de ${dinero(pg.monto)} del ${fecha(pg.fecha)}?`)) return;
    db.pagos = db.pagos.filter((x) => x.id !== id);
    guardar();
    rutear();
    aviso('Pago borrado');
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
    lineas.push('*ESTADO DE CUENTA*');
    lineas.push('Cliente: ' + c.nombre);
    lineas.push('Corte: ' + fecha(corte));
    let totalPagar = 0, totalCapital = 0, n = 0;
    const incluidos = [];
    const prestamos = prestamosDe(clienteId).filter((p) => p.fecha < corte).reverse();

    for (const p of prestamos) {
      const r = Calc.calcularPrestamo(p, db.pagos, corte);
      const per = r.periodos.find((x) => x.corte === corte);
      const pagosPeriodo = per ? r.detalle.filter((d) => d.pago.fecha > per.inicio && d.pago.fecha <= corte) : [];
      // Se omite si ese día no es corte de este préstamo o si ya estaba saldado antes
      if (!per) continue;
      if (per && r.saldado && !pagosPeriodo.length && per.base <= 0) continue;
      n++;
      incluidos.push(p);
      const atrasadoPrevio = Calc.r2(r.periodos.filter((x) => x !== per).reduce((s, x) => s + Math.max(0, x.redito - x.pagado), 0));
      const aPagar = Calc.r2(atrasadoPrevio + Math.max(0, per.redito - per.pagado));
      totalPagar += aPagar;
      totalCapital += r.capital;

      lineas.push('');
      lineas.push(`*Préstamo de ${dinero(p.monto)}* (${pct(p.pct)} ${frec(p)}, desde ${fecha(p.fecha)})`);
      lineas.push(`Rédito de ${estePeriodo(p)}: ${dinero(per.redito)}`);
      if (per.pagado > 0) lineas.push(`Rédito pagado: ${dinero(per.pagado)}`);
      if (atrasadoPrevio > 0) lineas.push(`Rédito atrasado: ${dinero(atrasadoPrevio)}`);
      if (pagosPeriodo.length) {
        lineas.push(`Pagos ${delPeriodo(p)}:`);
        for (const d of pagosPeriodo) {
          lineas.push(`- ${fecha(d.pago.fecha)}: ${dinero(d.pago.monto)} (rédito ${dinero(d.aRedito)}, capital ${dinero(d.aCapital)})`);
        }
      }
      lineas.push(`Capital pendiente: ${dinero(r.capital)}`);
      if (r.saldado) lineas.push('✅ Préstamo saldado');
      else lineas.push(aPagar > 0 ? `*Pendiente por pagar: ${dinero(aPagar)}*` : '✅ Rédito al día');
    }

    if (!n) return null;
    if (n > 1) {
      lineas.push('');
      lineas.push(`*Total capital pendiente: ${dinero(totalCapital)}*`);
      lineas.push(`*Total pendiente por pagar: ${dinero(totalPagar)}*`);
    }
    // Próximos cortes de los préstamos incluidos, agrupados por fecha
    const proximos = {};
    for (const p of incluidos) {
      const r = Calc.calcularPrestamo(p, db.pagos, corte);
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

    let html = `<label>Corte<select id="sel-corte">${opciones}</select></label>`;
    if (elegido > h) html += `<p class="suave">Este corte todavía no ha llegado: el estado muestra lo que tocará pagar con los pagos registrados hasta hoy.</p>`;
    if (!texto) {
      html += `<div class="vacio">No hay préstamos activos en ese corte.</div>`;
    } else {
      html += `<pre class="mensaje" id="mensaje">${esc(texto)}</pre>
      <div class="botones">
        <a class="btn whatsapp" href="https://wa.me/${tel}?text=${encodeURIComponent(texto)}" target="_blank" rel="noopener">Enviar por WhatsApp</a>
        <button class="btn" data-accion="copiarEstado">Copiar</button>
        ${navigator.share || esAndroid ? '<button class="btn" data-accion="compartirEstado">Compartir</button>' : ''}
      </div>
      ${tel ? '' : '<p class="suave">El cliente no tiene teléfono guardado: WhatsApp te pedirá escoger el contacto.</p>'}
      ${tel && !db.ajustes.codigoPais && tel.length <= 10 ? '<p class="suave rojo">El teléfono no tiene código de país y WhatsApp lo necesita. Ponlo en <a href="#/ajustes">Ajustes</a>.</p>' : ''}`;
    }
    poner('Estado de ' + c.nombre, html, { atras: true, tab: 'clientes' });
    $('#sel-corte').addEventListener('change', (e) => {
      vistaEstado.corte = e.target.value;
      vistaEstado(clienteId);
    });
    vistaEstado.texto = texto;
  }

  acciones.copiarEstado = async () => {
    try {
      await navigator.clipboard.writeText(vistaEstado.texto);
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

  acciones.compartirEstado = async () => {
    try {
      if (esAndroid) return await nativo('Share', 'share', { text: vistaEstado.texto });
      await navigator.share({ text: vistaEstado.texto });
    } catch (e) { /* cancelado */ }
  };

  // ---------- Ajustes y respaldo ----------

  function vistaAjustes() {
    const html = `
      <div class="tarjeta">
        <h3>Preferencias</h3>
        <label>Símbolo de moneda<input id="aj-moneda" value="${esc(db.ajustes.moneda)}" maxlength="5"></label>
        <label>Código de país para WhatsApp (sin +)
          <input id="aj-codigo" inputmode="numeric" value="${esc(db.ajustes.codigoPais)}" placeholder="Ej: 1 para Rep. Dominicana, 52 México, 57 Colombia">
        </label>
        <label>Formato de números
          <select id="aj-formato">
            <option value="punto" ${db.ajustes.formato !== 'coma' ? 'selected' : ''}>1,234.56</option>
            <option value="coma" ${db.ajustes.formato === 'coma' ? 'selected' : ''}>1.234,56</option>
          </select>
        </label>
        <p class="suave">Se agrega delante de los teléfonos que no lo tengan. Si escribes el teléfono con + al inicio, se usa tal cual.</p>
        <button class="btn primario" data-accion="guardarAjustes">Guardar</button>
      </div>

      <div class="tarjeta">
        <h3>Respaldo</h3>
        <p class="suave">Los datos se guardan solo en este dispositivo y en este navegador. Exporta un respaldo con frecuencia y guárdalo en Drive, WhatsApp o tu correo.</p>
        <div class="botones">
          <button class="btn primario" data-accion="exportar">Exportar respaldo</button>
          <button class="btn" data-accion="importar">Importar respaldo</button>
        </div>
        <input type="file" id="archivo" accept=".json,application/json" hidden>
        <p class="suave">${db.clientes.length} clientes · ${db.prestamos.length} préstamos · ${db.pagos.length} pagos</p>
      </div>

      <div class="tarjeta">
        <h3>Cómo se calcula</h3>
        <p class="suave">Quincenales: los cortes son el 15 y el 30 de cada mes (en febrero, el último día). Mensuales: un corte al mes, el día de cobro que escojas (si el mes no tiene ese día, el último del mes).</p>
        <p class="suave">En cada corte se cobra el rédito: capital pendiente al inicio del período × porcentaje del préstamo. El primer período va desde la fecha del préstamo hasta el primer corte y se cobra completo.</p>
        <p class="suave">Cada pago cubre primero el rédito atrasado, luego el del período en curso, y lo que sobre se descuenta del capital. El abono a capital baja el rédito desde el período siguiente.</p>
      </div>

      <div class="tarjeta">
        <h3>Zona peligrosa</h3>
        <button class="btn peligro" data-accion="borrarTodo">Borrar todos los datos</button>
      </div>`;
    poner('Ajustes', html, { tab: 'ajustes' });
    $('#archivo').addEventListener('change', importarArchivo);
  }

  acciones.guardarAjustes = () => {
    db.ajustes.moneda = $('#aj-moneda').value.trim() || '$';
    db.ajustes.codigoPais = $('#aj-codigo').value.replace(/\D/g, '');
    db.ajustes.formato = $('#aj-formato').value;
    guardar();
    aviso('Ajustes guardados');
  };

  acciones.exportar = async () => {
    const txt = JSON.stringify(db, null, 2);
    const nombre = `respaldo-prestamos-${hoy()}.json`;
    if (esAndroid) {
      try {
        const { uri } = await nativo('Filesystem', 'writeFile', { path: nombre, data: txt, directory: 'CACHE', encoding: 'utf8' });
        await nativo('Share', 'share', { title: nombre, files: [uri], dialogTitle: 'Guardar respaldo' });
      } catch (e) {
        if (!/cancel/i.test(e.message || '')) alert('No se pudo exportar: ' + (e.message || e));
      }
      return;
    }
    const archivo = new File([txt], nombre, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [archivo] }) && confirm('¿Compartir el respaldo (Drive, WhatsApp, correo…)?\n\nCancelar = descargarlo como archivo.')) {
      try {
        await navigator.share({ files: [archivo], title: nombre });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
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
    aviso('Respaldo descargado');
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

  // ---------- Modal ----------

  function abrirModal(contenido, alGuardar, alCambiar) {
    const dlg = $('#modal');
    const f = $('#modal-form');
    f.innerHTML = contenido + `
      <p class="rojo" id="modal-error" hidden></p>
      <div class="botones" style="justify-content:flex-end">
        <button type="button" class="btn" id="modal-cancelar">Cancelar</button>
        <button type="submit" class="btn primario" value="ok">Guardar</button>
      </div>`;
    f.onsubmit = (e) => {
      e.preventDefault();
      const error = alGuardar(f);
      if (typeof error === 'string') {
        const el = $('#modal-error');
        el.textContent = error;
        el.hidden = false;
        return;
      }
      dlg.close();
    };
    f.oninput = alCambiar ? () => alCambiar(f) : null;
    $('#modal-cancelar').onclick = () => dlg.close();
    if (alCambiar) alCambiar(f);
    dlg.showModal();
    const primero = f.querySelector('input');
    if (primero && !primero.value) primero.focus();
  }

  // ---------- Inicio ----------

  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !esAndroid) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e));
  }
  rutear();
})();
