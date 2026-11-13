const sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
const $ = (s, e = document) => e.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const app = $("#app");
let user = null, last = null; // last: 마지막 변환 결과(프로그램별 다시 받기용)

const fetchNs = async ns => {            // 1000행 제한을 넘기는 테이블도 전부 가져오기
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("lookup").select("k,v").eq("ns", ns).order("k").range(from, from + 999);
    if (error) throw error;
    all.push(...data);
    if (data.length < 1000) return all;
  }
};
const fetchRecent = async (ns, n) => {   // 최신 날짜부터 n개 (대시보드용)
  const { data, error } = await sb.from("lookup").select("k,v").eq("ns", ns).order("k", { ascending: false }).range(0, n - 1);
  if (error) throw error;
  return data;
};
const toast = (m, bad) => { const t = $("#toast"); if (t) t.innerHTML = m ? `<div class="toast ${bad ? "bad" : ""}">${esc(m)}</div>` : ""; };

// ---------- 로그인 ----------
function loginView(msg = "") {
  app.innerHTML = `<form class="card login"><h2>로그인</h2>${msg ? `<div class="toast bad">${esc(msg)}</div>` : ""}
    <input id="id" placeholder="아이디" autocomplete="username" required><input id="pw" type="password" placeholder="비밀번호" autocomplete="current-password" required>
    <button style="width:100%">로그인</button></form>`;
  $("form").onsubmit = async e => {
    e.preventDefault();
    let email = $("#id").value.trim(); if (!email.includes("@")) email += "@" + CONFIG.ID_DOMAIN;
    const { error } = await sb.auth.signInWithPassword({ email, password: $("#pw").value });
    if (error) loginView("아이디 또는 비밀번호가 올바르지 않습니다.");
  };
}

// ---------- 레이아웃 ----------
function shell(active, body) {
  const nav = PLUGINS.map(p => `<div class="grp">${esc(p.name)}</div><a href="#/${p.id}/run" class="${active === p.id + "/run" ? "on" : ""}">${esc(p.runLabel || "변환")}</a>${p.dashboard ? `<a href="#/${p.id}/dash" class="${active === p.id + "/dash" ? "on" : ""}">${esc(p.dashLabel || "대시보드")}</a>` : ""}
    <details ${active.startsWith(p.id + "/t/") ? "open" : ""}><summary>${esc(p.dbLabel || "DB관리")}</summary>` +
    p.tables.map(t => `<a href="#/${p.id}/t/${t.ns}" class="${active === p.id + "/t/" + t.ns ? "on" : ""}">${esc(t.title)}</a>`).join("") + `</details>`).join("");
  app.innerHTML = `<div class="layout"><aside><h1>매출 입력 변환</h1>${nav}
    <div class="me">${esc(user.email.split("@")[0])} · <a href="#" id="out" style="display:inline;padding:0">로그아웃</a></div></aside><main><div id="toast"></div>${body}</main></div>`;
  $("#out").onclick = e => { e.preventDefault(); sb.auth.signOut(); };
}

