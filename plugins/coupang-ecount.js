// 프로그램(플러그인) 2: 쿠팡 로켓그로스 매출 → 이카운트 매출 업로드 양식 (기존 파이썬 프로그램 + 프로모션 현황 업로드 방식)
(() => {
  const s = v => (v == null ? "" : String(v).trim());
  const R = x => { const f = Math.floor(x), d = x - f; return d < .5 ? f : d > .5 ? f + 1 : (f % 2 === 0 ? f : f + 1); }; // 파이썬 round와 동일
  const num = v => { const t = s(v).replace(/,/g, ""); return t === "" ? NaN : Number(t); };
  const nrm = v => s(v).replace(/\s+/g, "");
  const H = ["일자","순번","거래처코드","거래처명","담당자","출하창고","거래유형","통화","환율","미수금","품목코드","품목명","수량","단가","외화금액","공급가액","부가세"];
  const DEFAULTS = [["거래처코드", "00335"], ["담당자", "00001"], ["출하창고", "00267"]];   // [설정] 화면에서 바꿀 수 있는 기본값
  const OK_STATUS = ["승인완료", "진행중"];                                                    // 이 상태의 프로모션만 적용
  const day = t => { const m = s(t).match(/(\d{4})\.(\d{2})\.(\d{2})/); return m ? m[1] + m[2] + m[3] : ""; };   // '2026.11.23(월) 07:00' → '20261123'

  // 헤더 행을 찾아 열 이름으로 읽기 (열 위치가 바뀌어도 동작)
  const readTable = (aoa, mustHave) => {
    const h = aoa.findIndex(r => r && mustHave.every(n => r.some(c => nrm(c) === nrm(n))));
    if (h < 0) throw new Error(`'${mustHave.join("', '")}' 헤더를 찾을 수 없습니다. 올바른 파일인지 확인하세요.`);
    const hd = aoa[h].map(nrm);
    return { ix: n => hd.indexOf(nrm(n)), rows: aoa.slice(h + 1).filter(r => r && r.some(c => s(c) !== "")) };
  };

  // 기본 DB 엑셀(DB.xlsx) → [{k:옵션ID, v:[쿠팡 노출 상품명, 판매가격, 이카운트 품목코드, 정산금, 번들수량]}]  (기간정산 열은 사용하지 않음)
  const parseOptions = aoa => {
    const { ix, rows } = readTable(aoa, ["옵션 ID", "이카운트 품목코드", "정산금"]);
    const out = new Map();
    for (const r of rows) {
      const k = s(r[ix("옵션 ID")]); if (!k) continue;
      out.set(k, { k, v: [s(r[ix("쿠팡 노출 상품명")]), s(r[ix("판매가격")]), s(r[ix("이카운트 품목코드")]), s(r[ix("정산금")]), s(r[ix("번들수량")])] });
    }
    return [...out.values()];
  };
  // 쿠팡 프로모션 요청 목록 → [{k:프로모션ID, v:[옵션ID, 상품명, 판매가, 프로모션 가격, 프로모션 상태, 시작일시, 종료일시, 노출영역, 판매방식]}]
  const parsePromos = aoa => {
    const { ix, rows } = readTable(aoa, ["ID", "옵션ID", "프로모션 가격", "프로모션 상태"]);
    const out = new Map();
    for (const r of rows) {
      const k = s(r[ix("ID")]), opt = s(r[ix("옵션ID")]); if (!k || !opt) continue;
      out.set(k, { k, v: [opt, s(r[ix("등록상품명, 옵션명")]), s(r[ix("판매가")]), s(r[ix("프로모션 가격")]), s(r[ix("프로모션 상태")]),
                          s(r[ix("시작일시")]), s(r[ix("종료일시")]), s(r[ix("노출영역")]), s(r[ix("판매방식")])] });
    }
    return [...out.values()];
  };

  PLUGINS.push({
    id: "coupang-ecount",
    name: "쿠팡로켓그로스 → 이카운트 매출",
    input: "쿠팡 매출 파일 (SELLER_INSIGHTS_VENDOR_ITEM_METRICS .xlsx)",
    outputName: d => `${d}_이카운트웹자료올리기.xlsx`,
    errorLinks: [{ label: "옵션매칭등록", ns: "options" }],
    errorKey: e => e.split(" · ")[0],     // 오류 문구 '옵션ID · 옵션명' 에서 옵션ID만 등록 화면으로 전달
    runLabel: "매출파일 업로드",
    dbLabel: "DB관리",
    tables: [
      { ns: "options", title: "[DB]옵션매칭",
        fields: [{ l: "옵션 ID" }, { l: "쿠팡 노출 상품명" }, { l: "판매가격" }, { l: "이카운트 품목코드" }, { l: "정산금" }, { l: "번들수량" }],
        note: "옵션 ID → 이카운트 품목코드·정산금·번들수량. 번들수량은 세트 옵션(2개, 3개…)만 입력하고 단일 옵션은 비워 두세요. 정산금은 세트 전체 금액입니다.",
        import: { label: "기본 DB 엑셀 (DB.xlsx)", parse: parseOptions } },
      { ns: "promos", title: "[DB]프로모션", readonly: true,
        fields: [{ l: "프로모션 ID" }, { l: "옵션ID" }, { l: "상품·옵션명" }, { l: "판매가" }, { l: "프로모션 가격" }, { l: "상태" }, { l: "시작일시" }, { l: "종료일시" }, { l: "노출영역" }, { l: "판매방식" }],
        note: "쿠팡 프로모션 현황 엑셀을 올리면 목록 전체가 최신 파일 내용으로 교체됩니다. 변환할 때는 상태가 승인완료·진행중이고 작업 날짜가 시작일~종료일 안에 있는 것만 적용하며, 같은 옵션에 여러 개면 프로모션 가격이 가장 낮은 하나만 씁니다.",
        // 상태별 탭
        tabs: { field: 4, list: [{ label: "승인완료", values: ["승인완료"] }, { label: "진행중", values: ["진행중"] }, { label: "종료", values: ["종료"] }, { label: "반려", values: ["반려"] }, { label: "취소", values: ["취소"] }] },
        import: { label: "쿠팡 프로모션 현황 엑셀 (.xlsx)", parse: parsePromos } },
      { ns: "settings", title: "[설정]기본값", fields: [{ l: "항목" }, { l: "값" }], seed: DEFAULTS,
        note: "이카운트 양식에 고정으로 들어가는 값입니다. 항목 이름(거래처코드 / 담당자 / 출하창고)은 그대로 두고 값만 수정하세요." },
    ],
    run({ rows, maps, date }) {
      const cols = rows.length ? Object.keys(rows[0]) : [];
      const col = n => cols.find(c => nrm(c) === nrm(n));
      const c = { id: col("옵션 ID"), name: col("옵션명"), way: col("판매방식"), qty: col("판매량") };
      const miss = Object.entries({ "옵션 ID": c.id, 판매방식: c.way, 판매량: c.qty }).filter(([, v]) => !v).map(([k]) => k);
      if (miss.length) throw new Error("필수 컬럼 누락: " + miss.join(", "));

      const set = Object.fromEntries(DEFAULTS.map(([k, d]) => [k, s((maps.settings[k] || [])[0]) || d]));
      // 프로모션: 상태가 승인완료·진행중 + 작업 날짜가 시작일~종료일 안 → 옵션별로 프로모션 가격이 가장 낮은 하나
      const promo = new Map(); let promoRows = 0;
      for (const v of Object.values(maps.promos || {})) {
        const [opt, , sale, price, status, st, en] = v;
        if (!OK_STATUS.includes(s(status))) continue;
        const a = day(st), b = day(en), sp = num(sale), pp = num(price);
        if (!a || !b || !(a <= date && date <= b) || isNaN(sp) || isNaN(pp)) continue;
        promoRows++;
        const cur = promo.get(opt);
        if (!cur || pp < cur.price) promo.set(opt, { sale: sp, price: pp });
      }

      const errors = new Set(), notes = [], warns = [], out = []; let skipped = 0, applied = 0;
      const warned = new Set(), bad = new Set();
      for (const r of rows) {
        const id = s(r[c.id]), q = num(r[c.qty]);
        if (s(r[c.way]) === "판매자배송" || q === 0) { skipped++; continue; }
        if (isNaN(q)) { notes.push(`판매량을 읽을 수 없어 제외: ${id}`); continue; }
        const o = maps.options[id];
        if (!o) { errors.add(`${id} · ${s(r[c.name])}`); continue; }
        const [, dbPrice, code, settleS, bundleS] = o, settle = num(settleS);
        if (!s(code) || isNaN(settle)) { if (!bad.has(id)) { bad.add(id); notes.push(`옵션 ${id}: [DB]옵션매칭에 이카운트 품목코드 또는 정산금이 비어 있어 제외했습니다.`); } continue; }
        const bn = num(bundleS), bundle = bn > 0 ? Math.trunc(bn) : 1;
        let final = settle; const p = promo.get(id);
        if (p) {
          final = settle - (p.sale - p.price); applied++;
          const dp = num(dbPrice);
          if (!isNaN(dp) && dp !== p.sale && !warned.has(id))
            { warned.add(id); warns.push({ text: `${id} ${s(r[c.name])} — 프로모션 파일 판매가 ${p.sale.toLocaleString()}원 ≠ [DB]옵션매칭 판매가격 ${dp.toLocaleString()}원 (정산금 차감은 프로모션 파일 기준으로 계산됨)`, ns: "options", key: id, label: "옵션매칭 수정" }); }
        }
        const M = q * bundle, N = R(final / bundle), P = R((M * N) / 1.1), Q = M * N - P;
        const row = new Array(17).fill(null);
        row[0] = date; row[2] = set.거래처코드; row[4] = set.담당자; row[5] = set.출하창고;
        row[10] = /^[1-9]\d{8,}$/.test(s(code)) ? Number(code) : s(code);      // 바코드(숫자)는 숫자 셀, 그 외는 문자
        row[12] = M; row[13] = N; row[15] = P; row[16] = Q;
        out.push(row);
      }
      out.sort((a, b) => b[12] - a[12]);                                                        // 수량 많은 순 (같으면 입력 순서)
      if (!Object.keys(maps.promos || {}).length) notes.push("[DB]프로모션이 비어 있어 프로모션 차감 없이 기본 정산금으로 계산했습니다.");
      const info = [`프로모션 적용 ${applied}행 (오늘 기간 내 승인완료·진행중 프로모션 ${promo.size}개 옵션) · 제외 ${skipped}행(판매자배송 또는 판매량 0)`];
      return { headers: H, out, errors: [...errors], notes, warns, info, numFmt: { 10: "0" } };
    },
  });
})();
