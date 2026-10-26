import { router } from 'expo-router';
import { Camera, Hammer, ImagePlus, Pencil, Share2, Trash2, X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { PressableScale } from '@/components/pressable-scale';
import { Answer, Meta, Title } from '@/components/typography';
import { Font, Gutter, laneColor, Palette, Space } from '@/constants/theme';
import { pickPhoto } from '@/lib/photo';
import { fromFeet, isBusy, rupees, toFeet, type NewPhoto, type RenovationPlan, type Room } from '@/lib/renovate';
import { useRenovation } from '@/lib/use-renovation';
import { useSession } from '@/state/session';

/**
 * Renovation planner (maestro renovate/): his layout sketch and room photos in, a costed
 * plan page out. Three steps on one screen: a new plan, the rooms to confirm, the result.
 * Layout only; the behaviour is `useRenovation`.
 */
export default function Renovate() {
  const { lane, lanePref } = useSession();
  const accent = laneColor(lanePref);
  const r = useRenovation(lane);
  const waiting = r.plans.find((p) => p.status === 'needs_confirm');

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerTitleGroup}>
          <Hammer size={20} color={accent} />
          <Title style={styles.headerTitle}>Renovation</Title>
        </View>
        <PressableScale onPress={() => router.back()} hitSlop={12} accessibilityRole="button"
          accessibilityLabel="Close" style={styles.close}>
          <X size={18} color={Palette.text} />
        </PressableScale>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {r.error ? <Answer style={styles.error}>{r.error}</Answer> : null}
        {/* Keyed by plan: a new plan waiting for its rooms starts a fresh form. */}
        {waiting ? <RoomsForm key={waiting.id} plan={waiting} busy={r.busy} accent={accent}
          onSend={(id, rooms) => r.confirm(id, rooms)} /> : null}
        <NewPlan busy={r.busy} accent={accent} onStart={r.start} />
        {r.loading ? <ActivityIndicator color={accent} /> : null}
        {r.plans.filter((p) => p.status !== 'needs_confirm').map((p) => (
          <PlanCard key={p.id} plan={p} accent={accent} busy={r.busy} onOpen={() => void r.open(p.id)}
            onShare={() => r.share(p.id)} onCorrect={r.correct} />
        ))}
      </ScrollView>
      {r.page ? <PlanPage html={r.page} onClose={r.close} /> : null}
    </SafeAreaView>
  );
}

/** The finished plan, inside the app. The page is maestro's own (renovate/doc.py, photos inlined),
 * so it needs no network; its rate-source links open in the browser (public sites, unlike the Mac). */
function PlanPage({ html, onClose }: { html: string; onClose: () => void }) {
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Title style={styles.headerTitle}>Your plan</Title>
          <PressableScale onPress={onClose} hitSlop={12} accessibilityRole="button"
            accessibilityLabel="Close the plan" style={styles.close}>
            <X size={18} color={Palette.text} />
          </PressableScale>
        </View>
        <WebView source={{ html }} originWhitelist={['about:*']} style={styles.page}
          onShouldStartLoadWithRequest={(req) => {
            if (req.url.startsWith('about:')) return true;
            if (/^https?:/.test(req.url)) void Linking.openURL(req.url);
            return false;
          }} />
      </SafeAreaView>
    </Modal>
  );
}

