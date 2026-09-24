import { Redirect, useLocalSearchParams } from 'expo-router';

import { requestSessionStart } from '@/lib/todos';

/**
 * igris://todo?id=…&title=…&brief=… — the alarm screen's Start (TodoAlarmActivity.kt).
 * Hands the session to the chat and gets out of the way; it has no UI of its own.
 */
export default function TodoLink() {
  const { id, occurrence, title, brief } = useLocalSearchParams<{
    id?: string;
    occurrence?: string;
    title?: string;
    brief?: string;
  }>();
  if (id && (brief || title)) {
    requestSessionStart({ todoId: id, occurrence: occurrence ?? null, title: title ?? '', brief: brief || title || '' });
  }
  return <Redirect href="/" />;
}
