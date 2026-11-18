// 프로그램(플러그인) 4: 테무(Temu) 주문 파일 → 이카운트 매출 업로드 양식 (기존 엑셀 매크로 '자동치환' 시트와 동일 규칙)
(() => {
  const s = v => (v == null ? "" : String(v).trim());
  const num = v => { const t = s(v).replace(/,/g, "").replace(/원$/, ""); return t === "" ? NaN : Number(t); };
  const nrm = v => s(v).replace(/\s+/g, "");
  const SR = x => { const a = Math.abs(x); return (x < 0 ? -1 : 1) * Math.floor(a + 0.5 + 1e-9); };   // 엑셀 ROUND (0.5는 올림)
  const r6 = x => Math.round(x * 1e6) / 1e6;                                                     // 부동소수점 잡음 제거
  const H = ["일자","순번","거래처코드","거래처명","담당자","출하창고","거래유형","통화","환율","미수금","품목코드","품목명","수량","단가","외화금액","공급가액","부가세","적요","생산전표생성"];
  const DEFAULTS = [["거래처코드", "00365"], ["담당자", "00325"], ["출하창고", "00260"], ["택배비 품목코드", "01921"], ["택배비 품목명", "택배비(100물류)"]];   // [설정] 화면에서 바꿀 수 있는 기본값

  // 기존 엑셀의 DB 시트(B열 테무 선택 사항 → C열 품목코드, 품목명은 C→D열 조회) → [{k:선택 사항, v:[품목코드, 품목명]}]
  const parseDB = aoa => {
    const h = aoa.findIndex(r => r && s(r[1]) === "품목명" && s(r[2]) === "품목코드");
    if (h < 0) throw new Error("DB 시트에서 '품목명 / 품목코드' 헤더(B·C열)를 찾을 수 없습니다. 기존 엑셀(매크로) 파일의 DB 시트가 맞는지 확인하세요.");
    const nameOf = new Map();                                                                  // 품목코드 → 품목명 (VLOOKUP(C:D) 첫 일치)
    for (const r of aoa.slice(h + 1)) if (s(r[2]) && !nameOf.has(s(r[2]))) nameOf.set(s(r[2]), s(r[3]));
    const out = new Map();
    for (const r of aoa.slice(h + 1)) {
      const k = s(r[1]), code = s(r[2]); if (!k || !code || out.has(k)) continue;           // 같은 이름이 또 있으면 먼저 나온 것 사용
      out.set(k, { k, v: [code, nameOf.get(code) || s(r[3])] });
    }
    return [...out.values()];
  };

  PLUGINS.push({
    id: "temu-ecount",
    name: "테무 → 이카운트 매출",
    input: "테무 주문 파일 (.csv / .xlsx)",
    outputName: d => `${d}_테무_이카운트정산.xlsx`,
    errorLinks: [{ label: "품목매칭등록", ns: "options", inline: { kind: "pick", master: { plugin: "emp-ecount", ns: "master" } } }],
    runLabel: "테무 파일 업로드",
    dbLabel: "DB관리",
    tables: [
      { ns: "options", title: "[DB]품목매칭", fields: [{ l: "테무 선택 사항" }, { l: "품목코드" }, { l: "품목명" }],
        pick: { plugin: "emp-ecount", ns: "master", fill: { 1: "k", 2: "v0" } },
        note: "테무 주문의 '선택 사항'(J열) → 이카운트 품목코드·품목명. 이카운트 품목(기초자료)에서 찾아 고를 수 있고, 기존 엑셀의 DB 시트를 올려 한 번에 가져올 수도 있습니다.",
        import: { label: "기존 엑셀(매크로) 파일 — DB 시트", sheet: "DB", parse: parseDB } },
      { ns: "settings", title: "[설정]기본값", fields: [{ l: "항목" }, { l: "값" }], seed: DEFAULTS,
        pick: { plugin: "emp-ecount", ns: "master", fill: {} },
        picks: [{ label: "택배비 품목 변경 (선택하면 택배비 품목코드·품목명이 함께 저장됩니다)", save: { "택배비 품목코드": "k", "택배비 품목명": "v0" } }],
        note: "이카운트 양식에 고정으로 들어가는 값입니다. 항목 이름은 그대로 두고 값만 수정하세요." },
    ],
    run({ rows, maps, date }) {
      const cols = rows.length ? Object.keys(rows[0]) : [];
      // 열 위치: 기존 매크로와 같은 J(선택 사항) · N(구매 수량) · O(발송할 수량) · AY(단가 열). 이름이 같은 열이 있으면 이름을 우선 사용
      const col = (name, idx) => cols.find(c => nrm(c) === nrm(name)) || cols[idx];
      const c = { opt: col("선택 사항", 9), buy: col("구매 수량", 13), ship: col("발송할 수량", 14), price: col("배송 템플릿", 50) };
      if (!cols.length || cols.length < 51 || !c.opt || !c.buy || !c.ship || !c.price) throw new Error("테무 주문 파일 형식이 아닙니다. (선택 사항 J열 · 구매 수량 N열 · 발송할 수량 O열 · AY열이 필요합니다)");
      const set = Object.fromEntries(DEFAULTS.map(([k, d]) => [k, s((maps.settings[k] || [])[0]) || d]));
      const cAU = cols[46], cAW = cols[48], cAX = cols[49];                   // 배송비 총액(AU) · 배송 세금(AW) · 배송 주소(AX): 파일의 헤더 이름이 한 칸씩 밀려 있어 열 위치로 읽음
      const errors = new Set(), notes = [], out = []; let diff = 0, sum = 0, blank = 0, noPrice = 0;
      const zero = [], differ = [], addr = new Map();                           // addr: 주소 → { fee: 묶음 전체 배송비, ok: 발송되는 행이 있는지 }
      const R = n => Math.round(n);
      rows.forEach((r, i) => {
        const opt = s(r[c.opt]), M = num(r[c.ship]), N = num(r[c.buy]), unit = num(r[c.price]), id = s(r["주문 ID"]) || `${i + 2}행`;
        if (!opt && !Number.isFinite(M)) return;                              // 빈 줄
        const a = s(r[cAX]) || "행" + i, g = addr.get(a) || { fee: 0, ok: false }; addr.set(a, g);
        g.fee += (num(r[cAU]) || 0) + (num(r[cAW]) || 0);                      // 묶음 배송: 같은 주소 행들의 (AU + AW) 합 = 총 배송비
        if (!opt) { blank++; return; }
        if (!(M > 0)) { zero.push(id); return; }                              // 수량은 무조건 '발송할 수량' 기준
        g.ok = true;
        if (!Number.isFinite(unit)) { noPrice++; return; }
        const m = maps.options[opt];
        if (!m) { errors.add(opt); return; }
        if (Number.isFinite(N) && N !== M) differ.push(`${id} (구매 ${N} / 발송 ${M})`);
        const U = r6(unit * M), P = SR(U / 1.1), code = s(m[0]);              // 금액 = AY × 발송할 수량, 공급가액 = ROUND(금액/1.1), 부가세 = ROUND(금액) − 공급가액 (정수)
        const row = new Array(19).fill(null);
        row[0] = date; row[2] = set.거래처코드; row[4] = set.담당자; row[5] = set.출하창고;
        row[10] = /^[1-9]\d{8,}$/.test(code) ? Number(code) : code; row[11] = s(m[1]);
        row[12] = M; row[13] = r6(U / M); row[15] = P; row[16] = SR(U) - P;
        out.push(row); sum += SR(U);
      });
      // 택배비: 같은 주소(묶음 배송)는 1건으로 보고 총 배송비별로 묶어 수량=건수, 단가=배송비. 0원은 무료배송(0원 행으로 건수만)
      const ship = new Map();
      for (const g of addr.values()) if (g.ok) { const fee = R(g.fee); ship.set(fee, (ship.get(fee) || 0) + 1); }
      let shipN = 0, shipSum = 0;
      for (const [fee, cnt] of [...ship.entries()].sort((a, b) => a[0] - b[0])) {
        const total = fee * cnt, P = SR(total / 1.1), x = new Array(19).fill(null);
        x[0] = date; x[2] = set.거래처코드; x[4] = set.담당자; x[5] = set.출하창고; x[10] = set["택배비 품목코드"]; x[11] = set["택배비 품목명"];
        x[12] = cnt; x[13] = fee; x[15] = P; x[16] = total - P; out.push(x); shipN += cnt; shipSum += total;
      }
      if (blank) notes.push(`선택 사항이 비어 있는 행 ${blank}건은 제외했습니다.`);
      if (zero.length) notes.push(`발송할 수량이 0이라 제외한 행 ${zero.length}건: ${zero.slice(0, 5).join(", ")}${zero.length > 5 ? " …" : ""}`);
      if (differ.length) notes.push(`구매 수량과 발송할 수량이 달라 발송할 수량 기준으로 넣은 행 ${differ.length}건: ${differ.slice(0, 5).join(", ")}${differ.length > 5 ? " …" : ""}`);
      if (noPrice) notes.push(`단가(AY열)가 숫자가 아닌 행 ${noPrice}건은 제외했습니다. 파일 형식을 확인하세요.`);
      if (!out.length && !errors.size) notes.push("변환할 행이 없습니다.");
      const info = [`테무 상품 ${out.length - ship.size}행 · 판매금액 ${sum.toLocaleString()}원 (부가세 포함)`,
        `택배비 ${ship.size}행 · 배송 ${shipN}건(묶음 배송은 1건) · 합계 ${shipSum.toLocaleString()}원` + (ship.has(0) ? ` · 무료배송 ${ship.get(0)}건` : "")];
      return { headers: H, out, errors: [...errors], notes, warns: [], info, numFmt: { 10: "0" } };
    },
  });
})();
