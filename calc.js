/*
 * Motor de cálculo de préstamos con rédito quincenal.
 *
 * Reglas:
 * - Los cortes son el día 15 y el 30 de cada mes (en febrero, el último día del mes).
 * - Cada quincena genera un rédito = capital pendiente al inicio de la quincena × porcentaje.
 *   La primera quincena va desde la fecha del préstamo hasta el primer corte posterior.
 * - Un pago cubre primero el rédito atrasado (quincenas ya vencidas), luego el rédito
 *   de la quincena en curso, y lo que sobre se descuenta del capital.
 * - Un abono a capital reduce el rédito a partir de la quincena siguiente.
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

  function esCorte(s) {
    const { y, m, d } = partes(s);
    return d === 15 || d === segundoCorte(y, m);
  }

  function ordenarPagos(a, b) {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
    return (a.creado || 0) - (b.creado || 0);
  }

  /*
   * Calcula el estado de un préstamo hasta la fecha `hasta` (incluida).
   * Devuelve:
   *  - capital: capital pendiente
   *  - periodos: quincenas cuyo corte ya llegó (corte <= hasta)
   *  - actual: quincena en curso (corte > hasta)
   *  - detalle: cada pago con su reparto entre rédito y capital
   *  - reditoAtrasado: rédito pendiente de quincenas vencidas
   *  - reditoActualPendiente: rédito pendiente de la quincena en curso
   */
  function calcularPrestamo(prestamo, pagosTodos, hasta) {
    const tasa = Number(prestamo.pct) / 100;
    const pagos = pagosTodos
      .filter((x) => x.prestamoId === prestamo.id && x.fecha <= hasta)
      .sort(ordenarPagos);

    let capital = r2(Number(prestamo.monto));
    const periodos = [];
    const nuevo = (inicio) => ({
      inicio,
      corte: siguienteCorte(inicio),
      base: capital,
      redito: r2(capital * tasa),
      pagado: 0,
    });
    let actual = nuevo(prestamo.fecha);
    const cerrar = () => {
      periodos.push(actual);
      actual = nuevo(actual.corte);
    };

    const detalle = [];
    for (const pg of pagos) {
      while (actual.corte < pg.fecha) cerrar();
      let resto = r2(Number(pg.monto));
      let aRedito = 0;
      let aCapital = 0;
      for (const per of periodos.concat([actual])) {
        if (resto <= 0) break;
        const pend = r2(per.redito - per.pagado);
        if (pend > 0) {
          const x = Math.min(pend, resto);
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
      detalle.push({ pago: pg, aRedito, aCapital, sobrante: resto, capitalDespues: capital });
    }

    while (actual.corte <= hasta) {
      if (capital <= 0 && actual.redito <= actual.pagado) break;
      cerrar();
    }

    const reditoAtrasado = r2(periodos.reduce((s, p) => s + Math.max(0, p.redito - p.pagado), 0));
    const reditoActualPendiente = r2(Math.max(0, actual.redito - actual.pagado));
    const reditoPagado = r2(detalle.reduce((s, d) => s + d.aRedito, 0));
    const capitalPagado = r2(detalle.reduce((s, d) => s + d.aCapital, 0));
    const saldado = capital <= 0 && reditoAtrasado <= 0 && reditoActualPendiente <= 0;

    return {
      capital,
      periodos,
      actual,
      detalle,
      reditoAtrasado,
      reditoActualPendiente,
      reditoPagado,
      capitalPagado,
      saldado,
    };
  }

  // Lista de cortes entre dos fechas (incluidas), de más reciente a más antiguo.
  function cortesEntre(desde, hasta) {
    const lista = [];
    let c = esCorte(desde) ? desde : siguienteCorte(desde);
    while (c <= hasta) {
      lista.push(c);
      c = siguienteCorte(c);
    }
    return lista.reverse();
  }

  const api = { r2, siguienteCorte, corteAnterior, esCorte, calcularPrestamo, cortesEntre };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Calc = api;
})(this);
