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
  const nav = PLUGINS.map(p => `<div class="grp">${esc(p.name)}</div><a href="#/${p.id}/run" class="${active === p.id + "/run" ? "on" : ""}">변환</a>` +
    p.tables.map(t => `<a href="#/${p.id}/t/${t.ns}" class="${active === p.id + "/t/" + t.ns ? "on" : ""}">${esc(t.title)}</a>`).join("")).join("");
  app.innerHTML = `<div class="layout"><aside><h1>매출 입력 변환</h1>${nav}
    <div class="me">${esc(user.email.split("@")[0])} · <a href="#" id="out" style="display:inline;padding:0">로그아웃</a></div></aside><main><div id="toast"></div>${body}</main></div>`;
  $("#out").onclick = e => { e.preventDefault(); sb.auth.signOut(); };
}

// ---------- 변환 화면 ----------
function runView(p) {
  const today = new Date().toISOString().slice(0, 10);
  const prev = last && last.pid === p.id ? last : null;
  shell(p.id + "/run", `<h2>${esc(p.name)}</h2><div class="card"><div class="row">
    <label>${esc(p.input)}<input type="file" id="file" accept=".xls,.xlsx"></label>
    <label>정산 날짜<input type="date" id="date" value="${today}"></label><button id="go">변환하기</button></div>
    <p class="mut" style="margin:12px 0 0">파일은 이 컴퓨터의 브라우저에서만 처리되며 서버로 전송되지 않습니다.</p></div><div id="res">${prev ? prev.html : ""}</div>`);
  if (prev) bindDownload(prev);
  $("#go").onclick = async () => {
    const f = $("#file").files[0], date = $("#date").value.replace(/-/g, "");
    if (!f || !date) return toast("파일과 날짜를 선택하세요.", true);
    $("#go").disabled = true; toast("변환 중...");
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
      const maps = {};
      for (const t of p.tables) maps[t.ns] = Object.fromEntries((await fetchNs(`${p.id}/${t.ns}`)).map(r => [r.k, r.v]));
      const r = p.run({ rows, maps, date });
      const out = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet([r.headers, ...r.out]), "웹자료올리기");
      const name = p.outputName(date);
      const html = `<div class="card"><h3 style="margin-top:0" class="ok">변환 완료 · ${r.out.length}행</h3><button id="dl">${esc(name)} 받기</button>
        ${r.notes.length ? `<h4 class="err">확인 필요</h4>` + r.notes.map(n => `<div>${esc(n)}</div>`).join("") : ""}
        ${r.errors.length ? `<h4 class="err">매칭 실패 ${r.errors.length}건 (결과 파일에서 빠져 있음)</h4><table>` + r.errors.map(e =>
          `<tr><td>${esc(e)}</td><td style="width:80px"><a href="#/${p.id}/t/${p.errorTable}?new=${encodeURIComponent(e)}">등록</a></td></tr>`).join("") + `</table><p class="mut">등록 후 같은 파일을 다시 변환하세요.</p>` : ""}</div>`;
      last = { pid: p.id, html, out, name }; $("#res").innerHTML = html; bindDownload(last); toast("");
    } catch (e) { toast("변환 실패: " + (e.message || e), true); }
    $("#go").disabled = false;
  };
}
function bindDownload(l) { const b = $("#dl"); if (b) b.onclick = () => XLSX.writeFile(l.out, l.name); }

// ---------- 매핑 관리 화면 ----------
async function tableView(p, t, q) {
  shell(`${p.id}/t/${t.ns}`, `<h2>${esc(t.title)}</h2><div class="card">로딩 중...</div>`);
  const ns = `${p.id}/${t.ns}`;
  let rows; try { rows = await fetchNs(ns); } catch (e) { return toast("불러오기 실패: " + e.message, true); }
  const preset = new URLSearchParams(q).get("new") || "";
  const draw = (filter = "") => {
    const f = filter.toLowerCase(), shown = rows.filter(r => !f || (r.k + " " + r.v.join(" ")).toLowerCase().includes(f)).slice(0, 200);
    $("#rows").innerHTML = shown.map((r, i) => `<tr><td>${esc(r.k)}</td>${r.v.map(x => `<td>${esc(x)}</td>`).join("")}<td style="width:60px"><button class="del" data-k="${esc(r.k)}">삭제</button></td></tr>`).join("") || `<tr><td class="mut">결과 없음</td></tr>`;
    $("#cnt").textContent = `전체 ${rows.length}행` + (shown.length === 200 ? " · 200행까지 표시, 검색을 이용하세요" : "");
    document.querySelectorAll(".del").forEach(b => b.onclick = async () => {
      if (!confirm("삭제할까요?")) return;
      const { error } = await sb.from("lookup").delete().eq("ns", ns).eq("k", b.dataset.k);
      if (error) return toast(error.message, true);
      rows = rows.filter(r => r.k !== b.dataset.k); draw($("#q").value);
    });
  };
  $("main").innerHTML = `<div id="toast"></div><h2>${esc(t.title)} <span class="mut" id="cnt" style="font-size:13px;font-weight:400"></span></h2>
    <div class="card"><input id="q" placeholder="검색" style="width:100%"></div>
    <div class="card"><div class="mut" style="margin-bottom:8px">추가 / 수정 — 첫 번째 값이 같으면 덮어씁니다</div><form id="f" class="row">
      ${t.fields.map((fl, i) => `<label>${esc(fl.l)}${fl.lines ? `<textarea rows="3" name="f${i}" cols="34"></textarea>` : `<input name="f${i}" ${i === 0 ? `style="width:280px" value="${esc(preset)}"` : ""}>`}</label>`).join("")}<button>저장</button></form></div>
    <div class="card wrap"><table><tr>${t.fields.map(fl => `<th>${esc(fl.l)}</th>`).join("")}<th></th></tr><tbody id="rows"></tbody></table></div>`;
  $("#q").oninput = e => draw(e.target.value);
  $("#f").onsubmit = async e => {
    e.preventDefault();
    const vals = t.fields.map((fl, i) => { const v = e.target["f" + i].value; return fl.lines ? v.split("\n").map(x => x.trim()).filter(Boolean).join("\n") : v.trim(); });
    if (!vals[0]) return toast("첫 번째 값은 필수입니다.", true);
    const rec = { ns, k: vals[0], v: vals.slice(1) };
    const { error } = await sb.from("lookup").upsert(rec);
    if (error) return toast(error.message, true);
    rows = [...rows.filter(r => r.k !== rec.k), { k: rec.k, v: rec.v }].sort((a, b) => (a.k < b.k ? -1 : 1));
    e.target.reset(); toast("저장했습니다."); draw($("#q").value);
  };
  draw();
}

// ---------- 라우팅 ----------
async function route() {
  if (!user) return;
  const [path, q = ""] = location.hash.slice(2).split("?"), [pid, kind, ns] = path.split("/");
  const p = PLUGINS.find(x => x.id === pid) || PLUGINS[0];
  if (kind === "t" && p.tables.some(t => t.ns === ns)) return tableView(p, p.tables.find(t => t.ns === ns), q);
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
