/*
 * Motor de cálculo de préstamos con rédito quincenal.
 *
 * Reglas:
 * - Préstamo quincenal: los cortes son el día 15 y el 30 de cada mes (en febrero, el último día).
 * - Préstamo mensual: un corte al mes, el día de cobro escogido (si el mes es más corto,
 *   el último día del mes).
 * - Cada período genera un rédito = capital pendiente al inicio del período × porcentaje.
 *   El primer período va desde la fecha del préstamo hasta el primer corte posterior y se
 *   cobra completo.
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
      corte: siguienteCorteDe(prestamo, inicio),
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
    esMensual, diaCobro, calcularPrestamo, cortesDe,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Calc = api;
})(this);
