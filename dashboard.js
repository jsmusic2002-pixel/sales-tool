// 매출 대시보드 — 일별/주간 매출 그래프, 쇼핑몰별 순위, 택배비 제외 상품 TOP3
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
.tile .l{font-size:12.5px;color:var(--mut)}.tile .v{font-size:22px;font-weight:600;margin-top:2px}
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
  function columnChart(host, items, selKey, onSel, tip) {
    host.replaceChildren();
    const W = Math.max(280, Math.floor(host.clientWidth || 640)), H = 250, m = { l: 48, r: 8, t: 24, b: 42 };
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
  function shopRank(host, shops, sel, onPick) {
    host.replaceChildren();
    const list = [...shops].filter(([, v]) => v.amt > 0).sort((a, b) => b[1].amt - a[1].amt);
    if (!list.length) return host.append(h("p", { class: "mut" }, "선택한 기간에 매출이 없습니다."));
    const max = list[0][1].amt;
    for (const [name, v] of list)
      host.append(h("button", { type: "button", class: "rk", "aria-pressed": sel === name, title: `${name} · ${won(v.amt)} · ${NF.format(v.qty)}개`, onclick: () => onPick(sel === name ? "" : name) },
        h("span", { class: "rk-n" }, name),
        h("span", { class: "rk-v" }, won(v.amt)),
        h("span", { class: "rk-t" }, h("span", { class: "rk-b" + (!sel || sel === name ? "" : " dim"), style: `width:${Math.max(1.5, v.amt / max * 100)}%` }))));
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
    for (const r of rows || []) { const s = r.v && r.v[0]; if (s && Array.isArray(s.sales)) days.set(r.k, { sales: s.sales, ship: s.ship || [] }); }
    host.replaceChildren();
    if (!days.size) return host.append(h("div", { class: "card" }, "저장된 집계가 없습니다."));

    const startOf = ms => ms - ((new Date(ms).getUTCDay() - weekStart + 7) % 7) * DAY;
    const keys = [...days.keys()].sort(), latest = toMs(keys[keys.length - 1]), latestW = startOf(latest);
    const fMs = opts.focus && days.has(opts.focus) ? toMs(opts.focus) : latest, fW = startOf(fMs);
    const st = { shop: "", selDay: toKey(fMs), selWeek: toKey(fW),
      dayEnd: fMs > latest - 14 * DAY ? latest : fMs, weekEnd: fW > latestW - 56 * DAY ? latestW : fW };
    const NDAY = 14, NWEEK = 8;

    function summarize(ks, shop) {
      const r = { amt: 0, qty: 0, ship: 0, shipN: 0, n: 0, products: new Map(), shops: new Map() };
      for (const k of ks) {
        const d = days.get(k); if (!d) continue; r.n++;
        for (const [s, code, name, q, a] of d.sales) {
          if (NOT_SALE.has(code) || /^택배비/.test(name)) continue;
          const sh = r.shops.get(s) || { amt: 0, qty: 0 }; sh.amt += a; sh.qty += q; r.shops.set(s, sh);
          if (shop && s !== shop) continue;
          r.amt += a; r.qty += q;
          const p = r.products.get(code) || { name, qty: 0, amt: 0 }; p.qty += q; p.amt += a; p.name = name; r.products.set(code, p);
        }
        for (const [s, n, a] of d.ship) if (!shop || s === shop) { r.ship += a; r.shipN += n; }
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
        h("span", { class: "mut", style: "font-size:12.5px" }, "부가세 포함 판매가 · 매출·TOP3는 택배비 제외, 택배비는 별도 표시")),
      body, tipEl);
    host.append(card);

    const weekKeys = ws => Array.from({ length: 7 }, (_, i) => toKey(ws + i * DAY));
    const tile = (l, v) => h("div", { class: "tile" }, h("div", { class: "l" }, l), h("div", { class: "v" }, v));

    function section(kind) {
      const isDay = kind === "day", N = isDay ? NDAY : NWEEK, endMs = isDay ? st.dayEnd : st.weekEnd, span = isDay ? DAY : 7 * DAY;
      const selKey = isDay ? st.selDay : st.selWeek;
      const items = [], first = isDay ? toMs(keys[0]) : startOf(toMs(keys[0]));        // 가장 오래된 저장 날짜(주)
      for (let i = N - 1; i >= 0; i--) {
        if (endMs - i * span < first) continue;                                       // 데이터가 시작되기 전 기간은 건너뜀
        const ms = endMs - i * span, ks = isDay ? [toKey(ms)] : weekKeys(ms), s = summarize(ks, st.shop), partial = !isDay && s.n < 7;
        items.push({ key: toKey(ms), ms, s, value: s.n ? s.amt : null,
          label: md(ms), sub: isDay ? DOW[new Date(ms).getUTCDay()] : (partial ? `${s.n}/7일` : "~" + md(ms + 6 * DAY)),
          title: isDay ? mdw(ms) : `${mdw(ms)} ~ ${mdw(ms + 6 * DAY)}`,
          rows: s.n ? [["판매 수량", NF.format(s.qty) + "개"], ["택배비(별도)", won(s.ship)]].concat(partial ? [["집계된 일수", `${s.n}/7일 (일부만 저장됨)`]] : []) : [] });
      }
      const selMs = toMs(selKey), ks = isDay ? [selKey] : weekKeys(selMs), cur = summarize(ks, st.shop);
      const nextDisabled = isDay ? endMs >= latest : endMs >= latestW, prevDisabled = endMs - (N - 1) * span <= first;
      const shift = dir => { if (isDay) st.dayEnd = Math.min(latest, st.dayEnd + dir * 7 * DAY); else st.weekEnd = Math.min(latestW, st.weekEnd + dir * 28 * DAY); render(); };
      const chart = h("div", { class: "viz-chart" }), rank = h("div"), t3 = h("div", { class: "viz-grid two", style: "margin-top:14px" });
      const sec = h("section", { class: "viz-sec", "aria-label": isDay ? "일별 매출 현황" : "주간 매출 현황" },
        h("div", { class: "viz-top" }, h("h4", null, isDay ? "일별 매출 현황" : "주간 매출 현황"),
          h("span", { class: "mut" }, isDay ? `최근 ${N}일` : `최근 ${N}주 · ${DOW[weekStart]}요일 ~ ${DOW[(weekStart + 6) % 7]}요일 기준`),
          h("div", { class: "viz-nav" }, h("button", { type: "button", disabled: prevDisabled, onclick: () => shift(-1) }, "◀ 이전"), h("button", { type: "button", disabled: nextDisabled, onclick: () => shift(1) }, "다음 ▶"))),
        h("div", { class: "tiles" },
          tile(isDay ? `${mdw(selMs)} 매출` : `${md(selMs)} ~ ${md(selMs + 6 * DAY)} 매출`, cur.n ? won(cur.amt) : "데이터 없음"),
          tile("판매 수량", cur.n ? NF.format(cur.qty) + "개" : "–"),
          tile("택배비 (별도)", cur.n ? `${won(cur.ship)} · ${NF.format(cur.shipN)}건` : "–")),
        h("div", { class: "viz-grid" },
          h("div", null, h("p", { class: "viz-sub" }, `${st.shop || "전체 쇼핑몰"} · 막대를 누르면 ${isDay ? "그 날짜" : "그 주"}로 바뀝니다`), chart),
          h("div", null, h("p", { class: "viz-sub" }, `쇼핑몰별 매출 · ${isDay ? mdw(selMs) : md(selMs) + " 주"} (누르면 해당 쇼핑몰만 보기)`), rank)),
        t3,
        h("details", null, h("summary", null, "표로 보기"), h("div", { class: "wrap" }, h("table", null,
          h("tr", null, h("th", null, isDay ? "날짜" : "기간"), h("th", { class: "n" }, "매출"), h("th", { class: "n" }, "판매 수량"), h("th", { class: "n" }, "택배비(별도)"), h("th", { class: "n" }, "집계 일수")),
          items.map(it => h("tr", null, h("td", null, it.title), h("td", { class: "n" }, it.value == null ? "–" : won(it.value)), h("td", { class: "n" }, it.s.n ? NF.format(it.s.qty) : "–"),
            h("td", { class: "n" }, it.s.n ? won(it.s.ship) : "–"), h("td", { class: "n" }, isDay ? (it.s.n ? "1/1" : "0/1") : `${it.s.n}/7`)))))));
      return { sec, draw() {
        columnChart(chart, items, selKey, k => { if (isDay) st.selDay = k; else st.selWeek = k; render(); }, tip);
        shopRank(rank, cur.shops, st.shop, s => { st.shop = s; select.value = s; render(); });
        top3(t3, cur.products);
      } };
    }

    function render() {
      tip.hide();
      const a = section("day"), b = section("week");
      body.replaceChildren(a.sec, b.sec); a.draw(); b.draw();
    }
    render();
    let timer = null;
    const onResize = () => { if (!card.isConnected) return removeEventListener("resize", onResize); clearTimeout(timer); timer = setTimeout(render, 150); };
    addEventListener("resize", onResize);
  }

  window.Dashboard = { mount };
})();
