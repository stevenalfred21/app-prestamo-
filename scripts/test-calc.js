// Pruebas del cálculo de rédito y capital: node scripts/test-calc.js
const C = require('../calc.js');
const assert = require('assert');
assert.equal(C.siguienteCorte('2026-02-10'),'2026-02-15');
assert.equal(C.siguienteCorte('2026-02-15'),'2026-02-28');
assert.equal(C.siguienteCorte('2026-02-28'),'2026-03-15');
assert.equal(C.siguienteCorte('2026-01-31'),'2026-02-15');
assert.equal(C.siguienteCorte('2026-12-30'),'2027-01-15');
assert.equal(C.corteAnterior('2026-03-05'),'2026-02-28');
assert.equal(C.corteAnterior('2026-03-31'),'2026-03-30');
const p={id:'p',monto:10000,fecha:'2026-09-01',pct:10};
// sin pagos al 11-oct: cortes 15/9, 30/9 vencidos → 2000 atrasado, actual 1000
let r=C.calcularPrestamo(p,[], '2026-10-11');
assert.equal(r.reditoAtrasado,2000); assert.equal(r.reditoActualPendiente,1000); assert.equal(r.actual.corte,'2026-10-15');
// pago 15/9 de 3000 → 1000 rédito, 2000 capital; quincena 30/9 sobre 8000=800
const pagos=[{id:1,prestamoId:'p',fecha:'2026-09-15',monto:3000,creado:1},
 {id:2,prestamoId:'p',fecha:'2026-10-02',monto:800,creado:2}];
r=C.calcularPrestamo(p,pagos,'2026-10-11');
assert.deepEqual(r.detalle.map(d=>[d.aRedito,d.aCapital]),[[1000,2000],[800,0]]);
assert.equal(r.capital,8000); assert.equal(r.reditoAtrasado,0); assert.equal(r.reditoActualPendiente,800);
// pago adelantado el 14/10 de 1800: cubre rédito del 15/10 (800) + 1000 capital
pagos.push({id:3,prestamoId:'p',fecha:'2026-10-14',monto:1800,creado:3});
r=C.calcularPrestamo(p,pagos,'2026-10-20');
assert.deepEqual(r.detalle[2],{...r.detalle[2],aRedito:800,aCapital:1000});
assert.equal(r.capital,7000); assert.equal(r.actual.redito,700);
// saldar
pagos.push({id:4,prestamoId:'p',fecha:'2026-10-20',monto:7700,creado:4});
r=C.calcularPrestamo(p,pagos,'2027-05-01');
assert.ok(r.saldado); assert.equal(r.capital,0);

// ---- Mensual ----
assert.equal(C.siguienteCorteMensual('2026-01-10', 30), '2026-01-30');
assert.equal(C.siguienteCorteMensual('2026-01-30', 30), '2026-02-28');
assert.equal(C.siguienteCorteMensual('2026-02-28', 30), '2026-03-30');
assert.equal(C.siguienteCorteMensual('2028-01-31', 31), '2028-02-29');
assert.equal(C.siguienteCorteMensual('2026-03-05', 5), '2026-04-05');
// Préstamo de 10,000 al 20% mensual, cobro el día 5, prestado el 20/08: primer corte 05/09 completo
const m = { id: 'm', monto: 10000, fecha: '2026-08-20', pct: 20, frecuencia: 'mensual', diaCobro: 5 };
assert.deepEqual(C.cortesDe(m, '2026-11-05'), ['2026-09-05', '2026-10-05', '2026-11-05']);
const pm = [
  { id: 1, prestamoId: 'm', fecha: '2026-09-05', monto: 4000, creado: 1 }, // 2000 rédito + 2000 capital
  { id: 2, prestamoId: 'm', fecha: '2026-10-07', monto: 1600, creado: 2 }, // rédito de 8000 al 20%
];
r = C.calcularPrestamo(m, pm, '2026-10-14');
assert.deepEqual(r.detalle.map((d) => [d.aRedito, d.aCapital]), [[2000, 2000], [1600, 0]]);
assert.equal(r.capital, 8000);
assert.equal(r.reditoAtrasado, 0);
assert.equal(r.actual.corte, '2026-11-05');
assert.equal(r.reditoActualPendiente, 1600);
// Sin pagar: a la fecha 06/11 se deben dos meses
r = C.calcularPrestamo(m, pm.slice(0, 1), '2026-11-06');
assert.equal(r.reditoAtrasado, 3200);
// Préstamo sin frecuencia (datos viejos) sigue siendo quincenal
assert.equal(C.siguienteCorteDe({ fecha: '2026-01-01' }, '2026-01-01'), '2026-01-15');

console.log('ok');
