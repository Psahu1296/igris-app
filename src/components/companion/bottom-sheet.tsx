import { X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { Meta, Title } from '@/components/typography';
import { Gutter, Palette, Space } from '@/constants/theme';

/** The sheet her memory and her diary open in: a title, a close button, and the content. */
export function BottomSheet({ title, error, onClose, children }: { title: string; error?: string | null; onClose: () => void; children: ReactNode }) {
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Title style={styles.title}>{title}</Title>
            <PressableScale onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close" style={styles.close}>
              <X size={16} color={Palette.text} />
            </PressableScale>
          </View>
          {error ? <Meta style={styles.error}>{error}</Meta> : null}
          {children}
        </View>
      </View>
    </Modal>
  );
}

export const sheetStyles = StyleSheet.create({
  list: { paddingHorizontal: Gutter, gap: Space.md, paddingBottom: Space.lg },
  empty: { alignItems: 'center', padding: Space.xl },
  emptyText: { textAlign: 'center', marginHorizontal: Space.xl, marginTop: Space.lg },
});

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(9, 8, 14, 0.6)' },
  sheet: {
    maxHeight: '75%',
    minHeight: '35%',
    backgroundColor: Palette.ground,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderColor: Palette.hairline,
    paddingBottom: Space.xl,
  },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Gutter, paddingVertical: Space.lg, gap: Space.sm },
  title: { flex: 1, fontSize: 20, lineHeight: 24 },
  close: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  error: { color: Palette.alert, textAlign: 'center', marginBottom: Space.sm },
});
