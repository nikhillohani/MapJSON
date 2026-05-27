/* ─────────────────────────────────────────────────────────────
   Map JSON Generator — app.js
   ───────────────────────────────────────────────────────────── */

const App = (() => {

  // ── CONSTANTS ──────────────────────────────────────────────
  const APP_VERSION = 'V1';
  const STORAGE_PREFIX = 'mapjson_saved_entries_v1_';
  const CURRENT_USER_KEY = 'mapjson_current_user_v1';
  const USAGE_KEY = 'mapjson_usage_log_v1';
  const THEME_KEY = 'mapjson_theme_mode_v1';
  const OWNER_NAMES = ['nikhil', 'nikhil lohani'];
  const TRACKING_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxPUlmymLxTmmn-bJPIq4VrUjMNWuU5PBEGXmxkKsKIGmoge7m2t1qCFkdUTxfD7BkK8Q/exec'; // Optional: paste a Google Apps Script/Webhook URL here for GitHub Pages usage tracking.
  const COLORS = [
    { idx: 1, cls: 'f1', btn: 'sc1' },
    { idx: 2, cls: 'f2', btn: 'sc2' },
    { idx: 3, cls: 'f3', btn: 'sc3' },
    { idx: 4, cls: 'f4', btn: 'sc4' },
    { idx: 5, cls: 'f5', btn: 'sc5' },
    { idx: 6, cls: 'f6', btn: 'sc6' },
  ];

  // ── STATE ──────────────────────────────────────────────────
  let globalIdCounter = 1;
  let groups          = [];   // [{ gid, slots:[{sid, data}], generatedJSON }]
  let gidCounter      = 0;
  let sidCounter      = 0;
  let allSaved        = [];   // flat list of every saved entry (persisted)
  let latestJSON      = '';
  let urlLookupResult = null; // holds the last built entry from URL lookup
  let urlEditOpen     = false;
  let currentUser     = null;

  function userStorageKey() {
    return STORAGE_PREFIX + slugUser(currentUser || 'guest');
  }

  // ── STORAGE ────────────────────────────────────────────────
  function storageSave() {
    if (!currentUser) return;
    try {
      localStorage.setItem(userStorageKey(), JSON.stringify({
        allSaved,
        globalIdCounter,
      }));
      updateStoragePill('Saved ✓');
    } catch (e) {
      updateStoragePill('Storage error');
    }
  }

  function storageLoad() {
    if (!currentUser) return;
    try {
      const raw = localStorage.getItem(userStorageKey());
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed.allSaved)        allSaved        = parsed.allSaved;
      if (parsed.globalIdCounter) globalIdCounter = parsed.globalIdCounter;
    } catch (e) { /* ignore */ }
  }

  function loginUser() {
    const name = val('login-name').trim();
    if (!name) {
      const input = document.getElementById('login-name');
      if (input) input.focus();
      return;
    }
    currentUser = name;
    sessionStorage.setItem(CURRENT_USER_KEY, name);
    recordUsage(name);
    sendRemoteUsage(name);
    startWorkspace();
  }

  function recordUsage(name) {
    const usage = getUsageLog();
    const now = new Date();
    usage.unshift({
      name,
      version: APP_VERSION,
      at: now.toISOString(),
      displayAt: now.toLocaleString(),
    });
    localStorage.setItem(USAGE_KEY, JSON.stringify(usage.slice(0, 50)));
  }

  function getUsageLog() {
    try {
      return JSON.parse(localStorage.getItem(USAGE_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function renderUsageLog() {
    updateAdminVisibility();
    const list = document.getElementById('usage-list');
    if (!list) return;
    const usage = getUsageLog();
    if (!usage.length) {
      list.innerHTML = '<div class="empty-hist">No usage yet.</div>';
      return;
    }
    list.innerHTML = usage.map(item => `
      <div class="usage-item">
        <span class="usage-name">${esc(item.name || 'Unknown')}</span>
        <span class="usage-meta">${esc(item.version || APP_VERSION)} · ${esc(item.displayAt || '')}</span>
      </div>
    `).join('');
  }

  function clearUsageLog() {
    if (!isOwner()) return;
    if (!confirm('Clear the usage log for this browser?')) return;
    localStorage.removeItem(USAGE_KEY);
    renderUsageLog();
  }

  function isOwner() {
    return OWNER_NAMES.includes(slugUser(currentUser || '').replace(/-/g, ' '));
  }

  function updateAdminVisibility() {
    const panel = document.getElementById('owner-usage-panel');
    if (panel) panel.style.display = isOwner() ? 'block' : 'none';
    const note = document.getElementById('tracking-note');
    if (note) {
      note.textContent = TRACKING_ENDPOINT
        ? 'Remote tracking is configured. Usage is sent when users enter their name.'
        : 'Remote tracking is off. Local log only appears in this browser.';
    }
  }

  function sendRemoteUsage(name) {
    if (!TRACKING_ENDPOINT) return;
    const payload = {
      name,
      version: APP_VERSION,
      at: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      page: location.href,
    };
    fetch(TRACKING_ENDPOINT, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }

  function startWorkspace() {
    allSaved = [];
    latestJSON = '';
    globalIdCounter = 1;
    groups = [];
    gidCounter = 0;
    sidCounter = 0;

    storageLoad();
    const login = document.getElementById('login-screen');
    if (login) login.classList.add('hidden');
    document.getElementById('user-name-pill').textContent = currentUser || 'Guest';
    updateAdminVisibility();
    addGroup();
    renderHistory();
    renderUsageLog();
    updateTotals();
    setLookupStep(0);
    applyTheme();
  }

  function setThemeMode(mode) {
    const allowed = ['auto', 'day', 'night'];
    const nextMode = allowed.includes(mode) ? mode : 'auto';
    localStorage.setItem(THEME_KEY, nextMode);
    applyTheme();
  }

  function getThemeMode() {
    return localStorage.getItem(THEME_KEY) || 'auto';
  }

  function getResolvedTheme(mode) {
    if (mode === 'day' || mode === 'night') return mode;
    const hour = new Date().getHours();
    return hour >= 7 && hour < 19 ? 'day' : 'night';
  }

  function applyTheme() {
    const mode = getThemeMode();
    const resolved = getResolvedTheme(mode);
    document.body.classList.toggle('theme-night', resolved === 'night');
    document.body.classList.toggle('theme-day', resolved === 'day');

    ['auto', 'day', 'night'].forEach(item => {
      const btn = document.getElementById(`theme-${item}`);
      if (btn) btn.classList.toggle('on', item === mode);
    });

    const pill = document.getElementById('theme-pill');
    if (pill) pill.textContent = mode === 'auto' ? `Auto/${cap(resolved)}` : cap(mode);

    const hint = document.getElementById('theme-hint');
    if (hint) {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time';
      hint.textContent = mode === 'auto'
        ? `Auto uses the visitor's local time (${tz}).`
        : `${cap(mode)} mode is locked until changed.`;
    }
  }

  function updateStoragePill(msg) {
    const pill = document.getElementById('storage-pill');
    if (pill) {
      pill.textContent = msg;
      clearTimeout(pill._t);
      pill._t = setTimeout(() => { pill.textContent = 'Storage ready'; }, 2200);
    }
  }

  // ── GROUPS ─────────────────────────────────────────────────
  function addGroup() {
    const gid   = gidCounter++;
    const slots = [makeSlot(), makeSlot(), makeSlot()];
    groups.push({ gid, slots, generatedJSON: null });
    renderAll();
    // Scroll new group into view
    setTimeout(() => {
      const el = document.getElementById(`group-${gid}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }

  function removeGroup(gid) {
    if (!confirm('Remove this entire address group?')) return;
    groups = groups.filter(g => g.gid !== gid);
    renderAll();
  }

  function makeSlot() {
    return { sid: sidCounter++, data: null };
  }

  function addSlotToGroup(gid) {
    const g = groups.find(g => g.gid === gid);
    if (!g) return;
    g.slots.push(makeSlot());
    renderAll();
  }

  function removeSlotFromGroup(gid, sid) {
    const g = groups.find(g => g.gid === gid);
    if (!g || g.slots.length <= 1) return;
    g.slots = g.slots.filter(s => s.sid !== sid);
    renderAll();
  }

  function clearSlotData(gid, sid) {
    const g = groups.find(g => g.gid === gid);
    if (!g) return;
    const s = g.slots.find(s => s.sid === sid);
    if (s) s.data = null;
    renderAll();
  }

  // ── RENDER ALL ─────────────────────────────────────────────
  function renderAll() {
    const container = document.getElementById('groups-container');
    container.innerHTML = '';
    groups.forEach((g, gi) => container.appendChild(buildGroupCard(g, gi)));
    updateTotals();
  }

  // ── BUILD GROUP CARD ────────────────────────────────────────
  function buildGroupCard(g, gi) {
    const filledCount = g.slots.filter(s => s.data).length;

    const wrap = document.createElement('div');
    wrap.className = 'group-card';
    wrap.id = `group-${g.gid}`;

    // ── Group header
    const head = el('div', 'group-head', `
      <span class="group-num">${gi + 1}.</span>
      <span class="group-title">Address Group ${gi + 1}</span>
      <span class="group-meta">${filledCount} / ${g.slots.length} filled</span>
      <button class="group-close-btn" title="Remove this group" onclick="App.removeGroup(${g.gid})">×</button>
    `);
    wrap.appendChild(head);

    // ── Slots
    const slotsWrap = el('div', 'group-slots');
    g.slots.forEach((slot, si) => {
      slotsWrap.appendChild(buildSlotCard(g.gid, slot, si));
    });

    // Add-slot button
    const addBtn = el('button', 'add-slot-btn', '+ Add One More Address to This Group');
    addBtn.onclick = () => addSlotToGroup(g.gid);
    slotsWrap.appendChild(addBtn);

    wrap.appendChild(slotsWrap);

    // ── Footer: Download JSON
    const footer = el('div', 'group-footer', `
      <button class="dl-btn" id="dl-${g.gid}"
        onclick="App.downloadGroup(${g.gid})"
        ${filledCount === 0 ? 'disabled' : ''}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Download JSON (${filledCount} address${filledCount !== 1 ? 'es' : ''})
      </button>
    `);
    wrap.appendChild(footer);

    return wrap;
  }

  // ── BUILD SLOT CARD ─────────────────────────────────────────
  function buildSlotCard(gid, slot, si) {
    const color  = COLORS[si % COLORS.length];
    const filled = !!slot.data;
    const name   = filled ? slot.data.label  : `Address ${si + 1}`;
    const sub    = filled
      ? `${slot.data.address}${slot.data.city ? ', ' + slot.data.city : ''}`
      : 'Click to fill this slot';

    const card = document.createElement('div');
    card.className = `slot-card${filled ? ' ' + color.cls : ''}`;
    card.id = `slot-${slot.sid}`;

    card.innerHTML = `
      <div class="slot-trigger" onclick="App.toggleSlot(${slot.sid})">
        <div class="slot-dot">${String(si + 1).padStart(2, '0')}</div>
        <div class="slot-info">
          <div class="slot-name">${esc(name)}</div>
          <div class="slot-sub">${esc(sub)}</div>
        </div>
        ${filled
          ? `<span class="slot-badge">Filled ✓</span>
             <button class="slot-clr-btn" title="Clear slot"
               onclick="event.stopPropagation(); App.clearSlotData(${gid}, ${slot.sid})">×</button>`
          : `<span class="slot-badge empty-badge">Empty</span>`
        }
        <span class="chevron">▾</span>
      </div>

      <div class="slot-form" id="sf-${slot.sid}">
        <div class="tabs-mini">
          <button class="tmb on" onclick="App.switchSlotTab(${slot.sid}, 'paste', this)">Paste Raw</button>
          <button class="tmb"    onclick="App.switchSlotTab(${slot.sid}, 'manual', this)">Manual Fields</button>
        </div>

        <!-- PASTE TAB -->
        <div class="tc on" id="tc-p-${slot.sid}">
          <div class="fg">
            <label class="lbl">Google Maps URL</label>
            <textarea id="url-${slot.sid}" rows="2"
              placeholder="https://www.google.com/maps/place/..."></textarea>
            <div class="hint" id="ch-${slot.sid}">Lat &amp; long extracted automatically from URL.</div>
          </div>
          <div class="fg">
            <label class="lbl">Raw Address Block</label>
            <textarea id="raw-${slot.sid}" rows="3"
              placeholder="Business Name&#10;123 Street,&#10;City, ST 12345"></textarea>
            <div class="hint" id="ah-${slot.sid}">Name, street, city, state, zip parsed automatically.</div>
          </div>
          <button class="parse-btn" onclick="App.parsePaste(${slot.sid})">⚡ Parse &amp; Preview</button>
          <div class="fg">
            <label class="lbl">CTA URL</label>
            <input type="url" id="pcta-${slot.sid}" placeholder="https://www.vdx.tv" />
          </div>
        </div>

        <!-- MANUAL TAB -->
        <div class="tc" id="tc-m-${slot.sid}">
          <div class="fg">
            <label class="lbl">Label / Business Name</label>
            <input type="text" id="ml-${slot.sid}" placeholder="e.g. Harley-Davidson Bowling Green" />
          </div>
          <div class="fg">
            <label class="lbl">Street Address</label>
            <input type="text" id="ma-${slot.sid}" placeholder="e.g. 251 Cumberland Trace Rd" />
          </div>
          <div class="r3g">
            <div class="fg">
              <label class="lbl">City</label>
              <input type="text" id="mc-${slot.sid}" placeholder="City" />
            </div>
            <div class="fg">
              <label class="lbl">State</label>
              <input type="text" id="ms-${slot.sid}" placeholder="KY" maxlength="2"
                style="text-transform:uppercase" />
            </div>
            <div class="fg">
              <label class="lbl">ZIP</label>
              <input type="text" id="mz-${slot.sid}" placeholder="42103" />
            </div>
          </div>
          <div class="r2g">
            <div class="fg">
              <label class="lbl">Latitude</label>
              <input type="number" id="mlat-${slot.sid}" placeholder="36.9576" step="any" />
            </div>
            <div class="fg">
              <label class="lbl">Longitude</label>
              <input type="number" id="mlng-${slot.sid}" placeholder="-86.4326" step="any" />
            </div>
          </div>
          <button class="geo-inline-btn" id="geobtn-${slot.sid}"
            onclick="App.geocodeSlot(${slot.sid})">
            📍 Auto-fetch Lat/Long from Address
          </button>
          <div class="hint" id="geo-h-${slot.sid}"></div>
          <div class="fg" style="margin-top:8px">
            <label class="lbl">CTA URL</label>
            <input type="url" id="mcta-${slot.sid}" placeholder="https://www.vdx.tv" />
          </div>
        </div>

        <!-- SAVE SLOT BUTTON -->
        <button class="save-slot-btn ${color.btn}"
          onclick="App.saveSlot(${gid}, ${slot.sid})">
          ✓ Save This Address
        </button>
      </div>
    `;

    return card;
  }

  // ── SLOT INTERACTIONS ───────────────────────────────────────
  function toggleSlot(sid) {
    const card = document.getElementById(`slot-${sid}`);
    if (card) card.classList.toggle('open');
  }

  function switchSlotTab(sid, tab, btn) {
    btn.closest('.tabs-mini').querySelectorAll('.tmb').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    document.getElementById(`tc-p-${sid}`).classList.toggle('on', tab === 'paste');
    document.getElementById(`tc-m-${sid}`).classList.toggle('on', tab === 'manual');
  }

  function parsePaste(sid) {
    const url = val(`url-${sid}`);
    const raw = val(`raw-${sid}`);
    if (url) {
      const c = extractCoords(url);
      setHint(`ch-${sid}`,
        c ? `✓ lat ${c.lat}, long ${c.long}` : '✗ Could not extract coords from URL.',
        c ? 'ok' : 'er');
    }
    if (raw) {
      const p = parseAddr(raw);
      setHint(`ah-${sid}`,
        p ? `✓ "${p.label}" · ${p.city}, ${p.state} ${p.zip}` : '✗ Format: Name / Street / City, ST ZIP',
        p ? 'ok' : 'er');
    }
  }

  // ── SAVE SLOT ───────────────────────────────────────────────
  function saveSlot(gid, sid) {
    const g    = groups.find(g => g.gid === gid);
    if (!g) return;
    const slot = g.slots.find(s => s.sid === sid);
    if (!slot) return;

    const isPaste = document.getElementById(`tc-p-${sid}`)?.classList.contains('on');
    let data;

    if (isPaste) {
      const url    = val(`url-${sid}`);
      const raw    = val(`raw-${sid}`);
      const cta    = getCtaValue(val(`pcta-${sid}`));
      const coords = extractCoords(url);
      const addr   = parseAddr(raw);
      data = {
        id:      padId(globalIdCounter),
        label:   addr ? addr.label   : '',
        address: addr ? addr.address : '',
        city:    addr ? addr.city    : '',
        state:   addr ? addr.state   : '',
        zip:     addr ? addr.zip     : '',
        cta,
        lat:  coords ? coords.lat  : null,
        long: coords ? coords.long : null,
      };
    } else {
      data = {
        id:      padId(globalIdCounter),
        label:   val(`ml-${sid}`),
        address: val(`ma-${sid}`),
        city:    val(`mc-${sid}`),
        state:   val(`ms-${sid}`).toUpperCase(),
        zip:     val(`mz-${sid}`),
        cta:     getCtaValue(val(`mcta-${sid}`)),
        lat:     parseFloat(val(`mlat-${sid}`)) || null,
        long:    parseFloat(val(`mlng-${sid}`)) || null,
      };
    }

    // Validate — at minimum need a label or address
    if (!data.label && !data.address) {
      alert('Please fill in at least the business name or address before saving.');
      return;
    }

    slot.data = data;
    globalIdCounter++;

    // Persist to localStorage immediately
    storageSave();

    renderAll();

    // Collapse the saved slot
    const card = document.getElementById(`slot-${sid}`);
    if (card) card.classList.remove('open');

    // Flash storage pill
    updateStoragePill('Saved ✓');
  }

  // ── GEOCODE (inline in Manual tab) ─────────────────────────
  async function geocodeSlot(sid) {
    const label   = val(`ml-${sid}`);
    const address = val(`ma-${sid}`);
    const city    = val(`mc-${sid}`);
    const state   = val(`ms-${sid}`);
    const query   = [label || address, city, state].filter(Boolean).join(', ');

    if (!query.trim()) {
      setHint(`geo-h-${sid}`, 'Fill in the name/address fields first.', 'er');
      return;
    }

    const btn = document.getElementById(`geobtn-${sid}`);
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Fetching…'; }
    setHint(`geo-h-${sid}`, 'Contacting OpenStreetMap Nominatim…', 'load');

    try {
      const url  = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
      const res  = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      const data = await res.json();

      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat).toFixed(7);
        const lng = parseFloat(data[0].lon).toFixed(7);
        document.getElementById(`mlat-${sid}`).value = lat;
        document.getElementById(`mlng-${sid}`).value = lng;
        setHint(`geo-h-${sid}`, `✓ Filled: ${lat}, ${lng}`, 'ok');
      } else {
        setHint(`geo-h-${sid}`, '✗ No results. Try a more specific address.', 'er');
      }
    } catch (e) {
      setHint(`geo-h-${sid}`, '✗ Request failed. Check your connection.', 'er');
    }

    if (btn) { btn.disabled = false; btn.textContent = '📍 Auto-fetch Lat/Long from Address'; }
  }

  // ── URL → FULL ENTRY LOOKUP ────────────────────────────────
  async function lookupFromUrl() {
    const rawUrl = val('url-lookup-input').trim();
    const cta    = getCtaValue(val('url-lookup-cta').trim());
    if (!rawUrl) { setHint('url-lookup-hint', 'Please paste a Google Maps URL first.', 'er'); return; }

    const btn = document.getElementById('url-lookup-btn');
    btn.disabled = true;
    btn.textContent = '⏳ Working…';
    setHint('url-lookup-hint', 'Parsing URL…', 'load');
    setLookupStep(1);
    document.getElementById('url-preview-card').style.display = 'none';
    document.getElementById('url-edit-form').style.display = 'none';
    urlEditOpen = false;

    // ── Step 1: extract coords + place name from URL ──────────
    const coords = extractCoords(rawUrl);
    if (!coords) {
      setHint('url-lookup-hint', '✗ Could not find coordinates in this URL. Make sure it is a full Google Maps place URL (contains @lat,lng).', 'er');
      setLookupStep(1);
      btn.disabled = false;
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Extract &amp; Build Entry`;
      return;
    }
    setLookupStep(2);

    // Extract place name from URL path e.g. /place/AMC+The+Americana+at+Brand+18/
    let label = '';
    const placeMatch = rawUrl.match(/\/place\/([^/@]+)/);
    if (placeMatch) {
      label = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
      // Clean up any trailing noise
      label = label.replace(/\s*\(.*?\)\s*/g, '').trim();
    }

    setHint('url-lookup-hint', `✓ Coords found (${coords.lat}, ${coords.long}). Reverse-geocoding address…`, 'load');

    // ── Step 2: reverse geocode with Nominatim ────────────────
    let address = '', city = '', state = '', zip = '';
    try {
      const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?lat=${coords.lat}&lon=${coords.long}&format=json&addressdetails=1`;
      const res  = await fetch(nominatimUrl, { headers: { 'Accept-Language': 'en', 'User-Agent': 'MapJSONGenerator/1.0' } });
      const data = await res.json();

      if (data && data.address) {
        const a = data.address;
        // Street address: house_number + road
        const street = [a.house_number, a.road].filter(Boolean).join(' ');
        address = street || a.pedestrian || a.footway || a.path || '';
        city    = a.city || a.town || a.village || a.municipality || a.county || '';
        state   = a.state || '';
        zip     = a.postcode || '';

        // Try to abbreviate US state names
        const STATE_ABBR = {
          'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA',
          'Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA',
          'Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA',
          'Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD',
          'Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS',
          'Missouri':'MO','Montana':'MT','Nebraska':'NE','Nevada':'NV','New Hampshire':'NH',
          'New Jersey':'NJ','New Mexico':'NM','New York':'NY','North Carolina':'NC',
          'North Dakota':'ND','Ohio':'OH','Oklahoma':'OK','Oregon':'OR','Pennsylvania':'PA',
          'Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD','Tennessee':'TN',
          'Texas':'TX','Utah':'UT','Vermont':'VT','Virginia':'VA','Washington':'WA',
          'West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY','District of Columbia':'DC',
        };
        if (STATE_ABBR[state]) state = STATE_ABBR[state];
        // Trim zip to 5 digits if US
        if (zip && zip.length > 5 && /^\d/.test(zip)) zip = zip.substring(0, 5);

        setHint('url-lookup-hint', `✓ Address resolved. Review and save below.`, 'ok');
        setLookupStep(3);
      } else {
        setHint('url-lookup-hint', '⚠ Coordinates found but address lookup returned no results. You can edit fields manually.', 'load');
        setLookupStep(3);
      }
    } catch (e) {
      setHint('url-lookup-hint', '⚠ Coordinates found but reverse geocoding failed. You can edit fields manually.', 'load');
      setLookupStep(3);
    }

    // ── Step 3: build result object ───────────────────────────
    urlLookupResult = {
      id:      padId(globalIdCounter),
      label,
      address,
      city,
      state,
      zip,
      cta,
      lat:  coords.lat,
      long: coords.long,
    };

    renderUrlPreview(urlLookupResult);
    setLookupStep(4);

    btn.disabled = false;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Extract &amp; Build Entry`;
  }

  function setLookupStep(done) {
    document.querySelectorAll('.lookup-step').forEach(step => {
      const n = Number(step.dataset.step);
      step.classList.toggle('done', n <= done);
      step.classList.toggle('pending', n > done);
    });
  }

  function renderUrlPreview(entry) {
    const card = document.getElementById('url-preview-card');
    const fields = document.getElementById('url-preview-fields');
    const rows = [
      { k: 'id',      v: entry.id },
      { k: 'label',   v: entry.label },
      { k: 'address', v: entry.address },
      { k: 'city',    v: entry.city },
      { k: 'state',   v: entry.state },
      { k: 'zip',     v: entry.zip },
      { k: 'cta',     v: entry.cta },
      { k: 'lat',     v: entry.lat,  coords: true },
      { k: 'long',    v: entry.long, coords: true },
    ];
    fields.innerHTML = rows.map(r => {
      const empty = r.v === '' || r.v === null || r.v === undefined;
      const cls   = empty ? 'pf-val empty' : (r.coords ? 'pf-val coords' : 'pf-val');
      const disp  = empty ? '(empty)' : esc(String(r.v));
      return `<div class="pf-row"><span class="pf-key">${r.k}</span><span class="${cls}">${disp}</span></div>`;
    }).join('');
    card.style.display = 'block';
  }

  function toggleUrlEdit() {
    urlEditOpen = !urlEditOpen;
    const form = document.getElementById('url-edit-form');
    const btn  = document.getElementById('url-edit-toggle');
    form.style.display = urlEditOpen ? 'block' : 'none';
    btn.textContent    = urlEditOpen ? '✕ Close Edit' : '✏️ Edit Fields';
    if (urlEditOpen && urlLookupResult) {
      // Pre-fill edit fields
      document.getElementById('ue-label').value   = urlLookupResult.label   || '';
      document.getElementById('ue-address').value = urlLookupResult.address || '';
      document.getElementById('ue-city').value    = urlLookupResult.city    || '';
      document.getElementById('ue-state').value   = urlLookupResult.state   || '';
      document.getElementById('ue-zip').value     = urlLookupResult.zip     || '';
      document.getElementById('ue-lat').value     = urlLookupResult.lat     || '';
      document.getElementById('ue-long').value    = urlLookupResult.long    || '';
    }
  }

  function applyUrlEdits() {
    if (!urlLookupResult) return;
    urlLookupResult.label   = val('ue-label');
    urlLookupResult.address = val('ue-address');
    urlLookupResult.city    = val('ue-city');
    urlLookupResult.state   = val('ue-state').toUpperCase();
    urlLookupResult.zip     = val('ue-zip');
    urlLookupResult.lat     = parseFloat(val('ue-lat'))  || urlLookupResult.lat;
    urlLookupResult.long    = parseFloat(val('ue-long')) || urlLookupResult.long;
    renderUrlPreview(urlLookupResult);
    toggleUrlEdit(); // close edit form
    setHint('url-lookup-hint', '✓ Fields updated.', 'ok');
  }

  function saveUrlEntryDirect() {
    if (!urlLookupResult) return;
    const entry = { ...urlLookupResult };
    allSaved.unshift(entry);
    globalIdCounter++;
    storageSave();
    renderHistory();
    updateTotals();
    // Show in JSON output
    latestJSON = JSON.stringify(entry, null, 2);
    showLatestJSON(entry);
    // Reset for next entry
    urlLookupResult = null;
    document.getElementById('url-preview-card').style.display = 'none';
    document.getElementById('url-edit-form').style.display = 'none';
    document.getElementById('url-lookup-input').value = '';
    document.getElementById('url-lookup-cta').value   = '';
    setLookupStep(0);
    setHint('url-lookup-hint', '✓ Entry saved! Paste another URL to continue.', 'ok');
  }

  function addUrlEntryToSlot() {
    if (!urlLookupResult) return;
    // Find the first empty slot across all groups
    for (const g of groups) {
      for (const s of g.slots) {
        if (!s.data) {
          s.data = { ...urlLookupResult };
          globalIdCounter++;
          storageSave();
          renderAll();
          resetUrlLookup('✓ Added to slot in Group ' + (groups.indexOf(g) + 1) + '. Paste another URL to continue.');
          // Scroll to it
          setTimeout(() => {
            const el = document.getElementById(`slot-${s.sid}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 80);
          return;
        }
      }
    }
    // No empty slot found — create a new group
    const gid   = gidCounter++;
    const newSlot = makeSlot();
    newSlot.data  = { ...urlLookupResult };
    globalIdCounter++;
    const extraSlots = [newSlot, makeSlot(), makeSlot()];
    groups.push({ gid, slots: extraSlots, generatedJSON: null });
    storageSave();
    renderAll();
    resetUrlLookup('✓ Created a new group and added the entry. Paste another URL to continue.');
  }

  function resetUrlLookup(message) {
    urlLookupResult = null;
    urlEditOpen = false;
    document.getElementById('url-preview-card').style.display = 'none';
    document.getElementById('url-edit-form').style.display = 'none';
    document.getElementById('url-lookup-input').value = '';
    document.getElementById('url-lookup-cta').value = '';
    setLookupStep(0);
    if (message) setHint('url-lookup-hint', message, 'ok');
  }

  // ── GENERATE GROUP ──────────────────────────────────────────
  function generateGroup(gid) {
    const output = buildGroupJSON(gid);
    if (!output) return;
    downloadGroup(gid);
  }

  function buildGroupJSON(gid) {
    const g = groups.find(g => g.gid === gid);
    if (!g) return null;

    const stores = g.slots.filter(s => s.data).map(s => s.data);
    if (!stores.length) return null;

    const output   = { listing: { stores } };
    const jsonStr  = JSON.stringify(output, null, 2);
    g.generatedJSON = jsonStr;
    latestJSON      = jsonStr;

    // Push to allSaved (avoid duplicates by id)
    stores.forEach(s => {
      if (!allSaved.find(e => e.id === s.id)) allSaved.unshift(s);
    });

    storageSave();

    renderAll();
    showLatestJSON(output);
    renderHistory();
    updateTotals();
    return output;
  }

  // ── DOWNLOAD GROUP JSON ─────────────────────────────────────
  function downloadGroup(gid) {
    const g = groups.find(g => g.gid === gid);
    if (!g) return;
    if (!g.generatedJSON) buildGroupJSON(gid);
    if (!g.generatedJSON) return;
    const stores   = JSON.parse(g.generatedJSON).listing.stores;
    const filename = 'data.json';
    downloadBlob(g.generatedJSON, filename, 'application/json');
  }

  // ── JSON OUTPUT ─────────────────────────────────────────────
  function showLatestJSON(obj) {
    const el = document.getElementById('json-out');
    el.className = 'json-box';
    el.innerHTML  = syntaxHL(obj);
  }

  function copyLatest() {
    if (!latestJSON) return;
    navigator.clipboard.writeText(latestJSON).then(() => {
      const btn = document.getElementById('copy-btn');
      btn.textContent = '✓ Copied!';
      btn.classList.add('ok');
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('ok'); }, 2000);
    });
  }

  // ── HISTORY ─────────────────────────────────────────────────
  const HIST_COLORS = [
    { bg: 'var(--s1l)', fg: 'var(--s1)' },
    { bg: 'var(--s2l)', fg: 'var(--s2)' },
    { bg: 'var(--s3l)', fg: 'var(--s3)' },
    { bg: 'var(--s4l)', fg: 'var(--s4)' },
    { bg: 'var(--s5l)', fg: 'var(--s5)' },
    { bg: 'var(--s6l)', fg: 'var(--s6)' },
  ];

  function renderHistory() {
    document.getElementById('hist-cnt').textContent = allSaved.length;
    const list = document.getElementById('hist-list');
    if (!allSaved.length) {
      list.innerHTML = '<div class="empty-hist">No entries yet.</div>';
      return;
    }
    list.innerHTML = allSaved.map((item, i) => {
      const c = HIST_COLORS[i % HIST_COLORS.length];
      return `
        <div class="hist-item" onclick="App.previewSaved(${i})">
          <span class="hi-id"
            style="background:${c.bg};color:${c.fg}">${esc(item.id)}</span>
          <span class="hi-label">${esc(item.label || '(no label)')}</span>
          <span class="hi-city">${esc(item.city || '')}${item.state ? ', ' + item.state : ''}</span>
          <button class="hi-del"
            onclick="event.stopPropagation(); App.delSaved(${i})">×</button>
        </div>`;
    }).join('');
  }

  function previewSaved(i) {
    latestJSON = JSON.stringify(allSaved[i], null, 2);
    showLatestJSON(allSaved[i]);
  }

  function delSaved(i) {
    allSaved.splice(i, 1);
    storageSave();
    renderHistory();
    updateTotals();
  }

  function clearAll() {
    if (!allSaved.length) return;
    if (!confirm('Clear all saved entries from history? This cannot be undone.')) return;
    allSaved = [];
    storageSave();
    renderHistory();
    updateTotals();
  }

  // ── EXPORT ──────────────────────────────────────────────────
  function exportAllJSON() {
    if (!allSaved.length) { alert('No entries to export yet.'); return; }
    const out = JSON.stringify({ listing: { stores: [...allSaved].reverse() } }, null, 2);
    downloadBlob(out, 'data.json', 'application/json');
  }

  // ── TOTALS ──────────────────────────────────────────────────
  function updateTotals() {
    document.getElementById('total-count').textContent = allSaved.length;
    document.getElementById('hist-cnt').textContent    = allSaved.length;
  }

  // ── UTILITIES ────────────────────────────────────────────────
  function padId(n) { return String(n).padStart(5, '0'); }

  function val(id) {
    return (document.getElementById(id) || {}).value || '';
  }

  function setHint(id, msg, cls) {
    const el = document.getElementById(id);
    if (el) { el.textContent = msg; el.className = 'hint ' + (cls || ''); }
  }

  function getCtaValue(localValue) {
    const useGlobal = document.getElementById('global-cta-enabled')?.checked;
    const globalUrl = val('global-cta-url').trim();
    return useGlobal && globalUrl ? globalUrl : (localValue || '');
  }

  function syncGlobalCta() {
    const useGlobal = document.getElementById('global-cta-enabled')?.checked;
    const globalUrl = val('global-cta-url').trim();
    if (!useGlobal || !globalUrl) return;

    document.querySelectorAll('input[id^="pcta-"], input[id^="mcta-"], #url-lookup-cta')
      .forEach(input => { input.value = globalUrl; });

    groups.forEach(group => {
      group.slots.forEach(slot => {
        if (slot.data) slot.data.cta = globalUrl;
      });
      group.generatedJSON = null;
    });

    allSaved = allSaved.map(entry => ({ ...entry, cta: globalUrl }));
    storageSave();
    renderHistory();
    updateTotals();
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function slugUser(name) {
    return String(name).trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'guest';
  }

  function cap(s) {
    return String(s).charAt(0).toUpperCase() + String(s).slice(1);
  }

  function el(tag, cls, html) {
    const d = document.createElement(tag);
    if (cls)  d.className   = cls;
    if (html) d.innerHTML   = html;
    return d;
  }

  function extractCoords(url) {
    const m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    return m ? { lat: parseFloat(m[1]), long: parseFloat(m[2]) } : null;
  }

  function parseAddr(raw) {
    const lines = raw.trim().split('\n')
      .map(l => l.trim().replace(/,$/, '')).filter(Boolean);
    if (lines.length < 2) return null;
    const label = lines[0];
    const last  = lines[lines.length - 1];
    const m = last.match(/^(.+?),?\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    if (m) return {
      label,
      address: lines.slice(1, lines.length - 1).join(', '),
      city:    m[1].trim(),
      state:   m[2],
      zip:     m[3],
    };
    return { label, address: lines.slice(1).join(', '), city: '', state: '', zip: '' };
  }

  function syntaxHL(obj) {
    return JSON.stringify(obj, null, 2)
      .replace(
        /("(?:[^"\\]|\\.)*"(\s*:)?|-?\d+\.?\d*(?:[eE][+\-]?\d+)?|true|false|null)/g,
        m => {
          if (/^"/.test(m)) return /:$/.test(m)
            ? `<span class="jk">${m}</span>`
            : `<span class="js">${m}</span>`;
          if (m === 'null') return `<span class="jnl">${m}</span>`;
          return `<span class="jn">${m}</span>`;
        }
      )
      .replace(/[{}\[\]]/g, c => `<span class="jb">${c}</span>`);
  }

  function downloadBlob(content, filename, type) {
    const blob = new Blob([content], { type });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ── INIT ────────────────────────────────────────────────────
  function init() {
    const savedUser = sessionStorage.getItem(CURRENT_USER_KEY);
    applyTheme();
    setInterval(applyTheme, 15 * 60 * 1000);
    renderUsageLog();
    setLookupStep(0);
    if (savedUser) {
      currentUser = savedUser;
      startWorkspace();
    } else {
      const login = document.getElementById('login-screen');
      if (login) login.classList.remove('hidden');
      const input = document.getElementById('login-name');
      if (input) setTimeout(() => input.focus(), 80);
    }
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── PUBLIC API ───────────────────────────────────────────────
  return {
    loginUser,
    addGroup,
    removeGroup,
    addSlotToGroup,
    clearSlotData,
    toggleSlot,
    switchSlotTab,
    parsePaste,
    saveSlot,
    geocodeSlot,
    lookupFromUrl,
    toggleUrlEdit,
    applyUrlEdits,
    saveUrlEntryDirect,
    addUrlEntryToSlot,
    generateGroup,
    downloadGroup,
    copyLatest,
    exportAllJSON,
    previewSaved,
    delSaved,
    clearAll,
    clearUsageLog,
    syncGlobalCta,
    setThemeMode,
  };

})();
