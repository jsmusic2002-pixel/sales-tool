# 매출 입력 변환 (서버 없는 웹앱)

GitHub Pages(화면) + Supabase(로그인·매핑 데이터). 서버를 켜둘 필요가 없고, 업로드한 주문 파일은 브라우저 안에서만 처리됩니다.

## 설치 (한 번만, 30분 정도)
1. **Supabase** 가입 → New project 생성 (리전은 Seoul 권장)
2. SQL Editor에서 `supabase_setup.sql` 실행 → 이어서 `seed_data.sql`(기존 DB 데이터) 실행
3. **Authentication → Sign In / Providers → "Allow new users to sign up" 끄기** ← 필수. 켜져 있으면 아무나 가입해서 데이터를 볼 수 있습니다.
4. Authentication → Users → Add user 로 직원 계정 생성 (Auto Confirm 체크). 아이디만 쓰려면 `아이디@company.local` 형태로 만들고 로그인 때는 `아이디`만 입력
5. `config.js`에 Project Settings → API 의 URL과 anon key 붙여넣기
6. GitHub 저장소(**Public**) 생성 → 이 폴더 파일을 업로드 → Settings → Pages → Branch: main 선택 → 안내되는 주소로 접속
   - 코드는 공개되지만 비밀 정보가 없습니다. 데이터는 로그인해야만 읽힙니다. `seed_data.sql`은 **저장소에 올리지 마세요.**

## 새 매출 프로그램 추가
1. `plugins/emp-ecount.js`를 복사해 `plugins/새이름.js` 작성 (id, 이름, 매핑 테이블 목록, `run()` 변환 함수)
2. `index.html`의 `<!-- ▼ -->` 구역에 `<script src="plugins/새이름.js"></script>` 한 줄 추가
3. 사이드바 메뉴·매핑 관리 화면이 자동으로 생기고, 매핑 데이터는 같은 DB 테이블에 `프로그램id/테이블` 이름으로 저장됩니다. DB 변경은 필요 없습니다.

## 운영 메모
- Supabase 무료 플랜은 **7일간 접속이 없으면 프로젝트가 일시중지**됩니다(대시보드에서 수동 복구). 매일 쓰면 해당 없음.
- 백업: 각 매핑 화면 데이터는 Supabase Table Editor → lookup → Export 로 내려받을 수 있습니다.
- 비밀번호 변경·계정 중지는 Supabase 대시보드 Authentication 메뉴에서 합니다.
