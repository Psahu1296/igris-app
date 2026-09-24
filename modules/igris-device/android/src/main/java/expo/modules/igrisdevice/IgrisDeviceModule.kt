package expo.modules.igrisdevice

import android.Manifest
import android.app.Notification
import android.app.RemoteInput
import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.AlarmClock
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.provider.ContactsContract.CommonDataKinds.Phone
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NoHandlerException(what: String) :
  CodedException("ERR_NO_HANDLER", "No app on this phone can $what.", null)

class NoPermissionException(what: String) :
  CodedException("ERR_NO_PERMISSION", "Igris does not have permission to $what.", null)

class NoNotificationAccessException :
  CodedException("ERR_NO_NOTIFICATION_ACCESS", "Igris does not have notification access.", null)

class NotificationGoneException :
  CodedException("ERR_NOTIFICATION_GONE", "That notification is no longer showing.", null)

/** Enough candidates to pick from on one card; more is a search result, not a choice. */
private const val MAX_MATCHES = 12

/**
 * The phone's hands for Igris (src/lib/device.ts calls these).
 *
 * Native rather than Linking.sendIntent because sendIntent puts every JS number as a
 * Double ("we cannot know from JS if it is an Integer"), and the clock reads HOUR
 * with getIntExtra — so the hour silently arrives as 0. Here the types are exact.
 */
class IgrisDeviceModule : Module() {
  private var hindi: HindiVoice? = null

