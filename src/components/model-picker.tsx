import * as Haptics from 'expo-haptics';
import { Check, ChevronDown, ChevronUp, Cpu } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Meta } from '@/components/typography';
import { Font, Palette, Space, Type } from '@/constants/theme';
import type { Lane } from '@/lib/config';
import { fits, ROLE_ORDER, useLocalModels, type ModelRole, type ModelsView } from '@/lib/models';

/**
 * The Mac's model per role, under the lane rows. One role open at a time: six models
 * for two roles would push the card off a small screen. The menu stays open after a
 * pick, so chat and photos can both be changed in one visit.
 */
export function ModelPicker({ lane, active }: { lane: Lane; active: boolean }) {
  const { view, error, busy, choose } = useLocalModels(lane, active);
  const [open, setOpen] = useState<ModelRole | null>(null);

  const pick = (role: ModelRole, model: string | null) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setOpen(null);
    void choose(role, model);
  };

  return (
    <View style={styles.section}>
      <Meta style={styles.heading}>MODEL ON THE MAC</Meta>
      <Meta style={styles.note}>Yours only · demo logins keep the default</Meta>

      {!view && !error ? <ActivityIndicator size="small" color={Palette.faint} style={styles.loading} /> : null}

      {view
        ? // A maestro from before a role existed does not list it.
          ROLE_ORDER.filter((role) => view.roles[role]).map((role) => (
            <RoleRow
              key={role}
              role={role}
              view={view}
              open={open === role}
              busy={busy === role}
              onToggle={() => setOpen(open === role ? null : role)}
              onPick={(model) => pick(role, model)}
            />
          ))
        : null}

      {error ? <Meta style={styles.error}>{error}</Meta> : null}
    </View>
  );
}

function RoleRow({
  role,
  view,
  open,
  busy,
  onToggle,
  onPick,
}: {
  role: ModelRole;
  view: ModelsView;
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onPick: (model: string | null) => void;
}) {
  const r = view.roles[role];
  const Chevron = open ? ChevronUp : ChevronDown;
  // The default for chat also names the cloud voice, since that is what speaks then;
  // a picked chat model speaks for itself (maestro overrides the persona with it).
  const defaultHint =
    role === 'chat' && view.default_voice ? `${r.default} · voice ${view.default_voice}` : r.default;

  return (
    <View>
      <Pressable
        onPress={onToggle}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={`${r.label} model: ${r.current}`}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
        <Cpu size={14} color={r.chosen ? Palette.local : Palette.muted} />
        <View style={styles.rowText}>
          <Meta style={styles.label}>{r.label}</Meta>
          <Meta style={styles.hint}>{r.chosen ? r.current : `Default · ${defaultHint}`}</Meta>
        </View>
        {busy ? <ActivityIndicator size="small" color={Palette.local} /> : <Chevron size={14} color={Palette.faint} />}
      </Pressable>

      {open ? (
        <ScrollView style={styles.list} nestedScrollEnabled>
          <Option label="Default" hint={defaultHint} selected={!r.chosen} onPress={() => onPick(null)} />
          {view.models
            .filter((m) => fits(m, r))
            .map((m) => (
              <Option
                key={m.name}
                label={m.name}
                hint={[
                  `${m.params} · ${m.size_gb} GB`,
                  m.uncensored ? 'uncensored' : '',
                  m.heavy ? 'too big, will swap' : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
                warn={m.heavy || m.uncensored}
                selected={r.chosen && r.current === m.name}
                onPress={() => onPick(m.name)}
              />
            ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

function Option({
  label,
  hint,
  selected,
  warn = false,
  onPress,
}: {
  label: string;
  hint: string;
  selected: boolean;
  warn?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}. ${hint}`}
      style={({ pressed }) => [styles.option, selected && styles.rowSelected, pressed && styles.rowPressed]}>
      <View style={styles.rowText}>
        <Meta style={[styles.label, selected && { color: Palette.local }]}>{label}</Meta>
        <Meta style={[styles.hint, warn && { color: Palette.alert }]}>{hint}</Meta>
      </View>
      {selected ? <Check size={14} color={Palette.local} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: Space.xs,
    paddingTop: Space.sm,
    borderTopWidth: 1,
    borderTopColor: Palette.hairline,
  },
  heading: {
    color: Palette.faint,
    fontFamily: Font.uiMedium,
    ...Type.micro,
    letterSpacing: 0.8,
    paddingHorizontal: Space.md + 2,
  },
  note: {
    color: Palette.faint,
    fontFamily: Font.ui,
    ...Type.micro,
    paddingHorizontal: Space.md + 2,
    paddingBottom: Space.xs,
  },
  loading: { paddingVertical: Space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.md + 2,
    paddingVertical: Space.sm + 2,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    // Indented under its role's icon, so the list reads as belonging to the row above.
    paddingLeft: Space.md + 2 + 14 + Space.md,
    paddingRight: Space.md + 2,
    paddingVertical: Space.sm,
  },
  // Six models fit on a large phone; the cap keeps the card on screen on a small one.
  list: { maxHeight: 260 },
  rowSelected: { backgroundColor: Palette.surfaceGlass },
  rowPressed: { backgroundColor: Palette.surfaceGlassHover },
  rowText: { flex: 1, gap: 1 },
  label: { color: Palette.text, fontFamily: Font.uiMedium, ...Type.small },
  hint: { color: Palette.faint, fontFamily: Font.ui, ...Type.micro },
  error: {
    color: Palette.alert,
    fontFamily: Font.ui,
    ...Type.micro,
    paddingHorizontal: Space.md + 2,
    paddingVertical: Space.xs + 2,
  },
});
