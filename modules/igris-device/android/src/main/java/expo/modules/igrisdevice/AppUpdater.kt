package expo.modules.igrisdevice

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.core.content.FileProvider
import expo.modules.kotlin.exception.CodedException
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Its own class so it does not collide with the androidx FileProvider that other
 * modules (image picker, file system) declare — two <provider> entries naming the same
 * class fail the manifest merge.
 */
class IgrisUpdateFileProvider : FileProvider()

/**
 * A new APK, downloaded by the app and handed to Android's own installer.
 *
 * Before this, a native update meant downloading from the browser and opening it from
 * Files — which failed on the OnePlus with a bare "App not installed" — or a USB cable.
 *
 * Safety is Android's, not ours: the installer refuses an update signed with any key
 * but the one the installed app was signed with, so a tampered APK cannot replace
 * Igris. On top of that, only GitHub release hosts are downloaded from.
 */
object AppUpdater {
  private val ALLOWED_HOSTS = setOf(
    "github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com",
  )
  private const val MAX_BYTES = 300L * 1024 * 1024

  fun version(context: Context): Map<String, Any?> {
    val info = context.packageManager.getPackageInfo(context.packageName, 0)
    val code = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else @Suppress("DEPRECATION") info.versionCode.toLong()
    return mapOf("versionName" to info.versionName, "versionCode" to code.toDouble(), "packageName" to context.packageName)
  }

  fun canInstall(context: Context): Boolean =
    Build.VERSION.SDK_INT < 26 || context.packageManager.canRequestPackageInstalls()

  /** Settings › Install unknown apps, on Igris's own switch. */
  fun installPermissionIntent(context: Context): Intent =
    Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

  /**
   * Download on a worker thread (the APK is ~90 MB), then open the installer on the
   * main thread. [done] gets null on success or the error.
   */
  fun downloadAndInstall(context: Context, url: String, done: (Throwable?) -> Unit) {
    Thread {
      val result = runCatching {
        val file = download(context, url)
        Handler(Looper.getMainLooper()).post {
          runCatching { context.startActivity(installIntent(context, file)) }
            .let { done(it.exceptionOrNull()) }
        }
      }
      result.exceptionOrNull()?.let { done(it) }
    }.start()
  }

  private fun download(context: Context, url: String): File {
    var current = URL(url)
    // Redirects are followed by hand so every hop is checked against ALLOWED_HOSTS —
    // GitHub sends release assets to a separate download host.
    repeat(5) {
      if (current.protocol != "https" || current.host !in ALLOWED_HOSTS) {
        throw CodedException("ERR_UPDATE_HOST", "Updates only come from GitHub releases, not ${current.host}.", null)
      }
      val conn = (current.openConnection() as HttpURLConnection).apply {
        instanceFollowRedirects = false
        connectTimeout = 15_000
        readTimeout = 30_000
        setRequestProperty("User-Agent", "Igris-app-updater")
      }
      try {
        when (val code = conn.responseCode) {
          in 300..399 -> {
            current = URL(current, conn.getHeaderField("Location") ?: throw CodedException("ERR_UPDATE_REDIRECT", "Bad redirect from GitHub.", null))
          }
          200 -> {
            val dir = File(context.cacheDir, "updates").apply { mkdirs() }
            dir.listFiles()?.forEach { it.delete() }     // one update at a time; old ones are 90 MB each
            val file = File(dir, "igris-update.apk")
            var total = 0L
            conn.inputStream.use { input ->
              file.outputStream().use { output ->
                val buffer = ByteArray(64 * 1024)
                while (true) {
                  val n = input.read(buffer)
                  if (n < 0) break
                  total += n
                  if (total > MAX_BYTES) throw CodedException("ERR_UPDATE_SIZE", "The download is larger than any Igris APK.", null)
                  output.write(buffer, 0, n)
                }
              }
            }
            val expected = conn.contentLengthLong
            if (expected > 0 && total != expected) {
              throw CodedException("ERR_UPDATE_TRUNCATED", "The download stopped early. Try again on a steadier connection.", null)
            }
            return file
          }
          else -> throw CodedException("ERR_UPDATE_HTTP", "GitHub answered $code for the update.", null)
        }
      } finally {
        conn.disconnect()
      }
    }
    throw CodedException("ERR_UPDATE_REDIRECT", "Too many redirects from GitHub.", null)
  }

  private fun installIntent(context: Context, file: File): Intent {
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.igris.updates", file)
    return Intent(Intent.ACTION_VIEW)
      .setDataAndType(uri, "application/vnd.android.package-archive")
      .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
  }
}
