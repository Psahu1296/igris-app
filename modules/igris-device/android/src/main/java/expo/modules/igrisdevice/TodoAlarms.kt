package expo.modules.igrisdevice

import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject

/**
 * The phone's copy of maestro's todo schedule, armed as exact alarms.
 *
 * maestro owns the todos but cannot fire them (Render sleeps; there is no push), so
 * JS pulls GET /todos/schedule and hands the firings here (src/lib/todos.ts). They are
 * kept in SharedPreferences as well as armed, because two things need them without
 * JS: the boot receiver re-arming after a restart, and a firing's own re-poke.
 *
 * What the user does about a firing — Done, Snooze, Start — happens natively (the
 * overlay and the notification buttons), usually with the app closed. Each is queued
 * in an outbox here and sent to maestro by JS on its next sync. Events carry the
 * phone's clock, so a late send still lands on the right slot.
 *
 * A firing JSON: {todo_id, title, occurrence_at, fire_at_ms, priority, session?,
 * done_on_ack, can_skip, max_snoozes?, snoozed, repoke_every_ms?, repoke_until_ms?,
 * note?}. Priority decides the poke: normal is a quiet notification; high and must are
 * an alarm (setAlarmClock, the one Doze and ColorOS leave alone) with a full-screen
 * overlay and a looping sound. The rest are maestro's rules (todos._rules) — which
 * slot may be skipped, how many snoozes the last one gets, how long to keep nagging —
 * decided there so the phone never has to know what a "daily must-do" is.
 */
object TodoAlarms {
  private const val PREFS = "igris.todos"
  private const val FIRINGS = "firings"
  private const val ARMED = "armed"
  private const val OUTBOX = "outbox"

  const val ACTION_FIRE = "expo.modules.igrisdevice.TODO_FIRE"
  const val ACTION_DONE = "expo.modules.igrisdevice.TODO_DONE"
  const val ACTION_SNOOZE = "expo.modules.igrisdevice.TODO_SNOOZE"
  const val ACTION_SKIP = "expo.modules.igrisdevice.TODO_SKIP"
  const val EXTRA_FIRING = "firing"

  const val SNOOZE_MS = 10 * 60_000L
  /** After Start, the session is expected to finish within this; if not, it pokes again. */
  const val START_GRACE_MS = 45 * 60_000L

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  /** One slot of one todo. Stable across syncs, so re-arming replaces rather than duplicates. */
  fun key(firing: JSONObject) = "${firing.getString("todo_id")}@${firing.getString("occurrence_at")}"

  fun notificationId(firing: JSONObject) = key(firing).hashCode()

  /** Replace everything armed with `firings` (a JSON array). Returns how many were armed. */
  @Synchronized
  fun arm(context: Context, firings: String): Int {
    val list = JSONArray(firings)
    val p = prefs(context)
    for (tag in p.getStringSet(ARMED, emptySet()).orEmpty()) cancel(context, tag)
    val armed = mutableSetOf<String>()
    val now = System.currentTimeMillis()
    for (i in 0 until list.length()) {
      val firing = list.getJSONObject(i)
      val at = firing.getLong("fire_at_ms")
      if (at <= now) continue
      val tag = key(firing)
      schedule(context, firing, at, tag)
      armed.add(tag)
    }
    p.edit().putString(FIRINGS, list.toString()).putStringSet(ARMED, armed).apply()
    return armed.size
  }

  /** After a reboot every alarm is gone; the stored copy puts them back. */
  fun rearm(context: Context) {
    arm(context, prefs(context).getString(FIRINGS, "[]") ?: "[]")
  }

  /** A re-poke, a snooze, or a Start's check-back: the same firing again at `at`. */
  @Synchronized
  fun again(context: Context, firing: JSONObject, at: Long) {
    val tag = key(firing) + "#again"
    schedule(context, firing, at, tag)
    val p = prefs(context)
    p.edit().putStringSet(ARMED, p.getStringSet(ARMED, emptySet()).orEmpty() + tag).apply()
  }

  /** The user dealt with it: nothing more for this slot until maestro says otherwise. */
  fun settle(context: Context, firing: JSONObject) {
    cancel(context, key(firing) + "#again")
    context.getSystemService(NotificationManager::class.java).cancel(notificationId(firing))
  }

