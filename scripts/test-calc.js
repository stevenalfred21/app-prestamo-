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
console.log('ok');
