// 프로그램(플러그인) 5: 앱스토리몰 발주서(2종류) → 이카운트 매출 업로드 양식
// 발주서에는 판매가·정확한 옵션명이 없으므로 [DB]판매가(품목코드·품목명·판매가)를 기준으로 상품을 찾고 금액을 계산합니다.
(() => {
  const s = v => (v == null ? "" : String(v).trim());
  const num = v => { const t = s(v).replace(/,/g, "").replace(/원$/, ""); return t === "" ? NaN : Number(t); };
  const SR = x => { const a = Math.abs(x); return (x < 0 ? -1 : 1) * Math.floor(a + 0.5 + 1e-9); };
  const nk = t => s(t).toLowerCase().replace(/[\s()\[\]\-_*·,.\/]/g, "");            // 매칭용 정규화: 공백·괄호·기호 무시
  const QTY_TAIL = /\s*[*xX×]?\s*\d+\s*(?:ea|EA|Ea|eA|개)\s*$/;                       // 양식1 옵션주문 끝의 '2ea' '*2ea' 등 수량 표기
  const H = ["일자","순번","거래처코드","거래처명","담당자","출하창고","거래유형","통화","환율","미수금","품목코드","품목명","수량","단가","외화금액","공급가액","부가세","적요","생산전표생성"];
  const DEFAULTS = [["거래처코드", ""], ["담당자", "00325"], ["출하창고", "00260"], ["택배비 금액", "3000"], ["택배비 품목코드", "01921"], ["택배비 품목명", "택배비(100물류)"]];
  // 앱스토리몰_판매가 엑셀 기본 데이터 (품목코드, 품목명, 판매가) — [DB]판매가가 비어 있으면 이 값을 사용
  const BASE = [
    ["8806167238018", "모락 초미세 터치펜 (블랙)", 2000],
    ["8806167238025", "모락 초미세 터치펜 (실버)", 2000],
    ["8806167238049", "모락 초미세 터치펜 (그레이)", 2000],
    ["8806167239107", "모락 원포인트 초미세 터치펜 (블랙)", 2800],
    ["8806167239114", "모락 원포인트 초미세 터치펜 (골드)", 2800],
    ["8806167241803", "모락 넬리 LED 우드 스탠드 수면 취침 인테리어 조명 무드등", 12100],
    ["8806167242053", "모락 넬리 LED 무선 자석 센서등 18cm", 5200],
    ["8806167242060", "모락 넬리 LED 무선 자석 센서등 28cm", 7000],
    ["8806167242077", "모락 네다 V9 120W PD PPS QC4.0+ 3포트 차량용 초고속 충전기", 23700],
    ["8806167242237", "모락 투포인트 정전식 초미세 터치펜 (블랙)", 4800],
    ["8806167242244", "모락 투포인트 정전식 초미세 터치펜 (화이트)", 4800],
    ["8806167242251", "모락 투포인트 정전식 초미세 터치펜 (그레이)", 4800],
    ["8806167242268", "모락 투포인트 정전식 초미세 터치펜 (로즈골드)", 4800],
    ["8806167242411", "모락 시그널X 차량용 LED 안전삼각대", 6000],
    ["8806167242916", "모락 시뮬러 알루미늄 접이식 노트북 거치대S", 12000],
    ["8806167243081", "모락 프로토 5포트 USB 젠더 C타입 멀티 허브", 6000],
    ["8806167244385", "모락 브리큐 USB 4포트 여행용 멀티 플러그 어댑터 (블랙)", 11500],
    ["8806167244460", "모락 볼드 메탈 접이식 탁상용 태블릿 거치대 (다크그레이)", 10000],
    ["8806167244477", "모락 볼드 메탈 접이식 탁상용 태블릿 거치대 (실버)", 10000],
    ["8806167244590", "모락 네다 N7 90W 3포트 멀티 차량용 초고속 충전기", 12200],
    ["8806167244644", "모락 쇼키 휴대용 접이식 노트북 거치대 (화이트)", 4100],
    ["8806167244668", "모락 쇼키 휴대용 접이식 노트북 거치대 (블랙)", 4100],
    ["8806167245344", "모락 수맥 알루미늄 접이식 휴대용 노트북 거치대", 7200],
    ["8806167245351", "모락 글랜 라이트닝 8핀 이어폰", 5800],
    ["8806167245467", "모락 글랜 C타입 이어폰", 4000],
    ["8806167245474", "모락 스윙 자바라 탭 패드 태블릿 스마트폰 탁상용 침대 거치대", 9500],
    ["8806167245900", "모락 글로우팟 블루투스 무선 이어폰 (핑크)", 9300],
    ["8806167245917", "모락 글로우팟 블루투스 무선 이어폰 (화이트)", 9300],
    ["8806167247935", "모락 런처 USB C타입 충전식 건전지 AAA (2개입)", 6600],
    ["8806167247942", "모락 바디안 무릎 온열 마사지기", 17000],
    ["8806167248482", "모락 바디안 풋 케어 스페셜 세트", 35000],
    ["8806167248581", "모락 글로우팟2 블루투스 무선 이어폰 (화이트)", 11500],
    ["8806167248598", "모락 글로우팟2 블루투스 무선 이어폰 (핑크)", 11500],
    ["8806167248604", "모락 글로우팟2 블루투스 무선 이어폰 (블루)", 11500],
    ["8806167248611", "모락 글로우팟2 블루투스 무선 이어폰 (퍼플)", 11500],
    ["8806167248789", "모락 글랜 슬림 C타입 이어폰 (화이트)", 4000],
    ["8806167248796", "모락 글랜 슬림 C타입 이어폰 (블랙)", 4000],
    ["8806167248802", "모락 베레스 슬림 무선 마우스", 4000],
    ["8806167248857", "모락 글로우팟3 블루투스 무선 이어폰 (화이트)", 12500],
    ["8806167248864", "모락 글로우팟3 블루투스 무선 이어폰 (블랙)", 12500],
    ["8806167248871", "모락 글로우팟3 블루투스 무선 이어폰 (그린)", 12500],
    ["8806167248888", "모락 글로우팟3 블루투스 무선 이어폰 (베이지)", 12500],
    ["8806167248895", "모락 글로우팟3 블루투스 무선 이어폰 (퍼플)", 12500],
    ["8806167248963", "모락 넬리 스틱 LED 무선 자석 센서등 30cm (전구색)", 5300],
    ["8806167248970", "모락 넬리 스틱 LED 무선 자석 센서등 30cm (주광색)", 5300],
    ["8806167248987", "모락 넬리 스틱 LED 무선 자석 센서등 50cm (전구색)", 6000],
    ["8806167248994", "모락 넬리 스틱 LED 무선 자석 센서등 50cm (주광색)", 6000],
    ["8806167249106", "모락 퓨어 쿨러 에어 칫솔 살균기", 18500],
    ["8806167249625", "모락 조나 A9 Qi2 냉각쿨링 차량용 맥세이프 핸드폰 고속 무선 충전 거치대", 25000],
    ["8806167250676", "모락 글로우 미니 블루투스 무선 이어폰", 6000],
    ["8806167250683", "모락 넬리 인테리어 스틱 LED 무선 자석 센서등 50cm", 5500],
    ["8806167251376", "스플리 포토봉 맥세이프 삼각대 블루투스 리모컨 미니 셀카봉 (블랙)", 19500],
    ["8806167251383", "스플리 포토봉 맥세이프 삼각대 블루투스 리모컨 미니 셀카봉 (화이트)", 19500]
  ];

  const parsePrices = aoa => {
    const h = aoa.findIndex(r => r && s(r[0]) === "품목코드" && s(r[2]) === "판매가");
    if (h < 0) throw new Error("'품목코드 / 품목명 / 판매가' 헤더가 있는 앱스토리몰_판매가 엑셀이 아닙니다.");
    return aoa.slice(h + 1).filter(r => s(r[0]) && Number.isFinite(num(r[2]))).map(r => ({ k: s(r[0]), v: [s(r[1]), num(r[2])] }));
  };

  PLUGINS.push({
    id: "appstory-ecount",
    name: "앱스토리몰 → 이카운트 매출",
    input: "",
    inputs: [{ id: "files", label: "앱스토리몰 발주서 (양식1·양식2 모두 가능, 여러 개 선택 가능)", required: true, multiple: true }],
    outputName: d => `${d}_앱스토리몰_이카운트정산.xlsx`,
    errorLinks: [
      { label: "상품매칭등록", ns: "options", inline: { kind: "pick", master: { plugin: "emp-ecount", ns: "master" } }, skip: e => /^\[판매가\]/.test(e) },
      { label: "판매가등록", ns: "prices", only: e => /^\[판매가\]/.test(e), inline: { kind: "price", parse: e => { const m = e.match(/^\[판매가\]\s*(\S+)\s*\|\s*(.*)$/); return m ? { k: m[1], name: m[2] } : { k: e, name: "" }; } } },
    ],
    runLabel: "발주서 업로드",
    dbLabel: "DB관리",
    tables: [
      { ns: "prices", title: "[DB]판매가", fields: [{ l: "품목코드" }, { l: "품목명" }, { l: "판매가", number: true, suffix: "원" }],
        pick: { plugin: "emp-ecount", ns: "master", fill: { 0: "k", 1: "v0" } }, seed: BASE, seedIfEmpty: true,
        note: "앱스토리몰 판매가(부가세 포함 단가)입니다. 상품명이 품목명과 같으면(괄호·띄어쓰기 무시) 자동으로 매칭되고 금액은 이 판매가 × 수량으로 계산됩니다. 이카운트 품목(기초자료)에서 찾아 추가하거나, 앱스토리몰_판매가 엑셀을 올려 가져올 수 있습니다.",
        import: { label: "앱스토리몰_판매가 엑셀 (품목코드 · 품목명 · 판매가)", parse: parsePrices } },
      { ns: "options", title: "[DB]상품매칭", fields: [{ l: "발주서 상품명(옵션)" }, { l: "품목코드" }, { l: "품목명" }],
        pick: { plugin: "emp-ecount", ns: "master", fill: { 1: "k", 2: "v0" } },
        note: "[DB]판매가의 품목명과 자동으로 맞지 않는 상품만 여기에 등록합니다. 양식1은 옵션주문에서 끝의 '2ea' 수량을 뺀 글자, 양식2는 상품명+색상 글자가 기준입니다." },
      { ns: "settings", title: "[설정]기본값", fields: [{ l: "항목" }, { l: "값" }], seed: DEFAULTS,
        pick: { plugin: "emp-ecount", ns: "master", fill: {} },
        picks: [{ label: "택배비 품목 변경 (선택하면 택배비 품목코드·품목명이 함께 저장됩니다)", save: { "택배비 품목코드": "k", "택배비 품목명": "v0" } }],
        note: "거래처코드는 꼭 입력하세요. 택배비는 주문(주문번호) 1건당 '택배비 금액'(기본 3,000원) 유료배송으로 한 줄에 합산됩니다." },
    ],
    run({ inputs, maps, date }) {
      const set = Object.fromEntries(DEFAULTS.map(([k, d]) => [k, s((maps.settings[k] || [])[0]) || d]));
      const prices = Object.keys(maps.prices || {}).length ? maps.prices : Object.fromEntries(BASE.map(([k, ...v]) => [k, v]));
      const priceIdx = new Map(), optIdx = new Map();
      for (const [code, v] of Object.entries(prices)) if (!priceIdx.has(nk(v[0]))) priceIdx.set(nk(v[0]), code);
      for (const [k, v] of Object.entries(maps.options || {})) optIdx.set(nk(k), v);
      const find = key => { const n = nk(key); if (optIdx.has(n)) return optIdx.get(n)[0]; return priceIdx.get(n) || null; };

      const errors = new Set(), notes = [], warns = [], out = [], orders = new Set(), fmtCnt = { 1: 0, 2: 0 };
      let zero = 0, unknownFile = [], sum = 0, qtySum = 0;
      for (const f of inputs.files) {
        let rows = f.rows;
        const has = (n) => rows.length && Object.keys(rows[0]).some(c => s(c) === n);
        const f2 = has("상품명") && has("색상"), f1 = has("옵션주문") || has("제품");
        if (!f2 && !f1) { unknownFile.push(f.name); continue; }
        for (const r of rows) {
          let key, id;
          if (f2) { const nm = s(r["상품명"]), col = s(r["색상"]); key = !col || nk(nm).includes(nk(col)) ? nm : nm + " " + col; }
          else key = s(r["옵션주문"] || r["제품"]).replace(QTY_TAIL, "").trim();
          const q = num(r["수량"]);
          if (!key && !Number.isFinite(q)) continue;                           // 빈 줄
          if (!key) continue;
          fmtCnt[f2 ? 2 : 1]++;
          id = s(r["주문번호"]) || `${s(r["수취인"])}|${s(r["주소"])}`;
          if (!(q > 0)) { zero++; continue; }                                   // 수량은 항상 수량 열 기준
          orders.add(id);
          const code = find(key);
          if (!code) { errors.add(key); continue; }
          const pv = prices[code];
          if (!pv || !(num(pv[1]) > 0)) { errors.add(`[판매가] ${code} | ${pv ? pv[0] : s((maps.options[key] || [])[1])}`); continue; }
          const price = num(pv[1]), total = price * q, P = SR(total / 1.1);
          const row = new Array(19).fill(null);
          row[0] = date; row[2] = set.거래처코드; row[4] = set.담당자; row[5] = set.출하창고;
          row[10] = /^[1-9]\d{8,}$/.test(code) ? Number(code) : code; row[11] = s(pv[0]) || s((maps.options[key] || [])[1]);
          row[12] = q; row[13] = price; row[15] = P; row[16] = total - P;
          out.push(row); sum += total; qtySum += q;
        }
      }
      if (unknownFile.length) throw new Error(`발주서 양식을 알 수 없습니다: ${unknownFile.join(", ")} (양식1: 옵션주문 열 / 양식2: 상품명·색상 열이 필요합니다)`);
      // 택배비: 주문 1건당 고정 금액(유료배송), 한 줄에 건수로 합산
      const fee = num(set["택배비 금액"]) || 3000, nShip = orders.size;
      if (nShip) {
        const total = fee * nShip, P = SR(total / 1.1), x = new Array(19).fill(null);
        x[0] = date; x[2] = set.거래처코드; x[4] = set.담당자; x[5] = set.출하창고; x[10] = set["택배비 품목코드"]; x[11] = set["택배비 품목명"];
        x[12] = nShip; x[13] = fee; x[15] = P; x[16] = total - P; out.push(x);
      }
      if (zero) notes.push(`수량이 0이거나 비어 있어 제외한 행 ${zero}건`);
      if (!set.거래처코드) warns.push({ text: "[설정]기본값의 거래처코드가 비어 있습니다. 입력한 뒤 다시 변환하세요.", ns: "settings", key: "거래처코드", label: "설정 열기" });
      const info = [`앱스토리몰 상품 ${out.length - (nShip ? 1 : 0)}행 (양식1 ${fmtCnt[1]}행 · 양식2 ${fmtCnt[2]}행) · 수량 ${qtySum}개 · 판매금액 ${sum.toLocaleString()}원 (부가세 포함)`,
        `택배비 ${nShip}건 × ${fee.toLocaleString()}원 = ${(fee * nShip).toLocaleString()}원`];
      return { headers: H, out, errors: [...errors], notes, warns, info, numFmt: { 10: "0" } };
    },
  });
})();
