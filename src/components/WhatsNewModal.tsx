import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
} from "react-native";
import { Sparkles } from "lucide-react-native";
import { useTheme } from "../lib/theme";
import {
  getUnseenChangelog,
  markChangelogSeen,
  ChangelogEntry,
} from "../lib/whatsNew";

/**
 * 업데이트 후 첫 실행 때 "새로운 점"을 한 번 보여준다(스쿨데스크처럼).
 * 마지막으로 확인한 버전 이후의 변경사항만 모아 표시하고, 닫으면 확인 완료로 기록한다.
 */
export default function WhatsNewModal() {
  const { colors } = useTheme();
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const unseen = await getUnseenChangelog();
      if (alive && unseen.length > 0) {
        setEntries(unseen);
        setVisible(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const close = () => {
    setVisible(false);
    markChangelogSeen();
  };

  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={close}
    >
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.titleRow}>
            <Sparkles size={20} color={colors.primary} />
            <Text style={[styles.title, { color: colors.foreground }]}>
              업데이트 되었어요
            </Text>
          </View>
          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {entries.map((e) => (
              <View key={e.version} style={styles.entry}>
                <Text style={[styles.version, { color: colors.mutedForeground }]}>
                  v{e.version}
                </Text>
                {e.notes.map((n, i) => (
                  <View key={i} style={styles.noteRow}>
                    <View
                      style={[styles.dot, { backgroundColor: colors.primary }]}
                    />
                    <Text style={[styles.note, { color: colors.foreground }]}>
                      {n}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>
          <Pressable
            style={[styles.button, { backgroundColor: colors.primary }]}
            onPress={close}
          >
            <Text style={styles.buttonText}>확인</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 20,
    padding: 22,
    maxHeight: "80%",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  title: { fontSize: 18, fontWeight: "800" },
  body: { flexGrow: 0 },
  entry: { marginBottom: 14 },
  version: { fontSize: 12, fontWeight: "700", marginBottom: 6 },
  noteRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 7, marginRight: 8 },
  note: { flex: 1, fontSize: 14, lineHeight: 20 },
  button: {
    marginTop: 8,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
