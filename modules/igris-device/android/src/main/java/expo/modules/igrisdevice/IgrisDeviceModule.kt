package expo.modules.igrisdevice

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.AlarmClock
import android.provider.ContactsContract.CommonDataKinds.Phone
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NoHandlerException(what: String) :
  CodedException("ERR_NO_HANDLER", "No app on this phone can $what.", null)

class NoPermissionException(what: String) :
  CodedException("ERR_NO_PERMISSION", "Igris does not have permission to $what.", null)

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
  override fun definition() = ModuleDefinition {
    Name("IgrisDevice")

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
