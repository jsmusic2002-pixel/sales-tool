// 프로그램(플러그인) 1: EMP 정산 파일 → 이카운트 매출 업로드 양식 (기존 main.py와 동일 규칙)
(() => {
  const s = v => (v == null ? "" : String(v).trim());
  const R = x => { const f = Math.floor(x), d = x - f; return d < .5 ? f : d > .5 ? f + 1 : (f % 2 === 0 ? f : f + 1); }; // 파이썬 round와 동일
  const H = ["일자","순번","거래처코드","거래처명","담당자","출하창고","거래유형","통화","환율","미수금","품목코드","품목명","수량","단가","외화금액","공급가액","부가세","적요","생산전표생성"];
  const DEFAULT_WAREHOUSE = "00260";
  // 택배비 품목: 기본 01921, 출하창고가 00279(네이버도착보장)이면 02096
  const SHIP = { DEFAULT: ["01921", "택배비(100물류)"], NAVER: ["02096", "택배비(CJ대한통운/오네)"], NAVER_WH: "00279", TEMU: "테무(필품)", TEMU_FEE: 3000, SKIP_MSG: "광명" };
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
    // 매칭 실패 품목 옆에 표시할 등록 버튼. 이름에 '+'·'세트'가 있으면 특별매칭 버튼이 진하게(권장) 표시됨
    errorLinks: [
      { label: "품목매칭등록", ns: "products" },
      { label: "특별매칭등록", ns: "sets", when: /[+＋]|세트|set\b|\bset/i },
    ],
    weekStartDay: 5,   // 주간 매출 기준: 금요일(5) ~ 목요일
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
      { ns: "sets",       title: "[DB]특별매칭", fields: [{ l: "주문선택사항" }, { l: "분리수" }, { l: "품목명들 (한 줄에 하나)", lines: true, suggest: "products" }] },
    ],
    // rows: 업로드 시트의 행 객체 배열, maps[ns][key] = [값...]  →  { headers, out, errors, notes }
    run({ rows, maps, date }) {
      const cols = rows.length ? Object.keys(rows[0]) : [];
      const c = { seller: find(cols, ["판매자ID별칭"]), opt: find(cols, ["주문선택사항"]), qty: find(cols, ["수량", "주문수량"]),
                  price: find(cols, ["판매가", "상품판매가"]), msg: find(cols, ["기타메세지", "주의메세지"]) };
      const miss = Object.entries({ 판매자ID별칭: c.seller, 주문선택사항: c.opt, 수량: c.qty, 판매가: c.price, 기타메세지: c.msg }).filter(([, v]) => !v).map(([k]) => k);
      if (miss.length) throw new Error("필수 컬럼 누락: " + miss.join(", "));

      const errors = new Set(), skipped = {}, res = [];
      // 대시보드 집계: [쇼핑몰(판매자ID별칭), 품목코드, 품목명, 수량, 금액(부가세 포함)] — 이카운트에 올라가는 행과 같은 값
      const sale = new Map();
      const addSale = (seller, row) => {
        const k = seller + "\u0000" + row.품목코드; let e = sale.get(k);
        if (!e) sale.set(k, e = [seller, row.품목코드, row.품목명, 0, 0]);
        e[3] += row.수량; e[4] += row.공급가액 + row.부가세;
      };
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
            const row = mk(cu, wh, pr, 1, unit, unit); res.push(row); addSale(seller, row);
          }
        } else {
          const pr = maps.products[opt];
          if (!pr) { errors.add(opt); continue; }
          const row = mk(cu, wh, pr, qty, total, qty > 0 ? R(total / qty) : 0); res.push(row); addSale(seller, row);
        }
      }

      // ---------- 택배비 행 ----------
      // ① 기타메세지가 '광명'이거나 주문선택사항에 '광명 출고'(띄어쓰기 무관)가 있는 행 제외 → ② 수령자휴대폰번호 중복은 1건으로(선결제 행 우선)
      // ③ 선결제는 배송비금액(테무(필품)은 0이 아니면 3,000원), 무료배송은 0원 → ④ 판매자ID별칭·출하창고·금액이 모두 같은 건끼리만 합산: 수량=건수, 단가=그 금액(평균 아님)
      // 출하창고가 00279이면 품목코드 02096, 아니면 01921. 금액이 다르면 별도 행 (무료 0원도 별도 행)
      const info = [], notes = [], shipStat = new Map();
      const cH = find(cols, ["조건적용후", "배송방법(묶음"]), cF = find(cols, ["배송비금액"]), cP = find(cols, ["수령자휴대폰번호"]);
      const miss2 = Object.entries({ "배송방법(묶음/조건적용후)": cH, 배송비금액: cF, 수령자휴대폰번호: cP }).filter(([, v]) => !v).map(([k]) => k);
      if (miss2.length) notes.push("택배비를 만들지 못했습니다. 누락된 열: " + miss2.join(", "));
      else {
        const groups = new Map(); let gm = 0, uid = 0;
        for (const r of rows) {
          const seller = s(r[c.seller]);
          if (!maps.customers[seller]) continue;                       // 거래처DB에 없는 판매처는 상품 행과 동일하게 제외
          if (s(r[c.msg]) === SHIP.SKIP_MSG || s(r[c.opt]).replace(/\s+/g, "").includes("광명출고")) { gm++; continue; }   // 이미 수동 입력한 건 + 주문선택사항에 "광명 출고"가 있는 건
          const ph = s(r[cP]), key = ph || "__none" + uid++;           // 번호가 비어 있으면 합치지 않고 각각 처리
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(r);
        }
        const agg = new Map(), otherH = {};
        let dupRows = 0, noPhone = 0, badFee = 0, paid = 0, free = 0, sum = 0;
        for (const [key, list] of groups) {
          if (key.startsWith("__none")) noPhone++;
          dupRows += list.length - 1;
          if (new Set(list.map(r => s(r[c.seller]))).size > 1) notes.push(`같은 번호(${key})가 여러 판매처에 있어 택배비를 1건만 만들었습니다.`);
          const r = list.find(x => s(x[cH]) === "선결제") || list.find(x => s(x[cH]) === "무료배송") || list[0];   // 선결제 행 우선
          const h = s(r[cH]); let fee;
          if (h === "선결제") {
            fee = Math.trunc(Number(r[cF]));
            if (!Number.isFinite(fee)) { badFee++; continue; }
            if (s(r[c.seller]) === SHIP.TEMU && fee !== 0) fee = SHIP.TEMU_FEE;
          } else if (h === "무료배송") fee = 0;
          else { otherH[h || "(빈 값)"] = (otherH[h || "(빈 값)"] || 0) + 1; continue; }
          const seller = s(r[c.seller]);
          const wh = r[c.msg] == null ? DEFAULT_WAREHOUSE : (maps.warehouses[s(r[c.msg])] || [DEFAULT_WAREHOUSE])[0];
          const k2 = seller + "\u0000" + wh + "\u0000" + fee;
          if (!agg.has(k2)) agg.set(k2, { cu: maps.customers[seller], seller, wh, fee, n: 0 });
          const g = agg.get(k2); g.n++;
          fee > 0 ? paid++ : free++; sum += fee;
        }
        for (const g of agg.values()) {
          const sh = shipStat.get(g.seller) || [g.seller, 0, 0]; sh[1] += g.n; sh[2] += g.fee * g.n; shipStat.set(g.seller, sh);
          const [code, fb] = g.wh === SHIP.NAVER_WH ? SHIP.NAVER : SHIP.DEFAULT;
          const nm = (maps.master && maps.master[code] && maps.master[code][0]) || fb;   // 이름은 [DB]품목코드 기준
          res.push(mk(g.cu, g.wh, [code, nm], g.n, g.fee * g.n, g.fee));   // 단가=건당 금액, 금액=단가×수량
        }
        info.push(`택배비 ${agg.size}행 (판매처·창고·금액이 같은 건끼리 합산) · 배송 ${paid + free}건 = 유료 ${paid} + 무료 ${free} · 합계 ${sum.toLocaleString()}원 (같은 번호 중복 ${dupRows}행 합침${gm ? `, 광명 ${gm}행 제외` : ""})`);
        if (noPhone) notes.push(`수령자휴대폰번호가 비어 있는 행이 ${noPhone}건 있어 중복 확인 없이 각각 처리했습니다.`);
        if (badFee) notes.push(`배송비금액이 숫자가 아닌 선결제 ${badFee}건은 택배비에서 제외했습니다.`);
        for (const [h, n] of Object.entries(otherH)) notes.push(`배송방법이 '${h}'인 ${n}건은 택배비에서 제외했습니다. (선결제·무료배송만 처리)`);
        if (!maps.master || !maps.master[SHIP.DEFAULT[0]] || !maps.master[SHIP.NAVER[0]]) notes.push("[DB]품목코드에 01921 또는 02096이 없습니다. 품목코드 엑셀을 먼저 올려주세요(임시 품목명으로 입력됨).");
      }
      res.sort((a, b) => (a.거래처코드 < b.거래처코드 ? -1 : a.거래처코드 > b.거래처코드 ? 1 : a.출하창고 < b.출하창고 ? -1 : a.출하창고 > b.출하창고 ? 1 : 0));
      return {
        headers: H, out: res.map(o => H.map(h => (o[h] === undefined ? null : o[h]))), errors: [...errors].sort(),
        notes: [...Object.entries(skipped).map(([k, n]) => `거래처DB에 없어 제외: ${k} (${n}건)`), ...notes], info,
        stats: { sales: [...sale.values()], ship: [...shipStat.values()] },   // 대시보드 저장용 (택배비는 ship에 별도)
      };
    },
  });
})();
