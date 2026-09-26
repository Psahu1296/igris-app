import { StyleSheet } from 'react-native';

import { Font, Palette, Space } from '@/constants/theme';

/** The bordered card most turn cards share (call, reply, bill, messages) and its rows. */
export const shared = StyleSheet.create({
  callCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: Space.md,
    gap: Space.sm,
  },
  callPrompt: {
    color: Palette.muted,
    fontSize: 12,
  },
  callRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  callWho: {
    flex: 1,
  },
  callName: {
    fontFamily: Font.voiceMedium,
    color: Palette.text,
    fontSize: 16,
  },
  callNumber: {
    color: Palette.muted,
    fontSize: 12,
  },
  callButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callCancel: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingVertical: 2,
  },
  actionText: {
    color: Palette.muted,
    fontSize: 11,
    fontFamily: Font.uiMedium,
  },
  chatHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  chatTitle: {
    flexShrink: 1,
    fontFamily: Font.voiceMedium,
    color: Palette.text,
    fontSize: 14,
  },
});