function NewPlan({ busy, accent, onStart }: {
  busy: boolean; accent: string; onStart: (message: string, sketch: string, photos: NewPhoto[]) => Promise<unknown>;
}) {
  const [message, setMessage] = useState('');
  const [sketch, setSketch] = useState<{ base64: string; uri: string } | null>(null);
  const [photos, setPhotos] = useState<NewPhoto[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  const pick = async (source: 'camera' | 'library', then: (p: { base64: string; uri: string }) => void) => {
    try {
      const photo = await pickPhoto(source);
      if (photo) then(photo);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    }
  };
  const update = (i: number, change: Partial<NewPhoto>) =>
    setPhotos((list) => list.map((p, j) => (j === i ? { ...p, ...change } : p)));

  const submit = async () => {
    if (!sketch) return setProblem('Add a photo of your layout sketch first.');
    if (photos.some((p) => !p.room.trim())) return setProblem('Say which room each photo shows.');
    setProblem(null);
    await onStart(message.trim(), sketch.base64, photos);
    setMessage('');
    setSketch(null);
    setPhotos([]);
  };

  return (
    <View style={styles.section}>
      <Meta style={styles.sectionTitle}>NEW PLAN</Meta>
      <TextInput value={message} onChangeText={setMessage} multiline placeholder={
        'What you want, your style and budget — e.g. "make my room and the free area one, with a bathroom and wardrobe; keep the hallway; modern, under 3 lakh"'}
        placeholderTextColor={Palette.faint} style={styles.input} />

      <Meta style={styles.label}>Layout sketch (sizes written on it)</Meta>
      {sketch ? (
        <View style={styles.photoRow}>
          <Image source={{ uri: sketch.uri }} style={styles.thumb} />
          <PressableScale onPress={() => setSketch(null)} accessibilityLabel="Remove the sketch" style={styles.iconButton}>
            <Trash2 size={16} color={Palette.muted} />
          </PressableScale>
        </View>
      ) : (
        <View style={styles.row}>
          <SmallButton icon={<Camera size={16} color={Palette.text} />} text="Camera" onPress={() => void pick('camera', setSketch)} />
          <SmallButton icon={<ImagePlus size={16} color={Palette.text} />} text="Gallery" onPress={() => void pick('library', setSketch)} />
        </View>
      )}

      <Meta style={styles.label}>Room photos (wide, from the door)</Meta>
      {photos.map((p, i) => (
        <View key={p.uri} style={styles.photoBlock}>
          <View style={styles.photoRow}>
            <Image source={{ uri: p.uri }} style={styles.thumb} />
            <TextInput value={p.room} onChangeText={(room) => update(i, { room })} placeholder="Which room?"
              placeholderTextColor={Palette.faint} style={[styles.input, styles.roomInput]} />
            <PressableScale onPress={() => setPhotos((list) => list.filter((_, j) => j !== i))}
              accessibilityLabel="Remove this photo" style={styles.iconButton}>
              <Trash2 size={16} color={Palette.muted} />
            </PressableScale>
          </View>
          {/* Only a photo he marks this way is redrawn as an "after" picture: the vision model's own
              check missed a person asleep under a net. */}
          <View style={styles.switchRow}>
            <Switch value={p.empty} onValueChange={(empty) => update(i, { empty })} trackColor={{ true: accent }} />
            <Meta style={styles.switchText}>No one in this photo (needed for its &quot;after&quot; picture)</Meta>
          </View>
        </View>
      ))}
      <View style={styles.row}>
        <SmallButton icon={<Camera size={16} color={Palette.text} />} text="Add photo"
          onPress={() => void pick('camera', (ph) => setPhotos((l) => [...l, { ...ph, room: '', empty: false }]))} />
        <SmallButton icon={<ImagePlus size={16} color={Palette.text} />} text="From gallery"
          onPress={() => void pick('library', (ph) => setPhotos((l) => [...l, { ...ph, room: '', empty: false }]))} />
      </View>

      {problem ? <Meta style={styles.problem}>{problem}</Meta> : null}
      <PressableScale onPress={() => void submit()} disabled={busy} accessibilityRole="button"
        style={[styles.primary, { borderColor: accent }]}>
        <Text style={styles.primaryText}>{busy ? 'Sending…' : 'Plan it'}</Text>
      </PressableScale>
    </View>
  );
}

/** His rooms, to confirm before the first plan — or, with `correcting`, to fix with a note on a
 * finished one, so it is planned again. */
function RoomsForm({ plan, busy, accent, onSend, correcting, onCancel }: {
  plan: RenovationPlan; busy: boolean; accent: string; onSend: (id: string, rooms: Room[], note: string) => Promise<unknown>;
  correcting?: boolean; onCancel?: () => void;
}) {
  const [unit, setUnit] = useState<'m' | 'ft'>('m');
  type Draft = { name: string; length: string; width: string; height: string };
  const fromPlan = (u: 'm' | 'ft'): Draft[] =>
    plan.rooms.map((room) => ({ name: room.name, length: fromFeet(room.length, u), width: fromFeet(room.width, u),
      height: fromFeet(room.height, u) }));
  const [rooms, setRooms] = useState<Draft[]>(() => fromPlan('m'));
  const [note, setNote] = useState('');

  const set = (i: number, change: Partial<Draft>) => setRooms((list) => list.map((d, j) => (j === i ? { ...d, ...change } : d)));
  const send = () =>
    onSend(plan.id, rooms.map((d) => ({ name: d.name.trim(), length: toFeet(d.length, unit), width: toFeet(d.width, unit),
      height: d.height ? toFeet(d.height, unit) : 10 })), note.trim());

  return (
    <View style={[styles.section, !correcting && styles.card]}>
      {correcting ? (
        <>
          <Meta style={styles.sectionTitle}>CORRECT THE PLAN</Meta>
          <Answer style={styles.lede}>
            Say what is wrong or what to change, in your words: &quot;no false ceiling&quot;, &quot;budget bathroom&quot;,
            &quot;the wall to break is 10 ft&quot;, &quot;make it 4 lakh&quot;. Fix sizes below. It is planned again.
          </Answer>
          {plan.corrections?.length ? (
            <Meta style={styles.switchText}>Already asked: {plan.corrections.join(' · ')}</Meta>
          ) : null}
          {plan.notes?.length ? <Meta style={styles.label}>What Igris assumed</Meta> : null}
          {plan.notes?.map((n) => <Meta key={n} style={styles.switchText}>• {n}</Meta>)}
          <TextInput value={note} onChangeText={setNote} placeholder="What to change" multiline
            placeholderTextColor={Palette.faint} style={[styles.input, styles.note]} />
          <Meta style={styles.label}>Rooms</Meta>
        </>
      ) : (
        <>
          <Meta style={styles.sectionTitle}>CHECK THE ROOMS IGRIS READ</Meta>
          <Answer style={styles.lede}>Fix any name or size, add what is missing, then confirm. Nothing is planned before this.</Answer>
        </>
      )}
      {plan.problems.map((p) => <Meta key={p} style={styles.problem}>• {p}</Meta>)}
      <View style={styles.row}>
        {(['m', 'ft'] as const).map((u) => (
          <PressableScale key={u} onPress={() => { setUnit(u); setRooms(rooms.map((d) => ({ ...d,
            length: fromFeet(toFeet(d.length, unit) || 0, u), width: fromFeet(toFeet(d.width, unit) || 0, u),
            height: fromFeet(toFeet(d.height, unit) || 0, u) }))); }}
            style={[styles.chip, unit === u && { borderColor: accent }]}>
            <Meta style={styles.chipText}>{u === 'm' ? 'metres' : 'feet'}</Meta>
          </PressableScale>
        ))}
      </View>
      {rooms.map((d, i) => (
        <View key={i} style={styles.roomRow}>
          <TextInput value={d.name} onChangeText={(name) => set(i, { name })} placeholder="Room"
            placeholderTextColor={Palette.faint} style={[styles.input, styles.roomName]} />
          {(['length', 'width', 'height'] as const).map((k) => (
            <TextInput key={k} value={d[k]} onChangeText={(v) => set(i, { [k]: v })} placeholder={k[0].toUpperCase()}
              keyboardType="decimal-pad" placeholderTextColor={Palette.faint} style={[styles.input, styles.size]} />
          ))}
          <PressableScale onPress={() => setRooms(rooms.filter((_, j) => j !== i))} accessibilityLabel="Remove room"
            style={styles.iconButton}>
            <Trash2 size={14} color={Palette.muted} />
          </PressableScale>
        </View>
      ))}
      <SmallButton text="Add a room" onPress={() => setRooms([...rooms, { name: '', length: '', width: '', height: '' }])} />
      <PressableScale onPress={() => void send()} disabled={busy} style={[styles.primary, { borderColor: accent }]}>
        <Text style={styles.primaryText}>{busy ? 'Sending…' : correcting ? 'Plan it again' : 'Confirm and plan'}</Text>
      </PressableScale>
      {onCancel ? <SmallButton text="Cancel" onPress={onCancel} /> : null}
    </View>
  );
}

const STATUS: Record<string, string> = {
  reading: 'Reading your sketch and photos…',
  confirmed: 'Starting the plan…',
  planning: 'Planning on the Mac… a minute or two, then the after pictures.',
  planned: 'Ready',
  failed: 'Failed',
};

function PlanCard({ plan, accent, busy, onOpen, onShare, onCorrect }: {
  plan: RenovationPlan; accent: string; busy: boolean; onOpen: () => void; onShare: () => Promise<void>;
  onCorrect: (id: string, rooms: Room[], note: string) => Promise<boolean>;
}) {
  const [correcting, setCorrecting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const finished = (plan.status === 'planned' || plan.status === 'failed') && plan.rooms.length > 0;
  const share = async () => {
    setSharing(true);
    await onShare();
    setSharing(false);
  };
  return (
    <View style={[styles.section, styles.card]}>
      <Meta style={styles.sectionTitle}>{new Date(plan.created_at).toLocaleDateString('en-IN')}</Meta>
      <Answer numberOfLines={2} style={styles.lede}>{plan.request || 'Renovation plan'}</Answer>
      <View style={styles.row}>
        {isBusy(plan) ? <ActivityIndicator color={accent} /> : null}
        <Meta style={styles.status}>{plan.status === 'failed' ? plan.error || STATUS.failed : STATUS[plan.status]}</Meta>
      </View>
      {plan.total ? (
        <Answer style={styles.total}>
          {rupees(plan.total.low)} – {rupees(plan.total.high)}
          {plan.budget ? `  ·  budget ${rupees(plan.budget)}` : ''}
          {plan.total.quotes.length ? `  ·  + quotes for ${plan.total.quotes.length}` : ''}
        </Answer>
      ) : null}
      {plan.link ? (
        <PressableScale onPress={onOpen} accessibilityRole="button" style={[styles.primary, { borderColor: accent }]}>
          <Text style={styles.primaryText}>Open plan</Text>
        </PressableScale>
      ) : null}
      {finished && !correcting ? (
        <View style={styles.row}>
          {plan.link ? (
            <SmallButton icon={sharing ? <ActivityIndicator size="small" color={accent} /> : <Share2 size={16} color={Palette.text} />}
              text={sharing ? 'Making PDF…' : 'Share PDF'} onPress={() => void share()} />
          ) : null}
          <SmallButton icon={<Pencil size={16} color={Palette.text} />} text="Correct" onPress={() => setCorrecting(true)} />
        </View>
      ) : null}
      {finished && correcting ? (
        <RoomsForm plan={plan} busy={busy} accent={accent} correcting onCancel={() => setCorrecting(false)}
          onSend={async (id, rooms, note) => {
            if (await onCorrect(id, rooms, note)) setCorrecting(false);      // a failed send keeps his words
          }} />
      ) : null}
    </View>
  );
}

function SmallButton({ icon, text, onPress }: { icon?: React.ReactNode; text: string; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" style={styles.small}>
      {icon}
      <Meta style={styles.smallText}>{text}</Meta>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.ground },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Gutter,
    paddingVertical: Space.md, borderBottomWidth: 1, borderBottomColor: Palette.hairline,
  },
  headerTitleGroup: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  headerTitle: { fontSize: 22 },
  close: {
    width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Palette.surfaceGlass, borderWidth: 1, borderColor: Palette.hairline,
  },
  content: { padding: Gutter, gap: Space.xl, paddingBottom: Space.huge },
  section: { gap: Space.sm },
  card: { padding: Space.md, borderRadius: 16, backgroundColor: Palette.surfaceGlass, borderWidth: 1, borderColor: Palette.hairline },
  sectionTitle: { fontSize: 10, letterSpacing: 1.2, color: Palette.faint },
  lede: { color: Palette.muted, fontSize: 14, lineHeight: 20 },
  label: { color: Palette.muted, fontSize: 12, marginTop: Space.sm },
  input: {
    fontFamily: Font.ui, color: Palette.text, fontSize: 14, padding: Space.sm, borderRadius: 10,
    backgroundColor: Palette.surfaceLift, borderWidth: 1, borderColor: Palette.hairline,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, flexWrap: 'wrap' },
  photoBlock: { gap: 6 },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  thumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: Palette.surfaceLift },
  roomInput: { flex: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  switchText: { flex: 1, color: Palette.muted, fontSize: 12 },
  iconButton: { padding: 8 },
  small: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: Space.sm, paddingHorizontal: Space.md,
    borderRadius: 12, backgroundColor: Palette.surfaceLift, borderWidth: 1, borderColor: Palette.hairline,
  },
  smallText: { color: Palette.text, fontSize: 13 },
  primary: {
    alignItems: 'center', paddingVertical: Space.md, borderRadius: 14, backgroundColor: Palette.surfaceLift,
    borderWidth: 1, marginTop: Space.sm,
  },
  primaryText: { fontFamily: Font.uiMedium, color: Palette.text, fontSize: 15 },
  problem: { color: Palette.alert, fontSize: 12, lineHeight: 18 },
  error: { color: Palette.alert, fontSize: 14 },
  chip: { paddingVertical: 6, paddingHorizontal: Space.md, borderRadius: 10, borderWidth: 1, borderColor: Palette.hairline },
  chipText: { color: Palette.text, fontSize: 12 },
  roomRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  roomName: { flex: 1 },
  size: { width: 52, textAlign: 'center' },
  status: { color: Palette.muted, fontSize: 13, flexShrink: 1 },
  total: { color: Palette.text, fontSize: 16, fontFamily: Font.uiMedium },
  page: { flex: 1, backgroundColor: Palette.ground },
  note: { minHeight: 72, textAlignVertical: 'top' },
});
