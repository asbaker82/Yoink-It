import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { CREAM, INK, MUTE, TANGERINE } from '@/constants/theme';

interface Props {
  visible: boolean;
  deadlineDate: Date | null;
  onComplete: () => void;
  /** Owner's first name; with `onTextOwner`, adds a "Text {name}" button to arrange pickup. */
  ownerFirstName?: string;
  onTextOwner?: () => void;
}

function formatDeadline(date: Date): string {
  const diffMs = date.getTime() - Date.now();
  const diffH  = Math.ceil(diffMs / 3600000);
  const time   = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const day    = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  if (diffH <= 24) return `by ${time} today (${diffH}h)`;
  return `by ${time} on ${day}`;
}

export default function ClaimToast({ visible, deadlineDate, onComplete, ownerFirstName, onTextOwner }: Props) {
  const canText = !!onTextOwner;
  const translateY = useRef(new Animated.Value(80)).current;
  const opacity    = useRef(new Animated.Value(0)).current;
  const iconScale  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;

    translateY.setValue(80);
    opacity.setValue(0);
    iconScale.setValue(0);

    Animated.sequence([
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, tension: 80, friction: 8, useNativeDriver: true }),
        Animated.timing(opacity,    { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(150),
          Animated.spring(iconScale, { toValue: 1, tension: 120, friction: 5, useNativeDriver: true }),
        ]),
      ]),
      // Stay up longer when there's a button to tap.
      Animated.delay(canText ? 7000 : 2600),
      Animated.parallel([
        Animated.timing(translateY, { toValue: 80, duration: 300, useNativeDriver: true }),
        Animated.timing(opacity,    { toValue: 0,  duration: 300, useNativeDriver: true }),
      ]),
    ]).start(({ finished }) => { if (finished) onComplete(); });
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.toast, { opacity, transform: [{ translateY }] }]} pointerEvents={canText ? 'auto' : 'none'}>
      <Animated.View style={[styles.iconWrap, { transform: [{ scale: iconScale }] }]}>
        <FontAwesome name="check" size={18} color={CREAM} />
      </Animated.View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>Item Claimed!</Text>
        <Text style={styles.sub}>
          {deadlineDate ? `Pick up ${formatDeadline(deadlineDate)}` : 'Arrange pickup with the owner.'}
        </Text>
      </View>
      {canText && (
        <Pressable style={styles.textBtn} onPress={() => { onComplete(); onTextOwner!(); }}>
          <FontAwesome name="comment" size={12} color={CREAM} />
          <Text style={styles.textBtnLabel}>Text {ownerFirstName ?? 'owner'}</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: INK,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
    shadowColor: INK,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 100,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: TANGERINE,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: TANGERINE,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexShrink: 0,
  },
  textBtnLabel: { fontSize: 12, fontWeight: '700', color: CREAM },
  title: { fontSize: 15, fontWeight: '700', color: CREAM },
  sub:   { fontSize: 12, color: MUTE, marginTop: 2 },
});
