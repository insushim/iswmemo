import React, { useState, useEffect, useRef } from 'react';
import { TouchableOpacity, StyleSheet, Alert, Animated } from 'react-native';
import { Mic, MicOff } from 'lucide-react-native';

interface VoiceInputProps {
  onResult: (text: string) => void;
  color?: string;
  size?: number;
}

// Lazy load the module - safe for Expo Go
let _speechModule: any = undefined;
let _loaded = false;
function getSpeechModule() {
  if (_loaded) return _speechModule;
  _loaded = true;
  try {
    _speechModule = require('expo-speech-recognition').ExpoSpeechRecognitionModule;
  } catch {
    _speechModule = null;
  }
  return _speechModule;
}

export default function VoiceInput({ onResult, color = '#6366f1', size = 22 }: VoiceInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [pulseAnim] = useState(new Animated.Value(1));
  const subscriptionsRef = useRef<any[]>([]);

  useEffect(() => {
    if (isListening) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isListening]);

  // Cleanup listeners on unmount
  useEffect(() => {
    return () => {
      subscriptionsRef.current.forEach(sub => sub?.remove?.());
      subscriptionsRef.current = [];
    };
  }, []);

  const toggleListening = async () => {
    const mod = getSpeechModule();
    if (!mod) {
      Alert.alert('알림', '음성 입력은 APK 빌드 후 사용할 수 있습니다.\n(Expo Go에서는 지원되지 않습니다)');
      return;
    }

    if (isListening) {
      mod.stop();
      setIsListening(false);
      subscriptionsRef.current.forEach(sub => sub?.remove?.());
      subscriptionsRef.current = [];
      return;
    }

    const result = await mod.requestPermissionsAsync();
    if (!result.granted) {
      Alert.alert('권한 필요', '음성 입력을 사용하려면 마이크 권한이 필요합니다.');
      return;
    }

    try {
      // Clean old listeners
      subscriptionsRef.current.forEach(sub => sub?.remove?.());
      subscriptionsRef.current = [];

      // Add event listeners - isFinal만 사용하여 중복 방지
      const resultSub = mod.addListener?.('result', (event: any) => {
        const transcript = event.results?.[0]?.transcript;
        if (transcript && event.isFinal) {
          onResult(transcript);
        }
      });
      const endSub = mod.addListener?.('end', () => setIsListening(false));
      const errorSub = mod.addListener?.('error', (event: any) => {
        setIsListening(false);
        if (event.error !== 'no-speech') console.log('Speech error:', event.error);
      });

      subscriptionsRef.current = [resultSub, endSub, errorSub].filter(Boolean);

      mod.start({ lang: 'ko-KR', interimResults: false, continuous: false });
      setIsListening(true);
    } catch (e) {
      Alert.alert('오류', '음성 인식을 시작할 수 없습니다.');
    }
  };

  return (
    <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
      <TouchableOpacity
        style={[styles.btn, { backgroundColor: isListening ? '#ef4444' : color + '15' }]}
        onPress={toggleListening}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {isListening ? <MicOff size={size} color="#fff" /> : <Mic size={size} color={color} />}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  btn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
});
