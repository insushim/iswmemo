/**
 * 실시간 변경신호 → 화면 refetch 연결.
 *
 * 서버(growthpad)가 다른 기기(스쿨데스크/웹)의 쓰기 성공 시 데이터 없는 Expo 푸시
 * {type:'sync', entity, origin} 을 보낸다. App.tsx 수신 리스너가 이 이벤트로 중계하고,
 * 각 화면은 useSyncRefresh 로 "포커스 중 + 관련 엔티티"일 때만 디바운스 refetch 한다.
 * (비포커스 화면은 기존 useFocusEffect 의 포커스 시 refetch 가 커버 — 중복 호출 없음)
 */
import { useEffect, useRef } from "react";
import { AppState, DeviceEventEmitter } from "react-native";
import { useIsFocused } from "@react-navigation/native";

export const SYNC_CHANGED_EVENT = "gp-sync-changed";

/** 서버 엔티티명(tasks|events|notes|habits|routines). */
export function emitSyncChanged(entity: string): void {
  DeviceEventEmitter.emit(SYNC_CHANGED_EVENT, entity);
}

const REFETCH_DEBOUNCE_MS = 800;

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
    const schedule = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        refetchRef.current();
      }, REFETCH_DEBOUNCE_MS);
    };
    const sub = DeviceEventEmitter.addListener(SYNC_CHANGED_EVENT, (entity: string) => {
      if (!entitiesRef.current.includes(entity)) return;
      if (focusedRef.current) schedule();
      else dirtyRef.current = true;
    });
    // 백그라운드에서는 데이터 푸시가 앱까지 오지 않을 수 있다 — 복귀 시 포커스 화면은
    // 신호 유무와 무관하게 1회 refetch(놓친 변경 흡수). 비포커스 화면은 비용 0.
    let appState = AppState.currentState;
    const appSub = AppState.addEventListener("change", (next) => {
      const wasBackground = appState.match(/inactive|background/);
      appState = next;
      if (wasBackground && next === "active" && focusedRef.current) schedule();
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
