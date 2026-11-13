// 매출 대시보드 — 일별/주간 매출(택배비 포함) 그래프, 쇼핑몰별 순위, 택배비 제외 상품 TOP3, 순수익
// 외부 라이브러리 없이 SVG로 그립니다. 사용: Dashboard.mount(요소, 저장된_행들, { weekStart: 5, focus: "20261112" })
// 저장 형식(하루 1행): { sales: [[쇼핑몰, 품목코드, 품목명, 수량, 금액(부가세 포함)], ...], ship: [[쇼핑몰, 건수, 금액], ...] }
(() => {
  const NF = new Intl.NumberFormat("ko-KR");
  const CF = new Intl.NumberFormat("ko-KR", { notation: "compact", maximumFractionDigits: 1 });
  const won = n => NF.format(Math.round(n)) + "원";
  const DAY = 864e5, DOW = "일월화수목금토", pad = n => String(n).padStart(2, "0");
  const NOT_SALE = new Set(["00152", "01921", "02078", "02096"]);          // 택배비 품목은 매출·TOP3에서 제외
  const toMs = k => Date.UTC(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8));
  const toKey = ms => { const d = new Date(ms); return "" + d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()); };
  const md = ms => { const d = new Date(ms); return pad(d.getUTCMonth() + 1) + "/" + pad(d.getUTCDate()); };
  const mdw = ms => `${md(ms)}(${DOW[new Date(ms).getUTCDay()]})`;

  // 안전한 DOM 생성: 문자열은 항상 텍스트로 들어갑니다 (품목명 등 외부 값이 HTML로 해석되지 않음)
  const make = (ns, tag, props, kids) => {
    const e = ns ? document.createElementNS(ns, tag) : document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
    return e;
  };
  const h = (tag, props, ...kids) => make(null, tag, props, kids);
  const sv = (tag, props, ...kids) => make("http://www.w3.org/2000/svg", tag, props, kids);

  const niceStep = raw => { const p = 10 ** Math.floor(Math.log10(raw)), m = raw / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; };

  const CSS = `
.viz-root{--v-s1:#2a78d6;--v-dim:#86b6ef;--v-grid:#e1e0d9;--v-axis:#c3c2b7;--v-muted:#898781}
@media (prefers-color-scheme:dark){.viz-root{--v-s1:#3987e5;--v-dim:#184f95;--v-grid:#2c2c2a;--v-axis:#383835}}
.viz-head{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.viz-head h3{margin:0;font-size:18px;margin-right:auto}
.viz-head label{display:flex;gap:8px;align-items:center;font-size:13px;color:var(--mut)}
.viz-sec{border-top:1px solid var(--line);padding-top:16px;margin-top:18px}.viz-sec h4{margin:0;font-size:16px}
.viz-top{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}.viz-top .mut{font-size:13px}.viz-nav{margin-left:auto;display:flex;gap:6px}
.viz-nav button{background:none;color:var(--tx);border:1px solid var(--line);padding:3px 10px;font-size:13px}.viz-nav button:disabled{opacity:.35;cursor:default}
.tiles{display:flex;gap:12px;flex-wrap:wrap;margin:12px 0}.tile{flex:1 1 150px;border:1px solid var(--line);border-radius:10px;padding:10px 14px}
.viz-root .seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden}.viz-root .seg button{background:none;color:var(--tx);border:0;border-radius:0;padding:5px 14px;font-size:13px}.viz-root .seg button[aria-pressed=true]{background:var(--v-s1);color:#fff;font-weight:600}
.viz-chk{display:flex;gap:5px;align-items:center;font-size:12.5px;color:var(--mut);cursor:pointer;margin-right:6px}.viz-chk input{margin:0}
.tile .l.sm{font-size:12px;margin-top:2px}.tile .l{font-size:12.5px;color:var(--mut)}.tile .v{font-size:22px;font-weight:600;margin-top:2px}
.viz-manage{margin-top:18px;border-top:1px solid var(--line);padding-top:10px}.viz-manage summary{cursor:pointer;font-size:13.5px;color:var(--mut)}.viz-manage button.del{background:none;border:1px solid var(--line);color:#c0392b;padding:2px 10px;font-size:12.5px}.viz-manage td.n,.viz-manage th.n{text-align:right}
.viz-grid{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(0,1fr);gap:20px}.viz-grid.two{grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
@media(max-width:820px){.viz-grid{grid-template-columns:minmax(0,1fr)}}
.viz-sub{font-size:12.5px;color:var(--mut);margin:0 0 6px}
.viz-chart svg{display:block;max-width:100%}.viz-chart text{fill:var(--v-muted);font-size:11px}.viz-chart text.val{fill:var(--tx);font-weight:600}
.viz-chart .hit{fill:transparent;cursor:pointer;outline:none}.viz-chart .hit:focus-visible{stroke:var(--v-s1);stroke-width:2;rx:4}
.viz-chart .bar{fill:var(--v-dim)}.viz-chart .bar.sel,.viz-chart .bar.hov{fill:var(--v-s1)}
.rk{display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:10px;row-gap:3px;align-items:baseline;width:100%;background:none;border:0;color:var(--tx);padding:5px 6px;border-radius:6px;cursor:pointer;text-align:left;font:inherit;font-size:13px}
.rk:hover{background:var(--bg)}.rk-n{overflow-wrap:anywhere}.rk-t{display:block;height:12px;grid-column:1/-1}
.rk-b{display:block;height:12px;background:var(--v-s1);border-radius:0 4px 4px 0}.rk-b.dim{background:var(--v-dim)}.rk-v{font-variant-numeric:tabular-nums}
.t3 table{font-size:13px}.t3 th,.t3 td{padding:6px 6px}.t3 td:first-child,.t3 th:first-child{width:1.6em;color:var(--mut)}.t3 td.n{font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}.t3 th{white-space:nowrap}.t3 th.n{text-align:right}.t3 td{white-space:normal;word-break:keep-all;overflow-wrap:anywhere}
.viz-root details{margin-top:8px;font-size:13px}.viz-root summary{cursor:pointer;color:var(--mut)}.viz-root details table{margin-top:6px;font-size:12.5px}.viz-root details td.n,.viz-root details th.n{text-align:right;font-variant-numeric:tabular-nums}
.viz-tip{position:fixed;z-index:60;pointer-events:none;background:var(--card);color:var(--tx);border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:12.5px;box-shadow:0 6px 18px rgba(0,0,0,.14);display:none;max-width:260px}
.viz-tip b{display:block;font-size:15px;margin:2px 0 4px}.viz-tip div.r{display:flex;justify-content:space-between;gap:14px;color:var(--mut)}
`;
  const injectCss = () => { if (!document.getElementById("viz-css")) { const s = document.createElement("style"); s.id = "viz-css"; s.textContent = CSS; document.head.append(s); } };

  // ---------- 세로 막대 그래프 (한 가지 색, 선택한 막대만 강조) ----------
  function columnChart(host, items, selKey, onSel, tip, height) {
    host.replaceChildren();
    const W = Math.max(280, Math.floor(host.clientWidth || 640)), H = height || 250, m = { l: 48, r: 8, t: 24, b: 42 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b, n = items.length, band = pw / n;
    const max = Math.max(0, ...items.map(i => i.value || 0));
    const step = max > 0 ? niceStep(max / 4) : 1, top = max > 0 ? step * Math.ceil(max / step - 1e-9) : 1;
    const y = v => m.t + ph - (v / top) * ph;
    const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "group", "aria-label": "막대 그래프 (아래 '표로 보기'에 같은 값이 있습니다)" });
    for (let i = 0; i <= Math.round(top / step); i++) {
      const v = i * step;
      svg.append(sv("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: i === 0 ? "var(--v-axis)" : "var(--v-grid)", "stroke-width": 1 }),
        sv("text", { x: m.l - 8, y: y(v) + 4, "text-anchor": "end" }, max > 0 ? CF.format(v) : "0"));
    }
    const every = Math.max(1, Math.ceil(34 / band));
    items.forEach((it, i) => {
      const cx = m.l + band * (i + .5), bw = Math.min(24, band * .62), x = cx - bw / 2, sel = it.key === selKey;
      let bar = null;
      if (it.value == null) svg.append(sv("text", { x: cx, y: y(0) - 6, "text-anchor": "middle" }, "–"));
      else if (it.value > 0) {
        const bh = Math.max(2, y(0) - y(it.value)), yy = y(0) - bh, r = Math.min(4, bh);
        bar = sv("path", { class: "bar" + (sel ? " sel" : ""), d: `M${x},${yy + bh}V${yy + r}Q${x},${yy} ${x + r},${yy}H${x + bw - r}Q${x + bw},${yy} ${x + bw},${yy + r}V${yy + bh}Z` });
        svg.append(bar);
        if (sel) svg.append(sv("text", { class: "val", x: cx, y: yy - 6, "text-anchor": "middle" }, CF.format(it.value)));
      }
      if (i % every === 0 || sel) {
        svg.append(sv("text", { x: cx, y: H - m.b + 16, "text-anchor": "middle", style: sel ? "fill:var(--tx);font-weight:600" : null }, it.label));
        if (it.sub) svg.append(sv("text", { x: cx, y: H - m.b + 30, "text-anchor": "middle" }, it.sub));
      }
      const hit = sv("rect", { class: "hit", x: m.l + band * i, y: m.t, width: band, height: ph + 34, tabindex: 0, role: "button", "aria-pressed": sel, "aria-label": `${it.title} ${it.value == null ? "저장된 데이터 없음" : won(it.value)}` });
      const pos = e => tip.show(it, e.clientX != null && e.type !== "focus" ? { x: e.clientX, y: e.clientY } : (r => ({ x: r.left + r.width / 2, y: r.top + 20 }))(hit.getBoundingClientRect()));
      hit.addEventListener("pointerenter", e => { bar && bar.classList.add("hov"); pos(e); });
      hit.addEventListener("pointermove", pos);
      hit.addEventListener("pointerleave", () => { bar && bar.classList.remove("hov"); tip.hide(); });
      hit.addEventListener("focus", pos); hit.addEventListener("blur", tip.hide);
      hit.addEventListener("click", () => onSel(it.key));
      hit.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSel(it.key); } });
      svg.append(hit);
    });
    host.append(svg);
  }

  // ---------- 쇼핑몰별 순위 (가로 막대, 누르면 그 쇼핑몰만 보기) ----------
  function shopRank(host, shops, sel, onPick, metric = "amt", noProfit = false) {
    host.replaceChildren();
    const val = v => (metric === "profit" ? v.profit : v.amt);
    const list = [...shops].filter(([, v]) => v.amt > 0).sort((a, b) => val(b[1]) - val(a[1]));
    if (!list.length) return host.append(h("p", { class: "mut" }, "선택한 기간에 매출이 없습니다."));
    if (metric === "profit" && noProfit) return host.append(h("p", { class: "mut" }, "이 기간에는 원가가 저장된 날짜가 없습니다. 해당 날짜의 정산 파일을 다시 변환하면 순수익이 계산됩니다."));
    const max = Math.max(1, val(list[0][1]));
    for (const [name, v] of list)
      host.append(h("button", { type: "button", class: "rk", "aria-pressed": sel === name, title: `${name} · ${won(val(v))} · ${NF.format(v.qty)}개`, onclick: () => onPick(sel === name ? "" : name) },
        h("span", { class: "rk-n" }, name),
        h("span", { class: "rk-v" }, won(val(v))),
        h("span", { class: "rk-t" }, h("span", { class: "rk-b" + (!sel || sel === name ? "" : " dim"), style: `width:${Math.max(1.5, Math.max(0, val(v)) / max * 100)}%` }))));
  }

  // ---------- 상품 TOP3 (판매량 / 금액) ----------
  function top3(host, products) {
    host.replaceChildren();
    const arr = [...products.values()];
    const one = (title, cmp, cols) => {
      const rows = arr.slice().sort(cmp).slice(0, 3);
      return h("div", { class: "t3" }, h("p", { class: "viz-sub" }, title),
        rows.length ? h("table", null, h("tr", null, h("th", null, ""), h("th", null, "품목명"), cols.map(c => h("th", { class: "n" }, c[0]))),
          rows.map((p, i) => h("tr", null, h("td", null, i + 1), h("td", null, p.name), cols.map(c => h("td", { class: "n" }, c[1](p))))))
          : h("p", { class: "mut" }, "데이터 없음"));
    };
    const q = p => NF.format(p.qty) + "개", a = p => won(p.amt);
    host.append(one("판매량 TOP3 (택배비 제외)", (x, y) => y.qty - x.qty || y.amt - x.amt, [["판매량", q], ["금액", a]]),
      one("금액 TOP3 (택배비 제외)", (x, y) => y.amt - x.amt || y.qty - x.qty, [["금액", a], ["판매량", q]]));
  }

  // ---------- 메인 ----------
  function mount(host, rows, opts = {}) {
    injectCss();
    const weekStart = opts.weekStart ?? 5;                        // 0=일 … 5=금 … 6=토
    const days = new Map();
    for (const r of rows || []) { const s = r.v && r.v[0]; if (s && Array.isArray(s.sales)) days.set(r.k, { sales: s.sales, ship: s.ship || [], hasCost: s.sales.some(x => x.length > 5) }); }
    const rates = opts.rates || {}, rate = s => Number(rates[s]) || 0;
    host.replaceChildren();
    if (!days.size) return host.append(h("div", { class: "card" }, "저장된 집계가 없습니다."));

    const startOf = ms => ms - ((new Date(ms).getUTCDay() - weekStart + 7) % 7) * DAY;
    const keys = [...days.keys()].sort(), latest = toMs(keys[keys.length - 1]), latestW = startOf(latest);
    const fMs = opts.focus && days.has(opts.focus) ? toMs(opts.focus) : latest, fW = startOf(fMs);
    const st = { metric: "amt", shop: "", selDay: toKey(fMs), selWeek: toKey(fW),
      dayEnd: fMs > latest - 14 * DAY ? latest : fMs, weekEnd: fW > latestW - 56 * DAY ? latestW : fW };
    const NDAY = 14, NWEEK = 8;

    function summarize(ks, shop) {
      const r = { amt: 0, prod: 0, qty: 0, ship: 0, shipN: 0, n: 0, pn: 0, g: 0, profit: 0, unk: 0, norate: 0, products: new Map(), shops: new Map() };
      const sh = s => { let v = r.shops.get(s); if (!v) r.shops.set(s, v = { amt: 0, prod: 0, qty: 0, ship: 0, shipN: 0, g: 0, cost: 0, sc: 0, unk: 0, profit: 0 }); return v; };
      for (const k of ks) {
        const d = days.get(k); if (!d) continue; r.n++; if (d.hasCost) r.pn++;
        for (const [s, code, name, q, a, c, unk] of d.sales) {
          if (NOT_SALE.has(code) || /^택배비/.test(name)) continue;
          const v = sh(s); v.amt += a; v.prod += a; v.qty += q;
          if (d.hasCost) { v.g += a; v.cost += c || 0; if (unk) v.unk += a; }
          if (shop && s !== shop) continue;
          r.amt += a; r.prod += a; r.qty += q;
          const p = r.products.get(code) || { name, qty: 0, amt: 0 }; p.qty += q; p.amt += a; p.name = name; r.products.set(code, p);
        }
        for (const [s, n, a, c] of d.ship) {
          const v = sh(s); v.ship += a; v.shipN += n; v.amt += a;     // 택배비도 매출에 포함 (건수·금액은 따로 기록)
          if (d.hasCost) { v.g += a; v.sc += c || 0; }
          if (!shop || s === shop) { r.ship += a; r.shipN += n; r.amt += a; }
        }
      }
      // 순수익 = 매출(택배비 포함) × (1 − 수수료율) − 원가(상품 입고단가 + 택배비 품목 입고단가)  ※ 원가가 저장된 날짜만 집계. 수수료는 화면에 표시하지 않음
      for (const [s, v] of r.shops) {
        const fee = v.g * rate(s) / 100; v.profit = Math.round(v.g - fee - v.cost - v.sc);
        if (shop && s !== shop) continue;
        r.profit += v.profit; r.g += v.g; r.unk += v.unk; if (v.amt > 0 && !rate(s)) r.norate++;
      }
      return r;
    }

    // 쇼핑몰 목록 (전체 기간 매출 순)
    const total = new Map();
    for (const d of days.values()) for (const [s, code, name, , a] of d.sales) if (!NOT_SALE.has(code) && !/^택배비/.test(name)) total.set(s, (total.get(s) || 0) + a);
    const shopNames = [...total].sort((a, b) => b[1] - a[1]).map(x => x[0]);

    const tipEl = h("div", { class: "viz-tip", role: "tooltip" });
    const tip = {
      show(it, p) {
        tipEl.replaceChildren(h("div", { class: "mut" }, it.title), h("b", null, it.value == null ? "저장된 데이터 없음" : won(it.value)), ...(it.rows || []).map(r => h("div", { class: "r" }, h("span", null, r[0]), h("span", null, r[1]))));
        tipEl.style.display = "block";
        const w = tipEl.offsetWidth, hh = tipEl.offsetHeight;
        tipEl.style.left = Math.max(6, Math.min(innerWidth - w - 6, p.x + 14)) + "px";
        tipEl.style.top = Math.max(6, Math.min(innerHeight - hh - 6, p.y - hh - 10)) + "px";
      },
      hide() { tipEl.style.display = "none"; },
    };

    const select = h("select", { "aria-label": "쇼핑몰 선택", onchange: e => { st.shop = e.target.value; render(); } },
      h("option", { value: "" }, "전체 쇼핑몰"), shopNames.map(n => h("option", { value: n }, n)));
    const body = h("div");
    const card = h("div", { class: "card viz-root" },
      h("div", { class: "viz-head" }, h("h3", null, "매출 현황"), h("label", null, "쇼핑몰", select),
        h("span", { class: "mut", style: "font-size:12.5px" }, "부가세 포함 판매가 · 매출은 택배비 포함(건수·금액은 작게 표기), 상품 TOP3는 택배비 제외")),
      body, tipEl);

    const weekKeys = ws => Array.from({ length: 7 }, (_, i) => toKey(ws + i * DAY));
    const tile = (l, v, sub) => h("div", { class: "tile" }, h("div", { class: "l" }, l), h("div", { class: "v" }, v), sub ? h("div", { class: "l sm" }, sub) : null);
    const MN = () => (st.metric === "profit" ? "순수익" : "매출");
    const pv = s => (s.pn ? won(s.profit) : "원가 미저장");                      // 순수익 표시값
    const profitSub = s => !s.pn ? "이 기간은 원가가 저장되지 않았습니다(정산 파일을 다시 변환하면 계산됨)"
      : `마진 ${s.g > 0 ? Math.round(s.profit / s.g * 1000) / 10 : 0}%` + (s.pn < s.n ? ` · 원가 저장된 ${s.pn}/${s.n}일만 집계` : "") + (s.unk > 0 ? ` · 입고단가 없는 품목 매출 ${won(s.unk)} 포함` : "") + (s.norate ? ` · 수수료율 미입력 ${s.norate}곳은 0%로 계산` : "");
    const shipSub = s => (s.n ? `택배비 포함 ${NF.format(s.shipN)}건 · ${won(s.ship)}` : "");

    // 일별/주간 막대 그래프용 데이터 (shop이 ""이면 모든 쇼핑몰 합계)
    function series(kind, shop) {
      const isDay = kind === "day", N = isDay ? NDAY : NWEEK, endMs = isDay ? st.dayEnd : st.weekEnd, span = isDay ? DAY : 7 * DAY;
      const selKey = isDay ? st.selDay : st.selWeek;
      const items = [], first = isDay ? toMs(keys[0]) : startOf(toMs(keys[0]));        // 가장 오래된 저장 날짜(주)
      for (let i = N - 1; i >= 0; i--) {
        if (endMs - i * span < first) continue;                                       // 데이터가 시작되기 전 기간은 건너뜀
        const ms = endMs - i * span, ks = isDay ? [toKey(ms)] : weekKeys(ms), s = summarize(ks, shop), partial = !isDay && s.n < 7;
        const value = st.metric === "profit" ? (s.pn ? s.profit : null) : (s.n ? s.amt : null);
        items.push({ key: toKey(ms), ms, s, value,
          label: md(ms), sub: isDay ? DOW[new Date(ms).getUTCDay()] : (partial ? `${s.n}/7일` : "~" + md(ms + 6 * DAY)),
          title: isDay ? mdw(ms) : `${mdw(ms)} ~ ${mdw(ms + 6 * DAY)}`,
          rows: s.n ? [["매출", won(s.amt)], ["판매 수량", NF.format(s.qty) + "개"], ["택배비 포함", `${NF.format(s.shipN)}건 · ${won(s.ship)}`], ["순수익", pv(s)]]
            .filter(r => r[0] !== MN()).concat(partial ? [["집계된 일수", `${s.n}/7일 (일부만 저장됨)`]] : []) : [] });
      }
      const selMs = toMs(selKey), cur = summarize(isDay ? [selKey] : weekKeys(selMs), shop);
      return { isDay, N, endMs, span, selKey, selMs, items, first, cur };
    }
    const pickSel = (isDay, k) => { if (isDay) st.selDay = k; else st.selWeek = k; render(); };

    function section(kind) {
      const { isDay, N, endMs, span, selKey, selMs, items, first, cur } = series(kind, st.shop);
      const nextDisabled = isDay ? endMs >= latest : endMs >= latestW, prevDisabled = endMs - (N - 1) * span <= first;
      const shift = dir => { if (isDay) st.dayEnd = Math.min(latest, st.dayEnd + dir * 7 * DAY); else st.weekEnd = Math.min(latestW, st.weekEnd + dir * 28 * DAY); render(); };
      const chart = h("div", { class: "viz-chart" }), rank = h("div"), t3 = h("div", { class: "viz-grid two", style: "margin-top:14px" });
      const sec = h("section", { class: "viz-sec", "aria-label": (isDay ? "일별 " : "주간 ") + MN() + " 현황" },
        h("div", { class: "viz-top" }, h("h4", null, (isDay ? "일별 " : "주간 ") + MN() + " 현황"),
          h("span", { class: "mut" }, isDay ? `최근 ${N}일` : `최근 ${N}주 · ${DOW[weekStart]}요일 ~ ${DOW[(weekStart + 6) % 7]}요일 기준`),
          h("div", { class: "viz-nav" }, isDay ? chkLabel : null, isDay ? h("button", { type: "button", disabled: !cur.n, title: "선택한 날짜의 모든 쇼핑몰 성과를 한 장의 이미지(PNG)로 저장합니다", onclick: () => downloadDayImage(selKey) }, "전체 쇼핑몰 이미지 저장") : null, h("button", { type: "button", disabled: prevDisabled, onclick: () => shift(-1) }, "◀ 이전"), h("button", { type: "button", disabled: nextDisabled, onclick: () => shift(1) }, "다음 ▶"))),
        h("div", { class: "tiles" },
          tile(isDay ? `${mdw(selMs)} 매출 (택배비 포함)` : `${md(selMs)} ~ ${md(selMs + 6 * DAY)} 매출 (택배비 포함)${cur.n < 7 ? ` · ${cur.n}/7일 집계` : ""}`, cur.n ? won(cur.amt) : "데이터 없음", shipSub(cur)),
          tile("판매 수량", cur.n ? NF.format(cur.qty) + "개" : "–"),
          tile("순수익", cur.n ? pv(cur) : "–", cur.n ? profitSub(cur) : "")),
        h("div", { class: "viz-grid" },
          h("div", null, h("p", { class: "viz-sub" }, `${st.shop || "전체 쇼핑몰"} · 막대를 누르면 ${isDay ? "그 날짜" : "그 주"}로 바뀝니다`), chart),
          h("div", null, h("p", { class: "viz-sub" }, `쇼핑몰별 ${MN()} · ${isDay ? mdw(selMs) : md(selMs) + " 주"} (누르면 해당 쇼핑몰만 보기)`), rank)),
        t3,
        h("details", null, h("summary", null, "표로 보기"), h("div", { class: "wrap" }, h("table", null,
          h("tr", null, h("th", null, isDay ? "날짜" : "기간"), h("th", { class: "n" }, "매출(택배비 포함)"), h("th", { class: "n" }, "판매 수량"), h("th", { class: "n" }, "택배비 포함분"), h("th", { class: "n" }, "순수익"), h("th", { class: "n" }, "집계 일수")),
          items.map(it => h("tr", null, h("td", null, it.title), h("td", { class: "n" }, it.value == null ? "–" : won(it.value)), h("td", { class: "n" }, it.s.n ? NF.format(it.s.qty) : "–"),
            h("td", { class: "n" }, it.s.n ? `${won(it.s.ship)} (${NF.format(it.s.shipN)}건)` : "–"), h("td", { class: "n" }, it.s.pn ? won(it.s.profit) : "–"), h("td", { class: "n" }, isDay ? (it.s.n ? "1/1" : "0/1") : `${it.s.n}/7`)))))));
      return { sec, draw() {
        columnChart(chart, items, selKey, k => pickSel(isDay, k), tip);
        shopRank(rank, cur.shops, st.shop, s => { st.shop = s; select.value = s; render(); }, st.metric, !cur.pn);
        top3(t3, cur.products);
      } };
    }

    // 전체 쇼핑몰 합계 (쇼핑몰 선택과 상관없이 항상 모든 쇼핑몰) — 일별·주간 요약
    // 공유 이미지에 순수익을 넣을지 (기본: 넣지 않음 — 단톡방 공유용), 선택은 이 브라우저에 기억
    const chk = h("input", { type: "checkbox", id: "img-profit" });
    try { chk.checked = localStorage.getItem("img-profit") === "1"; } catch (e) { /* 저장소 사용 불가 */ }
    chk.addEventListener("change", () => { try { localStorage.setItem("img-profit", chk.checked ? "1" : "0"); } catch (e) { /* 무시 */ } });
    const chkLabel = h("label", { class: "viz-chk", title: "체크하면 저장 이미지에 순수익과 마진율이 함께 들어갑니다" }, chk, "이미지에 순수익 포함");
    const metricSeg = h("div", { class: "seg", role: "group", "aria-label": "표시 기준" });
    const drawSeg = () => metricSeg.replaceChildren(...[["amt", "매출"], ["profit", "순수익"]].map(([k, l]) => h("button", { type: "button", "aria-pressed": st.metric === k, onclick: () => { st.metric = k; render(); } }, l)));
    const totalGrid = h("div", { class: "viz-grid two" });
    const totalCard = h("div", { class: "card viz-root" },
      h("div", { class: "viz-head" }, h("h3", null, "전체 쇼핑몰 총 " + "현황"), metricSeg, h("span", { class: "mut", style: "font-size:12.5px;flex-basis:100%" }, "모든 쇼핑몰 합계 · 매출은 택배비 포함 · 막대를 누르면 아래 상세 현황도 같은 날짜(주)로 바뀝니다")), totalGrid);
    host.replaceChildren(totalCard, card);
    function totalBlock() {
      const parts = ["day", "week"].map(kind => {
        const sr = series(kind, ""), partial = !sr.isDay && sr.cur.n < 7, chart = h("div", { class: "viz-chart" });
        const label = sr.isDay ? `${mdw(sr.selMs)} 총 ${MN()}${st.metric === "amt" ? " (택배비 포함)" : ""}` : `${md(sr.selMs)} ~ ${md(sr.selMs + 6 * DAY)} 총 ${MN()}${partial ? ` · ${sr.cur.n}/7일 집계` : ""}`;
        const c = sr.cur, big = st.metric === "profit" ? (c.n ? pv(c) : "데이터 없음") : (c.n ? won(c.amt) : "데이터 없음");
        const other = !c.n ? "" : st.metric === "profit" ? `매출 ${won(c.amt)} · ${profitSub(c).split(" · ")[0]}` : `판매 ${NF.format(c.qty)}개 · 택배비 포함 ${NF.format(c.shipN)}건 ${won(c.ship)}${c.pn ? " · 순수익 " + won(c.profit) : ""}`;
        const col = h("div", null, h("h4", { style: "margin:0 0 8px;font-size:15px" }, sr.isDay ? "일별" : "주간"),
          h("div", { class: "tile", style: "margin-bottom:8px" }, h("div", { class: "l" }, label), h("div", { class: "v" }, big),
            h("div", { class: "l", style: "margin-top:2px" }, other)), chart);
        return { col, draw: () => columnChart(chart, sr.items, sr.selKey, k => pickSel(sr.isDay, k), tip, 190) };
      });
      totalGrid.replaceChildren(...parts.map(x => x.col)); parts.forEach(x => x.draw());
    }

    // ---------- 일별 성과 이미지 (모든 쇼핑몰, 단톡방 공유용 PNG) ----------
    function dayImage(selKey, withProfit) {
      const ms = toMs(selKey), pk = toKey(ms - DAY), hasPrev = days.has(pk);
      const all = summarize([selKey], "");
      const mk = (name, s, p, total) => ({ name, s, p, total });
      const list = [mk("전체 쇼핑몰", all, hasPrev ? summarize([pk], "") : null, true)];
      [...all.shops].filter(([, v]) => v.amt > 0).sort((a, b) => b[1].amt - a[1].amt)
        .forEach(([name]) => list.push(mk(name, summarize([selKey], name), hasPrev ? summarize([pk], name) : null, false)));
      const maxAmt = Math.max(1, ...list.slice(1).map(r => r.s.amt));
      const S = 2, W = 1200, pad = 40, HEAD = 128, KPI_Y = HEAD + 24, KPI_H = 104, TBL_Y = KPI_Y + KPI_H + 30, ROW_H = 118, H = TBL_Y + 40 + list.length * ROW_H + 52;
      const cv = document.createElement("canvas"); cv.width = W * S; cv.height = H * S;
      const c = cv.getContext("2d"); c.scale(S, S);
      const FONT = '"Pretendard","Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",system-ui,sans-serif';
      const INK = "#16181d", MUT = "#6b7280", LINE = "#e5e7eb", ACC = "#2a78d6", NAVY = "#173f73", SOFT = "#f3f6fb", UP = "#16a34a", DOWN = "#dc2626";
      const txt = (t, x, y, size, weight, color, align = "left") => { c.font = `${weight} ${size}px ${FONT}`; c.fillStyle = color; c.textAlign = align; c.textBaseline = "alphabetic"; c.fillText(t, x, y); };
      const fit = (t, maxW, size, weight) => { c.font = `${weight} ${size}px ${FONT}`; if (c.measureText(t).width <= maxW) return t; let a = t; while (a.length > 1 && c.measureText(a + "…").width > maxW) a = a.slice(0, -1); return a + "…"; };
      const rr = (x, y, w, hgt, r) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + hgt, r); c.arcTo(x + w, y + hgt, x, y + hgt, r); c.arcTo(x, y + hgt, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
      const pct = (cur, prev) => (!prev || !(prev > 0) ? null : Math.round((cur - prev) / prev * 100));
      const deltaTxt = v => (v == null ? "전일 –" : v > 0 ? `전일 ▲ ${v}%` : v < 0 ? `전일 ▼ ${-v}%` : "전일 0%");
      const deltaCol = v => (v == null || v === 0 ? MUT : v > 0 ? UP : DOWN);
      const shipTxt = s => `택배비 포함 ${NF.format(s.shipN)}건 · ${won(s.ship)}`;
      const margin = s => (s.g > 0 ? Math.round(s.profit / s.g * 1000) / 10 : 0);
      c.fillStyle = "#ffffff"; c.fillRect(0, 0, W, H);
      // 머리띠
      c.fillStyle = NAVY; c.fillRect(0, 0, W, HEAD);
      txt("일별 매출 현황", pad, 62, 34, 700, "#ffffff");
      const d = new Date(ms); txt(`${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${DOW[d.getUTCDay()]})`, W - pad, 62, 26, 600, "#ffffff", "right");
      txt("전체 쇼핑몰 · 부가세 포함 · 매출은 택배비 포함 · 상품 TOP3는 택배비 제외", pad, 98, 15, 400, "#b9cdeb");
      // 핵심 숫자 3칸
      const kw = (W - 2 * pad - 32) / 3, dAll = pct(all.amt, hasPrev ? summarize([pk], "").amt : null);
      const third = withProfit ? ["순수익", all.pn ? won(all.profit) : "–", all.pn ? `마진 ${margin(all)}%` : "원가 미저장"] : ["매출 발생 쇼핑몰", `${list.length - 1}곳`, ""];
      [["총 매출 (택배비 포함)", won(all.amt), shipTxt(all), deltaTxt(dAll), deltaCol(dAll)], ["판매 수량", NF.format(all.qty) + "개", `상품 ${all.products.size}종`, "", MUT], [third[0], third[1], third[2], "", MUT]].forEach(([l, v, sub, dl, dc], i) => {
        const x = pad + i * (kw + 16); rr(x, KPI_Y, kw, KPI_H, 12); c.fillStyle = SOFT; c.fill();
        txt(l, x + 20, KPI_Y + 30, 15, 500, MUT); txt(v, x + 20, KPI_Y + 68, 30, 700, INK);
        if (sub) txt(sub, x + 20, KPI_Y + 92, 13, 400, MUT);
        if (dl) txt(dl, x + kw - 20, KPI_Y + 30, 14, 600, dc, "right");
      });
      // 표 머리글
      const c1 = pad + 34, c1w = 340, c2 = 430, c2w = 340, c3 = 810, c3w = 350, top0 = TBL_Y + 28;
      txt("쇼핑몰별 성과", pad, TBL_Y + 4, 18, 700, INK);
      txt("판매량 TOP3", c2, top0 - 6, 14, 600, MUT); txt("금액 TOP3", c3, top0 - 6, 14, 600, MUT);
      c.strokeStyle = INK; c.lineWidth = 1.5; c.beginPath(); c.moveTo(pad, top0 + 4); c.lineTo(W - pad, top0 + 4); c.stroke();
      const topList = (x, w, y, prods, cmp, fmt) => prods.slice().sort(cmp).slice(0, 3).forEach((p, i) => {
        const base = y + 34 + i * 26, val = fmt(p);
        txt(String(i + 1), x, base, 14, 600, ACC); txt(val, x + w, base, 14, 600, INK, "right");
        c.font = `600 14px ${FONT}`; txt(fit(p.name, w - 24 - c.measureText(val).width - 16, 14, 400), x + 22, base, 14, 400, INK);
      });
      list.forEach((r, i) => {
        const y = top0 + 6 + i * ROW_H, dv = pct(r.s.amt, r.p ? r.p.amt : null);
        if (r.total) { c.fillStyle = SOFT; c.fillRect(pad - 10, y, W - 2 * pad + 20, ROW_H - 2); }
        // 순번 / 이름 / 전일 대비
        if (!r.total) { c.beginPath(); c.arc(pad + 12, y + 24, 12, 0, Math.PI * 2); c.fillStyle = i <= 3 ? ACC : "#9aa4b2"; c.fill(); txt(String(i), pad + 12, y + 29, 13, 700, "#ffffff", "center"); }
        const nx = r.total ? pad : c1, nw = r.total ? c1w + 30 : c1w - 80;
        txt(fit(r.name, c1w - 90 + (r.total ? 34 : 0), 17, 700), nx, y + 30, 17, 700, INK); txt(deltaTxt(dv), c1 + c1w, y + 30, 13, 600, deltaCol(dv), "right");
        // 매출 (택배비 포함) + 막대
        txt(won(r.s.amt), nx, y + 60, 22, 700, INK);
        if (!r.total) { c.fillStyle = "#e3ebf7"; rr(nx, y + 68, c1w, 7, 3); c.fill(); c.fillStyle = ACC; rr(nx, y + 68, Math.max(4, c1w * r.s.amt / maxAmt), 7, 3); c.fill(); }
        txt(`판매 ${NF.format(r.s.qty)}개 · ${shipTxt(r.s)}`, nx, y + 92, 13, 400, MUT);
        if (withProfit) txt(r.s.pn ? `순수익 ${won(r.s.profit)} · 마진 ${margin(r.s)}%` : "순수익 –", nx, y + 109, 13, 600, r.s.pn && r.s.profit < 0 ? DOWN : "#0f6b3a");
        const prods = [...r.s.products.values()];
        topList(c2, c2w, y, prods, (a, b) => b.qty - a.qty || b.amt - a.amt, p => NF.format(p.qty) + "개");
        topList(c3, c3w, y, prods, (a, b) => b.amt - a.amt || b.qty - a.qty, p => won(p.amt));
        c.strokeStyle = LINE; c.lineWidth = 1; c.beginPath(); c.moveTo(pad, y + ROW_H - 2); c.lineTo(W - pad, y + ROW_H - 2); c.stroke();
      });
      txt("전일 대비는 전날 저장된 데이터가 있을 때만 표시됩니다 · 순위는 매출(택배비 포함) 기준", pad, H - 22, 12, 400, MUT);
      return cv;
    }
    function downloadDayImage(selKey) {
      dayImage(selKey, chk.checked).toBlob(b => {
        const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `일별매출_${selKey}${chk.checked ? "_순수익포함" : ""}.png`;
        document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      }, "image/png");
    }

    // ---------- 저장된 날짜 관리 (날짜별 삭제) ----------
    const delMsg = h("p", { class: "mut", style: "margin:6px 0 0" });
    const manage = h("details", { class: "viz-manage" }, h("summary", null, "저장된 날짜 관리 (날짜별 삭제)"),
      h("div", { class: "wrap", style: "max-height:320px;overflow:auto" }, h("table", null,
        h("tr", null, h("th", null, "날짜"), h("th", { class: "n" }, "매출"), h("th", { class: "n" }, "판매 수량"), h("th", null, "")),
        keys.slice().reverse().map(k => {
          const s = summarize([k], ""), label = `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6)} (${DOW[new Date(toMs(k)).getUTCDay()]})`;
          return h("tr", null, h("td", null, label), h("td", { class: "n" }, won(s.amt)), h("td", { class: "n" }, NF.format(s.qty) + "개"),
            h("td", { class: "n" }, h("button", { type: "button", class: "del", onclick: async e => {
              if (!opts.onDelete || !confirm(`${label} 집계를 삭제할까요?\n삭제한 날짜는 같은 날짜의 정산 파일을 다시 변환해야 복구됩니다.`)) return;
              e.target.disabled = true; delMsg.textContent = "삭제 중...";
              try { await opts.onDelete(k); } catch (err) { delMsg.textContent = "삭제 실패: " + (err.message || err); e.target.disabled = false; }
            } }, "삭제")));
        }))), delMsg);
    card.append(manage);

    function render() {
      tip.hide(); card.querySelector("h3").textContent = MN() + " 현황";
      const a = section("day"), b = section("week");
      body.replaceChildren(a.sec, b.sec); drawSeg(); totalBlock(); a.draw(); b.draw();
    }
    render();
    let timer = null;
    const onResize = () => { if (!card.isConnected) return removeEventListener("resize", onResize); clearTimeout(timer); timer = setTimeout(render, 150); };
    addEventListener("resize", onResize);
  }

  window.Dashboard = { mount };
})();