// ---------- 변환 화면 ----------
// 매칭 실패 품목 옆의 등록 버튼들. 이름에 '+'나 '세트'가 있으면 해당 버튼을 진하게(권장) 표시
function errBtns(p, e) {
  const links = p.errorLinks || [], pri = links.find(l => l.when && l.when.test(e)) || links[0];
  return links.map(l => `<a class="btn sm ${l === pri ? "" : "ghost"}" href="#/${p.id}/t/${l.ns}?new=${encodeURIComponent(p.errorKey ? p.errorKey(e) : e)}">${esc(l.label)}</a>`).join(" ");
}
function runView(p) {
  const today = new Date().toISOString().slice(0, 10);
  const prev = last && last.pid === p.id ? last : null;
  shell(p.id + "/run", `<h2>${esc(p.name)}</h2><div class="card"><div class="row">
    ${(p.inputs || [{ id: "file", label: p.input }]).map(i => `<label style="flex:1 1 100%">${esc(i.label)}<input type="file" id="in_${i.id}" accept=".xls,.xlsx" ${i.multiple ? "multiple" : ""}></label>`).join("")}
    <label>정산 날짜<input type="date" id="date" value="${today}"></label><button id="go">변환하기</button></div>
    <p class="mut" style="margin:12px 0 0">파일은 이 컴퓨터의 브라우저에서만 처리되며 서버로 전송되지 않습니다.</p></div><div id="res">${prev ? prev.html : ""}</div>${p.dashboard ? "" : `<div id="dash"></div>`}`);
  if (prev) { bindDownload(prev); if (prev.dashDate) showDash(p, prev.dashDate); }
  $("#go").onclick = async () => {
    const specs = p.inputs || [{ id: "file", required: true }], date = $("#date").value.replace(/-/g, "");
    if (!date || specs.some(i => i.required && !$("#in_" + i.id).files.length)) return toast("필수 파일과 날짜를 선택하세요.", true);
    $("#go").disabled = true; toast("변환 중...");
    try {
      const readFile = async f => ({ name: f.name, rows: XLSX.utils.sheet_to_json((wb => wb.Sheets[wb.SheetNames[0]])(XLSX.read(await f.arrayBuffer(), { type: "array" })), { defval: null }) });
      const inputs = {};
      for (const i of specs) inputs[i.id] = await Promise.all([...$("#in_" + i.id).files].map(readFile));
      const rows = p.inputs ? null : inputs.file[0].rows;
      const maps = {};
      for (const t of p.tables) maps[t.ns] = Object.fromEntries((await fetchNs(`${p.id}/${t.ns}`)).map(r => [r.k, r.v]));
      const r = p.run({ rows, inputs, maps, date });
      let dashDate = null, dashMsg = "";
      if (r.stats) {
        if (r.errors.length) dashMsg = "매칭 실패 품목을 모두 등록하고 다시 변환하면 매출 대시보드에 반영됩니다.";
        else {
          const { error } = await sb.from("lookup").upsert({ ns: `${p.id}/sales`, k: date, v: [r.stats] });   // 같은 날짜는 덮어씀
          if (error) dashMsg = "대시보드 저장에 실패했습니다: " + error.message;
          else { dashDate = date; dashMsg = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)} 집계를 대시보드에 저장했습니다. (같은 날짜를 다시 변환하면 덮어씁니다)`; }
        }
      }
      const out = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([r.headers, ...r.out]);
      for (const [ci, z] of Object.entries(r.numFmt || {})) r.out.forEach((_, ri) => { const cell = ws[XLSX.utils.encode_cell({ r: ri + 1, c: +ci })]; if (cell && cell.t === "n") cell.z = z; });
      XLSX.utils.book_append_sheet(out, ws, "웹자료올리기");
      const name = p.outputName(date);
      const html = `<div class="card"><h3 style="margin-top:0" class="ok">변환 완료 · ${r.out.length}행</h3><button id="dl">${esc(name)} 받기</button>
        ${(r.info || []).concat(dashMsg ? [dashMsg] : []).map(n => `<div class="mut" style="margin-top:10px">${esc(n)}</div>`).join("")}${dashDate && p.dashboard ? `<p style="margin:10px 0 0"><a class="btn sm ghost" href="#/${p.id}/dash?focus=${dashDate}">대시보드에서 보기 →</a></p>` : ""}
        ${r.notes.length ? `<h4 class="err">확인 필요</h4>` + r.notes.map(n => `<div>${esc(n)}</div>`).join("") : ""}
        ${(r.warns || []).length ? `<h4 class="err">경고 ${r.warns.length}건</h4><table>` + r.warns.map(w => `<tr><td style="white-space:normal;word-break:break-all">${esc(w.text)}</td><td style="white-space:nowrap;width:1%"><a class="btn sm" href="#/${p.id}/t/${w.ns}?new=${encodeURIComponent(w.key)}">${esc(w.label || "수정")}</a></td></tr>`).join("") + `</table>` : ""}
        ${r.errors.length ? `<h4 class="err">매칭 실패 ${r.errors.length}건 (결과 파일에서 빠져 있음)</h4><table>` + r.errors.map(e =>
          `<tr><td style="white-space:normal;word-break:break-all">${esc(e)}</td><td style="white-space:nowrap;width:1%">${errBtns(p, e)}</td></tr>`).join("") + `</table><p class="mut">등록 후 같은 파일을 다시 변환하세요.</p>` : ""}</div>`;
      last = { pid: p.id, html, out, name, dashDate }; $("#res").innerHTML = html; bindDownload(last); toast("");
      if (dashDate) await showDash(p, dashDate); else if ($("#dash")) $("#dash").replaceChildren();
    } catch (e) { toast("변환 실패: " + (e.message || e), true); }
    $("#go").disabled = false;
  };
}
async function showDash(p, focus) {   // 저장된 최근 집계를 불러와 대시보드를 그림
  const host = $("#dash"); if (!host) return;
  try {
    const rates = {};   // 쇼핑몰별 수수료율(%) — 플러그인의 dashRates 설정(표 이름, 값 위치) 기준
    if (p.dashRates) for (const r of await fetchNs(`${p.id}/${p.dashRates.ns}`)) rates[r.k] = Number(r.v[p.dashRates.index]) || 0;
    Dashboard.mount(host, await fetchRecent(`${p.id}/sales`, 150), { weekStart: p.weekStartDay ?? 5, focus, rates,
    onDelete: async k => {   // 날짜별 집계 삭제 후 대시보드 새로고침
      const { error } = await sb.from("lookup").delete().eq("ns", `${p.id}/sales`).eq("k", k);
      if (error) throw error; toast(`${k} 집계를 삭제했습니다.`); await showDash(p);
    } }); }
  catch (e) { host.textContent = "대시보드를 불러오지 못했습니다: " + (e.message || e); }
}
function bindDownload(l) { const b = $("#dl"); if (b) b.onclick = () => XLSX.writeFile(l.out, l.name); }

// ---------- 매핑 관리 화면 ----------
const LIMIT = 40;   // 후보 목록에 한 번에 보여줄 최대 개수 (목록은 스크롤)
async function tableView(p, t, q) {
  shell(`${p.id}/t/${t.ns}`, `<h2>${esc(t.title)}</h2><div class="card">로딩 중...</div>`);
  const ns = `${p.id}/${t.ns}`, ro = !!t.readonly;
  let rows, master = [], names = []; const refs = {};
  try { rows = await fetchNs(ns);
    if (t.seed) {   // 설정 기본값이 없으면 처음 열 때 자동 입력
      const add = t.seed.filter(([k]) => !rows.some(r => r.k === k)).map(([k, ...v]) => ({ ns, k, v }));
      if (add.length) { const { error } = await sb.from("lookup").upsert(add); if (error) throw error; rows = [...rows, ...add.map(({ k, v }) => ({ k, v }))].sort((a, b) => (a.k < b.k ? -1 : 1)); }
    }
    for (const fl of t.fields) if (fl.ref && !refs[fl.ref]) refs[fl.ref] = Object.fromEntries((await fetchNs(`${p.id}/${fl.ref}`)).map(r => [r.k, r.v[0]]));   // 코드 → 이름
    if (t.pick) master = await fetchNs(`${t.pick.plugin || p.id}/${t.pick.ns}`);
    // 선택 카드: t.picks = [{label, fill:{필드번호:"k"|"v0"}, save:{설정키:"k"|"v0"}}] (t.pick 은 카드 1개짜리 약식)
    // fill = 아래 입력칸 채우기, save = 선택 즉시 해당 행(설정값)을 저장
    const sgf0 = t.fields.find(fl => fl.suggest); if (sgf0) names = (await fetchNs(`${p.id}/${sgf0.suggest}`)).map(r => r.k); } catch (e) { return toast("불러오기 실패: " + e.message, true); }
  const preset = new URLSearchParams(q).get("new") || "";
  // 상태별 탭 (t.tabs): 탭에 속하지 않는 값이 있으면 "기타" 탭을 추가
  let tabs = null, tab = 0;
  const tabRows = i => rows.filter(r => tabs[i].values ? tabs[i].values.includes(r.v[t.tabs.field]) : !t.tabs.list.some(x => x.values.includes(r.v[t.tabs.field])));
  const drawTabs = () => {
    if (!t.tabs) return;
    tabs = t.tabs.list.slice(); if (rows.some(r => !t.tabs.list.some(x => x.values.includes(r.v[t.tabs.field])))) tabs.push({ label: "기타" });
    if (tab >= tabs.length) tab = 0;
    $("#tabs").innerHTML = tabs.map((x, i) => `<button type="button" class="btn sm ${i === tab ? "" : "ghost"}" data-i="${i}">${esc(x.label)} ${tabRows(i).length}</button>`).join(" ");
    $("#tabs").querySelectorAll("button").forEach(b => b.onclick = () => { tab = +b.dataset.i; draw($("#q").value); });
  };
  const fmt = (fl, x) => { const t0 = x == null ? "" : String(x); if (!fl || t0 === "") return t0; if (fl.ref && refs[fl.ref] && refs[fl.ref][t0]) return `${t0} · ${refs[fl.ref][t0]}`; return fl.suffix ? t0 + fl.suffix : t0; };
  const draw = (filter = "") => {
    drawTabs();
    const f = filter.toLowerCase(), base = t.tabs ? tabRows(tab) : rows, shown = base.filter(r => !f || (r.k + " " + r.v.map((x, i) => fmt(t.fields[i + 1], x)).join(" ")).toLowerCase().includes(f)).slice(0, 200);
    $("#rows").innerHTML = shown.map(r => `<tr><td>${esc(r.k)}</td>${r.v.map((x, i) => `<td>${esc(fmt(t.fields[i + 1], x))}</td>`).join("")}${ro ? "" : `<td style="width:120px;white-space:nowrap"><button class="btn sm ghost ed" data-k="${esc(r.k)}">수정</button> <button class="del" data-k="${esc(r.k)}">삭제</button></td>`}</tr>`).join("") || `<tr><td class="mut">결과 없음</td></tr>`;
    $("#cnt").textContent = (t.tabs ? `${tabs[tab].label} ${base.length}행 (전체 ${rows.length}행)` : `전체 ${rows.length}행`) + (shown.length === 200 ? " · 200행까지 표시, 검색을 이용하세요" : "");
    document.querySelectorAll(".ed").forEach(b => b.onclick = () => { fillForm(b.dataset.k); });
    document.querySelectorAll(".del").forEach(b => b.onclick = async () => {
      if (!confirm("삭제할까요?")) return;
      const { error } = await sb.from("lookup").delete().eq("ns", ns).eq("k", b.dataset.k);
      if (error) return toast(error.message, true);
      rows = rows.filter(r => r.k !== b.dataset.k); draw($("#q").value);
    });
  };
  const importCard = t.import ? `<div class="card"><div class="mut" style="margin-bottom:8px">${esc(t.import.label)} — 전체 목록을 올리면 기존 데이터와 비교해 신규·변경·삭제를 반영합니다</div>
    <div class="row"><input type="file" id="imp" accept=".xlsx,.xls"><button id="impgo">비교하기</button></div><div id="impres" style="margin-top:12px"></div></div>` : "";
  const picks = t.pick ? (t.picks || [{ fill: t.pick.fill }]) : [];
  const pickCard = picks.length ? `<div class="card"><div class="mut" style="margin-bottom:8px">${master.length ? "이카운트 품목(기초자료)에서 찾기 — 품목명이나 코드를 입력하면 일치하는 품목이 나타나고, 선택하면 " + (picks.some(x => x.save) ? "바로 저장됩니다" : "아래 입력칸이 자동으로 채워집니다") : `기초자료가 비어 있습니다. 먼저 <a href="#/${t.pick.plugin || p.id}/t/${t.pick.ns}">[DB]품목코드</a>에서 이카운트 품목 엑셀을 올려주세요.`}</div>
    ${picks.map((x, n) => `<div style="margin-bottom:${n < picks.length - 1 ? 10 : 0}px">${x.label ? `<div style="font-weight:600;margin-bottom:4px">${esc(x.label)}</div>` : ""}<input class="pq" data-n="${n}" placeholder="품목명 또는 코드 (여러 단어는 공백으로)" style="width:100%"><div class="plist pr" data-n="${n}"></div></div>`).join("")}</div>` : "";
  const formCard = ro ? "" : `<div class="card"><div class="mut" style="margin-bottom:8px">추가 / 수정 — 첫 번째 값이 같으면 덮어씁니다</div><form id="f" class="row">
      ${t.fields.map((fl, i) => `<label style="flex:${fl.lines ? "1 1 100%" : i === 0 || /품목명/.test(fl.l) ? "2 1 420px" : "1 1 160px"}">${esc(fl.l)}${fl.lines ? `<textarea rows="5" name="f${i}" style="width:100%"></textarea>${fl.suggest ? '<div id="sgbox" class="plist"></div><div id="sgwarn" class="err" style="font-size:12.5px"></div>' : ""}` : `<input name="f${i}" style="width:100%" ${fl.number ? 'type="number" step="any" min="0" inputmode="decimal"' : ""} ${fl.ref ? `list="dl${i}" autocomplete="off"` : ""} ${i === 0 ? `value="${esc(preset)}"` : ""}>${fl.ref ? `<datalist id="dl${i}">${Object.entries(refs[fl.ref]).map(([k, v]) => `<option value="${esc(k)}">${esc(v)}</option>`).join("")}</datalist>` : ""}`}</label>`).join("")}<button>저장</button></form></div>`;
  $("main").innerHTML = `<div id="toast"></div><h2>${esc(t.title)} <span class="mut" id="cnt" style="font-size:13px;font-weight:400"></span></h2>${t.note ? `<p class="mut" style="margin:-4px 0 12px">${esc(t.note)}</p>` : ""}${importCard}
    <div class="card">${t.tabs ? `<div id="tabs" style="margin-bottom:10px"></div>` : ""}<input id="q" placeholder="검색" style="width:100%"></div>${pickCard}${formCard}
    <div class="card wrap"><table><tr>${t.fields.map(fl => `<th>${esc(fl.l)}</th>`).join("")}${ro ? "" : "<th></th>"}</tr><tbody id="rows"></tbody></table></div>`;
  $("#q").oninput = e => draw(e.target.value);

  function fillForm(k) {   // 기존 행을 입력칸에 불러와 수정
    const r = rows.find(x => x.k === k), f = $("#f"); if (!r || !f) return;
    [r.k, ...r.v].forEach((v, i) => { if (f["f" + i]) f["f" + i].value = v ?? ""; });
    f.scrollIntoView({ block: "center", behavior: "smooth" }); if (f.f0) f.f0.focus();
  }
  let sgRefresh = () => {};
  const sgf = t.fields.find(fl => fl.suggest);
  if (sgf && !ro) {   // 커서가 있는 줄을 기준으로 부분 일치 후보 표시 → 선택하면 그 줄을 교체
    const ta = $("#f")["f" + t.fields.indexOf(sgf)], box = $("#sgbox"), warn = $("#sgwarn"), known = new Set(names);
    let hit = [];
    const cur = () => { const v = ta.value, pos = ta.selectionStart, s = v.lastIndexOf("\n", pos - 1) + 1; let e = v.indexOf("\n", pos); if (e < 0) e = v.length; return { v, s, e, line: v.slice(s, e).trim() }; };
    sgRefresh = () => {
      const { line } = cur(), tk = line.toLowerCase().split(/\s+/).filter(Boolean);
      hit = tk.length && !known.has(line) ? names.filter(n => { const h = n.toLowerCase(); return tk.every(x => h.includes(x)); }) : [];
      const more = hit.length - LIMIT; hit = hit.slice(0, LIMIT);
      box.innerHTML = hit.map((n, i) => `<div class="pick" data-i="${i}">${esc(n)}</div>`).join("") + (more > 0 ? `<div class="mut" style="padding:6px 10px">외 ${more}건 — 단어를 더 입력해 좁혀 보세요</div>` : "");
      const bad = ta.value.split("\n").map(x => x.trim()).filter(x => x && !known.has(x));
      warn.textContent = bad.length ? "[DB]품목매칭에 없는 이름: " + bad.join(", ") : "";
      box.querySelectorAll(".pick").forEach(el => el.onmousedown = ev => {
        ev.preventDefault();
        const { v, s, e } = cur(), n = hit[el.dataset.i];
        ta.value = v.slice(0, s) + n + (e >= v.length ? "\n" : v.slice(e));
        ta.focus(); const pos = s + n.length + (e >= v.length ? 1 : 0); ta.setSelectionRange(pos, pos); sgRefresh();
      });
    };
    ["input", "click", "keyup"].forEach(ev => ta.addEventListener(ev, sgRefresh));
  }
  if (picks.length) {   // 기초자료 검색 → 선택 시 입력칸 자동 채움 / 설정값 저장 (사용구분 NO인 품목은 제외)
    const usable = master.filter(r => r.v[3] !== "NO");
    picks.forEach((pk, n) => {
      const inp = document.querySelector(`.pq[data-n="${n}"]`), box = document.querySelector(`.pr[data-n="${n}"]`); let hit = [];
      inp.oninput = () => {
        const tk = inp.value.toLowerCase().split(/\s+/).filter(Boolean);
        hit = tk.length ? usable.filter(r => { const h = `${r.k} ${r.v[0]} ${r.v[2] || ""}`.toLowerCase(); return tk.every(x => h.includes(x)); }) : [];
        const more = hit.length - LIMIT; hit = hit.slice(0, LIMIT);
        box.innerHTML = hit.map((r, i) => `<div class="pick" data-i="${i}"><b>${esc(r.v[0])}</b> <span class="mut">${esc(r.k)}</span></div>`).join("") + (more > 0 ? `<div class="mut" style="padding:6px 10px">외 ${more}건 — 단어를 더 입력해 좁혀 보세요</div>` : "") + (tk.length && !hit.length ? `<div class="mut" style="padding:6px 10px">일치하는 품목이 없습니다</div>` : "");
        box.querySelectorAll(".pick").forEach(el => el.onclick = async () => {
          const r = hit[el.dataset.i], val = src => src === "k" ? r.k : r.v[0];
          if (pk.save) {
            const recs = Object.entries(pk.save).map(([k, src]) => ({ ns, k, v: [val(src)] }));
            const { error } = await sb.from("lookup").upsert(recs); if (error) return toast(error.message, true);
            for (const rc of recs) rows = [...rows.filter(x => x.k !== rc.k), { k: rc.k, v: rc.v }].sort((a, b) => (a.k < b.k ? -1 : 1));
            toast(`저장했습니다: ${r.v[0]} (${r.k})`); draw($("#q").value);
          } else for (const [i, src] of Object.entries(pk.fill)) { const f = $("#f")["f" + i]; f.value = val(src); }
          box.innerHTML = ""; inp.value = "";
          if (!pk.save) { const f = $("#f"); f.scrollIntoView({ block: "center", behavior: "smooth" }); }
        });
      };
    });
  }
  if (t.import) {
    $("#impgo").onclick = async () => {
      const file = $("#imp").files[0]; if (!file) return toast("파일을 선택하세요.", true);
      try {
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const sn = !t.import.sheet || wb.SheetNames.includes(t.import.sheet) ? (t.import.sheet || wb.SheetNames[0]) : wb.SheetNames.length === 1 ? wb.SheetNames[0] : null;
        if (!sn) throw new Error(`'${t.import.sheet}' 시트를 찾을 수 없습니다. (파일의 시트: ${wb.SheetNames.join(", ")})`);
        const next = t.import.parse(XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: null, raw: true }));
        if (!next.length) throw new Error("읽을 데이터가 없습니다.");
        const cur = new Map(rows.map(r => [r.k, JSON.stringify(r.v)])), nk = new Set(next.map(r => r.k));
        const add = next.filter(r => !cur.has(r.k)), chg = next.filter(r => cur.has(r.k) && cur.get(r.k) !== JSON.stringify(r.v)), del = rows.filter(r => !nk.has(r.k));
        const big = cur.size > 0 && del.length > cur.size * 0.3;
        $("#impres").innerHTML = `<b>신규 ${add.length} · 변경 ${chg.length} · 삭제 ${del.length}</b> <span class="mut">(변동 없음 ${next.length - add.length - chg.length})</span>
          ${big ? `<div class="err">삭제가 많습니다(${del.length}건). 파일이 전체 목록이 맞는지 확인하세요.</div>` : ""}
          ${add.length ? `<div class="mut" style="margin:6px 0">신규 예: ${add.slice(0, 5).map(r => esc(r.v[0])).join(", ")}${add.length > 5 ? " …" : ""}</div>` : ""}
          <button id="apply" ${add.length + chg.length + del.length ? "" : "disabled"}>반영하기</button>`;
        $("#apply").onclick = async () => {
          $("#apply").disabled = true;
          try {
            const up = [...add, ...chg].map(r => ({ ns, k: r.k, v: r.v }));
            for (let i = 0; i < up.length; i += 500) { const { error } = await sb.from("lookup").upsert(up.slice(i, i + 500)); if (error) throw error; }
            for (let i = 0; i < del.length; i += 100) { const { error } = await sb.from("lookup").delete().eq("ns", ns).in("k", del.slice(i, i + 100).map(r => r.k)); if (error) throw error; }
            rows = next.map(r => ({ k: r.k, v: r.v })).sort((a, b) => (a.k < b.k ? -1 : 1));
            $("#impres").innerHTML = ""; toast(`반영 완료: 신규 ${add.length}, 변경 ${chg.length}, 삭제 ${del.length}`); draw($("#q").value);
          } catch (e) { toast("반영 실패: " + (e.message || e), true); $("#apply").disabled = false; }
        };
      } catch (e) { toast(e.message || String(e), true); }
    };
  }
  if (!ro) $("#f").onsubmit = async e => {
    e.preventDefault();
    const vals = t.fields.map((fl, i) => { const v = e.target["f" + i].value; return fl.lines ? v.split("\n").map(x => x.trim()).filter(Boolean).join("\n") : v.trim(); });
    if (!vals[0]) return toast("첫 번째 값은 필수입니다.", true);
    const rec = { ns, k: vals[0], v: vals.slice(1) };
    const { error } = await sb.from("lookup").upsert(rec);
    if (error) return toast(error.message, true);
    rows = [...rows.filter(r => r.k !== rec.k), { k: rec.k, v: rec.v }].sort((a, b) => (a.k < b.k ? -1 : 1));
    e.target.reset(); sgRefresh(); toast("저장했습니다."); draw($("#q").value);
  };
  draw();
  if (preset && rows.some(r => r.k === preset)) fillForm(preset);
  if (preset) { const fo = $("#pq") || (sgf && $("#f") && $("#f")["f" + t.fields.indexOf(sgf)]); if (fo) fo.focus(); }
}

// ---------- 대시보드 (변환 없이 언제든 열람) ----------
function dashView(p, focus) {
  shell(p.id + "/dash", `<h2>${esc(p.name)} · ${esc(p.dashLabel || "대시보드")}</h2><div id="dash"><div class="card mut">불러오는 중...</div></div>`);
  showDash(p, focus);
}

// ---------- 라우팅 ----------
async function route() {
  if (!user) return;
  const [path, q = ""] = location.hash.slice(2).split("?"), [pid, kind, ns] = path.split("/");
  const p = PLUGINS.find(x => x.id === pid) || PLUGINS[0];
  if (kind === "t" && p.tables.some(t => t.ns === ns)) return tableView(p, p.tables.find(t => t.ns === ns), q);
  if (kind === "dash" && p.dashboard) return dashView(p, new URLSearchParams(q).get("focus") || undefined);
  runView(p);
}
window.addEventListener("hashchange", route);
sb.auth.onAuthStateChange((_, s) => {
  const u = s?.user ?? null, same = (u && user && u.id === user.id) || (!u && !user);
  user = u;
  if (same) return; // 파일 선택 창을 닫을 때 등 같은 사용자의 이벤트로는 화면을 다시 그리지 않음
  user ? route() : loginView();
});
sb.auth.getSession().then(({ data }) => { if (!data.session) loginView(); });
