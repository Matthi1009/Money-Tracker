// Tests mit dem eingebauten Test-Runner von Node (node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/logic.js');

const tx = (type, euros, date, category = 'Sonstiges') => ({ id: `${date}-${euros}`, type, amountCents: Math.round(euros * 100), category, date, note: '' });

test('parseAmount versteht deutsche und englische Schreibweisen', () => {
  assert.equal(L.parseAmount('12,50'), 1250);
  assert.equal(L.parseAmount('12.5'), 1250);
  assert.equal(L.parseAmount('1.234,56'), 123456);
  assert.equal(L.parseAmount('1,234.56'), 123456);
  assert.equal(L.parseAmount('1.234'), 123400);
  assert.equal(L.parseAmount(' 15 € '), 1500);
  assert.equal(L.parseAmount('0,05'), 5);
  assert.equal(L.parseAmount('-3'), -300);
  assert.equal(L.parseAmount('12,'), 1200);
  assert.equal(L.parseAmount('-'), null);
  assert.equal(L.parseAmount(''), null);
  assert.equal(L.parseAmount('abc'), null);
  assert.equal(L.parseAmount('1e5'), null);
  assert.equal(L.parseAmount(','), null);
});

test('Monate verschieben über Jahresgrenzen', () => {
  assert.equal(L.shiftMonth('2026-01', -1), '2025-12');
  assert.equal(L.shiftMonth('2026-12', 1), '2027-01');
  assert.equal(L.shiftMonth('2026-11', 14), '2028-01');
  assert.deepEqual(L.lastMonths('2026-02', 3), ['2025-12', '2026-01', '2026-02']);
  assert.equal(L.monthLabel('2026-03'), 'März 2026');
  assert.equal(L.monthLabel('2026-03', true), 'Mär 26');
});

test('Monatszusammenfassung und Sparquote', () => {
  const data = [tx('income', 100, '2026-11-01'), tx('expense', 30, '2026-11-05'), tx('expense', 500, '2026-10-05')];
  const s = L.summarizeMonth(data, '2026-11');
  assert.equal(s.incomeCents, 10000);
  assert.equal(s.expenseCents, 3000);
  assert.equal(s.balanceCents, 7000);
  assert.equal(s.savingsRate, 0.7);
  assert.equal(L.summarizeMonth(data, '2026-10').savingsRate, null);
});

test('Ausgaben nach Kategorie, absteigend mit Anteilen', () => {
  const data = [tx('expense', 10, '2026-11-01', 'Essen'), tx('expense', 30, '2026-11-02', 'Technik'),
    tx('expense', 10, '2026-11-03', 'Essen'), tx('income', 99, '2026-11-03', 'Job')];
  const rows = L.byCategory(data, '2026-11', 'expense');
  assert.deepEqual(rows.map((r) => r.category), ['Technik', 'Essen']);
  assert.equal(rows[0].share, 0.6);
});

test('Durchschnitt ignoriert Monate vor der ersten Buchung', () => {
  const data = [tx('income', 100, '2026-10-01'), tx('income', 50, '2026-11-01')];
  assert.equal(L.averageMonthlyNet(data, '2026-11', 3), 7500);
  assert.equal(L.averageMonthlyNet([], '2026-11', 3), 0);
});

test('Prognose für Sparziele', () => {
  const goal = { targetCents: 45000, savedCents: 5000 };
  assert.deepEqual(L.goalForecast(goal, 10000, '2026-11'), { status: 'eta', remainingCents: 40000, months: 4, key: '2027-03' });
  assert.equal(L.goalForecast(goal, 0, '2026-11').status, 'never');
  assert.equal(L.goalForecast({ targetCents: 100, savedCents: 150 }, 0, '2026-11').status, 'done');
});

test('CSV nutzt Semikolon, Vorzeichen und schützt vor Formeln', () => {
  const data = [{ id: '1', type: 'expense', amountCents: 1250, category: '=HYPERLINK("x")', date: '2026-11-02', note: 'Pizza; Cola' },
    { id: '2', type: 'income', amountCents: 2000, category: 'Job', date: '2026-11-01', note: '' }];
  const lines = L.toCSV(data).trim().split('\r\n');
  assert.equal(lines[0], 'Datum;Typ;Kategorie;Betrag;Notiz');
  assert.equal(lines[1], '2026-11-01;Einnahme;Job;20,00;');
  assert.equal(lines[2], '2026-11-02;Ausgabe;"\'=HYPERLINK(""x"")";-12,50;"Pizza; Cola"');
});

test('normalizeData prüft Importe', () => {
  const ok = L.normalizeData({ transactions: [tx('income', 5, '2026-11-01')], goals: [{ name: 'PC', targetCents: 100, savedCents: 0 }] });
  assert.equal(ok.transactions.length, 1);
  assert.ok(ok.goals[0].id);
  assert.throws(() => L.normalizeData({}), /fehlen/);
  assert.throws(() => L.normalizeData({ transactions: [{ type: 'expense', amountCents: -5, date: '2026-11-01' }], goals: [] }), /Buchung 1/);
  assert.throws(() => L.normalizeData({ transactions: [], goals: [{ name: 'X', targetCents: 0, savedCents: 0 }] }), /Sparziel 1/);
});

test('Kategorievorschläge enthalten eigene Kategorien ohne Doppelte', () => {
  const list = L.categorySuggestions([tx('expense', 1, '2026-11-01', 'Gaming'), tx('expense', 1, '2026-11-01', 'Essen')], 'expense');
  assert.ok(list.includes('Gaming'));
  assert.equal(list.filter((c) => c === 'Essen').length, 1);
});

test('parseAmount lehnt kaputte Trenner und riesige Beträge ab', () => {
  assert.equal(L.parseAmount('1.2.3'), null);
  assert.equal(L.parseAmount('0.125'), null);
  assert.equal(L.parseAmount('1.234.56'), null);
  assert.equal(L.parseAmount('1,234,567.89'), 123456789);
  assert.equal(L.parseAmount(',5'), 50);
  assert.equal(L.parseAmount('999999999999'), null);
  assert.equal(L.parseAmount(1e12), null);
});

test('isValidDate prüft echte Kalenderdaten', () => {
  assert.equal(L.isValidDate('2026-02-28'), true);
  assert.equal(L.isValidDate('2028-02-29'), true);
  assert.equal(L.isValidDate('2026-02-29'), false);
  assert.equal(L.isValidDate('2026-13-01'), false);
  assert.equal(L.isValidDate('0000-00-00'), false);
  assert.equal(L.isValidDate(20260101), false);
});

test('Nachsichtiges Laden überspringt kaputte Einträge und zählt sie', () => {
  const stored = { transactions: [tx('income', 5, '2026-11-01'), { type: 'expense', amountCents: 5, date: '2026-13-45' }],
    goals: [{ name: 'PC', targetCents: 100, savedCents: 0 }, null] };
  const result = L.normalizeData(stored, { lenient: true });
  assert.equal(result.transactions.length, 1);
  assert.equal(result.goals.length, 1);
  assert.equal(result.dropped, 2);
  assert.equal(JSON.stringify(result).includes('dropped'), false); // wird nicht mitgespeichert
  assert.throws(() => L.normalizeData(stored), /Buchung 2/);
});
