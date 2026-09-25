package expo.modules.igrisdevice

import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject

/**
 * The alarm screen for a high or must-do todo: over the lock screen, like the clock's.
 *
 * Native, not a React screen, because it has to appear with the app closed and the
 * phone locked, in the second the alarm fires — starting React Native for that would
 * be several seconds of splash. The sound is the notification's (FLAG_INSISTENT), so
 * closing this screen without choosing leaves it ringing: that is the point.
 *
 * Start opens Igris on the todo's session (igris://todo?…, src/app/todo.tsx) and
 * counts as a snooze of START_GRACE_MS: until the session is reported finished, the
 * slot is still open and will poke again.
 */
class TodoAlarmActivity : Activity() {
  private lateinit var firing: JSONObject
  private val main = Handler(Looper.getMainLooper())
  private val giveUp = Runnable { finish() }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    firing = intent.getStringExtra(TodoAlarms.EXTRA_FIRING)?.let { JSONObject(it) } ?: return finish()
    showOverLockScreen()
    setContentView(layout())
    closeLater()
  }

  /**
   * Left alone, the screen closes after UNATTENDED_MS and the phone may sleep again;
   * the notification (and its re-poke) is still there. It used to hold
   * FLAG_KEEP_SCREEN_ON until tapped: an ignored 10pm must-do kept the screen lit all
   * night, and re-pokes woke it every 10 minutes — the battery hit 0 (2026-09-25).
   */
  private fun closeLater() {
    main.removeCallbacks(giveUp)
    main.postDelayed(giveUp, UNATTENDED_MS)
  }

  override fun onDestroy() {
    main.removeCallbacks(giveUp)
    super.onDestroy()
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    firing = intent.getStringExtra(TodoAlarms.EXTRA_FIRING)?.let { JSONObject(it) } ?: return
    setContentView(layout())
    closeLater()
  }

  private fun showOverLockScreen() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
      getSystemService(KeyguardManager::class.java)?.requestDismissKeyguard(this, null)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
      )
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  }

  private fun layout(): LinearLayout {
    val session = firing.optJSONObject("session")
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setBackgroundColor(GROUND)
      setPadding(dp(28), dp(48), dp(28), dp(48))
    }
    root.addView(text(TodoAlarmReceiver.subtitle(firing).uppercase(), 13f, ACCENT, bold = true))
    root.addView(text(firing.getString("title"), 30f, Color.WHITE, top = 12))
    session?.optString("brief")?.takeIf { it.isNotBlank() && it != firing.getString("title") }?.let {
      root.addView(text(it, 16f, MUTED, top = 12))
    }
    // maestro's word for this slot: "Last chance today. No skipping."
    TodoAlarms.note(firing).takeIf { it.isNotBlank() }?.let {
      root.addView(text(it, 15f, ACCENT, top = 16))
    }
    val done = if (firing.optBoolean("done_on_ack")) "Got it" else "Done"
    if (session != null) {
      root.addView(button("Start session", primary = true, top = 40) { start() })
      // A way out that needs no maestro: with the backend down, a session could not
      // start or report itself finished, so the slot nagged on (2026-09-25).
      root.addView(button("Already done", primary = false, top = 12) { act(TodoAlarms.ACTION_DONE) })
    } else {
      root.addView(button(done, primary = true, top = 40) { act(TodoAlarms.ACTION_DONE) })
    }
    if (firing.optBoolean("can_skip")) {
      root.addView(button("Skip to next slot", primary = false, top = 12) { act(TodoAlarms.ACTION_SKIP) })
    }
    if (TodoAlarms.canSnooze(firing)) {
      val left = if (firing.isNull("max_snoozes")) "" else
        " (${firing.optInt("max_snoozes") - firing.optInt("snoozed")} left)"
      root.addView(button("Snooze 10 min$left", primary = false, top = 12) { act(TodoAlarms.ACTION_SNOOZE) })
    }
    return root
  }

  /** Done / Snooze go through the receiver, so the overlay and the notification buttons agree. */
  private fun act(action: String) {
    sendBroadcast(
      Intent(this, TodoAlarmReceiver::class.java).setAction(action).putExtra(TodoAlarms.EXTRA_FIRING, firing.toString()),
    )
    finish()
  }

  private fun start() {
    val until = System.currentTimeMillis() + TodoAlarms.START_GRACE_MS
    TodoAlarms.record(this, firing, "snooze", until)
    TodoAlarms.settle(this, firing)
    TodoAlarms.again(this, firing, until)
    val session = firing.optJSONObject("session")
    val link = Uri.Builder().scheme("igris").authority("todo")
      .appendQueryParameter("id", firing.getString("todo_id"))
      .appendQueryParameter("occurrence", firing.getString("occurrence_at"))
      .appendQueryParameter("title", firing.getString("title"))
      .appendQueryParameter("brief", session?.optString("brief") ?: firing.getString("title"))
      .build()
    val open = Intent(Intent.ACTION_VIEW, link).setPackage(packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    val keyguard = getSystemService(KeyguardManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && keyguard?.isKeyguardLocked == true) {
      // This screen shows over the lock screen; the chat does not. Opened straight away,
      // it started behind the keyguard — Igris could be heard teaching and not seen
      // (2026-09-24). So unlock first (fingerprint / PIN), then open it.
      keyguard.requestDismissKeyguard(this, object : KeyguardManager.KeyguardDismissCallback() {
        override fun onDismissSucceeded() {
          startActivity(open)
          finish()
        }
      })
      return
    }
    startActivity(open)
    finish()
  }

  private fun text(value: String, size: Float, color: Int, bold: Boolean = false, top: Int = 0) =
    TextView(this).apply {
      text = value
      setTextSize(TypedValue.COMPLEX_UNIT_SP, size)
      setTextColor(color)
      gravity = Gravity.CENTER
      if (bold) typeface = Typeface.DEFAULT_BOLD
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT,
      ).apply { topMargin = dp(top) }
    }

  private fun button(label: String, primary: Boolean, top: Int, onClick: () -> Unit) =
    Button(this).apply {
      text = label
      isAllCaps = false
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
      setTextColor(if (primary) GROUND else Color.WHITE)
      background = GradientDrawable().apply {
        cornerRadius = dp(28).toFloat()
        if (primary) setColor(ACCENT) else { setColor(Color.TRANSPARENT); setStroke(dp(1), MUTED) }
      }
      setOnClickListener { onClick() }
      layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(56))
        .apply { topMargin = dp(top) }
    }

  private fun dp(value: Int) = TypedValue.applyDimension(
    TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), resources.displayMetrics,
  ).toInt()

  companion object {
    private const val UNATTENDED_MS = 60_000L

    // The app's own palette (src/constants/theme.ts): ground, alert, muted.
    private val GROUND = Color.parseColor("#09080E")
    private val ACCENT = Color.parseColor("#FF5555")
    private val MUTED = Color.parseColor("#A29990")

    fun intent(context: Context, firing: JSONObject): Intent =
      Intent(context, TodoAlarmActivity::class.java)
        .setData(Uri.parse("igris-todo://show/" + Uri.encode(TodoAlarms.key(firing))))
        .putExtra(TodoAlarms.EXTRA_FIRING, firing.toString())
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
  }
}
