// Ironvale staff dashboard. Talks to /api/staff/* (login required).
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function api(path, method = 'GET', body) {
    const res = await fetch(path, {
      method,
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch { /* empty */ }
    if (res.status === 401 && path !== '/api/staff/login') { showLogin(); throw new Error('Please log in.'); }
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');
    return data;
  }

  let toastTimer;
  function toast(msg, isError = false) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = `toast${isError ? ' err' : ''}`;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }
  const fail = (err) => toast(err.message, true);

  // ---------- Login ----------
  function showLogin() {
    $('#login-view').hidden = false;
    $('#app-view').hidden = true;
    $('#logout').hidden = true;
    $('#login-form').password.focus();
  }
  function showApp() {
    $('#login-view').hidden = true;
    $('#app-view').hidden = false;
    $('#logout').hidden = false;
    refreshAll();
  }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#login-error').textContent = '';
    try {
      await api('/api/staff/login', 'POST', { password: e.target.password.value });
      e.target.reset();
      showApp();
    } catch (err) {
      $('#login-error').textContent = err.message;
    }
  });
  $('#logout').addEventListener('click', async () => {
    await api('/api/staff/login', 'DELETE').catch(() => {});
    showLogin();
  });

  // ---------- Tabs ----------
  for (const tab of $$('[data-tab]')) {
    tab.addEventListener('click', () => {
      for (const t of $$('[data-tab]')) t.setAttribute('aria-selected', String(t === tab));
      for (const p of $$('[data-panel]')) p.hidden = p.dataset.panel !== tab.dataset.tab;
      loaders[tab.dataset.tab]?.();
    });
  }

  // ---------- Overview tiles ----------
  let today = null;
  const ago = (iso) => {
    const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
    return min < 1 ? 'just now' : min < 60 ? `${min} min ago` : `${Math.floor(min / 60)} h ${min % 60} min ago`;
  };
  const SOURCE_NAMES = { website: 'Website', whatsapp: 'WhatsApp', phone: 'Phone', 'walk-in': 'Walk-in', instagram: 'Instagram', referral: 'Friend / member', other: 'Other' };

  async function loadTiles() {
    const o = await api('/api/staff/overview');
    const c = o.counts;
    today = o.today;
    const fresh = o.last_count && Date.now() - Date.parse(o.last_count.at) < 2 * 3_600_000;
    const tiles = [
      [fresh ? o.last_count.people : '–', fresh ? `In the gym now (${ago(o.last_count.at)})` : 'In the gym now (no recent count)'],
      [c.today, 'Bookings today'],
      [c.attended, 'Check-ins, last 7 days'],
      [c.trialsNew, 'New leads to call', c.trialsNew > 0],
      [c.messagesNew, 'New messages', c.messagesNew > 0],
      [c.leadsMonth, 'Leads this month'],
      [c.joinedMonth, 'Joined this month'],
      [o.taps.whatsapp || 0, 'WhatsApp taps, 7 days'],
      [o.taps.call || 0, 'Call taps, 7 days'],
    ];
    $('#tiles').innerHTML = tiles.map(([n, label, hot]) => `<div class="tile${hot ? ' hot' : ''}"><b>${n}</b><span>${label}</span></div>`).join('');
    $('#sources').textContent = o.sources.length
      ? `Leads this month by source: ${o.sources.map((r) => `${SOURCE_NAMES[r.source] || r.source} ${r.n}`).join(' · ')}`
      : '';
  }

  // ---------- Crowd: head count, today vs usual, busy hours ----------
  const countForm = $('#count-form');
  for (const b of $$('.step', countForm)) {
    b.addEventListener('click', () => {
      const v = Math.max(0, (Number(countForm.people.value) || 0) + Number(b.dataset.step));
      countForm.people.value = v;
    });
  }
  countForm.addEventListener('submit', (e) => {
    e.preventDefault();
    api('/api/staff/crowd', 'POST', { people: Number(countForm.people.value) })
      .then(() => { toast('Count saved. The website shows it now.'); loadCrowd(); loadTiles(); }).catch(fail);
  });
  $('#sample-add').addEventListener('click', () => {
    if (!confirm('Add 4 weeks of made-up counts? Only for practice.')) return;
    api('/api/staff/crowd', 'POST', { sample: true }).then((r) => { toast(`Added ${r.added} practice counts`); loadCrowd(); }).catch(fail);
  });
  $('#sample-remove').addEventListener('click', () => {
    api('/api/staff/crowd', 'DELETE').then(() => { toast('Practice counts removed'); loadCrowd(); loadTiles(); }).catch(fail);
  });

  const OPEN = { 5: [14, 22] }; // Friday 2 PM to 10 PM; every other day 6 AM to 11 PM
  const hoursOf = (d) => OPEN[d] || [6, 23];
  const ORDER = [6, 0, 1, 2, 3, 4, 5]; // the week starts on Saturday in Jordan

  function lineChart(el, todayCounts, usualRow, now) {
    const [open, close] = hoursOf(now.weekday);
    const W = Math.max(320, Math.min(900, el.clientWidth || 720)); const H = W < 500 ? 220 : 260; const L = 34; const R = 12; const T = 12; const B = 28;
    const x = (h) => L + ((h - open) / (close - open)) * (W - L - R);
    const pts = todayCounts.map((p) => ({ h: p.hour + p.minute / 60, v: p.people }));
    const usual = [];
    for (let h = open; h < close; h++) if (usualRow[h] != null) usual.push({ h: h + 0.5, v: usualRow[h] });
    const max = Math.max(10, ...pts.map((p) => p.v), ...usual.map((p) => p.v));
    const top = Math.ceil(max / 10) * 10;
    const y = (v) => T + (1 - v / top) * (H - T - B);
    const path = (arr) => arr.map((p, i) => `${i ? 'L' : 'M'}${x(p.h).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
    let grid = '';
    for (let v = 0; v <= top; v += top / 4) grid += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    let xs = '';
    for (let h = open; h <= close; h += W < 500 ? 4 : 2) xs += `<text x="${x(h)}" y="${H - 8}" text-anchor="middle">${h}:00</text>`;
    const nowX = now.hour >= open && now.hour < close ? x(now.hour + now.minute / 60) : null;
    el.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="People in the gym today compared with a usual day">
        <g class="grid axis">${grid}</g><g class="axis">${xs}</g>
        ${nowX ? `<line x1="${nowX}" x2="${nowX}" y1="${T}" y2="${H - B}" stroke="#a6aeb7" stroke-width="1" stroke-dasharray="2 4"/>` : ''}
        <path d="${path(usual)}" fill="none" stroke="#8b93a1" stroke-width="2" stroke-dasharray="6 5" stroke-linecap="round"/>
        <path d="${path(pts)}" fill="none" stroke="#c9f231" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
        ${pts.map((p) => `<circle cx="${x(p.h)}" cy="${y(p.v)}" r="4.5" fill="#c9f231" stroke="#14171c" stroke-width="2"/>`).join('')}
        <line class="hover" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="#f3f5f6" stroke-width="1" visibility="hidden"/>
        <rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/>
      </svg>
      <div class="tip" hidden></div>
      ${pts.length ? '' : '<p class="muted">No counts yet today. Save the first one above.</p>'}`;
    const svg = $('svg', el); const tip = $('.tip', el); const line = $('.hover', el);
    svg.addEventListener('pointermove', (e) => {
      const box = svg.getBoundingClientRect();
      const sx = ((e.clientX - box.left) / box.width) * W;
      const h = Math.min(close - 0.01, Math.max(open, open + ((sx - L) / (W - L - R)) * (close - open)));
      const hour = Math.floor(h);
      const mid = x(hour + 0.5);
      const nearest = pts.filter((p) => Math.floor(p.h) === hour).pop();
      line.setAttribute('x1', mid); line.setAttribute('x2', mid); line.setAttribute('visibility', 'visible');
      tip.hidden = false;
      tip.style.left = `${(mid / W) * 100}%`;
      tip.style.top = `${(T / H) * 100}%`;
      tip.textContent = `${hour}:00 · today ${nearest ? nearest.v : '–'} · usual ${usualRow[hour] ?? '–'}`;
    });
    svg.addEventListener('pointerleave', () => { tip.hidden = true; line.setAttribute('visibility', 'hidden'); });
  }

  function heatmap(table, usual) {
    let max = 1;
    usual.forEach((row) => row.forEach((v) => { if (v != null) max = Math.max(max, v); }));
    let html = '<tr><th></th>';
    for (let h = 6; h < 23; h++) html += `<th scope="col">${h}</th>`;
    html += '</tr>';
    for (const d of ORDER) {
      const [open, close] = hoursOf(d);
      html += `<tr><th scope="row">${DAYS[d].slice(0, 3)}</th>`;
      for (let h = 6; h < 23; h++) {
        const v = usual[d][h];
        if (v == null || h < open || h >= close) { html += `<td class="none" title="${DAYS[d]} ${h}:00: no counts"></td>`; continue; }
        const a = 0.15 + 0.85 * (v / max);
        html += `<td style="background:rgba(201,242,49,${a.toFixed(2)})" title="${DAYS[d]} ${h}:00: usually ${Math.round(v)} people">${Math.round(v)}</td>`;
      }
      html += '</tr>';
    }
    table.innerHTML = html;
  }

  async function loadCrowd() {
    const c = await api('/api/staff/crowd');
    const last = c.last;
    $('#last-count').textContent = last ? `Last count: ${last.people} people, ${ago(last.at)}` : 'No counts yet.';
    if (last && document.activeElement !== countForm.people) countForm.people.value = last.people;
    const [open, close] = hoursOf(c.now.weekday);
    const isOpen = c.now.hour >= open && c.now.hour < close;
    const late = !last || Date.now() - Date.parse(last.at) > 45 * 60_000;
    $('#overdue').hidden = !(isOpen && late);
    $('#overdue').textContent = last ? `Time to count: the last count was ${ago(last.at)}.` : 'Time to count: no count yet today.';
    $('#chart-day').textContent = DAYS[c.now.weekday];
    lineChart($('#line-chart'), c.today, c.usual[c.now.weekday], c.now);
    heatmap($('#heatmap'), c.usual);
    $('#sample-remove').disabled = !c.has_samples;
  }
  setInterval(() => {
    if (!$('#app-view').hidden && document.visibilityState === 'visible') { loadTiles().catch(() => {}); if (!$('[data-panel=crowd]').hidden) loadCrowd().catch(() => {}); }
  }, 60_000);

  // ---------- Classes on a day ----------
  const dateInput = $('#day-date');
  function shift(days) {
    const d = new Date(`${dateInput.value}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    dateInput.value = d.toISOString().slice(0, 10);
    loadDay();
  }
  $('#day-prev').addEventListener('click', () => shift(-1));
  $('#day-next').addEventListener('click', () => shift(1));
  $('#day-today').addEventListener('click', () => { dateInput.value = today; loadDay(); });
  dateInput.addEventListener('change', loadDay);

  async function loadDay() {
    if (!dateInput.value) dateInput.value = today;
    const { sessions } = await api(`/api/staff/sessions?date=${dateInput.value}`);
    const list = $('#day-list');
    const day = DAYS[new Date(`${dateInput.value}T12:00:00Z`).getUTCDay()];
    if (!sessions.length) { list.innerHTML = `<p class="tt-empty">No classes on ${day}.</p>`; return; }
    list.innerHTML = '';
    for (const s of sessions) {
      const card = document.createElement('article');
      card.className = `class-card${s.cancelled ? ' off' : ''}`;
      card.innerHTML = `
        <div class="class-head">
          <h3>${esc(s.start_time)} · ${esc(s.name_en)}${s.ladies_only ? ' <span class="tag tag-ladies">Ladies</span>' : ''}${s.cancelled ? ' <span class="tag tag-full">Cancelled</span>' : ''}</h3>
          <span class="muted">${esc(s.coach)} · ${s.booked}/${s.capacity} booked</span>
        </div>
        <ul class="people">${s.people.length ? '' : '<li class="muted">No bookings yet.</li>'}</ul>
        <form class="walkin">
          <input name="name" placeholder="Walk-in name" required>
          <input name="phone" placeholder="Phone" type="tel" required>
          <button class="btn btn-ghost btn-small" type="submit">Add</button>
          <button class="btn btn-ghost btn-small" type="button" data-cancel>${s.cancelled ? 'Restore class' : 'Cancel class this day'}</button>
        </form>`;
      const ul = $('.people', card);
      for (const p of s.people) {
        const li = document.createElement('li');
        li.className = 'person';
        const wa = p.phone.replace(/^0/, '962').replace(/\D/g, '');
        li.innerHTML = `
          <span class="who"><b>${esc(p.name)}</b><a href="tel:${esc(p.phone)}">${esc(p.phone)}</a></span>
          <span class="seg" role="group" aria-label="Status">
            ${['booked', 'attended', 'no_show', 'cancelled'].map((st) => `<button type="button" data-status="${st}" aria-pressed="${p.status === st}">${{ booked: 'Booked', attended: 'Here', no_show: 'No-show', cancelled: 'Cancel' }[st]}</button>`).join('')}
          </span>
          <a href="https://wa.me/${wa}" target="_blank" rel="noopener">WhatsApp</a>`;
        for (const b of $$('[data-status]', li)) {
          b.addEventListener('click', () => api('/api/staff/bookings', 'PATCH', { id: p.id, status: b.dataset.status })
            .then(() => { toast('Saved'); loadDay(); loadTiles(); }).catch(fail));
        }
        ul.append(li);
      }
      $('.walkin', card).addEventListener('submit', (e) => {
        e.preventDefault();
        const f = e.target;
        api('/api/staff/bookings', 'POST', { class_id: s.class_id, date: s.date, name: f.name.value, phone: f.phone.value })
          .then(() => { toast('Added'); loadDay(); loadTiles(); }).catch(fail);
      });
      $('[data-cancel]', card).addEventListener('click', () => {
        if (!s.cancelled && !confirm(`Cancel ${s.name_en} on ${day} ${s.date}? It will show as cancelled on the website. Call the ${s.booked} people booked.`)) return;
        api('/api/staff/sessions', 'POST', { class_id: s.class_id, date: s.date, cancelled: !s.cancelled })
          .then(() => { toast('Saved'); loadDay(); }).catch(fail);
      });
      list.append(card);
    }
  }

  // ---------- Trials and messages ----------
  const when = (iso) => new Date(`${iso.replace(' ', 'T')}Z`).toLocaleString('en-GB', { timeZone: 'Asia/Amman', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  function select(options, value) {
    return `<select>${options.map((o) => `<option value="${o}"${o === value ? ' selected' : ''}>${o.replace('_', ' ')}</option>`).join('')}</select>`;
  }

  async function loadLeads() {
    const { trials, messages } = await api('/api/staff/leads');
    const tt = $('#trials');
    tt.innerHTML = '<tr><th>When</th><th>From</th><th>Name</th><th>Phone</th><th>Email</th><th>Goal</th><th>Day</th><th>Status</th><th>Note</th></tr>'
      + (trials.length ? '' : '<tr><td colspan="9" class="muted">No leads yet.</td></tr>');
    for (const r of trials) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="${r.status === 'new' ? 'new' : ''}">${when(r.created_at)}</td><td>${esc(SOURCE_NAMES[r.source] || r.source || 'Website')}</td><td>${esc(r.name)}</td>
        <td><a href="tel:${esc(r.phone)}">${esc(r.phone)}</a></td><td>${esc(r.email)}</td><td>${esc(r.goal)}</td><td>${esc(r.preferred_day)}</td>
        <td>${select(['new', 'contacted', 'visited', 'joined', 'not_interested'], r.status)}</td>
        <td><input value="${esc(r.note)}" maxlength="300" placeholder="Add a note"></td>`;
      const save = () => api('/api/staff/leads', 'PATCH', { type: 'trial', id: r.id, status: $('select', tr).value, note: $('input', tr).value })
        .then(() => { toast('Saved'); loadTiles(); }).catch(fail);
      $('select', tr).addEventListener('change', save);
      $('input', tr).addEventListener('change', save);
      tt.append(tr);
    }
    const mt = $('#messages');
    mt.innerHTML = '<tr><th>When</th><th>Name</th><th>Phone</th><th>Email</th><th>Topic</th><th>Message</th><th>Status</th></tr>'
      + (messages.length ? '' : '<tr><td colspan="7" class="muted">No messages yet.</td></tr>');
    for (const m of messages) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="${m.status === 'new' ? 'new' : ''}">${when(m.created_at)}</td><td>${esc(m.name)}</td>
        <td>${m.phone ? `<a href="tel:${esc(m.phone)}">${esc(m.phone)}</a>` : ''}</td><td>${m.email ? `<a href="mailto:${esc(m.email)}">${esc(m.email)}</a>` : ''}</td>
        <td>${esc(m.topic)}</td><td class="msg">${esc(m.body)}</td><td>${select(['new', 'replied', 'closed'], m.status)}</td>`;
      $('select', tr).addEventListener('change', (e) => api('/api/staff/leads', 'PATCH', { type: 'message', id: m.id, status: e.target.value })
        .then(() => { toast('Saved'); loadTiles(); }).catch(fail));
      mt.append(tr);
    }
  }

  $('#lead-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    api('/api/staff/leads', 'POST', { name: f.name.value, phone: f.phone.value, source: f.source.value, goal: f.goal.value, note: f.note.value })
      .then(() => { toast('Lead added'); f.reset(); loadLeads(); loadTiles(); }).catch(fail);
  });

  // ---------- Weekly timetable ----------
  const dayOptions = (v) => [6, 0, 1, 2, 3, 4, 5].map((d) => `<option value="${d}"${d === v ? ' selected' : ''}>${DAYS[d]}</option>`).join('');
  function classFields(c = {}) {
    return `
      <label>Name (English)<input name="name_en" value="${esc(c.name_en)}" required maxlength="60"></label>
      <label>Name (Arabic)<input name="name_ar" value="${esc(c.name_ar)}" maxlength="60" dir="rtl"></label>
      <label>Coach<input name="coach" value="${esc(c.coach)}" maxlength="40"></label>
      <label>Day<select name="weekday">${dayOptions(c.weekday ?? 6)}</select></label>
      <label>Start<input name="start_time" type="time" value="${esc(c.start_time || '18:00')}" required></label>
      <label>Minutes<input name="duration_min" type="number" min="10" max="240" value="${c.duration_min || 60}"></label>
      <label>Spots<input name="capacity" type="number" min="1" max="200" value="${c.capacity || 12}"></label>
      <label class="check"><input name="ladies_only" type="checkbox"${c.ladies_only ? ' checked' : ''}> Ladies only</label>`;
  }
  const readClass = (f) => ({
    name_en: f.name_en.value, name_ar: f.name_ar.value, coach: f.coach.value,
    weekday: Number(f.weekday.value), start_time: f.start_time.value,
    duration_min: Number(f.duration_min.value), capacity: Number(f.capacity.value),
    ladies_only: f.ladies_only.checked,
  });

  const classForm = $('#class-form');
  classForm.innerHTML = `${classFields()}<button class="btn" type="submit">Add class</button>`;
  classForm.addEventListener('submit', (e) => {
    e.preventDefault();
    api('/api/staff/classes', 'POST', readClass(classForm))
      .then(() => { toast('Class added'); classForm.reset(); loadClasses(); }).catch(fail);
  });

  async function loadClasses() {
    const { classes } = await api('/api/staff/classes');
    const table = $('#classes');
    table.innerHTML = '<tr><th>Day</th><th>Start</th><th>Class</th><th>Coach</th><th>Min</th><th>Spots</th><th>On website</th><th></th></tr>';
    for (const c of classes) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${DAYS[c.weekday]}</td><td>${esc(c.start_time)}</td><td>${esc(c.name_en)}${c.ladies_only ? ' <span class="tag tag-ladies">Ladies</span>' : ''}<br><span class="muted" dir="rtl">${esc(c.name_ar)}</span></td>
        <td>${esc(c.coach)}</td><td>${c.duration_min}</td><td>${c.capacity}</td>
        <td><label class="check"><input type="checkbox"${c.active ? ' checked' : ''}> ${c.active ? 'Shown' : 'Hidden'}</label></td>
        <td><button class="btn btn-ghost btn-small" type="button">Edit</button></td>`;
      $('input[type=checkbox]', tr).addEventListener('change', (e) => api('/api/staff/classes', 'PATCH', { ...c, ladies_only: !!c.ladies_only, active: e.target.checked })
        .then(() => { toast(e.target.checked ? 'Shown on website' : 'Hidden from website'); loadClasses(); }).catch(fail));
      $('button', tr).addEventListener('click', () => {
        const edit = document.createElement('tr');
        edit.innerHTML = `<td colspan="8"><form class="form class-form">${classFields(c)}<button class="btn" type="submit">Save</button></form></td>`;
        tr.replaceWith(edit);
        $('form', edit).addEventListener('submit', (e) => {
          e.preventDefault();
          api('/api/staff/classes', 'PATCH', { id: c.id, active: !!c.active, ...readClass(e.target) })
            .then(() => { toast('Saved'); loadClasses(); }).catch(fail);
        });
      });
      table.append(tr);
    }
  }

  // ---------- Settings ----------
  const settingsForm = $('#settings-form');
  async function loadSettings() {
    const s = await api('/api/staff/settings');
    settingsForm.notice_en.value = s.notice_en || '';
    settingsForm.notice_ar.value = s.notice_ar || '';
    settingsForm.booking_open.checked = s.booking_open === '1';
  }
  settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    api('/api/staff/settings', 'PUT', {
      notice_en: settingsForm.notice_en.value,
      notice_ar: settingsForm.notice_ar.value,
      booking_open: settingsForm.booking_open.checked,
    }).then(() => toast('Saved. The website shows it within a minute.')).catch(fail);
  });

  const loaders = { crowd: loadCrowd, day: loadDay, leads: loadLeads, timetable: loadClasses, settings: loadSettings };

  async function refreshAll() {
    try {
      await loadTiles();
      const open = $('[data-tab][aria-selected="true"]').dataset.tab;
      await loaders[open]();
    } catch (err) { fail(err); }
  }

  api('/api/staff/login').then((d) => (d.staff ? showApp() : showLogin())).catch((err) => { showLogin(); fail(err); });
})();
