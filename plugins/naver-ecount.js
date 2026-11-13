// 프로그램(플러그인) 3: 네이버 스마트스토어(N배송) 중 플레이오토에서 수집되지 않은 주문 → 이카운트 매출 업로드 양식
// (기존 구글 시트 매크로 '판매내역' + '판매내역2(1+1 분리)'를 하나로 합친 것)
(() => {
  const s = v => (v == null ? "" : String(v).trim());
  const num = v => { const t = s(v).replace(/,/g, ""); return t === "" ? NaN : Number(t); };
  const nrm = v => s(v).replace(/\s+/g, "");
  const SR = x => (x < 0 ? -Math.floor(-x + 0.5) : Math.floor(x + 0.5));          // 구글 시트 ROUND (0.5는 0에서 먼 쪽으로)
  const H = ["일자","순번","거래처코드","거래처명","담당자","출하창고","거래유형","통화","환율","미수금","품목코드","품목명","수량","단가","외화금액","공급가액","부가세","적요","생산전표생성"];
  // 스토어(업로드 칸) → 판매자ID별칭(= 플레이오토 EMP의 별칭과 동일). 거래처코드·담당자 기본값은 [DB]거래처에서 바꿀 수 있음
  const STORES = [
    { input: "morak",  alias: "스마트스토어-모락스토어",   code: "00344", mgr: "00325" },
    { input: "spleee", alias: "스마트스토어-스플리스토어", code: "00374", mgr: "00325" },
  ];
  const SETTINGS = [["출하창고", "00279"], ["택배비 품목코드", "02096"], ["택배비 품목명", "택배비(CJ대한통운/오네)"]];
  const toCode = c => (/^[1-9]\d{8,}$/.test(s(c)) ? Number(c) : s(c));              // 13자리 바코드는 숫자 셀(지수 표기 방지는 서식 '0'으로)

  const readHeaderRows = (aoa, key2, key3) => {   // 머리글(2열=품목명, 3열=품목코드) 이후 행
    const h = aoa.findIndex(r => r && s(r[1]) === key2 && s(r[2]) === key3);
    if (h < 0) throw new Error(`머리글('${key2}', '${key3}')을 찾을 수 없습니다. DB 엑셀이 맞는지 확인하세요.`);
    return aoa.slice(h + 1).filter(r => r && s(r[1]));
  };
  // DB 시트: B=옵션정보, C=품목코드, D=품목명 (같은 옵션정보가 여러 번이면 위쪽 행 우선: VLOOKUP과 동일)
  const parseDB = aoa => {
    const out = new Map();
    for (const r of readHeaderRows(aoa, "품목명", "품목코드")) { const k = s(r[1]); if (s(r[2]) && !out.has(k)) out.set(k, { k, v: [s(r[2]), s(r[3])] }); }
    return [...out.values()];
  };
  // DB2 시트: B=옵션정보, C·D=품목코드1·품목명1, E·F=품목코드2·품목명2 (중복이면 아래쪽 행 우선: 기존 스크립트와 동일)
  const parseDB2 = aoa => {
    const out = new Map();
    for (const r of readHeaderRows(aoa, "품목명", "품목코드")) { const k = s(r[1]); out.set(k, { k, v: [s(r[2]), s(r[3]), s(r[4]), s(r[5])] }); }
    return [...out.values()];
  };

  PLUGINS.push({
    id: "naver-ecount",
    name: "네이버(N배송) → 이카운트 매출",
    input: "",
    inputs: [
      { id: "emp", label: "플레이오토(EMP) 정산 파일 — 중복 제거용 (.xls / .xlsx)", required: true },
      { id: "morak", label: "스마트스토어-모락스토어 네이버 파일 (배송현황관리·구매확정내역, 여러 개 선택 가능)", multiple: true },
      { id: "spleee", label: "스마트스토어-스플리스토어 네이버 파일 (배송현황관리·구매확정내역, 여러 개 선택 가능)", multiple: true },
    ],
    outputName: d => `${d}_네이버N배송_이카운트웹자료올리기.xlsx`,
    errorLinks: [{ label: "품목매칭등록", ns: "options" }, { label: "1+1분리등록", ns: "sets", when: /1\s*\+\s*1/ }],
    runLabel: "네이버 파일 업로드",
    dbLabel: "DB관리",
    tables: [
      { ns: "options", title: "[DB]품목매칭", fields: [{ l: "옵션정보" }, { l: "품목코드" }, { l: "품목명" }],
        pick: { plugin: "emp-ecount", ns: "master", fill: { 1: "k", 2: "v0" } },
        note: "네이버 옵션정보(예: '선택: 모락 시뮬러 노트북거치대S') → 이카운트 품목코드·품목명. 구글 시트 DB 탭과 같은 표입니다.",
        import: { label: "DB 엑셀 (DB 시트)", sheet: "DB", parse: parseDB } },
      { ns: "sets", title: "[DB]1+1분리", fields: [{ l: "옵션정보" }, { l: "품목코드1" }, { l: "품목명1" }, { l: "품목코드2" }, { l: "품목명2" }],
        note: "[DB]품목매칭에 없는 옵션정보 중 여기에 있는 것은 두 품목 행으로 나누고, 단가와 금액을 각각 절반(소수점은 반올림)으로 넣습니다. 구글 시트 DB2 탭과 같은 표입니다.",
        import: { label: "DB 엑셀 (DB2 시트)", sheet: "DB2", parse: parseDB2 } },
      { ns: "customers", title: "[DB]거래처", fields: [{ l: "판매자ID별칭" }, { l: "거래처코드" }, { l: "담당자" }],
        seed: STORES.map(t => [t.alias, t.code, t.mgr]),
        note: "스토어별 거래처코드·담당자입니다. 판매자ID별칭은 플레이오토의 이름과 같게 두고 코드만 수정하세요." },
      { ns: "settings", title: "[설정]기본값", fields: [{ l: "항목" }, { l: "값" }], seed: SETTINGS,
        note: "출하창고와 택배비 품목입니다. 항목 이름은 그대로 두고 값만 수정하세요." },
    ],
    run({ inputs, maps, date }) {
      const emp = inputs.emp || [];
      if (!emp.length) throw new Error("플레이오토(EMP) 파일을 선택하세요.");
      // 1. 플레이오토 주문번호 수집 (J열 '판매사이트 주문번호': 공백이 있으면 뒤쪽 숫자)
      const ids = new Set();
      for (const f of emp) {
        const jk = f.rows.length ? Object.keys(f.rows[0]).find(c => nrm(c) === "판매사이트주문번호") : null;
        if (!jk) throw new Error(`'${f.name}'에서 '판매사이트 주문번호' 열을 찾을 수 없습니다. 플레이오토(EMP) 파일이 맞는지 확인하세요.`);
        for (const r of f.rows) { const v = s(r[jk]); if (!v) continue; const id = v.includes(" ") ? v.split(" ")[1] : v; if (id) ids.add(id.trim()); }
      }
      const set = Object.fromEntries(SETTINGS.map(([k, d]) => [k, s((maps.settings[k] || [])[0]) || d]));
      const NEED = { id: "상품주문번호", way: "배송속성", opt: "옵션정보", qty: "수량", amt: "최종 상품별 총 주문금액", fee: "배송비 합계" };

      // 2. 네이버 파일 → N배송 + 플레이오토에 없음 + 처음 나온 주문번호만
      const seen = new Set(), errors = new Set(), notes = [], info = [], out = [];
      const dbk = k => (maps.options || {})[k], sk = k => (maps.sets || {})[k];
      let totalNaver = 0;
      for (const st of STORES) {
        const cust = maps.customers[st.alias] || [], code = s(cust[0]) || st.code, mgr = s(cust[1]) || st.mgr;
        const prod = [], ship = new Map(); let n = 0, inEmp = 0, dupe = 0, fileRows = 0;
        for (const f of inputs[st.input] || []) {
          const cols = f.rows.length ? Object.keys(f.rows[0]) : [], c = {};
          for (const [k, name] of Object.entries(NEED)) { c[k] = cols.find(x => nrm(x) === nrm(name)); }
          const miss = Object.entries(NEED).filter(([k]) => !c[k]).map(([, v]) => v);
          if (miss.length) throw new Error(`'${f.name}'에 필요한 열이 없습니다: ${miss.join(", ")}`);
          for (const r of f.rows) {
            if (s(r[c.way]) !== "N배송") continue;
            fileRows++;
            const id = s(r[c.id]);
            if (ids.has(id)) { inEmp++; continue; }
            if (seen.has(id)) { dupe++; continue; }
            seen.add(id);
            const q = num(r[c.qty]), amt = num(r[c.amt]), fee = num(r[c.fee]) || 0;
            if (isNaN(q) || isNaN(amt)) { notes.push(`수량·금액을 읽을 수 없어 제외: ${id}`); continue; }
            n++;
            ship.set(fee, (ship.get(fee) || 0) + 1);                                  // 택배비: 배송비 금액별 건수
            // 3. 품목 매칭: [DB]품목매칭 우선, 없으면 [DB]1+1분리
            const key = s(r[c.opt]), M = q, N0 = M === 0 ? "-" : SR(amt / M);
            const row = (ic, iname, unit, total) => { const P = SR(total / 1.1), x = new Array(19).fill(null);
              x[0] = date; x[2] = code; x[4] = mgr; x[5] = set.출하창고; x[10] = ic === "" ? "" : toCode(ic); x[11] = iname; x[12] = M; x[13] = unit; x[15] = P; x[16] = total - P; return x; };
            const d1 = dbk(key), d2 = sk(key);
            if (d1 && s(d1[0])) prod.push(row(d1[0], s(d1[1]), N0, amt));
            else if (d2) {
              const hu = typeof N0 === "number" ? SR(N0 / 2) : N0, ha = SR(amt / 2);   // 단가·금액 절반 (소수점은 반올림)
              prod.push(row(d2[0], s(d2[1]), hu, ha));
              if (s(d2[2]) || s(d2[3])) prod.push(row(d2[2], s(d2[3]), hu, ha));
            } else { errors.add(key); }
          }
          totalNaver += f.rows.length;
        }
        // 4. 택배비 행 (금액이 다르면 행을 나눔, 0원도 행으로)
        const sh = [...ship.entries()].sort((a, b) => a[0] - b[0]).map(([fee, cnt]) => {
          const x = new Array(19).fill(null), P = SR(fee * cnt / 1.1);
          x[0] = date; x[2] = code; x[4] = mgr; x[5] = set.출하창고; x[10] = set["택배비 품목코드"]; x[11] = set["택배비 품목명"]; x[12] = cnt; x[13] = fee; x[15] = P; x[16] = fee * cnt - P; return x; });
        out.push(...prod, ...sh);
        if ((inputs[st.input] || []).length) info.push(`${st.alias}: N배송 ${fileRows}건 중 플레이오토와 겹침 ${inEmp}건 제외${dupe ? `, 네이버 파일 내 중복 ${dupe}건 제외` : ""} → ${n}건 (택배비 ${sh.length}행)`);
      }
      if (!totalNaver) throw new Error("네이버 파일을 한 개 이상 선택하세요.");
      return { headers: H, out, errors: [...errors], notes, info, numFmt: { 10: "0" } };
    },
  });
})();
