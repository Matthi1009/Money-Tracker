/*
 * Reine Rechenfunktionen ohne DOM-Zugriff.
 * Läuft im Browser (window.MoneyLogic) und in Node (require) für die Tests.
 * Beträge werden immer als ganze Cent gespeichert, damit keine Rundungsfehler entstehen.
 */
(function (root) {
  'use strict';

  const LOCALE = 'de-DE';
  const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli',
    'August', 'September', 'Oktober', 'November', 'Dezember'];

  const DEFAULT_CATEGORIES = {
    expense: ['Essen', 'Freizeit', 'Kleidung', 'Technik', 'Abos', 'Handy', 'Transport', 'Schule', 'Geschenke', 'Sonstiges'],
    income: ['Taschengeld', 'Job', 'Geschenk', 'Verkauf', 'Sonstiges'],
  };

  // Obergrenze für einzelne Beträge: 1 Milliarde Euro, damit Summen sicher rechenbar bleiben
  const MAX_CENTS = 100_000_000_000;

  const currencyFormat = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'EUR' });
  const plainFormat = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });

  // Ganze Zahl ohne Tausendertrenner oder mit sauberen Dreiergruppen ("1.234.567")
  function isIntegerPart(text, decimalSep) {
    if (/^\d+$/.test(text)) return true;
    const match = /^[1-9]\d{0,2}(([.,])\d{3})+$/.exec(text);
    if (!match) return false;
    const groupSep = match[2];
    // Nur eine Art Tausendertrenner, und sie darf nicht gleich dem Dezimaltrenner sein
    return !text.includes(groupSep === '.' ? ',' : '.') && groupSep !== decimalSep;
  }

  // "12,50", "12.50", "1.234,56", "1,234.56", "15 €" -> Cent; ungültig -> null
  function parseAmount(input) {
    if (typeof input === 'number') {
      const cents = Math.round(input * 100);
      return Number.isFinite(input) && Math.abs(cents) <= MAX_CENTS ? cents : null;
    }
    let text = String(input == null ? '' : input).trim().replace(/[\s€]/g, '');
    if (!text) return null;
    const negative = text.startsWith('-');
    if (negative || text.startsWith('+')) text = text.slice(1);
    text = text.replace(/[.,]$/, ''); // "12," wie "12" behandeln
    const sepIndex = Math.max(text.lastIndexOf(','), text.lastIndexOf('.'));
    const digitsAfter = sepIndex >= 0 ? text.length - sepIndex - 1 : 0;
    let intPart = text;
    let fraction = '';
    // Ein Trenner mit 1–2 Ziffern dahinter ist das Dezimalkomma, sonst ein Tausenderpunkt
    if (sepIndex >= 0 && digitsAfter >= 1 && digitsAfter <= 2) {
      intPart = text.slice(0, sepIndex);
      fraction = text.slice(sepIndex + 1);
    }
    const decimalSep = fraction ? text[sepIndex] : null;
    if (intPart === '' ? !fraction : !isIntegerPart(intPart, decimalSep)) return null;
    if (!/^\d*$/.test(fraction)) return null;
    const cents = Number(intPart.replace(/[.,]/g, '') || '0') * 100 + Number((fraction + '00').slice(0, 2));
    if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) return null;
    return negative ? -cents : cents;
  }

  function formatCents(cents) {
    return currencyFormat.format((cents || 0) / 100);
  }

  function monthKey(dateString) {
    return String(dateString).slice(0, 7);
  }

  function todayKey(now) {
    const d = now || new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function todayDate(now) {
    const d = now || new Date();
    return `${todayKey(d)}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function shiftMonth(key, delta) {
    const [year, month] = key.split('-').map(Number);
    const index = year * 12 + (month - 1) + delta;
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
  }

  function monthLabel(key, short) {
    const [year, month] = key.split('-').map(Number);
    const name = MONTH_NAMES[month - 1];
    return short ? `${name.slice(0, 3)} ${String(year).slice(2)}` : `${name} ${year}`;
  }

  function lastMonths(endKey, count) {
    const keys = [];
    for (let i = count - 1; i >= 0; i -= 1) keys.push(shiftMonth(endKey, -i));
    return keys;
  }

  function inMonth(transactions, key) {
    return transactions.filter((t) => monthKey(t.date) === key);
  }

  function summarizeMonth(transactions, key) {
    let incomeCents = 0;
    let expenseCents = 0;
    for (const t of inMonth(transactions, key)) {
      if (t.type === 'income') incomeCents += t.amountCents;
      else expenseCents += t.amountCents;
    }
    const balanceCents = incomeCents - expenseCents;
    return {
      incomeCents,
      expenseCents,
      balanceCents,
      // Sparquote: Anteil der Einnahmen, der übrig bleibt (null ohne Einnahmen)
      savingsRate: incomeCents > 0 ? balanceCents / incomeCents : null,
    };
  }

  function byCategory(transactions, key, type) {
    const totals = new Map();
    let sum = 0;
    for (const t of inMonth(transactions, key)) {
      if (t.type !== type) continue;
      totals.set(t.category, (totals.get(t.category) || 0) + t.amountCents);
      sum += t.amountCents;
    }
    return [...totals.entries()]
      .map(([category, cents]) => ({ category, cents, share: sum ? cents / sum : 0 }))
      .sort((a, b) => b.cents - a.cents || a.category.localeCompare(b.category, LOCALE));
  }

  function monthlySeries(transactions, endKey, count) {
    return lastMonths(endKey, count).map((key) => ({ key, ...summarizeMonth(transactions, key) }));
  }

  // Durchschnittlicher Überschuss pro Monat; Monate vor der ersten Buchung zählen nicht mit
  function averageMonthlyNet(transactions, endKey, count) {
    if (!transactions.length) return 0;
    const firstKey = transactions.reduce((min, t) => (monthKey(t.date) < min ? monthKey(t.date) : min), '9999-12');
    const keys = lastMonths(endKey, count).filter((key) => key >= firstKey);
    if (!keys.length) return 0;
    const total = keys.reduce((acc, key) => acc + summarizeMonth(transactions, key).balanceCents, 0);
    return Math.round(total / keys.length);
  }

  function goalForecast(goal, monthlyCents, fromKey) {
    const remaining = goal.targetCents - goal.savedCents;
    if (remaining <= 0) return { status: 'done', remainingCents: 0 };
    if (!(monthlyCents > 0)) return { status: 'never', remainingCents: remaining };
    const months = Math.ceil(remaining / monthlyCents);
    return { status: 'eta', remainingCents: remaining, months, key: shiftMonth(fromKey, months) };
  }

  function csvCell(value) {
    let text = String(value == null ? '' : value);
    // Schutz vor Formel-Injection in Tabellenprogrammen
    if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(,\d+)?$/.test(text)) text = `'${text}`;
    return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function toCSV(transactions) {
    const rows = [['Datum', 'Typ', 'Kategorie', 'Betrag', 'Notiz']];
    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
    for (const t of sorted) {
      const signed = t.type === 'income' ? t.amountCents : -t.amountCents;
      rows.push([t.date, t.type === 'income' ? 'Einnahme' : 'Ausgabe', t.category, plainFormat.format(signed / 100), t.note || '']);
    }
    return rows.map((row) => row.map(csvCell).join(';')).join('\r\n') + '\r\n';
  }

  function emptyData() {
    return { version: 1, transactions: [], goals: [] };
  }

  // Echtes Kalenderdatum im Format YYYY-MM-DD (kein 2026-13-45)
  function isValidDate(text) {
    if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
    const [y, m, d] = text.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return y >= 1900 && date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  }

  const isAmount = (cents, allowZero) => Number.isSafeInteger(cents) && cents <= MAX_CENTS && (allowZero ? cents >= 0 : cents > 0);

  /*
   * Prüft Daten. Streng (Import): wirft beim ersten Fehler eine verständliche Meldung.
   * Nachsichtig (Laden aus dem Speicher): überspringt kaputte Einträge und zählt sie in `dropped`.
   */
  function normalizeData(input, options) {
    const lenient = Boolean(options && options.lenient);
    let dropped = 0;
    const keep = (ok, message) => {
      if (ok) return true;
      if (!lenient) throw new Error(message);
      dropped += 1;
      return false;
    };
    if (!input || typeof input !== 'object') throw new Error('Die Datei enthält keine gültigen Daten.');
    if (!Array.isArray(input.transactions) || !Array.isArray(input.goals)) {
      throw new Error('In der Datei fehlen Buchungen oder Sparziele.');
    }
    const transactions = input.transactions.filter((t, i) => keep(
      t && (t.type === 'income' || t.type === 'expense') && isAmount(t.amountCents) && isValidDate(t.date),
      `Buchung ${i + 1} ist ungültig.`,
    )).map((t) => ({
      id: String(t.id || uid()),
      type: t.type,
      amountCents: t.amountCents,
      category: String(t.category || 'Sonstiges').slice(0, 40),
      date: t.date,
      note: String(t.note || '').slice(0, 200),
    }));
    const goals = input.goals.filter((g, i) => keep(
      g && typeof g.name === 'string' && isAmount(g.targetCents) && isAmount(g.savedCents, true),
      `Sparziel ${i + 1} ist ungültig.`,
    )).map((g) => ({ id: String(g.id || uid()), name: g.name.slice(0, 60), targetCents: g.targetCents, savedCents: g.savedCents }));
    const data = { version: 1, transactions, goals };
    if (lenient) Object.defineProperty(data, 'dropped', { value: dropped, enumerable: false });
    return data;
  }

  function categorySuggestions(transactions, type) {
    const used = transactions.filter((t) => t.type === type).map((t) => t.category);
    return [...new Set([...DEFAULT_CATEGORIES[type], ...used])];
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  const api = {
    DEFAULT_CATEGORIES, MAX_CENTS, isValidDate, parseAmount, formatCents, monthKey, todayKey, todayDate, shiftMonth, monthLabel,
    lastMonths, summarizeMonth, byCategory, monthlySeries, averageMonthlyNet, goalForecast, toCSV,
    emptyData, normalizeData, categorySuggestions, uid,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MoneyLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
