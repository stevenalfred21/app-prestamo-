/*
 * Motor de cálculo de préstamos con rédito quincenal o mensual.
 *
 * Reglas:
 * - Préstamo quincenal: los cortes son el día 15 y el 30 de cada mes (en febrero, el último día).
 * - Préstamo mensual: un corte al mes, el día de cobro escogido (si el mes es más corto,
 *   el último día del mes).
 * - Cada período genera un rédito = capital pendiente al inicio del período × porcentaje.
 *   El primer período va desde la fecha del préstamo hasta el primer corte posterior y se
 *   cobra completo.
 * - Un pago cubre primero la mora anotada, luego el rédito atrasado (períodos ya vencidos),
 *   luego el rédito del período en curso, y lo que sobre se descuenta del capital.
 * - Un abono a capital, o dinero adicional prestado, cambia el rédito a partir del período
 *   siguiente.
 *
 * Fechas siempre como texto 'AAAA-MM-DD'.
 */
(function (root) {
  'use strict';

  const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

  function partes(s) {
    const [y, m, d] = s.split('-').map(Number);
    return { y, m, d };
  }
  function armar(y, m, d) {
    return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }
  function diasDelMes(y, m) {
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  }
  function segundoCorte(y, m) {
    return Math.min(30, diasDelMes(y, m));
  }

  // Primer corte estrictamente posterior a la fecha.
  function siguienteCorte(s) {
    const { y, m, d } = partes(s);
    if (d < 15) return armar(y, m, 15);
    const c2 = segundoCorte(y, m);
    if (d < c2) return armar(y, m, c2);
    return m === 12 ? armar(y + 1, 1, 15) : armar(y, m + 1, 15);
  }

  // Último corte en o antes de la fecha.
  function corteAnterior(s) {
    const { y, m, d } = partes(s);
    const c2 = segundoCorte(y, m);
    if (d >= c2) return armar(y, m, c2);
    if (d >= 15) return armar(y, m, 15);
    const pm = m === 1 ? 12 : m - 1;
    const py = m === 1 ? y - 1 : y;
    return armar(py, pm, segundoCorte(py, pm));
  }

  // Primer corte mensual estrictamente posterior a la fecha, para un día de cobro dado.
  function siguienteCorteMensual(s, dia) {
    const { y, m } = partes(s);
    const enEsteMes = armar(y, m, Math.min(dia, diasDelMes(y, m)));
    if (enEsteMes > s) return enEsteMes;
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    return armar(ny, nm, Math.min(dia, diasDelMes(ny, nm)));
  }

  const esMensual = (prestamo) => prestamo.frecuencia === 'mensual';
  const diaCobro = (prestamo) => Number(prestamo.diaCobro) || partes(prestamo.fecha).d;

  // Siguiente corte según la frecuencia del préstamo (los préstamos viejos no tienen frecuencia: son quincenales).
  function siguienteCorteDe(prestamo, s) {
    return esMensual(prestamo) ? siguienteCorteMensual(s, diaCobro(prestamo)) : siguienteCorte(s);
  }

  function esCorte(s) {
    const { y, m, d } = partes(s);
    return d === 15 || d === segundoCorte(y, m);
  }

  function ordenarEventos(a, b) {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
    return (a.creado || 0) - (b.creado || 0);
  }

  const pendiente = (per) => r2(per.redito - per.pagado - per.descontado);

  /*
   * Calcula el estado de un préstamo hasta la fecha `hasta` (incluida).
   *
   * `movimientos` son los otros eventos del préstamo, además de los pagos:
   *  - 'capital':   dinero adicional prestado. Genera rédito desde el período siguiente.
   *  - 'mora':      cargo por atraso, anotado a mano. Se cobra antes que el rédito.
   *  - 'descuento': rédito perdonado. Rebaja el rédito pendiente, del más viejo al más nuevo.
   *
   * Devuelve:
   *  - capital: capital pendiente
   *  - periodos: períodos cuyo corte ya llegó (corte <= hasta)
   *  - actual: período en curso (corte > hasta)
   *  - detalle: cada pago con su reparto entre mora, rédito y capital
   *  - reditoAtrasado / reditoActualPendiente: rédito pendiente vencido / del período en curso
   *  - moraPendiente: mora anotada que falta por pagar
   *  - vencidoDesde: corte más viejo con rédito sin pagar (o null)
   */
  function calcularPrestamo(prestamo, pagosTodos, hasta, movimientosTodos) {
    const tasa = Number(prestamo.pct) / 100;
    const eventos = pagosTodos
      .filter((x) => x.prestamoId === prestamo.id && x.fecha <= hasta)
      .map((x) => Object.assign({ tipo: 'pago' }, x))
      .concat((movimientosTodos || []).filter((x) => x.prestamoId === prestamo.id && x.fecha <= hasta))
      .sort(ordenarEventos);

    let capital = r2(Number(prestamo.monto));
    let capitalAgregado = 0;
    const periodos = [];
    const moras = [];
    const nuevo = (inicio) => ({
      inicio,
      corte: siguienteCorteDe(prestamo, inicio),
      base: capital,
      redito: r2(capital * tasa),
      pagado: 0,
      descontado: 0,
    });
    let actual = nuevo(prestamo.fecha);
    const cerrar = () => {
      periodos.push(actual);
      actual = nuevo(actual.corte);
    };

    const detalle = [];
    for (const ev of eventos) {
      while (actual.corte < ev.fecha) cerrar();
      const monto = r2(Number(ev.monto));

      if (ev.tipo === 'capital') {
        capital = r2(capital + monto);
        capitalAgregado = r2(capitalAgregado + monto);
        continue;
      }
      if (ev.tipo === 'mora') {
        moras.push({ mov: ev, monto, pagado: 0 });
        continue;
      }
      if (ev.tipo === 'descuento') {
        let resto = monto;
        for (const per of periodos.concat([actual])) {
          if (resto <= 0) break;
          const x = Math.min(pendiente(per), resto);
          if (x > 0) {
            per.descontado = r2(per.descontado + x);
            resto = r2(resto - x);
          }
        }
        continue;
      }

      // Pago: mora, luego rédito (del más viejo al más nuevo), luego capital
      let resto = monto;
      let aMora = 0;
      let aRedito = 0;
      let aCapital = 0;
      for (const m of moras) {
        if (resto <= 0) break;
        const x = Math.min(r2(m.monto - m.pagado), resto);
        if (x > 0) {
          m.pagado = r2(m.pagado + x);
          resto = r2(resto - x);
          aMora = r2(aMora + x);
        }
      }
      for (const per of periodos.concat([actual])) {
        if (resto <= 0) break;
        const x = Math.min(pendiente(per), resto);
        if (x > 0) {
          per.pagado = r2(per.pagado + x);
          resto = r2(resto - x);
          aRedito = r2(aRedito + x);
        }
      }
      if (resto > 0 && capital > 0) {
        aCapital = Math.min(resto, capital);
        capital = r2(capital - aCapital);
        resto = r2(resto - aCapital);
      }
      detalle.push({ pago: ev, aMora, aRedito, aCapital, sobrante: resto, capitalDespues: capital });
    }

    while (actual.corte <= hasta) {
      if (capital <= 0 && pendiente(actual) <= 0) break;
      cerrar();
    }

    const reditoAtrasado = r2(periodos.reduce((s, p) => s + Math.max(0, pendiente(p)), 0));
    const reditoActualPendiente = r2(Math.max(0, pendiente(actual)));
    const moraPendiente = r2(moras.reduce((s, m) => s + m.monto - m.pagado, 0));
    const vencido = periodos.find((p) => pendiente(p) > 0);
    const suma = (campo) => r2(detalle.reduce((s, d) => s + d[campo], 0));
    const saldado = capital <= 0 && reditoAtrasado <= 0 && reditoActualPendiente <= 0 && moraPendiente <= 0;

    return {
      capital,
      capitalAgregado,
      periodos,
      actual,
      detalle,
      moras,
      reditoAtrasado,
      reditoActualPendiente,
      moraPendiente,
      vencidoDesde: vencido ? vencido.corte : null,
      reditoPagado: suma('aRedito'),
      capitalPagado: suma('aCapital'),
      moraPagada: suma('aMora'),
      saldado,
    };
  }

  // Días entre dos fechas 'AAAA-MM-DD' (b - a).
  function diasEntre(a, b) {
    return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
  }

  // Cortes de un préstamo desde su fecha hasta `hasta` (incluida), de más antiguo a más reciente.
  function cortesDe(prestamo, hasta) {
    const lista = [];
    let c = siguienteCorteDe(prestamo, prestamo.fecha);
    while (c <= hasta) {
      lista.push(c);
      c = siguienteCorteDe(prestamo, c);
    }
    return lista;
  }

  const api = {
    r2, siguienteCorte, siguienteCorteMensual, siguienteCorteDe, corteAnterior, esCorte,
    esMensual, diaCobro, calcularPrestamo, cortesDe, diasEntre, pendiente,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Calc = api;
})(this);
