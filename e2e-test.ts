import { chromium } from '@playwright/test';

const BASE_URL = 'https://growthpad.vercel.app';

interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  error?: string;
}

async function runFullTest() {
  console.log('='.repeat(60));
  console.log('GrowthPad 전체 기능 테스트');
  console.log('='.repeat(60));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const results: TestResult[] = [];
  const serverErrors: string[] = [];

  // 서버 에러 수집
  page.on('response', response => {
    if (response.status() >= 500) {
      serverErrors.push(`${response.status()}: ${response.url()}`);
    }
  });

  const testEmail = `e2etest${Date.now()}@test.com`;
  const testPassword = 'TestPassword123!';

  // ============================================
  // 1. 회원가입 테스트
  // ============================================
  console.log('\n[1/10] 회원가입 테스트...');
  try {
    await page.goto(`${BASE_URL}/register`, { waitUntil: 'networkidle', timeout: 30000 });

    await page.fill('#name', 'E2E테스트');
    await page.fill('#email', testEmail);
    await page.fill('#password', testPassword);
    await page.fill('#confirmPassword', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(4000);

    const url = page.url();
    if (url.includes('/login')) {
      results.push({ name: '회원가입', status: 'pass' });
      console.log('  ✅ 회원가입 성공');
    } else {
      results.push({ name: '회원가입', status: 'fail', error: `Unexpected URL: ${url}` });
      console.log('  ❌ 회원가입 실패');
    }
  } catch (e: any) {
    results.push({ name: '회원가입', status: 'fail', error: e.message });
    console.log(`  ❌ ${e.message}`);
  }

  // ============================================
  // 2. 로그인 테스트
  // ============================================
  console.log('\n[2/10] 로그인 테스트...');
  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('#email', testEmail);
    await page.fill('#password', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(4000);

    // 대시보드로 이동 확인
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
    const dashText = await page.textContent('body');

    if (dashText?.includes('E2E테스트') || dashText?.includes('좋은')) {
      results.push({ name: '로그인', status: 'pass' });
      console.log('  ✅ 로그인 성공');
    } else if (dashText?.includes('Application error')) {
      results.push({ name: '로그인', status: 'fail', error: '서버 에러' });
      console.log('  ❌ 서버 에러');
    } else {
      results.push({ name: '로그인', status: 'warn', error: '로그인 상태 불확실' });
      console.log('  ⚠️ 로그인 상태 불확실');
    }
  } catch (e: any) {
    results.push({ name: '로그인', status: 'fail', error: e.message });
    console.log(`  ❌ ${e.message}`);
  }

  // ============================================
  // 3. 대시보드 테스트
  // ============================================
  console.log('\n[3/10] 대시보드 테스트...');
  try {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
    const body = await page.textContent('body');

    if (body?.includes('Application error')) {
      results.push({ name: '대시보드', status: 'fail', error: '서버 에러' });
      console.log('  ❌ 서버 에러');
    } else if (body?.includes('오늘 할 일') || body?.includes('최근 메모')) {
      results.push({ name: '대시보드', status: 'pass' });
      console.log('  ✅ 대시보드 정상');
    } else {
      results.push({ name: '대시보드', status: 'warn', error: '예상치 못한 콘텐츠' });
      console.log('  ⚠️ 예상치 못한 콘텐츠');
    }
  } catch (e: any) {
    results.push({ name: '대시보드', status: 'fail', error: e.message });
    console.log(`  ❌ ${e.message}`);
  }

  // ============================================
  // 4. 할일 CRUD 테스트
  // ============================================
  console.log('\n[4/10] 할일 CRUD 테스트...');
  try {
    await page.goto(`${BASE_URL}/tasks`, { waitUntil: 'networkidle' });

    // 할일 추가 버튼 클릭
    const addBtn = page.locator('button:has-text("할 일 추가")');
    await addBtn.click();
    await page.waitForTimeout(1000);

    // 할일 입력
    const taskInput = page.locator('input').first();
    await taskInput.fill('E2E 테스트 할일');

    // 제출
    await page.locator('button:has-text("할 일 추가")').last().click();
    await page.waitForTimeout(3000);

    // 확인
    const body = await page.textContent('body');
    if (body?.includes('Application error')) {
      results.push({ name: '할일 추가', status: 'fail', error: '서버 에러' });
      console.log('  ❌ 할일 추가 서버 에러');
    } else if (body?.includes('E2E 테스트 할일')) {
      results.push({ name: '할일 추가', status: 'pass' });
      console.log('  ✅ 할일 추가 성공');
    } else {
      results.push({ name: '할일 추가', status: 'warn', error: '할일이 목록에 없음' });
      console.log('  ⚠️ 할일이 목록에 표시되지 않음');
    }
  } catch (e: any) {
    results.push({ name: '할일 추가', status: 'fail', error: e.message });
    console.log(`  ❌ ${e.message}`);
  }

  // ============================================
  // 5. 메모 CRUD 테스트
  // ============================================
  console.log('\n[5/10] 메모 CRUD 테스트...');
  try {
    await page.goto(`${BASE_URL}/notes`, { waitUntil: 'networkidle' });

    // 새 메모 버튼 클릭
    const addNoteBtn = page.locator('button:has-text("새 메모")');
    if (await addNoteBtn.isVisible()) {
      await addNoteBtn.click();
      await page.waitForTimeout(1000);

      // 제목/내용 입력
      await page.locator('input').first().fill('E2E 테스트 메모');
      await page.locator('textarea').first().fill('테스트 메모 내용입니다.');

      // 저장
      await page.locator('button:has-text("저장")').click();
      await page.waitForTimeout(3000);

      const body = await page.textContent('body');
      if (body?.includes('Application error')) {
        results.push({ name: '메모 추가', status: 'fail', error: '서버 에러' });
        console.log('  ❌ 메모 추가 서버 에러');
      } else {
        results.push({ name: '메모 추가', status: 'pass' });
        console.log('  ✅ 메모 추가 성공');
      }
    } else {
      results.push({ name: '메모 추가', status: 'warn', error: '새 메모 버튼 없음' });
      console.log('  ⚠️ 새 메모 버튼을 찾을 수 없음');
    }
  } catch (e: any) {
    results.push({ name: '메모 추가', status: 'fail', error: e.message });
    console.log(`  ❌ ${e.message}`);
  }

  // ============================================
  // 6. 습관 페이지 테스트
  // ============================================
  console.log('\n[6/10] 습관 페이지 테스트...');
  try {
    await page.goto(`${BASE_URL}/habits`, { waitUntil: 'networkidle' });
    const body = await page.textContent('body');

    if (body?.includes('Application error')) {
      results.push({ name: '습관 페이지', status: 'fail', error: '서버 에러' });
      console.log('  ❌ 서버 에러');
    } else {
      results.push({ name: '습관 페이지', status: 'pass' });
      console.log('  ✅ 습관 페이지 정상');
    }
  } catch (e: any) {
    results.push({ name: '습관 페이지', status: 'fail', error: e.message });
    console.log(`  ❌ ${e.message}`);
  }

  // ============================================
  // 7. 목표 페이지 테스트
  // ============================================
  console.log('\n[7/10] 목표 페이지 테스트...');
  try {
    await page.goto(`${BASE_URL}/goals`, { waitUntil: 'networkidle' });
    const body = await page.textContent('body');

    if (body?.includes('Application error')) {
      results.push({ name: '목표 페이지', status: 'fail', error: '서버 에러' });
      console.log('  ❌ 서버 에러');
    } else {
      results.push({ name: '목표 페이지', status: 'pass' });
      console.log('  ✅ 목표 페이지 정상');
    }
  } catch (e: any) {
    results.push({ name: '목표 페이지', status: 'fail', error: e.message });
    console.log(`  ❌ ${e.message}`);
  }

  // ============================================
  // 8. 캘린더 페이지 테스트
  // ============================================
  console.log('\n[8/10] 캘린더 페이지 테스트...');
  try {
    await page.goto(`${BASE_URL}/calendar`, { waitUntil: 'networkidle' });
    const body = await page.textContent('body');

    if (body?.includes('Application error')) {
      results.push({ name: '캘린더 페이지', status: 'fail', error: '서버 에러' });
      console.log('  ❌ 서버 에러');
    } else {
      results.push({ name: '캘린더 페이지', status: 'pass' });
      console.log('  ✅ 캘린더 페이지 정상');
    }
  } catch (e: any) {
    results.push({ name: '캘린더 페이지', status: 'fail', error: e.message });
    console.log(`  ❌ ${e.message}`);
  }

  // ============================================
  // 9. 통계 페이지 테스트
  // ============================================
  console.log('\n[9/10] 통계 페이지 테스트...');
  try {
    await page.goto(`${BASE_URL}/stats`, { waitUntil: 'networkidle' });
    const body = await page.textContent('body');

    if (body?.includes('Application error')) {
      results.push({ name: '통계 페이지', status: 'fail', error: '서버 에러' });
      console.log('  ❌ 서버 에러');
    } else {
      results.push({ name: '통계 페이지', status: 'pass' });
      console.log('  ✅ 통계 페이지 정상');
    }
  } catch (e: any) {
    results.push({ name: '통계 페이지', status: 'fail', error: e.message });
    console.log(`  ❌ ${e.message}`);
  }

  // ============================================
  // 10. 설정 페이지 테스트
  // ============================================
  console.log('\n[10/10] 설정 페이지 테스트...');
  try {
    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'networkidle' });
    const body = await page.textContent('body');

    if (body?.includes('Application error')) {
      results.push({ name: '설정 페이지', status: 'fail', error: '서버 에러' });
      console.log('  ❌ 서버 에러');
    } else {
      results.push({ name: '설정 페이지', status: 'pass' });
      console.log('  ✅ 설정 페이지 정상');
    }
  } catch (e: any) {
    results.push({ name: '설정 페이지', status: 'fail', error: e.message });
    console.log(`  ❌ ${e.message}`);
  }

  await browser.close();

  // ============================================
  // 결과 요약
  // ============================================
  console.log('\n' + '='.repeat(60));
  console.log('테스트 결과 요약');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const warned = results.filter(r => r.status === 'warn').length;

  console.log(`\n총 ${results.length}개 테스트`);
  console.log(`  ✅ 통과: ${passed}개`);
  console.log(`  ❌ 실패: ${failed}개`);
  console.log(`  ⚠️ 경고: ${warned}개`);

  if (failed > 0) {
    console.log('\n실패한 테스트:');
    results.filter(r => r.status === 'fail').forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
  }

  if (serverErrors.length > 0) {
    console.log('\n서버 에러 목록:');
    [...new Set(serverErrors)].forEach(e => console.log(`  - ${e}`));
  }

  console.log('\n' + '='.repeat(60));

  return { results, serverErrors };
}

runFullTest().catch(console.error);
