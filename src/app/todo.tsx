import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { requestSessionStart } from '@/lib/todos';

/**
 * igris://todo?id=…&title=…&brief=… — the alarm screen's Start (TodoAlarmActivity.kt).
 * Hands the session to the chat and gets out of the way; it has no UI of its own.
 *
 * In an effect, not during render: handing over starts a new session, which sets state
 * in SessionProvider, and doing that while this component rendered was React's
 * "Cannot update a component while rendering a different component" (2026-09-24).
 */
export default function TodoLink() {
  const { id, occurrence, title, brief } = useLocalSearchParams<{
    id?: string;
    occurrence?: string;
    title?: string;
    brief?: string;
  }>();
  useEffect(() => {
    if (!id || !(brief || title)) return;
    requestSessionStart({
      todoId: id,
      occurrence: occurrence ?? null,
      title: title ?? '',
      brief: brief || title || '',
    });
  }, [id, occurrence, title, brief]);
  return <Redirect href="/" />;
}
