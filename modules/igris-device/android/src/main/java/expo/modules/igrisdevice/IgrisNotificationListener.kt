package expo.modules.igrisdevice

import android.service.notification.NotificationListenerService

/**
 * Bound by Android once the user grants Notification access (Settings › Notification
 * access › Igris). It does nothing on its own: no callbacks are overridden beyond
 * connect/disconnect, nothing is stored or sent. IgrisDeviceModule reads the
 * notifications that are showing right now, only when the user asks.
 */
class IgrisNotificationListener : NotificationListenerService() {
  override fun onListenerConnected() {
    instance = this
  }

  override fun onListenerDisconnected() {
    if (instance === this) instance = null
  }

  companion object {
    @Volatile
    var instance: IgrisNotificationListener? = null
  }
}
