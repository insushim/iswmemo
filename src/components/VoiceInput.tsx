import React, { useState, useEffect, useCallback } from "react";
import { TouchableOpacity, StyleSheet, Alert, Animated } from "react-native";
import { Mic, MicOff } from "lucide-react-native";

interface VoiceInputProps {
  onResult: (text: string) => void;
  color?: string;
  size?: number;
}

let _speechModule: any = null;
let _useSpeechEvent: (name: string, cb: Function) => void = (_n, _c) => {};
try {
  const pkg = require("expo-speech-recognition");
  _speechModule = pkg.ExpoSpeechRecognitionModule;
  _useSpeechEvent = pkg.useSpeechRecognitionEvent;
} catch {}

export default function VoiceInput({
  onResult,
  color = "#6366f1",
  size = 22,
}: VoiceInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [pulseAnim] = useState(new Animated.Value(1));

  _useSpeechEvent("result", (event: any) => {
    const transcript = event.results?.[0]?.transcript;
    if (transcript && event.isFinal) {
      onResult(transcript);
    }
  });
  _useSpeechEvent("end", () => {
    setIsListening(false);
  });
  _useSpeechEvent("error", (event: any) => {
    setIsListening(false);
    if (event.error !== "no-speech") {
      Alert.alert("음성 인식 오류", event.error || "알 수 없는 오류");
    }
  });

  useEffect(() => {
    if (isListening) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.3,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isListening]);

  const toggleListening = useCallback(async () => {
    if (!_speechModule) {
      Alert.alert(
        "알림",
        "음성 입력은 APK 빌드 후 사용할 수 있습니다.\n(Expo Go에서는 지원되지 않습니다)",
      );
      return;
    }

    if (isListening) {
      _speechModule.stop();
      setIsListening(false);
      return;
    }

    try {
      _speechModule.start({
        lang: "ko-KR",
        interimResults: false,
        continuous: false,
      });
      setIsListening(true);
    } catch (e: any) {
      Alert.alert("음성 인식 오류", e?.message || "시작할 수 없습니다.");
    }
  }, [isListening]);

  return (
    <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
      <TouchableOpacity
        style={[
          styles.btn,
          { backgroundColor: isListening ? "#ef4444" : color + "15" },
        ]}
        onPress={toggleListening}
        activeOpacity={0.5}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {isListening ? (
          <MicOff size={size} color="#fff" />
        ) : (
          <Mic size={size} color={color} />
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
});
