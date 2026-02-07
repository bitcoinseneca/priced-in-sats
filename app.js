/* app.js */
(() => {
  const SATS_PER_BTC = 100_000_000;
  const TOP10 = ["usd","eur","jpy","gbp","cny","cad","aud","chf","hkd","inr"];

  // ---------- utils ----------
  const $ = (id) => document.getElementById(id);
  const fmt = (n, d=2) => Number(n).toLocaleString(undefined, { minimumFractionDigits:d, maximumFractionDigits:d });
  const fmt0 = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits:0 });
  const nowStr = () => new Date().toLocaleString();

  function parseNum(v){
    const n = Number(String(v).replace(/,/g,'').trim());
    return Number.isFinite(n) ? n : null;
  }
  function satsPerUnitFromBtcPrice(btcPriceFiat){ return SATS_PER_BTC / btcPriceFiat; }
  function fiatPerSatFromBtcPrice(btcPriceFiat){ return btcPriceFiat / SATS_PER_BTC; }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, m => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[m]));
  }

  // ---------- state ----------
  let supported = TOP10.slice();
  let rates = new Map(); // code -> btc price in that fiat
  let lastUpdated = null;

  // ---------- UI ----------
  const statusTop = $("statusTop");
  const ticker = $("ticker");
  const ratesBody = $("ratesBody");
  const sortBy = $("sortBy");
  const refreshAll = $("refreshAll");
  const liveMeta = $("liveMeta");

  // Calculator
  const calcCurrency = $("calcCurrency");
  const calcStatus = $("calcStatus");
  const calcFiat = $("calcFiat");
  const calcBtc = $("calcBtc");
  const calcSats = $("calcSats");
  const calcReset = $("calcReset");

  const calcOutBtc = $("calcOutBtc");
  const calcOutBtc2 = $("calcOutBtc2");
  const calcOutSats = $("calcOutSats");
  const calcOutSats2 = $("calcOutSats2");
  const calcOutFiat = $("calcOutFiat");
  const calcOutFiat2 = $("calcOutFiat2");

  const calcBtcPrice = $("calcBtcPrice");
  const calcCurLabel = $("calcCurLabel");
  const calcCurLabel2 = $("calcCurLabel2");
  const calcSatsPerUnit = $("calcSatsPerUnit");

  let calcLastEdited = "fiat"; // "fiat" | "btc" | "sats"

  // Chart
  const chartCanvas = $("chartCanvas");
  const chartRange = $("chartRange");
  const chartKpiTop = $("chartKpiTop");
  const chartKpiMain = $("chartKpiMain");
  const chartKpiSub = $("chartKpiSub");
  const chartCurA = $("chartCurA");
  const chartCurB = $("chartCurB");
  const chartLowHighA = $("chartLowHighA");
  const chartLowHighB = $("chartLowHighB");
  const segBtns = Array.from(document.querySelectorAll(".segBtn"));

  let chartDays = 30;
  let chartData = null; // { dates:[], btc:[], sats:[] }
  let hoverIdx = null;
  let chartGeom = null;
  let chartTipEl = null;

  // Cards + CAGR
  const cardsEl = $("cards");

  const startPrice = $("startPrice");
  const endPrice = $("endPrice");
  const years = $("years");
  const btnCagr = $("btnCagr");
  const cagrOut = $("cagrOut");
  const cagrNotes = $("cagrNotes");
  const projBody = $("projBody");

  // ---------- formatting ----------
  function moneyish(n, code){
    if (!Number.isFinite(n)) return "—";
    return `${fmt(n, 2)} ${String(code).toUpperCase()}`;
  }
  function setCalcStatus(msg){ if (calcStatus) calcStatus.textContent = msg; }

  function getCalcPrice(){
    const c = String(calcCurrency?.value || "usd").toLowerCase();
    return rates.get(c) || null;
  }

  function updateCalcHeader(){
    const c = String(calcCurrency?.value || "usd").toUpperCase();
    calcCurLabel.textContent = c;
    calcCurLabel2.textContent = c;

    const p = getCalcPrice();
    if (!p){
      calcBtcPrice.textContent = "—";
      calcSatsPerUnit.textContent = "—";
      setCalcStatus("need live rate…");
      return;
    }
    calcBtcPrice.textContent = moneyish(p, c);
    calcSatsPerUnit.textContent = fmt0(satsPerUnitFromBtcPrice(p));
    setCalcStatus(`live • ${lastUpdated ? lastUpdated.toLocaleTimeString() : ""}`.trim());
  }

  function clearCalcOutputs(){
    calcOutBtc.textContent = "—";
    calcOutBtc2.textContent = "—";
    calcOutSats.textContent = "—";
    calcOutSats2.textContent = "—";
    calcOutFiat.textContent = "—";
    calcOutFiat2.textContent = "—";
  }

  function setCalcOutputs({ btc, sats, fiat, ccy }){
    calcOutBtc.textContent = `${fmt(btc, 10)} BTC`;
    calcOutBtc2.textContent = `(${fmt0(btc * SATS_PER_BTC)} sats total)`;

    calcOutSats.textContent = `${fmt0(sats)} sats`;
    calcOutSats2.textContent = `(${fmt(sats / SATS_PER_BTC, 10)} BTC)`;

    calcOutFiat.textContent = moneyish(fiat, ccy);
    calcOutFiat2.textContent = `(@ 1 BTC = ${moneyish(getCalcPrice(), ccy)})`;
  }

  function syncCalc(from){
    calcLastEdited = from;

    const p = getCalcPrice();
    const c = String(calcCurrency.value || "usd").toUpperCase();
    updateCalcHeader();

    if (!p){
      clearCalcOutputs();
      return;
    }

    const fiatVal = parseNum(calcFiat.value);
    const btcVal  = parseNum(calcBtc.value);
    const satsVal = parseNum(calcSats.value);

    if (from === "fiat"){
      if (fiatVal == null){ clearCalcOutputs(); return; }
      const btc = fiatVal / p;
      const sats = btc * SATS_PER_BTC;

      calcBtc.value = String(btc);
      calcSats.value = String(Math.round(sats));

      setCalcOutputs({ btc, sats, fiat: fiatVal, ccy: c });
      return;
    }

    if (from === "btc"){
      if (btcVal == null){ clearCalcOutputs(); return; }
      const btc = btcVal;
      const sats = btc * SATS_PER_BTC;
      const fiat = btc * p;

      calcFiat.value = String(fiat);
      calcSats.value = String(Math.round(sats));

      setCalcOutputs({ btc, sats, fiat, ccy: c });
      return;
    }

    if (satsVal == null){ clearCalcOutputs(); return; }
    const sats = satsVal;
    const btc = sats / SATS_PER_BTC;
    const fiat = btc * p;

    calcBtc.value = String(btc);
    calcFiat.value = String(fiat);

    setCalcOutputs({ btc, sats, fiat, ccy: c });
  }

  function reSyncCalcAfterRateUpdate(){
    const hasAny =
      String(calcFiat.value || "").trim() ||
      String(calcBtc.value || "").trim() ||
      String(calcSats.value || "").trim();

    updateCalcHeader();
    if (!hasAny) { clearCalcOutputs(); return; }
    syncCalc(calcLastEdited);
  }

  // ---------- index cards ----------
  const DEFAULT_CARDS = [
    { id:"coffee", name:"Coffee", amount:4.99, currency:"cad" },
    { id:"gas", name:"Gas fill-up", amount:80, currency:"cad" },
    { id:"rent", name:"Rent (month)", amount:2000, currency:"usd" },
    { id:"bigmac", name:"Big Mac", amount:5.99, currency:"usd" },
    { id:"spx", name:"S&P 500 (manual price)", amount:5000, currency:"usd" },
    { id:"house", name:"House (median-ish)", amount:400000, currency:"usd" },
    { id:"gold", name:"Gold (oz, manual)", amount:2000, currency:"usd" },
    { id:"oil", name:"Oil (barrel, manual)", amount:80, currency:"usd" }
  ];

  function cardRow(card){
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <div class="name">${escapeHtml(card.name)}</div>
      <div class="row" style="margin-top:6px;">
        <div>
          <label>Amount</label>
          <input data-k="amount" value="${card.amount}" />
        </div>
        <div>
          <label>Currency</label>
          <select data-k="currency"></select>
        </div>
      </div>
      <div class="out mono" data-k="out">—</div>
      <div class="small mono" data-k="detail">—</div>
    `;
    const sel = div.querySelector('select[data-k="currency"]');
    sel.dataset.value = card.currency;
    div.dataset.id = card.id;
    return div;
  }

  function renderCards(){
    cardsEl.innerHTML = "";
    for (const c of DEFAULT_CARDS) cardsEl.appendChild(cardRow(c));
    hydrateCardDropdowns();
    cardsEl.addEventListener("input", updateAllCards, { passive:true });
    cardsEl.addEventListener("change", updateAllCards, { passive:true });
    updateAllCards();
  }

  function hydrateCardDropdowns(){
    const selects = cardsEl.querySelectorAll('select[data-k="currency"]');
    for (const sel of selects){
      sel.innerHTML = supported.map(code => `<option value="${code}">${code.toUpperCase()}</option>`).join("");
      const v = sel.dataset.value || "usd";
      sel.value = supported.includes(v) ? v : "usd";
    }
  }

  function updateAllCards(){
    const cardDivs = cardsEl.querySelectorAll(".card");
    for (const div of cardDivs){
      const amountEl = div.querySelector('input[data-k="amount"]');
      const curEl = div.querySelector('select[data-k="currency"]');
      const outEl = div.querySelector('[data-k="out"]');
      const detEl = div.querySelector('[data-k="detail"]');

      const a = parseNum(amountEl.value);
      const c = (curEl.value || "usd").toLowerCase();
      const p = rates.get(c);

      if (!a || !p){
        outEl.textContent = "— (need live rate)";
        detEl.textContent = p ? "Enter a valid amount." : "Live price not loaded for this currency.";
        continue;
      }
      const satsPerUnit = satsPerUnitFromBtcPrice(p);
      const sats = a * satsPerUnit;

      outEl.textContent = `${fmt0(sats)} sats`;
      detEl.textContent = `${fmt(a,2)} ${c.toUpperCase()} × ${fmt(satsPerUnit,2)} sats/${c.toUpperCase()}  (BTC=${fmt(p,2)} ${c.toUpperCase()})`;
    }
  }

  // ---------- live rates ----------
  async function fetchJson(url){
    const res = await fetch(url, { cache:"no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  async function loadRates(){
    statusTop.textContent = "Fetching BTC prices…";
    rates = new Map();

    const vs = supported.join(",");
    const url = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=" + encodeURIComponent(vs);
    const data = await fetchJson(url);
    const row = data && data.bitcoin ? data.bitcoin : {};

    for (const [code, price] of Object.entries(row)){
      if (Number.isFinite(Number(price))) rates.set(code.toLowerCase(), Number(price));
    }

    lastUpdated = new Date();
    statusTop.textContent = `Live BTC prices ready (${rates.size}/${supported.length}) • ${nowStr()}`;
    liveMeta.textContent = `Loaded: ${rates.size}/${supported.length} • Updated: ${lastUpdated.toLocaleTimeString()}`;

    const usd = rates.get("usd");
    if (usd && !parseNum(startPrice.value)) startPrice.value = String(usd);

    renderRatesTable();
    renderTicker();

    calcCurrency.innerHTML = supported.map(code => `<option value="${code}">${code.toUpperCase()}</option>`).join("");
    if (!calcCurrency.value) calcCurrency.value = supported.includes("cad") ? "cad" : "usd";
    updateCalcHeader();
    reSyncCalcAfterRateUpdate();

    // chart uses selected currency
    await refreshChart();

    hydrateCardDropdowns();
    updateAllCards();
  }

  // ===========================
  // ✅ UPDATED: flowing ticker
  // ===========================
  function renderTicker(){
    const items = [];

    for (const code of supported){
      const p = rates.get(code);
      if (!p) continue;

      const C = code.toUpperCase();
      const sats1 = fmt0(satsPerUnitFromBtcPrice(p));

      items.push(`
        <span class="marqueeItem">
          <strong>${C}</strong>
          <span>BTC</span><span>${fmt(p, 2)}</span>
          <span class="marqueeSep">•</span>
          <span>sats/1</span><span>${sats1}</span>
        </span>
      `);
    }

    items.push(`
      <span class="marqueeItem">
        <strong>MODEL</strong>
        <span>Fiat is variable → sats are unit</span>
      </span>
    `);

    const once = items.join("");
    ticker.innerHTML = `<span class="marqueeTrack">${once}${once}</span>`;
  }
  // ===========================

  function currentRows(){
    const rows = [];
    for (const code of supported){
      const price = rates.get(code);
      if (!price) continue;
      rows.push({
        code,
        price,
        satsPerUnit: satsPerUnitFromBtcPrice(price),
        fiatPerSat: fiatPerSatFromBtcPrice(price)
      });
    }

    const s = sortBy.value;
    const cmp = {
      code: (a,b)=> a.code.localeCompare(b.code),
      price_desc: (a,b)=> b.price - a.price,
      price_asc: (a,b)=> a.price - b.price,
      sats_desc: (a,b)=> b.satsPerUnit - a.satsPerUnit,
      sats_asc: (a,b)=> a.satsPerUnit - b.satsPerUnit
    }[s] || ((a,b)=>a.code.localeCompare(b.code));

    rows.sort(cmp);
    return rows;
  }

  function renderRatesTable(){
    const rows = currentRows();
    if (!rows.length){
      ratesBody.innerHTML = `<tr><td colspan="4" class="small">No rows yet (loading).</td></tr>`;
      return;
    }
    ratesBody.innerHTML = rows.map(r => `
      <tr>
        <td class="mono">${r.code.toUpperCase()}</td>
        <td class="mono">${fmt(r.price, 6)}</td>
        <td class="mono">${fmt(r.satsPerUnit, 2)}</td>
        <td class="mono">${fmt(r.fiatPerSat, 8)}</td>
      </tr>
    `).join("");
  }

  // ---------- Chart ----------
  async function fetchMarketChart(vs, days){
    const url =
      "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart" +
      `?vs_currency=${encodeURIComponent(vs)}&days=${encodeURIComponent(days)}&interval=daily`;
    const data = await fetchJson(url);
    const prices = Array.isArray(data?.prices) ? data.prices : [];
    return prices.map(([t, p]) => ({ t: Number(t), price: Number(p) }))
      .filter(x => Number.isFinite(x.t) && Number.isFinite(x.price));
  }

  function minMax(arr){
    let lo = Infinity, hi = -Infinity;
    for (const v of arr){
      if (!Number.isFinite(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [null, null];
    return [lo, hi];
  }

  function fitSeriesToCanvas(w, h, vals, pad){
    const [lo, hi] = minMax(vals);
    const range = (hi - lo) || 1;
    const xStep = (w - pad.l - pad.r) / Math.max(1, vals.length - 1);

    const pts = vals.map((v, i) => {
      const x = pad.l + i * xStep;
      const yNorm = (v - lo) / range;
      const y = (h - pad.b) - yNorm * (h - pad.t - pad.b);
      return { x, y };
    });

    return { pts, lo, hi };
  }

  function drawLine(ctx, pts){
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }

  function drawChart(){
    if (!chartCanvas) return;
    const ctx = chartCanvas.getContext("2d");
    if (!ctx) return;

    const rect = chartCanvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));

    const dpr = window.devicePixelRatio || 1;
    chartCanvas.width  = Math.floor(cssW * dpr);
    chartCanvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const w = cssW, h = cssH;
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, w, h);

    const pad = { l: 44, r: 44, t: 12, b: 22 };
    chartGeom = { w, h, pad };

    if (!chartData || !chartData.btc?.length) {
      ctx.fillStyle = "#bdbdbd";
      ctx.font = "14px ui-monospace, monospace";
      ctx.fillText("Loading chart…", 12, 22);
      return;
    }

    ctx.strokeStyle = "rgba(255,255,255,.10)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    for (let i=1;i<=3;i++){
      const y = pad.t + (i*(h - pad.t - pad.b))/4;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(w - pad.r, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    const satsFit = fitSeriesToCanvas(w, h, chartData.sats, pad);
    const btcFit  = fitSeriesToCanvas(w, h, chartData.btc,  pad);

    ctx.strokeStyle = "#7a7a7a";
    ctx.lineWidth = 2;
    drawLine(ctx, btcFit.pts);

    ctx.strokeStyle = "#ffb14a";
    ctx.lineWidth = 3;
    drawLine(ctx, satsFit.pts);

    ctx.fillStyle = "rgba(255,255,255,.70)";
    ctx.font = "12px ui-monospace, monospace";
    ctx.fillText(fmt0(satsFit.hi), 6, pad.t + 10);
    ctx.fillText(fmt0(satsFit.lo), 6, h - pad.b + 4);

    const lastS = satsFit.pts[satsFit.pts.length - 1];
    const lastB = btcFit.pts[btcFit.pts.length - 1];

    ctx.fillStyle = "#ffb14a";
    ctx.beginPath(); ctx.arc(lastS.x, lastS.y, 3.2, 0, Math.PI*2); ctx.fill();

    ctx.fillStyle = "#7a7a7a";
    ctx.beginPath(); ctx.arc(lastB.x, lastB.y, 2.8, 0, Math.PI*2); ctx.fill();

    if (hoverIdx != null){
      const i = Math.max(0, Math.min(hoverIdx, chartData.btc.length - 1));
      const x = satsFit.pts[i]?.x ?? null;
      if (x != null){
        ctx.strokeStyle = "rgba(255,177,74,.35)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3,3]);
        ctx.beginPath();
        ctx.moveTo(x, pad.t);
        ctx.lineTo(x, h - pad.b);
        ctx.stroke();
        ctx.setLineDash([]);

        const spt = satsFit.pts[i];
        const bpt = btcFit.pts[i];

        ctx.fillStyle = "#ffb14a";
        ctx.beginPath(); ctx.arc(spt.x, spt.y, 3.4, 0, Math.PI*2); ctx.fill();

        ctx.fillStyle = "#7a7a7a";
        ctx.beginPath(); ctx.arc(bpt.x, bpt.y, 3.0, 0, Math.PI*2); ctx.fill();
      }
    }
  }

  function ensureTip(){
    if (chartTipEl) return chartTipEl;
    const d = document.createElement("div");
    d.className = "chartTip mono";
    d.style.display = "none";
    document.body.appendChild(d);
    chartTipEl = d;
    return d;
  }

  function hideTip(){
    if (!chartTipEl) return;
    chartTipEl.style.display = "none";
  }

  function showTip(html, x, y){
    const tip = ensureTip();
    tip.innerHTML = html;
    tip.style.display = "block";

    const pad = 12;
    const rect = tip.getBoundingClientRect();
    let left = x + pad;
    let top  = y + pad;

    if (left + rect.width > window.innerWidth - 8) left = x - rect.width - pad;
    if (top + rect.height > window.innerHeight - 8) top = y - rect.height - pad;
    if (left < 8) left = 8;
    if (top < 8) top = 8;

    tip.style.left = left + "px";
    tip.style.top  = top + "px";
  }

  function fmtDate(d){
    const yy = d.getFullYear();
    const mm = String(d.getMonth()+1).padStart(2,"0");
    const dd = String(d.getDate()).padStart(2,"0");
    return `${yy}-${mm}-${dd}`;
  }

  function idxFromMouse(evt){
    if (!chartData || !chartData.dates?.length || !chartGeom) return null;
    const rect = chartCanvas.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const { w, pad } = chartGeom;
    const innerW = (w - pad.l - pad.r);
    if (innerW <= 0) return null;
    const t = (x - pad.l) / innerW;
    const clamped = Math.max(0, Math.min(1, t));
    return Math.round(clamped * (chartData.dates.length - 1));
  }

  function updateHover(evt){
    if (!chartData) return;

    const idx = idxFromMouse(evt);
    if (idx == null) return;

    hoverIdx = idx;
    drawChart();

    const c = String(calcCurrency?.value || "usd").toUpperCase();
    const d = chartData.dates[idx];
    const btc = chartData.btc[idx];
    const sats = chartData.sats[idx];
    const fiatPerSat = fiatPerSatFromBtcPrice(btc);

    const html = `
      <div class="t">${fmtDate(d)} • ${c}</div>
      <div class="r">BTC price: <span class="mono">${fmt(btc, 2)} ${c}</span></div>
      <div class="r">sats per 1 ${c}: <span class="mono">${fmt0(sats)} sats</span></div>
      <div class="r">${c} per 1 sat: <span class="mono">${fmt(fiatPerSat, 8)} ${c}</span></div>
    `;
    showTip(html, evt.clientX, evt.clientY);
  }

  async function refreshChart(){
    const c = String(calcCurrency?.value || "usd").toLowerCase();
    chartCurA.textContent = c.toUpperCase();
    chartCurB.textContent = c.toUpperCase();

    chartKpiTop.textContent = `${c.toUpperCase()} 1.00 =`;
    chartKpiMain.textContent = "—";
    chartKpiSub.textContent = "loading…";
    chartRange.textContent = "—";
    chartLowHighA.textContent = "Sats low/high: —";
    chartLowHighB.textContent = "BTC low/high: —";

    try{
      const rows = await fetchMarketChart(c, chartDays);
      if (!rows.length) throw new Error("No chart rows");

      const dates = rows.map(r => new Date(r.t));
      const btc = rows.map(r => r.price);
      const sats = btc.map(p => satsPerUnitFromBtcPrice(p));

      chartData = { dates, btc, sats };

      const first = dates[0];
      const last  = dates[dates.length - 1];
      chartRange.textContent = `${first.toISOString().slice(0,10)} → ${last.toISOString().slice(0,10)}`;

      const lastSats = sats[sats.length - 1];
      chartKpiMain.textContent = `${fmt0(lastSats)} sats`;

      const base = sats[0];
      const diff = lastSats - base;
      const pct = base ? (diff / base) * 100 : 0;
      chartKpiSub.textContent = `${chartDays}d: ${diff >= 0 ? "+" : ""}${fmt0(diff)} sats (${diff >= 0 ? "+" : ""}${fmt(pct, 2)}%)`;

      const [sLo, sHi] = minMax(sats);
      const [bLo, bHi] = minMax(btc);
      chartLowHighA.textContent = `Sats low/high: ${fmt0(sLo)} / ${fmt0(sHi)}`;
      chartLowHighB.textContent = `BTC low/high: ${fmt(bLo, 2)} / ${fmt(bHi, 2)}`;

      hoverIdx = null;
      hideTip();
      drawChart();
    }catch(e){
      chartKpiSub.textContent = "chart unavailable (rate limit / network)";
      chartData = null;
      hoverIdx = null;
      hideTip();
      drawChart();
      console.error(e);
    }
  }

  function setSegActive(days){
    chartDays = days;
    for (const b of segBtns){
      b.classList.toggle("isOn", Number(b.dataset.days) === days);
    }
  }

  // ---------- CAGR ----------
  function calcCagr(){
    const s = parseNum(startPrice.value);
    const e = parseNum(endPrice.value);
    const y = parseNum(years.value);

    if (!s || !e || !y || y <= 0){
      cagrOut.textContent = "—";
      cagrNotes.textContent = "Enter valid start/end/years.";
      projBody.innerHTML = `<tr><td colspan="3" class="small">Run the calculator.</td></tr>`;
      return;
    }
    const cagr = Math.pow(e/s, 1/y) - 1;
    cagrOut.textContent = `${fmt(cagr*100, 2)}% / year`;
    cagrNotes.textContent = `From ${fmt(s,2)} → ${fmt(e,2)} over ${fmt0(y)} years`;

    const startYear = new Date().getFullYear();
    const rows = [];
    for (let i=0;i<=Math.min(60, Math.ceil(y)); i++){
      const yr = startYear + i;
      const price = s * Math.pow(1+cagr, i);
      const satsPerDollar = SATS_PER_BTC / price;
      rows.push({ yr, price, satsPerDollar });
    }
    projBody.innerHTML = rows.map(r => `
      <tr>
        <td class="mono">${r.yr}</td>
        <td class="mono">${fmt(r.price, 2)}</td>
        <td class="mono">${fmt(r.satsPerDollar, 2)}</td>
      </tr>
    `).join("");
  }

  // ---------- events ----------
  sortBy.addEventListener("change", renderRatesTable, { passive:true });

  refreshAll.addEventListener("click", async () => {
    try{ await loadRates(); }
    catch(_){ statusTop.textContent = "Refresh failed. Try again in a moment."; }
  });

  calcCurrency.addEventListener("change", async () => {
    updateCalcHeader();
    reSyncCalcAfterRateUpdate();
    await refreshChart();
  });

  calcFiat.addEventListener("input", () => syncCalc("fiat"), { passive:true });
  calcBtc.addEventListener("input", () => syncCalc("btc"), { passive:true });
  calcSats.addEventListener("input", () => syncCalc("sats"), { passive:true });

  calcReset.addEventListener("click", () => {
    calcFiat.value = "";
    calcBtc.value = "";
    calcSats.value = "";
    calcLastEdited = "fiat";
    updateCalcHeader();
    clearCalcOutputs();
    calcFiat.focus();
  });

  for (const b of segBtns){
    b.addEventListener("click", async () => {
      const d = Number(b.dataset.days);
      setSegActive(d);
      await refreshChart();
    });
  }

  chartCanvas.addEventListener("mousemove", (evt) => {
    if (!chartData) return;
    updateHover(evt);
  });
  chartCanvas.addEventListener("mouseleave", () => {
    hoverIdx = null;
    hideTip();
    drawChart();
  });

  chartCanvas.addEventListener("touchstart", (evt) => {
    if (!chartData) return;
    const t = evt.touches[0];
    if (!t) return;
    updateHover({ clientX: t.clientX, clientY: t.clientY });
  }, { passive:true });

  chartCanvas.addEventListener("touchmove", (evt) => {
    if (!chartData) return;
    const t = evt.touches[0];
    if (!t) return;
    updateHover({ clientX: t.clientX, clientY: t.clientY });
  }, { passive:true });

  window.addEventListener("resize", () => {
    try{ drawChart(); } catch(_) {}
  }, { passive:true });

  btnCagr.addEventListener("click", calcCagr);

  // ---------- boot ----------
  async function boot(){
    try{
      renderCards();

      calcCurrency.innerHTML = supported.map(code => `<option value="${code}">${code.toUpperCase()}</option>`).join("");
      calcCurrency.value = supported.includes("cad") ? "cad" : "usd";
      updateCalcHeader();
      clearCalcOutputs();

      setSegActive(30);
      drawChart();

      await loadRates();

      setInterval(async () => {
        try{ await loadRates(); } catch(_) {}
      }, 5 * 60 * 1000);

    }catch(err){
      statusTop.textContent = "Boot failed. Check internet / API availability.";
      console.error(err);
    }
  }

  boot();
})();