  /**
   * A daily must-do done at one slot is done for the day (closes_day): its later
   * slots that day must not ring. maestro already drops them from the schedule, but
   * the phone only learns that at its next sync — often hours away with the app shut.
   */
  @Synchronized
  fun settleDay(context: Context, firing: JSONObject) {
    if (!firing.optBoolean("closes_day")) return
    val day = firing.getString("occurrence_at").take(10)
    val list = JSONArray(prefs(context).getString(FIRINGS, "[]"))
    for (i in 0 until list.length()) {
      val other = list.getJSONObject(i)
      if (other.getString("todo_id") == firing.getString("todo_id") && other.getString("occurrence_at").startsWith(day)) {
        cancel(context, key(other))
        settle(context, other)
      }
    }
  }

  /** maestro's note for this slot, or blank. (optString turns a JSON null into "null".) */
  fun note(firing: JSONObject): String = if (firing.isNull("note")) "" else firing.optString("note")

  /** When a fired todo pokes again if nobody touches it, or null when it has nagged enough. */
  fun nextRepoke(firing: JSONObject, now: Long): Long? {
    val every = firing.optLong("repoke_every_ms", 0)
    val until = firing.optLong("repoke_until_ms", 0)
    return if (every > 0 && now + every <= until) now + every else null
  }

  /** The last slot of a daily must-do caps snoozes; everything else may snooze freely. */
  fun canSnooze(firing: JSONObject): Boolean =
    firing.isNull("max_snoozes") || firing.optInt("snoozed") < firing.optInt("max_snoozes")

  private fun intent(context: Context, firing: JSONObject?, tag: String) =
    Intent(context, TodoAlarmReceiver::class.java)
      .setAction(ACTION_FIRE)
      // PendingIntents are told apart by data, never by extras — the tag makes each unique.
      .setData(Uri.parse("igris-todo://fire/" + Uri.encode(tag)))
      .apply { if (firing != null) putExtra(EXTRA_FIRING, firing.toString()) }

  private fun schedule(context: Context, firing: JSONObject, at: Long, tag: String) {
    val am = context.getSystemService(AlarmManager::class.java)
    val pending = PendingIntent.getBroadcast(
      context, 0, intent(context, firing, tag),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val loud = firing.optString("priority") in setOf("high", "must")
    val exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()
    when {
      loud && exact -> {
        val show = PendingIntent.getActivity(
          context, 0, TodoAlarmActivity.intent(context, firing),
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        am.setAlarmClock(AlarmManager.AlarmClockInfo(at, show), pending)
      }
      exact -> am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending)
      // Exact alarms refused in Settings: late by minutes beats not at all.
      else -> am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending)
    }
  }

  private fun cancel(context: Context, tag: String) {
    val pending = PendingIntent.getBroadcast(
      context, 0, intent(context, null, tag),
      PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
    ) ?: return
    context.getSystemService(AlarmManager::class.java).cancel(pending)
    pending.cancel()
  }

  // ── Outbox: what the user did, waiting for JS to send it to maestro ───────────

  @Synchronized
  fun record(context: Context, firing: JSONObject, kind: String, untilMs: Long? = null) {
    val now = System.currentTimeMillis()
    val event = JSONObject()
      .put("id", "${key(firing)}#$kind#$now")
      .put("todo_id", firing.getString("todo_id"))
      .put("occurrence_at", firing.getString("occurrence_at"))
      .put("kind", kind)
      .put("at_ms", now)
    if (untilMs != null) event.put("until_ms", untilMs)
    val p = prefs(context)
    val outbox = JSONArray(p.getString(OUTBOX, "[]"))
    outbox.put(event)
    p.edit().putString(OUTBOX, outbox.toString()).apply()
  }

  fun outbox(context: Context): String = prefs(context).getString(OUTBOX, "[]") ?: "[]"

  /** Drop the events maestro has accepted. By id, so one recorded mid-send survives. */
  @Synchronized
  fun clearOutbox(context: Context, ids: List<String>) {
    val sent = ids.toSet()
    val p = prefs(context)
    val outbox = JSONArray(p.getString(OUTBOX, "[]"))
    val kept = JSONArray()
    for (i in 0 until outbox.length()) {
      val e = outbox.getJSONObject(i)
      if (e.getString("id") !in sent) kept.put(e)
    }
    p.edit().putString(OUTBOX, kept.toString()).apply()
  }
}
