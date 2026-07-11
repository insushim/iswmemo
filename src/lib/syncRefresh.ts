/**
 * 실시간 변경신호 → 화면 refetch 연결.
 *
 * 서버(growthpad)가 다른 기기(스쿨데스크/웹)의 쓰기 성공 시 데이터 없는 Expo 푸시
 * {type:'sync', entity, origin} 을 보낸다. App.tsx 수신 리스너가 이 이벤트로 중계하고,
 * 각 화면은 useSyncRefresh 로 "포커스 중 + 관련 엔티티"일 때만 refetch 한다.
 * (비포커스 화면은 기존 useFocusEffect 의 포커스 시 refetch 가 커버 — 중복 호출 없음)
 *
 * 신호 유발 refetch 는 schedule-once 합류 창(20초): 첫 신호가 타이머를 걸고 창 안의
 * 후속 신호는 합류 — 푸시 폭주(대량 push) 시 refetch 횟수를 상한해 서버 무료 한도를
 * 아낀다(허용 지연 1~5분 — 2026-07-11 사용자 결정). 앱 복귀 시엔 사용자가 화면을 보고
 * 있으므로 1.5초로 빠르게 1회.
 */
import { useEffect, useRef } from "react";
import { AppState, DeviceEventEmitter } from "react-native";
import { useIsFocused } from "@react-navigation/native";

export const SYNC_CHANGED_EVENT = "gp-sync-changed";

/** 서버 엔티티명(tasks|events|notes|habits|routines). */
export function emitSyncChanged(entity: string): void {
  DeviceEventEmitter.emit(SYNC_CHANGED_EVENT, entity);
}

const SIGNAL_REFETCH_DELAY_MS = 20_000;
const RESUME_REFETCH_DELAY_MS = 1_500;

export function useSyncRefresh(entities: string[], refetch: () => void): void {
  const isFocused = useIsFocused();
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  const focusedRef = useRef(isFocused);
  focusedRef.current = isFocused;
  const entitiesRef = useRef(entities);
  entitiesRef.current = entities;
  // 비포커스 중 신호가 오면 기억해뒀다 포커스 복귀 시 refetch
  // (일부 화면은 hasLoadedRef 로 재포커스 fetch 를 생략하므로 여기서 커버)
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const fire = () => {
      timerRef.current = null;
      refetchRef.current();
    };
    const sub = DeviceEventEmitter.addListener(SYNC_CHANGED_EVENT, (entity: string) => {
      if (!entitiesRef.current.includes(entity)) return;
      if (!focusedRef.current) {
        dirtyRef.current = true;
        return;
      }
      // schedule-once: 창 내 후속 신호는 합류(타이머 연장 없음 → refetch 횟수 상한)
      if (!timerRef.current) timerRef.current = setTimeout(fire, SIGNAL_REFETCH_DELAY_MS);
    });
    // 백그라운드에서는 데이터 푸시가 앱까지 오지 않을 수 있다 — 복귀 시 포커스 화면은
    // 신호 유무와 무관하게 1회 refetch(놓친 변경 흡수). 비포커스 화면은 비용 0.
    let appState = AppState.currentState;
    const appSub = AppState.addEventListener("change", (next) => {
      const wasBackground = appState.match(/inactive|background/);
      appState = next;
      if (wasBackground && next === "active" && focusedRef.current) {
        // 복귀 직후엔 사용자가 화면을 보는 중 — 대기 중인 긴 창을 짧은 창으로 앞당김
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(fire, RESUME_REFETCH_DELAY_MS);
      }
    });
    return () => {
      sub.remove();
      appSub.remove();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (isFocused && dirtyRef.current) {
      dirtyRef.current = false;
      refetchRef.current();
    }
  }, [isFocused]);
}