  override fun definition() = ModuleDefinition {
    Name("IgrisDevice")

    OnDestroy {
      hindi?.shutdown()
    }

    // ── Hindi speech (HindiVoice.kt) ─────────────────────────────────────────────
    // Resolves when the sentence finishes OR is stopped; rejects if it cannot speak.
    AsyncFunction("speakHindi") { text: String, promise: Promise ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val voice = hindi ?: HindiVoice(context.applicationContext).also { hindi = it }
      voice.speak(text, promise)
    }

    Function("stopHindi") {
      hindi?.stop()
    }

    // SKIP_UI: the clock sets it without showing its own screen, so Igris stays in
    // front. Measured on ColorOS: honoured.
    Function("setAlarm") { hour: Int, minute: Int, label: String? ->
      val intent = Intent(AlarmClock.ACTION_SET_ALARM)
        .putExtra(AlarmClock.EXTRA_HOUR, hour)
        .putExtra(AlarmClock.EXTRA_MINUTES, minute)
        .putExtra(AlarmClock.EXTRA_SKIP_UI, true)
      if (!label.isNullOrBlank()) intent.putExtra(AlarmClock.EXTRA_MESSAGE, label)
      start(intent, "set an alarm")
    }

    Function("showAlarms") {
      start(Intent(AlarmClock.ACTION_SHOW_ALARMS), "show alarms")
    }

    // Phone numbers whose contact name matches `query`. CONTENT_FILTER_URI is the
    // provider's own name search — the same matching the dialer uses (prefix of any
    // word, accent-insensitive) — so "rahul" finds "Rahul Sharma". Ranking and
    // de-duplication happen in JS (src/lib/device.ts). AsyncFunction runs off the UI
    // thread, which a contacts query needs.
    AsyncFunction("findContacts") { query: String ->
      requirePermission(Manifest.permission.READ_CONTACTS, "read your contacts")
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val uri = Uri.withAppendedPath(Phone.CONTENT_FILTER_URI, Uri.encode(query))
      val projection = arrayOf(
        Phone.DISPLAY_NAME_PRIMARY, Phone.NUMBER, Phone.TYPE, Phone.LABEL,
        Phone.STARRED, Phone.IS_SUPER_PRIMARY,
      )
      val matches = mutableListOf<Map<String, Any?>>()
      context.contentResolver.query(uri, projection, null, null, null)?.use { c ->
        while (c.moveToNext() && matches.size < MAX_MATCHES) {
          val number = c.getString(1) ?: continue
          matches.add(mapOf(
            "name" to (c.getString(0) ?: number),
            "number" to number,
            "label" to Phone.getTypeLabel(context.resources, c.getInt(2), c.getString(3)).toString(),
            "starred" to (c.getInt(4) == 1),
            "primary" to (c.getInt(5) == 1),
          ))
        }
      }
      matches
    }

    // Rings immediately. Only ever called after the user tapped Call on a confirm card.
    Function("placeCall") { number: String ->
      requirePermission(Manifest.permission.CALL_PHONE, "place calls")
      start(Intent(Intent.ACTION_CALL, Uri.fromParts("tel", number, null)), "place calls")
    }

    // The no-permission fallback: opens the dialer with the number filled in.
    Function("dial") { number: String ->
      start(Intent(Intent.ACTION_DIAL, Uri.fromParts("tel", number, null)), "open the dialer")
    }

    // ── Notifications (IgrisNotificationListener) ──────────────────────────────
    // Everything below runs on the phone and returns to JS on the phone. Which apps
    // are read, and how, is decided in src/lib/notifications.ts.

    Function("hasNotificationAccess") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)
    }

    // Straight to Igris's own switch where the OS supports it (Android 11+), else the list.
    Function("openNotificationAccess") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val component = ComponentName(context, IgrisNotificationListener::class.java)
      val detail = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && try {
        start(
          Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS)
            .putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, component.flattenToString()),
          "open notification settings",
        )
        true
      } catch (e: NoHandlerException) {
        false // ColorOS may not route the detail page; the list always exists.
      }
      if (!detail) start(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS), "open notification settings")
    }

    // What is in the shade now. Group summaries ("5 messages from 2 chats") are skipped:
    // each chat also has its own notification, and reading both says everything twice.
    AsyncFunction("getNotifications") {
      listener().activeNotifications.orEmpty()
        .filter { it.notification.flags and Notification.FLAG_GROUP_SUMMARY == 0 }
        .map { describe(it) }
    }

    // Answers through the notification's own reply box (RemoteInput) — the same thing
    // typing into the shade does, so the message leaves from the user's own account.
    AsyncFunction("reply") { key: String, text: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val action = find(key).notification.actions
        ?.firstOrNull { a -> a.remoteInputs?.any { it.allowFreeFormInput } == true }
        ?: throw NoHandlerException("reply to that notification")
      val inputs = action.remoteInputs
      val results = Bundle().apply { inputs.forEach { putCharSequence(it.resultKey, text) } }
      val fill = Intent()
      RemoteInput.addResultsToIntent(inputs, fill, results)
      action.actionIntent.send(context, 0, fill)
    }

    // Presses one of a notification's buttons — how a ringing alarm is dismissed,
    // since ColorOS ignores DISMISS_ALARM.
    AsyncFunction("pressAction") { key: String, index: Int ->
      val action = find(key).notification.actions?.getOrNull(index)
        ?: throw NotificationGoneException()
      action.actionIntent.send()
    }
  }

  private fun listener(): NotificationListenerService {
    val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
    if (!NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)) {
      throw NoNotificationAccessException()
    }
    return IgrisNotificationListener.instance ?: run {
      // Access is on but Android has not bound the service yet (or dropped it).
      NotificationListenerService.requestRebind(ComponentName(context, IgrisNotificationListener::class.java))
      throw CodedException("ERR_LISTENER_STARTING", "Notification access is still connecting. Ask again in a moment.", null)
    }
  }

  private fun find(key: String): StatusBarNotification =
    listener().activeNotifications.orEmpty().firstOrNull { it.key == key } ?: throw NotificationGoneException()

  private fun describe(sbn: StatusBarNotification): Map<String, Any?> {
    val n = sbn.notification
    val extras = n.extras
    val title = extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE)
      ?: extras.getCharSequence(Notification.EXTRA_TITLE)
    // Chat apps put the whole unread conversation here; the plain text is only the last line.
    val messages = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(n)
      ?.messages.orEmpty()
      .takeLast(5)
      .mapNotNull { m -> m.text?.let { mapOf("sender" to m.person?.name?.toString(), "text" to it.toString()) } }
    return mapOf(
      "key" to sbn.key,
      "packageName" to sbn.packageName,
      "title" to title?.toString(),
      "text" to extras.getCharSequence(Notification.EXTRA_TEXT)?.toString(),
      "messages" to messages,
      "postedAt" to sbn.postTime.toDouble(),
      "category" to n.category,
      "ongoing" to sbn.isOngoing,
      // A RINGING alarm takes over the screen; an "upcoming alarm" notice does not —
      // and pressing the upcoming one's Dismiss would skip tomorrow's alarm.
      "fullScreen" to (n.fullScreenIntent != null),
      "canReply" to (n.actions?.any { a -> a.remoteInputs?.any { it.allowFreeFormInput } == true } == true),
      "actions" to n.actions.orEmpty().map { it.title?.toString() ?: "" },
    )
  }

  private fun requirePermission(permission: String, what: String) {
    val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
    if (ContextCompat.checkSelfPermission(context, permission) != PackageManager.PERMISSION_GRANTED) {
      throw NoPermissionException(what)
    }
  }

  private fun start(intent: Intent, what: String) {
    val activity = appContext.currentActivity ?: throw Exceptions.MissingActivity()
    try {
      activity.startActivity(intent)
    } catch (e: ActivityNotFoundException) {
      throw NoHandlerException(what)
    }
  }
}
