import * as Haptics from 'expo-haptics';
import { Star } from 'lucide-react-native';

import { PressableScale } from '@/components/pressable-scale';
import { Palette } from '@/constants/theme';
import type { Contact } from '@/lib/device';
import { isFavourite, toggleFavourite, useFavourites } from '@/lib/favourites';

/** Add or remove someone from quick call, from wherever you just called them. */
export function StarToggle({ contact, accent }: { contact: Contact; accent: string }) {
  const starred = isFavourite(useFavourites(), contact);
  return (
    <PressableScale
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        toggleFavourite(contact);
      }}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={starred ? `Remove ${contact.name} from quick call` : `Add ${contact.name} to quick call`}>
      <Star size={16} color={starred ? accent : Palette.faint} fill={starred ? accent : 'transparent'} />
    </PressableScale>
  );
}
