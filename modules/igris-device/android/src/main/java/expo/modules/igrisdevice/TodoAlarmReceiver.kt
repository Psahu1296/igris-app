package expo.modules.igrisdevice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.provider.Settings
import androidx.core.app.NotificationCompat
import org.json.JSONObject

/**
 * A todo's alarm going off, and the Done / Snooze buttons on its notification.
 *
 * Normal priority: an ordinary notification that pops up and sounds once. (It began
 * as IMPORTANCE_LOW — silent — and on ColorOS that files it under "silent
 * notifications": a reminder fired on time on 2026-09-24 and nobody saw it.) High and must: an alarm-channel
 * notification with a full-screen intent (TodoAlarmActivity over the lock screen) whose
 * sound loops until acted on, then re-pokes while it is ignored (TodoAlarms.nextRepoke).
 * Swiping it away does not count as acting on it.
 */
class TodoAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val firing = intent.getStringExtra(TodoAlarms.EXTRA_FIRING)?.let { JSONObject(it) } ?: return
    when (intent.action) {
      TodoAlarms.ACTION_FIRE -> fire(context, firing)
      TodoAlarms.ACTION_DONE -> {
        TodoAlarms.record(context, firing, if (firing.optBoolean("done_on_ack")) "ack" else "done")
        TodoAlarms.settle(context, firing)
        TodoAlarms.settleDay(context, firing)
      }
      TodoAlarms.ACTION_SNOOZE -> {
        if (!TodoAlarms.canSnooze(firing)) return
        val until = System.currentTimeMillis() + TodoAlarms.SNOOZE_MS
        TodoAlarms.record(context, firing, "snooze", until)
        TodoAlarms.settle(context, firing)
        TodoAlarms.again(context, firing.put("snoozed", firing.optInt("snoozed") + 1), until)
      }
      TodoAlarms.ACTION_SKIP -> {
        if (!firing.optBoolean("can_skip")) return
        TodoAlarms.record(context, firing, "skip")
        TodoAlarms.settle(context, firing)
      }
    }
  }

  private fun fire(context: Context, firing: JSONObject) {
    ensureChannels(context)
    val loud = firing.optString("priority") in setOf("high", "must")
    val id = TodoAlarms.notificationId(firing)
    val overlay = PendingIntent.getActivity(
      context, id, TodoAlarmActivity.intent(context, firing),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val session = firing.optJSONObject("session")
    val builder = NotificationCompat.Builder(context, if (loud) CHANNEL_ALARM else CHANNEL_QUIET)
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setContentTitle(firing.getString("title"))
      .setContentText(TodoAlarms.note(firing).ifBlank { subtitle(firing) })
      .setContentIntent(overlay)
      .setAutoCancel(!loud)
      .setCategory(if (loud) NotificationCompat.CATEGORY_ALARM else NotificationCompat.CATEGORY_REMINDER)
      .setPriority(if (loud) NotificationCompat.PRIORITY_MAX else NotificationCompat.PRIORITY_HIGH)
    // Android shows three buttons at most; the overlay always has them all. A session
    // todo keeps Done among them — the one way out that needs no maestro.
    val actions = mutableListOf<NotificationCompat.Action>()
    // Starting a session is a screen, not a button press — it opens the overlay's Start.
    if (session != null) actions.add(NotificationCompat.Action(0, "Start", overlay))
    actions.add(
      NotificationCompat.Action(
        0, if (firing.optBoolean("done_on_ack")) "Got it" else "Done",
        button(context, firing, TodoAlarms.ACTION_DONE, id),
      ),
    )
    if (firing.optBoolean("can_skip")) {
      actions.add(NotificationCompat.Action(0, "Skip", button(context, firing, TodoAlarms.ACTION_SKIP, id + 2)))
    }
    if (TodoAlarms.canSnooze(firing)) {
      actions.add(NotificationCompat.Action(0, "Snooze 10 min", button(context, firing, TodoAlarms.ACTION_SNOOZE, id + 1)))
    }
    actions.take(3).forEach { builder.addAction(it) }
    if (loud) {
      builder.setFullScreenIntent(overlay, true)
        // Stops the looping sound; the re-poke brings it back. Was 5 minutes of
        // alarm out of every 10 — too much of the battery for an ignored phone.
        .setTimeoutAfter(2 * 60_000L)
    }
    val notification = builder.build()
    // Loops the channel's sound until the notification is acted on or cancelled.
    if (loud) notification.flags = notification.flags or Notification.FLAG_INSISTENT
    context.getSystemService(NotificationManager::class.java).notify(id, notification)

    // The full-screen intent only takes over the screen when the phone is locked or
    // off; in use, Android shows a heads-up banner instead, and on ColorOS that was just
    // a sound with nothing on screen (2026-09-24). Opening the alarm screen directly is
    // a background activity start, allowed only to an app that may draw over others.
    if (loud && Settings.canDrawOverlays(context)) {
      try {
        context.startActivity(TodoAlarmActivity.intent(context, firing))
      } catch (e: RuntimeException) {
        // Refused anyway (an OEM restriction): the notification is still there.
      }
    }

    TodoAlarms.nextRepoke(firing, System.currentTimeMillis())?.let { at -> TodoAlarms.again(context, firing, at) }
  }

  private fun button(context: Context, firing: JSONObject, action: String, code: Int): PendingIntent =
    PendingIntent.getBroadcast(
      context, code,
      Intent(context, TodoAlarmReceiver::class.java)
        .setAction(action)
        .setData(Uri.parse("igris-todo://$action/" + Uri.encode(TodoAlarms.key(firing))))
        .putExtra(TodoAlarms.EXTRA_FIRING, firing.toString()),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

  companion object {
    const val CHANNEL_ALARM = "todo_alarm"
    // A new id, not a change to "todo_quiet": a channel's importance is fixed once it
    // exists, so the old silent channel stays on phones that have it, unused.
    const val CHANNEL_QUIET = "todo_notify"

    fun subtitle(firing: JSONObject): String = when {
      firing.optString("priority") == "must" -> "Must-do"
      firing.optString("priority") == "high" -> "High priority"
      firing.optBoolean("done_on_ack") -> "Reminder"
      else -> "Todo"
    } + if (firing.optJSONObject("session") != null) " · session with Igris" else ""

    /** A channel's sound cannot change after creation — these are set once, here. */
    fun ensureChannels(context: Context) {
      val nm = context.getSystemService(NotificationManager::class.java)
      if (nm.getNotificationChannel(CHANNEL_ALARM) == null) {
        nm.createNotificationChannel(
          NotificationChannel(CHANNEL_ALARM, "Todo alarms", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "High-priority and must-do todos: an alarm over the lock screen."
            setSound(
              RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
              AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build(),
            )
            enableVibration(true)
            setBypassDnd(true)
          },
        )
      }
      if (nm.getNotificationChannel(CHANNEL_QUIET) == null) {
        nm.createNotificationChannel(
          NotificationChannel(CHANNEL_QUIET, "Todos and reminders", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Normal todos and reminders: a pop-up and one sound."
          },
        )
      }
    }
  }
}

/** Alarms do not survive a reboot; the stored schedule re-arms them. */
class TodoBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
      TodoAlarms.rearm(context)
    }
  }
}
