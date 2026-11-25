/* Oberfläche des Money Trackers: Zustand, Speichern und Darstellung */
(function () {
  'use strict';

  const L = window.MoneyLogic;
  const STORAGE_KEY = 'money-tracker:v1';
  const RESCUE_KEY = 'money-tracker:v1:rescue';
  const $ = (id) => document.getElementById(id);

  let loadWarning = '';
  let data = load();
  let currentMonth = L.todayKey();
  let lastDeleted = null;
  let toastTimer = null;

  // ---------- Speichern ----------

  // Kaputte Daten nie still verwerfen: Rohdaten sichern und Bescheid geben
  function rescue(raw) {
    try {
      localStorage.setItem(RESCUE_KEY, raw);
    } catch {
      // Wenn auch das nicht geht, bleibt nur die Meldung
    }
  }

  function load() {
    let raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch {
      loadWarning = 'Der Browser-Speicher ist gesperrt. Deine Buchungen werden nicht gespeichert.';
      return L.emptyData();
    }
    if (!raw) return L.emptyData();
    try {
      const result = L.normalizeData(JSON.parse(raw), { lenient: true });
      if (result.dropped) {
        rescue(raw);
        loadWarning = `${result.dropped} beschädigte Einträge wurden ausgeblendet. Die Originaldaten sind unter „${RESCUE_KEY}“ im Browser-Speicher gesichert.`;
      }
      return result;
    } catch {
      rescue(raw);
      loadWarning = `Die gespeicherten Daten sind beschädigt und wurden unter „${RESCUE_KEY}“ gesichert. Spiel am besten ein Backup ein.`;
      return L.emptyData();
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      setStatus('Speichern fehlgeschlagen. Ist der Browser-Speicher voll oder gesperrt?');
    }
  }

  // ---------- Hilfen ----------

  function el(tag, props, children) {
    const node = document.createElement(tag);
    if (props) Object.assign(node, props);
    for (const child of children || []) node.append(child);
    return node;
  }

  function formatDate(iso) {
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  }

  function setStatus(text) {
    $('data-status').textContent = text;
  }

  function showToast(text, onUndo) {
    clearTimeout(toastTimer);
    $('toast-text').textContent = text;
    $('toast-undo').hidden = !onUndo;
    $('toast-undo').onclick = () => { if (onUndo) onUndo(); hideToast(); };
    $('toast').hidden = false;
    toastTimer = setTimeout(hideToast, 6000);
  }

  function hideToast() {
    $('toast').hidden = true;
  }

  // Alle Daten ersetzen (Import, Alles löschen), mit Rückgängig-Möglichkeit
  function replaceAll(next, message) {
    const previous = data;
    data = next;
    lastDeleted = null;
    save();
    render();
    showToast(message, () => {
      data = previous;
      save();
      render();
      setStatus('Wiederhergestellt.');
    });
  }

  function download(filename, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = el('a', { href: url, download: filename });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Zwei Klicks zum Bestätigen statt confirm()-Dialog
  function armConfirm(button, label, action) {
    if (button.dataset.armed === '1') {
      button.dataset.armed = '';
      button.textContent = button.dataset.label;
      action();
      return;
    }
    button.dataset.label = button.textContent;
    button.dataset.armed = '1';
    button.textContent = label;
    setTimeout(() => {
      if (button.dataset.armed === '1') {
        button.dataset.armed = '';
        button.textContent = button.dataset.label;
      }
    }, 4000);
  }

  // ---------- Darstellung ----------

  function render() {
    renderMonth();
    renderSummary();
    renderTrend();
    renderCategories();
    renderGoals();
    renderTransactions();
    renderCategoryOptions();
  }

  function renderMonth() {
    $('month-label').textContent = L.monthLabel(currentMonth);
    $('tx-month').textContent = L.monthLabel(currentMonth);
  }

  function renderSummary() {
    const s = L.summarizeMonth(data.transactions, currentMonth);
    $('sum-income').textContent = L.formatCents(s.incomeCents);
    $('sum-expense').textContent = L.formatCents(s.expenseCents);
    const balance = $('sum-balance');
    balance.textContent = L.formatCents(s.balanceCents);
    balance.classList.toggle('income', s.balanceCents > 0);
    balance.classList.toggle('expense', s.balanceCents < 0);
    // "|| 0" verhindert die Anzeige "-0 %"
    $('sum-rate').textContent = s.savingsRate == null
      ? '—'
      : `${(Math.round(s.savingsRate * 100) || 0).toLocaleString('de-DE')} %`;
  }

  function renderTrend() {
    const box = $('trend-chart');
    const series = L.monthlySeries(data.transactions, currentMonth, 6);
    const width = Math.max(box.clientWidth, 280);
    const height = 220;
    const pad = { top: 12, right: 8, bottom: 26, left: 8 };
    const max = Math.max(1, ...series.flatMap((m) => [m.incomeCents, m.expenseCents]));
    const innerH = height - pad.top - pad.bottom;
    const groupW = (width - pad.left - pad.right) / series.length;
    const barW = Math.min(26, groupW * 0.32);
    const ns = 'http://www.w3.org/2000/svg';

    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Einnahmen und Ausgaben der letzten sechs Monate');

    const node = (tag, attrs) => {
      const n = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      svg.append(n);
      return n;
    };

    // Hilfslinien bei 50 % und 100 % des Höchstwerts
    [0.5, 1].forEach((f) => node('line', {
      x1: pad.left, x2: width - pad.right, y1: pad.top + innerH * (1 - f), y2: pad.top + innerH * (1 - f), class: 'grid',
    }));
    node('line', { x1: pad.left, x2: width - pad.right, y1: pad.top + innerH, y2: pad.top + innerH, class: 'axis' });

    const tip = el('div', { className: 'tip', hidden: true });
    series.forEach((m, i) => {
      const cx = pad.left + groupW * i + groupW / 2;
      [['incomeCents', 'bar income-fill', -barW - 2], ['expenseCents', 'bar expense-fill', 2]].forEach(([key, cls, dx]) => {
        const h = Math.max(m[key] > 0 ? 2 : 0, (m[key] / max) * innerH);
        node('rect', { x: cx + dx, y: pad.top + innerH - h, width: barW, height: h, rx: 3, class: cls });
      });
      const label = node('text', { x: cx, y: height - 8, 'text-anchor': 'middle', class: m.key === currentMonth ? 'tick current' : 'tick' });
      label.textContent = L.monthLabel(m.key, true);
      // Unsichtbare Fläche pro Monat für den Tooltip
      const hit = node('rect', { x: pad.left + groupW * i, y: 0, width: groupW, height, class: 'hit' });
      hit.addEventListener('pointermove', (ev) => {
        tip.replaceChildren(
          el('strong', { textContent: L.monthLabel(m.key) }),
          el('span', { textContent: `Einnahmen ${L.formatCents(m.incomeCents)}` }),
          el('span', { textContent: `Ausgaben ${L.formatCents(m.expenseCents)}` }),
          el('span', { textContent: `Übrig ${L.formatCents(m.balanceCents)}` }),
        );
        tip.hidden = false;
        const rect = box.getBoundingClientRect();
        const x = Math.min(ev.clientX - rect.left + 12, rect.width - tip.offsetWidth - 4);
        tip.style.left = `${Math.max(0, x)}px`;
        tip.style.top = `${Math.max(0, ev.clientY - rect.top - tip.offsetHeight - 8)}px`;
      });
      hit.addEventListener('pointerleave', () => { tip.hidden = true; });
      hit.addEventListener('click', () => { currentMonth = m.key; render(); });
    });

    box.replaceChildren(svg, tip);
  }

  function renderCategories() {
    const rows = L.byCategory(data.transactions, currentMonth, 'expense');
    const list = $('cat-list');
    list.replaceChildren(...rows.map((r) => el('li', { className: 'cat-row' }, [
      el('span', { className: 'cat-name', textContent: r.category }),
      el('span', { className: 'cat-amount', textContent: L.formatCents(r.cents) }),
      el('span', { className: 'cat-bar' }, [el('span', { className: 'cat-fill', style: `width:${(r.share * 100).toFixed(1)}%` })]),
      el('span', { className: 'cat-share', textContent: `${Math.round(r.share * 100)} %` }),
    ])));
    $('cat-empty').hidden = rows.length > 0;
  }

  function renderGoals() {
    const pace = L.averageMonthlyNet(data.transactions, L.todayKey(), 3);
    $('goal-pace').textContent = data.transactions.length
      ? `Im Schnitt der letzten drei Monate bleiben dir ${L.formatCents(pace)} pro Monat übrig.`
      : 'Trag Buchungen ein, dann berechne ich, wann du deine Ziele erreichst.';

    const list = $('goal-list');
    list.replaceChildren(...data.goals.map((goal) => {
      const share = Math.min(1, goal.savedCents / goal.targetCents);
      const forecast = L.goalForecast(goal, pace, L.todayKey());
      let eta = 'Ziel erreicht!';
      if (forecast.status === 'eta') {
        eta = `Noch ${L.formatCents(forecast.remainingCents)}, bei deinem Tempo ca. ${L.monthLabel(forecast.key)}`;
      } else if (forecast.status === 'never') {
        eta = `Noch ${L.formatCents(forecast.remainingCents)}. Im Moment bleibt im Schnitt nichts übrig.`;
      }

      const input = el('input', { inputMode: 'decimal', placeholder: 'Betrag', ariaLabel: `Betrag für ${goal.name}`, autocomplete: 'off' });
      const addBtn = el('button', { type: 'button', className: 'btn btn-small', textContent: 'Einzahlen' });
      const delBtn = el('button', { type: 'button', className: 'link-btn', textContent: 'Ziel löschen' });
      const progress = el('div', { className: 'progress', role: 'progressbar' }, [
        el('span', { className: 'progress-fill', style: `width:${(share * 100).toFixed(1)}%` }),
      ]);
      progress.setAttribute('aria-valuenow', String(Math.round(share * 100)));
      progress.setAttribute('aria-valuemin', '0');
      progress.setAttribute('aria-valuemax', '100');

      const deposit = () => {
        const cents = L.parseAmount(input.value);
        if (cents == null || cents === 0) { input.focus(); input.classList.add('invalid'); return; }
        goal.savedCents = Math.min(L.MAX_CENTS, Math.max(0, goal.savedCents + cents));
        save();
        render();
        showToast(cents > 0 ? `${L.formatCents(cents)} zu „${goal.name}“ hinzugefügt` : `${L.formatCents(-cents)} von „${goal.name}“ abgezogen`);
      };
      addBtn.addEventListener('click', deposit);
      input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') deposit(); });
      delBtn.addEventListener('click', () => armConfirm(delBtn, 'Wirklich löschen?', () => {
        data.goals = data.goals.filter((g) => g.id !== goal.id);
        save();
        render();
      }));

      return el('li', { className: `goal${share >= 1 ? ' is-done' : ''}` }, [
        el('div', { className: 'goal-head' }, [
          el('strong', { textContent: goal.name }),
          el('span', { className: 'goal-amount', textContent: `${L.formatCents(goal.savedCents)} / ${L.formatCents(goal.targetCents)}` }),
        ]),
        progress,
        el('p', { className: 'goal-eta', textContent: eta }),
        el('div', { className: 'goal-actions' }, [input, addBtn, delBtn]),
      ]);
    }));
  }

  function renderTransactions() {
    const query = $('tx-search').value.trim().toLowerCase();
    const rows = data.transactions
      .filter((t) => L.monthKey(t.date) === currentMonth)
      .filter((t) => !query || `${t.category} ${t.note}`.toLowerCase().includes(query))
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

    $('tx-body').replaceChildren(...rows.map((t) => {
      const del = el('button', { type: 'button', className: 'icon-btn small', textContent: '×', title: 'Löschen' });
      del.setAttribute('aria-label', `Buchung ${t.category} vom ${formatDate(t.date)} löschen`);
      del.addEventListener('click', () => removeTransaction(t.id));
      const sign = t.type === 'income' ? '+' : '−';
      return el('tr', {}, [
        el('td', { className: 'date', textContent: formatDate(t.date) }),
        el('td', {}, [el('span', { className: `tag ${t.type}`, textContent: t.category })]),
        el('td', { className: 'note', textContent: t.note }),
        el('td', { className: `num ${t.type}`, textContent: `${sign} ${L.formatCents(t.amountCents)}` }),
        el('td', { className: 'actions' }, [del]),
      ]);
    }));
    const hasAny = data.transactions.some((t) => L.monthKey(t.date) === currentMonth);
    $('tx-empty').hidden = hasAny;
    $('tx-empty').textContent = 'Keine Buchungen in diesem Monat. Trag oben deine erste ein.';
    if (hasAny && !rows.length) {
      $('tx-empty').hidden = false;
      $('tx-empty').textContent = 'Keine Buchung passt zur Suche.';
    }
  }

  function renderCategoryOptions() {
    const type = document.querySelector('input[name="type"]:checked').value;
    $('category-list').replaceChildren(...L.categorySuggestions(data.transactions, type).map((c) => el('option', { value: c })));
  }

  // ---------- Aktionen ----------

  function removeTransaction(id) {
    const index = data.transactions.findIndex((t) => t.id === id);
    if (index < 0) return;
    lastDeleted = { item: data.transactions[index], index };
    data.transactions.splice(index, 1);
    save();
    render();
    showToast('Buchung gelöscht', () => {
      if (!lastDeleted) return;
      data.transactions.splice(lastDeleted.index, 0, lastDeleted.item);
      lastDeleted = null;
      save();
      render();
    });
  }

  function showFormError(id, text) {
    $(id).textContent = text;
    $(id).hidden = !text;
  }

  $('tx-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const form = ev.target;
    const cents = L.parseAmount(form.amount.value);
    const category = form.category.value.trim();
    const date = form.date.value;
    if (cents == null || cents <= 0) { showFormError('tx-error', 'Bitte einen Betrag größer als 0 eingeben, z. B. 12,50.'); form.amount.focus(); return; }
    if (!category) { showFormError('tx-error', 'Bitte eine Kategorie angeben.'); form.category.focus(); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { showFormError('tx-error', 'Bitte ein Datum wählen.'); form.date.focus(); return; }
    showFormError('tx-error', '');

    const type = form.type.value;
    data.transactions.push({ id: L.uid(), type, amountCents: cents, category, date, note: form.note.value.trim() });
    save();
    currentMonth = L.monthKey(date);
    form.amount.value = '';
    form.note.value = '';
    render();
    showToast(`${type === 'income' ? 'Einnahme' : 'Ausgabe'} über ${L.formatCents(cents)} gespeichert`);
    form.amount.focus();
  });

  document.querySelectorAll('input[name="type"]').forEach((radio) => radio.addEventListener('change', renderCategoryOptions));

  $('goal-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const name = $('goal-name').value.trim();
    const target = L.parseAmount($('goal-target').value);
    if (!name) { showFormError('goal-error', 'Gib dem Ziel einen Namen.'); return; }
    if (target == null || target <= 0) { showFormError('goal-error', 'Bitte einen Zielbetrag größer als 0 eingeben.'); return; }
    showFormError('goal-error', '');
    data.goals.push({ id: L.uid(), name, targetCents: target, savedCents: 0 });
    save();
    $('goal-name').value = '';
    $('goal-target').value = '';
    render();
  });

  $('month-prev').addEventListener('click', () => { currentMonth = L.shiftMonth(currentMonth, -1); render(); });
  $('month-next').addEventListener('click', () => { currentMonth = L.shiftMonth(currentMonth, 1); render(); });
  $('month-label').addEventListener('click', () => { currentMonth = L.todayKey(); render(); });
  $('tx-search').addEventListener('input', renderTransactions);

  $('export-json').addEventListener('click', () => {
    download(`money-tracker-backup-${L.todayDate()}.json`, JSON.stringify(data, null, 2), 'application/json');
    setStatus('Backup heruntergeladen.');
  });

  $('export-csv').addEventListener('click', () => {
    // BOM, damit Excel die Umlaute richtig erkennt
    download(`money-tracker-${L.todayDate()}.csv`, '﻿' + L.toCSV(data.transactions), 'text/csv;charset=utf-8');
    setStatus('CSV heruntergeladen.');
  });

  $('import-file').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    try {
      const imported = L.normalizeData(JSON.parse(await file.text()));
      replaceAll(imported, `Backup eingespielt: ${imported.transactions.length} Buchungen`);
      setStatus(`Backup eingespielt: ${imported.transactions.length} Buchungen, ${imported.goals.length} Sparziele.`);
    } catch (err) {
      setStatus(`Import fehlgeschlagen: ${err instanceof SyntaxError ? 'Die Datei ist kein gültiges JSON.' : err.message}`);
    }
  });

  $('reset-all').addEventListener('click', (ev) => armConfirm(ev.currentTarget, 'Wirklich alles löschen?', () => {
    replaceAll(L.emptyData(), 'Alle Daten gelöscht');
    setStatus('Alle Daten gelöscht.');
  }));

  // Diagramm bei Größenänderung neu zeichnen
  let resizeFrame = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(renderTrend);
  }).observe($('trend-chart'));

  // Änderungen aus einem anderen Tab übernehmen
  window.addEventListener('storage', (ev) => {
    if (ev.key === STORAGE_KEY) {
      data = load();
      lastDeleted = null;
      render();
    }
  });

  $('tx-date').value = L.todayDate();
  render();
  if (loadWarning) setStatus(loadWarning);
})();
