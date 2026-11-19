// 프로그램(플러그인) 6: 마켓프렌즈 발주서 → 이카운트 매출 업로드 양식 (기존 엑셀 매크로 '자동치환' 시트와 동일 규칙 + 택배비)
(() => {
  const s = v => (v == null ? "" : String(v).trim());
  const num = v => { const t = s(v).replace(/,/g, "").replace(/원$/, ""); return t === "" ? NaN : Number(t); };
  const SR = x => { const a = Math.abs(x); return (x < 0 ? -1 : 1) * Math.floor(a + 0.5 + 1e-9); };   // 엑셀 ROUND
  const H = ["일자","순번","거래처코드","거래처명","담당자","출하창고","거래유형","통화","환율","미수금","품목코드","품목명","수량","단가","외화금액","공급가액","부가세","적요","생산전표생성"];
  const DEFAULTS = [["거래처코드", "00348"], ["담당자", "00325"], ["출하창고", "00260"], ["택배비 품목코드", "01921"], ["택배비 품목명", "택배비(100물류)"]];

  // 기존 엑셀의 DB 시트(B열 '품목 / 옵션' → C열 품목코드, 품목명은 C→D열 조회)
  const parseDB = aoa => {
    const h = aoa.findIndex(r => r && s(r[1]) === "품목명" && s(r[2]) === "품목코드");
    if (h < 0) throw new Error("DB 시트에서 '품목명 / 품목코드' 헤더(B·C열)를 찾을 수 없습니다. 기존 엑셀(매크로) 파일의 DB 시트가 맞는지 확인하세요.");
    const nameOf = new Map();
    for (const r of aoa.slice(h + 1)) if (s(r[2]) && !nameOf.has(s(r[2]))) nameOf.set(s(r[2]), s(r[3]));
    const out = new Map();
    for (const r of aoa.slice(h + 1)) {
      const k = s(r[1]), code = s(r[2]); if (!k || !code || out.has(k)) continue;
      out.set(k, { k, v: [code, nameOf.get(code) || s(r[3])] });
    }
    return [...out.values()];
  };

  PLUGINS.push({
    id: "marketfriends-ecount",
    name: "마켓프렌즈 → 이카운트 매출",
    input: "마켓프렌즈 발주서 (.xlsx / .xls)",
    outputName: d => `${d}_마켓프렌즈_이카운트정산.xlsx`,
    errorLinks: [{ label: "품목매칭등록", ns: "options", inline: { kind: "pick", master: { plugin: "emp-ecount", ns: "master" } } }],
    runLabel: "발주서 업로드",
    dbLabel: "DB관리",
    tables: [
      { ns: "options", title: "[DB]품목매칭", fields: [{ l: "발주서 품목 / 옵션" }, { l: "품목코드" }, { l: "품목명" }],
        pick: { plugin: "emp-ecount", ns: "master", fill: { 1: "k", 2: "v0" } },
        note: "발주서의 '품목 / 옵션'(예: 모락 단델2 여권 지갑 MR-AP-DD02 / 브라운) → 이카운트 품목코드·품목명. 옵션이 없으면 '품목 /' 로 끝납니다. 기존 엑셀의 DB 시트를 올려 한 번에 가져올 수도 있습니다.",
        import: { label: "기존 엑셀(매크로) 파일 — DB 시트", sheet: "DB", parse: parseDB } },
      { ns: "settings", title: "[설정]기본값", fields: [{ l: "항목" }, { l: "값" }], seed: DEFAULTS,
        pick: { plugin: "emp-ecount", ns: "master", fill: {} },
        picks: [{ label: "택배비 품목 변경 (선택하면 택배비 품목코드·품목명이 함께 저장됩니다)", save: { "택배비 품목코드": "k", "택배비 품목명": "v0" } }],
        note: "이카운트 양식에 고정으로 들어가는 값입니다. 항목 이름은 그대로 두고 값만 수정하세요." },
    ],
    run({ rows, maps, date }) {
      const cols = rows.length ? Object.keys(rows[0]) : [];
      const need = ["품목", "옵션", "수량", "단가", "주문번호"];
      if (need.some(n => !cols.includes(n))) throw new Error("마켓프렌즈 발주서 형식이 아닙니다. (품목 · 옵션 · 수량 · 단가 · 주문번호 열이 필요합니다)");
      const set = Object.fromEntries(DEFAULTS.map(([k, d]) => [k, s((maps.settings[k] || [])[0]) || d]));
      const errors = new Set(), notes = [], out = []; let zero = 0, noPrice = 0, sum = 0, qtySum = 0, nProd = 0;
      const orders = new Map();                                                 // 주문번호 → 택배비(추가운임) 합계 (묶음 배송은 한 주문에 한 번만 붙어 있음)
      rows.forEach((r, i) => {
        const item = s(r["품목"]), opt = s(r["옵션"]);
        if (!item) return;                                                      // 빈 줄(순번만 있는 줄)
        const id = s(r["주문번호"]) || `${s(r["수취인"])}|${s(r["주소"])}|${i}`;
        const M = num(r["수량"]), U = num(r["단가"]);
        orders.set(id, (orders.get(id) || 0) + (num(r["추가운임"]) || 0));
        if (!(M > 0)) { zero++; return; }
        if (!Number.isFinite(U)) { noPrice++; return; }
        const key = `${item} / ${opt}`.trim(), m = maps.options[key];            // 엑셀: T = 품목 & " / " & 옵션
        if (!m) { errors.add(key); return; }
        const N = SR(U), P = SR(N * M / 1.1), Q = SR(N * M / 11), code = s(m[0]);   // 엑셀: N=ROUND(단가), 공급가액=ROUND(N×M/1.1), 부가세=ROUND(N×M/11)
        const row = new Array(19).fill(null);
        row[0] = date; row[2] = set.거래처코드; row[4] = set.담당자; row[5] = set.출하창고;
        row[10] = /^[1-9]\d{8,}$/.test(code) ? Number(code) : code; row[11] = s(m[1]);
        row[12] = M; row[13] = N; row[15] = P; row[16] = Q;
        out.push(row); sum += N * M; qtySum += M; nProd++;
      });
      // 택배비: 주문(묶음 배송은 1건)별 합계 운임을 금액별로 모아 수량=건수, 단가=운임. 0원은 무료배송(0원 행으로 건수만)
      const ship = new Map();
      for (const fee of orders.values()) { const f = SR(fee); ship.set(f, (ship.get(f) || 0) + 1); }
      let shipN = 0, shipSum = 0;
      for (const [fee, cnt] of [...ship.entries()].sort((a, b) => a[0] - b[0])) {
        const total = fee * cnt, P = SR(total / 1.1), x = new Array(19).fill(null);
        x[0] = date; x[2] = set.거래처코드; x[4] = set.담당자; x[5] = set.출하창고; x[10] = set["택배비 품목코드"]; x[11] = set["택배비 품목명"];
        x[12] = cnt; x[13] = fee; x[15] = P; x[16] = total - P; out.push(x); shipN += cnt; shipSum += total;
      }
      if (zero) notes.push(`수량이 0이거나 비어 있어 제외한 행 ${zero}건`);
      if (noPrice) notes.push(`단가가 숫자가 아닌 행 ${noPrice}건은 제외했습니다. 파일 형식을 확인하세요.`);
      if (!orders.size) notes.push("변환할 행이 없습니다. 발주서 파일이 맞는지 확인하세요.");
      const info = [`마켓프렌즈 상품 ${nProd}행 · 수량 ${qtySum}개 · 판매금액 ${sum.toLocaleString()}원 (부가세 포함)`,
        `택배비 ${ship.size}행 · 주문 ${shipN}건(묶음 배송은 1건) · 합계 ${shipSum.toLocaleString()}원` + (ship.has(0) ? ` · 무료배송 ${ship.get(0)}건` : "")];
      return { headers: H, out, errors: [...errors], notes, warns: [], info, numFmt: { 10: "0" } };
    },
  });
})();
