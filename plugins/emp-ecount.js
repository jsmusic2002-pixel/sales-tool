// 프로그램(플러그인) 1: EMP 정산 파일 → 이카운트 매출 업로드 양식 (기존 main.py와 동일 규칙)
(() => {
  const s = v => (v == null ? "" : String(v).trim());
  const R = x => { const f = Math.floor(x), d = x - f; return d < .5 ? f : d > .5 ? f + 1 : (f % 2 === 0 ? f : f + 1); }; // 파이썬 round와 동일
  const H = ["일자","순번","거래처코드","거래처명","담당자","출하창고","거래유형","통화","환율","미수금","품목코드","품목명","수량","단가","외화금액","공급가액","부가세","적요","생산전표생성"];
  const DEFAULT_WAREHOUSE = "00260";
  const find = (cols, kws) => cols.find(c => kws.some(k => String(c).includes(k)));

  // 이카운트 '품목등록' 엑셀 → [{k:품목코드, v:[품목명,입고단가,검색창내용,사용구분,품목그룹1명]}]
  const parseMaster = aoa => {
    const h = aoa.findIndex(r => s(r[0]) === "품목코드");
    if (h < 0) throw new Error("'품목코드' 헤더를 찾을 수 없습니다. 이카운트 품목등록 엑셀이 맞는지 확인하세요.");
    const hd = aoa[h].map(s), ix = n => hd.indexOf(n);
    if (ix("품목명") < 0) throw new Error("'품목명' 열이 없습니다.");
    const out = new Map();
    for (const r of aoa.slice(h + 1)) {
      const k = s(r[0]), name = s(r[ix("품목명")]);
      if (!k || !name) continue;            // 맨 아래 출력 일시 줄 등 제외
      out.set(k, { k, v: [name, s(r[ix("입고단가")]), s(r[ix("검색창내용")]), s(r[ix("사용구분")]), s(r[ix("품목그룹1명")])] });
    }
    return [...out.values()];
  };

  PLUGINS.push({
    id: "emp-ecount",
    name: "EMP → 이카운트 매출",
    input: "EMP 정산 파일 (.xls / .xlsx)",
    outputName: d => `${d}_이카운트정산.xlsx`,
    errorTable: "products", // 매칭 실패 품목에서 '등록' 링크가 열릴 매핑 테이블
    runLabel: "정산파일 업로드",
    dbLabel: "DB관리",
    tables: [
      { ns: "master", title: "[DB]품목코드", readonly: true,   // 이카운트 품목등록 엑셀을 통째로 올려 동기화
        fields: [{ l: "품목코드" }, { l: "품목명" }, { l: "입고단가" }, { l: "검색창내용" }, { l: "사용구분" }, { l: "품목그룹1명" }],
        import: { label: "이카운트 품목등록 엑셀 (.xlsx)", parse: parseMaster } },
      { ns: "customers",  title: "[DB]거래처",   fields: [{ l: "판매자ID별칭" }, { l: "거래처코드" }, { l: "담당자" }] },
      { ns: "warehouses", title: "[DB]창고",     fields: [{ l: "기타메세지" }, { l: "출하창고" }] },
      { ns: "products",   title: "[DB]품목매칭", fields: [{ l: "주문선택사항" }, { l: "품목코드" }, { l: "품목명" }],
        pick: { ns: "master", fill: { 1: "k", 2: "v0" } } },   // 기초자료에서 골라 품목코드·품목명 자동 입력
      { ns: "sets",       title: "[DB]특별매칭", fields: [{ l: "주문선택사항" }, { l: "분리수" }, { l: "품목명들 (한 줄에 하나)", lines: true }] },
    ],
    // rows: 업로드 시트의 행 객체 배열, maps[ns][key] = [값...]  →  { headers, out, errors, notes }
    run({ rows, maps, date }) {
      const cols = rows.length ? Object.keys(rows[0]) : [];
      const c = { seller: find(cols, ["판매자ID별칭"]), opt: find(cols, ["주문선택사항"]), qty: find(cols, ["수량", "주문수량"]),
                  price: find(cols, ["판매가", "상품판매가"]), msg: find(cols, ["기타메세지", "주의메세지"]) };
      const miss = Object.entries({ 판매자ID별칭: c.seller, 주문선택사항: c.opt, 수량: c.qty, 판매가: c.price, 기타메세지: c.msg }).filter(([, v]) => !v).map(([k]) => k);
      if (miss.length) throw new Error("필수 컬럼 누락: " + miss.join(", "));

      const errors = new Set(), skipped = {}, res = [];
      const mk = (cu, wh, pr, qty, price, unit) => {
        const sup = R(price / 1.1);
        return { 일자: date, 거래처코드: cu[0], 담당자: cu[1] || "", 출하창고: wh, 품목코드: pr[0], 품목명: pr[1], 수량: qty, 단가: unit, 공급가액: sup, 부가세: price - sup };
      };
      for (const r of rows) {
        const seller = s(r[c.seller]), cu = maps.customers[seller];
        if (!cu) { skipped[seller] = (skipped[seller] || 0) + 1; continue; }
        const wh = r[c.msg] == null ? DEFAULT_WAREHOUSE : (maps.warehouses[s(r[c.msg])] || [DEFAULT_WAREHOUSE])[0];
        const opt = s(r[c.opt]);
        const qty = Math.trunc(Number(r[c.qty])), total = Math.trunc(Number(r[c.price]));
        if (!Number.isFinite(qty) || !Number.isFinite(total)) { errors.add(opt); continue; }
        const set = maps.sets[opt];
        if (set) {
          const split = Math.trunc(Number(set[0])) || 1, items = s(set[1]).split("\n").map(s).filter(Boolean);
          if (!items.length || split <= 0) continue;
          const unit = R(total / (split * qty));
          for (let i = 0; i < qty; i++) for (const name of items) {
            const pr = maps.products[name];
            if (!pr) { errors.add(name); continue; }
            res.push(mk(cu, wh, pr, 1, unit, unit));
          }
        } else {
          const pr = maps.products[opt];
          if (!pr) { errors.add(opt); continue; }
          res.push(mk(cu, wh, pr, qty, total, qty > 0 ? R(total / qty) : 0));
        }
      }
      res.sort((a, b) => (a.거래처코드 < b.거래처코드 ? -1 : a.거래처코드 > b.거래처코드 ? 1 : a.출하창고 < b.출하창고 ? -1 : a.출하창고 > b.출하창고 ? 1 : 0));
      return {
        headers: H, out: res.map(o => H.map(h => (o[h] === undefined ? null : o[h]))), errors: [...errors].sort(),
        notes: Object.entries(skipped).map(([k, n]) => `거래처DB에 없어 제외: ${k} (${n}건)`),
      };
    },
  });
})();
