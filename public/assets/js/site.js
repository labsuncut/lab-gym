// Ironvale public site: language switch, live timetable, booking, forms.
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // ---------- Language ----------
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };
  let lang = store.get('lang') === 'ar' ? 'ar' : 'en';
  const t = () => window.UI[lang];
  const originals = new Map();
  const rerenders = [];

  function applyLang() {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    for (const el of $$('[data-i18n]')) {
      if (!originals.has(el)) originals.set(el, el.textContent);
      const ar = window.AR[el.dataset.i18n];
      el.textContent = lang === 'ar' && ar ? ar : originals.get(el);
    }
    for (const el of $$('[data-i18n-html]')) {
      if (!originals.has(el)) originals.set(el, el.innerHTML);
      const ar = window.AR[el.dataset.i18nHtml];
      el.innerHTML = lang === 'ar' && ar ? ar : originals.get(el);
    }
    const toggle = $('#lang-toggle');
    if (toggle) {
      toggle.textContent = lang === 'ar' ? 'English' : 'عربي';
      toggle.lang = lang === 'ar' ? 'en' : 'ar';
    }
    rerenders.forEach((fn) => fn());
  }

  $('#lang-toggle')?.addEventListener('click', () => {
    lang = lang === 'ar' ? 'en' : 'ar';
    store.set('lang', lang);
    applyLang();
  });

  // ---------- Helpers ----------
  async function api(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: options.body ? { 'content-type': 'application/json' } : {},
    });
    let data = {};
    try { data = await res.json(); } catch { /* not JSON */ }
    if (!res.ok) {
      const err = new Error(data.error || 'Request failed');
      err.status = res.status;
      throw err;
    }
    return data;
  }
  const errorText = (err) => (lang === 'en' && err.status && err.status < 500 ? err.message : t().failed);

  function ammanNow() {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Amman', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
    }).formatToParts(new Date()).map((x) => [x.type, x.value]));
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
    return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute), day };
  }
  const dayOf = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay();
  const shortDate = (iso) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;

  // ---------- Menu ----------
  const menu = $('#menu-toggle');
  const nav = $('#nav');
  menu?.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    menu.setAttribute('aria-expanded', String(open));
  });
  nav?.addEventListener('click', (e) => {
    if (e.target.closest('a')) { nav.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); }
  });

  const year = $('#year');
  if (year) year.textContent = new Date().getFullYear();

  // ---------- Open now + today's hours ----------
  // Keep in sync with the hours table: [open, close] in minutes, by weekday (0 = Sunday).
  const HOURS = { 0: [360, 1380], 1: [360, 1380], 2: [360, 1380], 3: [360, 1380], 4: [360, 1380], 5: [840, 1320], 6: [360, 1380] };
  function renderOpen() {
    const el = $('#open-now');
    if (!el) return;
    const now = ammanNow();
    const [o, c] = HOURS[now.day];
    const open = now.minutes >= o && now.minutes < c;
    el.classList.toggle('is-open', open);
    el.textContent = open ? t().openNow : t().closedNow;
    for (const row of $$('#hours tr')) {
      row.classList.toggle('today', row.dataset.days.split(',').map(Number).includes(now.day));
    }
  }
  rerenders.push(renderOpen);

  // ---------- Notice bar (set by staff in the dashboard) ----------
  let notice = null;
  function renderNotice() {
    const el = $('#notice');
    if (!el || !notice) return;
    const msg = (lang === 'ar' && notice.notice_ar) || notice.notice_en;
    el.textContent = msg;
    el.hidden = !msg;
  }
  rerenders.push(renderNotice);
  if ($('#notice')) {
    api('/api/info').then((d) => { notice = d; renderNotice(); }).catch(() => {});
  }

  // ---------- Timetable ----------
  const sessionsEl = $('#sessions');
  const tabsEl = $('#day-tabs');
  const ladiesFilter = $('#ladies-filter');
  let schedule = null;
  let scheduleError = false;
  let selected = null;

  async function loadSchedule() {
    try {
      schedule = await api('/api/schedule');
      scheduleError = false;
      if (!selected) {
        // Start on the first day that still has a bookable class.
        const firstOpen = schedule.sessions.find((s) => !s.past && !s.cancelled);
        selected = firstOpen ? firstOpen.date : schedule.today;
      }
    } catch {
      scheduleError = true;
    }
    renderSchedule();
  }

  function renderSchedule() {
    if (!sessionsEl) return;
    if (scheduleError) { sessionsEl.innerHTML = `<p class="tt-status">${t().error}</p>`; tabsEl.innerHTML = ''; return; }
    if (!schedule) return;

    const dates = [...new Set(Array.from({ length: 7 }, (_, i) => {
      const d = new Date(`${schedule.today}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + i);
      return d.toISOString().slice(0, 10);
    }))];
    tabsEl.replaceChildren(...dates.map((date, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'day-tab';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(date === selected));
      const label = i === 0 ? t().today : i === 1 ? t().tomorrow : t().days[dayOf(date)];
      b.innerHTML = `${label}<small>${shortDate(date)}</small>`;
      b.addEventListener('click', () => { selected = date; renderSchedule(); });
      return b;
    }));

    if (!schedule.booking_open) {
      sessionsEl.innerHTML = `<p class="tt-status">${t().paused}</p>`;
      return;
    }
    const list = schedule.sessions.filter((s) => s.date === selected && (!ladiesFilter?.checked || s.ladies_only));
    if (!list.length) { sessionsEl.innerHTML = `<p class="tt-empty">${t().none}</p>`; return; }

    sessionsEl.replaceChildren(...list.map((s) => {
      const row = document.createElement('article');
      row.className = 'session';
      const name = lang === 'ar' ? s.name_ar : s.name_en;
      const full = s.spots_left === 0;
      const state = s.cancelled ? t().cancelled : s.past ? t().started : full ? t().full : '';
      row.innerHTML = `
        <time datetime="${s.date}T${s.start_time}">${s.start_time}</time>
        <div>
          <h3></h3>
          <div class="meta"></div>
        </div>
        <div class="session-side">
          <div class="spots ${s.spots_left <= 3 ? 'low' : ''}">${state ? '' : t().spots(s.spots_left)}</div>
          <button class="btn btn-small" type="button" ${state ? 'disabled' : ''}>${state || t().book}</button>
        </div>`;
      $('h3', row).textContent = name;
      if (s.ladies_only) $('h3', row).insertAdjacentHTML('beforeend', `<span class="tag tag-ladies">${t().ladies}</span>`);
      $('.meta', row).textContent = `${s.duration_min} ${t().min}${s.coach ? ` · ${t().with} ${s.coach}` : ''}`;
      $('button', row).addEventListener('click', () => openBooking(s));
      return row;
    }));
  }
  rerenders.push(renderSchedule);
  ladiesFilter?.addEventListener('change', renderSchedule);
  if (sessionsEl) {
    loadSchedule();
    setInterval(() => { if (document.visibilityState === 'visible') loadSchedule(); }, 60_000);
  }

  // ---------- Booking dialog ----------
  const dialog = $('#book-dialog');
  const bookForm = $('#book-form');
  let current = null;

  function sessionLabel(s) {
    const day = t().days[dayOf(s.date)];
    const name = lang === 'ar' ? s.name_ar : s.name_en;
    return `<strong></strong>${day} ${shortDate(s.date)} · ${s.start_time} · ${s.duration_min} ${t().min}`
      .replace('<strong></strong>', `<strong>${escapeHtml(name)}</strong>`);
  }
  function escapeHtml(v) {
    return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function openBooking(s) {
    current = s;
    $('#book-summary').innerHTML = sessionLabel(s);
    $('#book-fields').hidden = false;
    $('#book-done').hidden = true;
    $('#book-error').textContent = '';
    const saved = store.get('booker');
    if (saved) {
      try {
        const { name, phone } = JSON.parse(saved);
        bookForm.name.value ||= name || '';
        bookForm.phone.value ||= phone || '';
      } catch { /* ignore */ }
    }
    dialog.showModal();
    (bookForm.name.value ? $('button[type=submit]', bookForm) : bookForm.name).focus();
  }

  $$('[data-close]', dialog || document).forEach((b) => b.addEventListener('click', () => dialog.close()));
  dialog?.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

  function icsFor(b) {
    const start = `${b.date.replace(/-/g, '')}T${b.start_time.replace(':', '')}00`;
    const endMin = Number(b.start_time.slice(0, 2)) * 60 + Number(b.start_time.slice(3)) + b.duration_min;
    const end = `${b.date.replace(/-/g, '')}T${String(Math.floor(endMin / 60) % 24).padStart(2, '0')}${String(endMin % 60).padStart(2, '0')}00`;
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ironvale//Booking//EN', 'BEGIN:VEVENT',
      `UID:${Date.now()}@ironvale`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
      `DTSTART;TZID=Asia/Amman:${start}`, `DTEND;TZID=Asia/Amman:${end}`,
      `SUMMARY:${b.name_en} at Ironvale`, 'LOCATION:Abdali Boulevard\\, Amman', 'END:VEVENT', 'END:VCALENDAR',
    ];
    return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines.join('\r\n'))}`;
  }

  bookForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#book-error');
    err.textContent = '';
    const name = bookForm.name.value.trim();
    const phone = bookForm.phone.value.trim();
    if (!name || !phone) { err.textContent = t().need; return; }
    const btn = $('button[type=submit]', bookForm);
    btn.disabled = true;
    try {
      const res = await api('/api/book', {
        method: 'POST',
        body: JSON.stringify({ class_id: current.class_id, date: current.date, name, phone, website: bookForm.website.value }),
      });
      store.set('booker', JSON.stringify({ name, phone }));
      $('#book-manage').href = `booking.html?t=${encodeURIComponent(res.token)}`;
      $('#book-ics').href = icsFor(res.booking);
      $('#book-fields').hidden = true;
      $('#book-done').hidden = false;
      loadSchedule();
    } catch (ex) {
      err.textContent = errorText(ex);
      if (ex.status === 409) loadSchedule();
    } finally {
      btn.disabled = false;
    }
  });

  // ---------- Trial and contact forms ----------
  for (const form of $$('form[data-endpoint]')) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const status = $('.form-status', form);
      const btn = $('button[type=submit]', form);
      const missing = $$('[required]', form).find((el) => !el.value.trim());
      if (missing) {
        status.className = 'form-status err';
        status.textContent = t().need;
        missing.focus();
        return;
      }
      status.className = 'form-status';
      status.textContent = t().sending;
      btn.disabled = true;
      try {
        await api(form.dataset.endpoint, { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
        form.reset();
        status.className = 'form-status ok';
        status.textContent = form.dataset.endpoint.includes('trial') ? t().trialOk : t().contactOk;
      } catch (ex) {
        status.className = 'form-status err';
        status.textContent = errorText(ex);
      } finally {
        btn.disabled = false;
      }
    });
  }

  // ---------- My booking page (booking.html) ----------
  const manage = $('#manage');
  if (manage) {
    const token = new URLSearchParams(location.search).get('t');
    let booking = null;
    let message = '';
    const render = () => {
      if (!booking) { manage.innerHTML = `<p class="tt-status">${message || t().notFound}</p>`; return; }
      const name = lang === 'ar' ? booking.name_ar : booking.name_en;
      manage.innerHTML = `
        <div class="summary"><strong></strong><span class="when"></span></div>
        <p class="muted state"></p>
        <p class="form-status ok"></p>
        <div class="confirm-actions"></div>`;
      $('strong', manage).textContent = name;
      $('.when', manage).textContent = `${t().days[dayOf(booking.date)]} ${shortDate(booking.date)} · ${booking.start_time} · ${booking.duration_min} ${t().min} · ${booking.name}`;
      $('.state', manage).textContent = t().status[booking.status] || booking.status;
      $('.form-status', manage).textContent = message;
      if (booking.status === 'booked') {
        const btn = document.createElement('button');
        btn.className = 'btn btn-danger';
        btn.type = 'button';
        btn.textContent = window.AR && lang === 'ar' ? window.AR['mb.cancel'] : 'Cancel booking';
        btn.addEventListener('click', async () => {
          if (!confirm(t().cancelAsk)) return;
          btn.disabled = true;
          try {
            await api('/api/booking', { method: 'POST', body: JSON.stringify({ token }) });
            booking.status = 'cancelled';
            message = t().cancelOk;
          } catch (ex) {
            message = errorText(ex);
          }
          render();
        });
        $('.confirm-actions', manage).append(btn);
      }
    };
    rerenders.push(render);
    api(`/api/booking?t=${encodeURIComponent(token || '')}`)
      .then((d) => { booking = d.booking; render(); })
      .catch(() => render());
  }

  applyLang();
})();
