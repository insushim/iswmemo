// 화면에 보이는 시계(1:29 처럼 분까지만)를 위한 **공유 티커**.
//
// 배터리 문제였던 것: GoalBanner 가 1초짜리 setInterval 을 돌리는데, 하단 탭이 화면을
// 언마운트하지 않아서 사용자가 탭 6개를 한 번씩 열면 **1초 타이머가 6개 동시에** 돌았다.
// 게다가 시계는 '분'까지만 표시하므로 초당 갱신은 59/60이 헛일이다.
// → 타이머는 앱 전체에 하나, 다음 '분'이 바뀌는 순간에만 깨어난다.
//
// ⚠️ 왜 "백그라운드에서 타이머를 멈추지" 않는가 (교차검증 지적 반영, 2026-07-14):
//    이 앱은 화면이 켜질 때마다 잠금화면 위로 자기 화면을 띄운다(핵심 기능). 그 전환 과정에서
//    AppState 의 'active' 이벤트가 한 번이라도 씹히면, 이벤트에만 의존해 재가동하는 구조는
//    **시계가 영영 멈춘 채로 잠금화면에 보이게 된다**(재부팅 전까지). 실제로 이 앱은 그
//    전환 구간의 race 로 여러 번 사고가 났었다.
//    → 타이머는 계속 돌린다. 대신 깨어나서 `AppState.currentState` 를 **직접 확인**하고,
//      앱이 안 보이면 아무것도 하지 않고 즉시 되돌아간다(화면 갱신·연산 0).
//      비용은 1분에 한 번 깨어나는 것뿐이고, 이벤트가 씹혀도 다음 분에 스스로 복구된다.

import { useEffect, useState } from "react";
import { AppState, AppStateStatus } from "react-native";

type Listener = (now: Date) => void;

const listeners = new Set<Listener>();
let timer: ReturnType<typeof setTimeout> | null = null;
let appStateSub: { remove: () => void } | null = null;

/** 다음 분 경계까지 남은 ms (+200ms 여유 — 경계 직전에 깨어나 같은 분을 두 번 그리는 것 방지) */
function msToNextMinute(): number {
  const now = new Date();
  return 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 200;
}

function emit(): void {
  const now = new Date();
  for (const fn of listeners) fn(now);
}

function tick(): void {
  // 앱이 화면에 보일 때만 갱신한다(안 보이면 렌더·연산 0). 상태는 이벤트가 아니라
  // 지금 값을 직접 확인 → 'active' 이벤트가 씹혀도 다음 분에 자동 복구된다.
  if (AppState.currentState === "active") emit();
  schedule();
}

function schedule(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(tick, msToNextMinute());
}

function onAppState(state: AppStateStatus): void {
  // 돌아오자마자 현재 시각으로 (멈춰 있던 동안 흐른 시간 반영). 타이머는 원래 돌고 있다.
  if (state === "active") emit();
}

function ensureRunning(): void {
  if (!appStateSub) appStateSub = AppState.addEventListener("change", onAppState);
  if (!timer) schedule();
}

function stopIfIdle(): void {
  if (listeners.size > 0) return;
  if (timer) clearTimeout(timer);
  timer = null;
  appStateSub?.remove();
  appStateSub = null;
}

/** 분이 바뀔 때만 리렌더되는 현재 시각. 타이머는 앱 전체에 하나만 돈다. */
export function useMinuteClock(): Date {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const listener: Listener = (d) => setNow(d);
    listeners.add(listener);
    ensureRunning();
    setNow(new Date()); // 마운트 즉시 최신값
    return () => {
      listeners.delete(listener);
      stopIfIdle();
    };
  }, []);

  return now;
}
