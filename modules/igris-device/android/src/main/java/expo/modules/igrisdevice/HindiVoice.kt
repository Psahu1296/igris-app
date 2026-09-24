package expo.modules.igrisdevice

import android.content.Context
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import android.util.Log
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import java.util.Locale
import java.util.UUID

class NoHindiVoiceException :
  CodedException("ERR_NO_HINDI_VOICE", "No offline Hindi voice is installed.", null)

class HindiSpeechException(why: String) :
  CodedException("ERR_HINDI_SPEECH", "The Hindi voice failed: $why.", null)

/**
 * Google TTS's offline Hindi voice, for the sentences Alan (Piper, English-only) can't
 * say — src/lib/voice/language.ts decides which.
 *
 * Hand-written rather than expo-speech, which failed on this phone: it builds the
 * locale as Locale("hi-IN") — a language literally named "hi-in" — so Hindi fell back
 * to English, then crashed on a null voice list, and its JS never saw the error, so
 * the speaking loop waited forever (measured 2026-09-24).
 *
 * Offline only: a voice that needs the network would send the text — possibly a
 * WhatsApp message read from the shade — to Google. Such voices are never chosen.
 */
class HindiVoice(private val context: Context) {
  private var tts: TextToSpeech? = null
  private var ready = false
  private var voice: Voice? = null
  private val waiting = mutableListOf<Pair<Promise, (TextToSpeech) -> Unit>>()
  private val pending = mutableMapOf<String, Promise>()

  @Synchronized
  fun speak(text: String, promise: Promise) {
    whenReady(promise) { engine ->
      val chosen = voice ?: pickVoice(engine)?.also { voice = it; engine.voice = it }
      if (chosen == null) {
        promise.reject(NoHindiVoiceException())
        return@whenReady
      }
      val id = UUID.randomUUID().toString()
      pending[id] = promise
      if (engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, id) != TextToSpeech.SUCCESS) {
        pending.remove(id)
        promise.reject(HindiSpeechException("the engine refused the text"))
      }
    }
  }

  /** Stops speech and settles every waiting promise — a stopped sentence is finished. */
  @Synchronized
  fun stop() {
    tts?.stop()
    pending.values.forEach { it.resolve(null) }
    pending.clear()
  }

  @Synchronized
  fun shutdown() {
    stop()
    tts?.shutdown()
    tts = null
    ready = false
  }

  // A male voice, to sit closer to Alan. Google's voice names carry no gender field;
  // MALE_VOICES lists the hi-IN ones that are male, best first. Falls back to any.
  private fun pickVoice(engine: TextToSpeech): Voice? {
    val offline = engine.voices.orEmpty().filter {
      it.locale.language == Locale("hi").language &&
        !it.isNetworkConnectionRequired &&
        !it.features.orEmpty().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)
    }
    Log.i(TAG, "offline Hindi voices: ${offline.map { it.name }}")
    return MALE_VOICES.firstNotNullOfOrNull { name -> offline.firstOrNull { it.name.startsWith(name) } }
      ?: offline.maxByOrNull { it.quality }
  }

  private fun whenReady(promise: Promise, action: (TextToSpeech) -> Unit) {
    val engine = tts
    if (engine != null && ready) return action(engine)
    waiting.add(promise to action)
    if (engine != null) return // still initialising
    // Google's engine by name: the system default might be one with no Hindi at all.
    tts = TextToSpeech(context, { status ->
      synchronized(this) {
        if (status != TextToSpeech.SUCCESS) {
          tts = null
          waiting.forEach { (p, _) -> p.reject(HindiSpeechException("the speech engine did not start")) }
          waiting.clear()
          return@synchronized
        }
        ready = true
        val started = tts ?: return@synchronized
        started.setOnUtteranceProgressListener(listener)
        waiting.forEach { (_, act) -> act(started) }
        waiting.clear()
      }
    }, GOOGLE_TTS)
  }

  private val listener = object : UtteranceProgressListener() {
    override fun onStart(id: String) {}

    override fun onDone(id: String) = settle(id) { it.resolve(null) }

    override fun onStop(id: String, interrupted: Boolean) = settle(id) { it.resolve(null) }

    @Deprecated("Deprecated in Java")
    override fun onError(id: String) = settle(id) { it.reject(HindiSpeechException("playback error")) }

    override fun onError(id: String, errorCode: Int) =
      settle(id) { it.reject(HindiSpeechException("error $errorCode")) }
  }

  private fun settle(id: String, action: (Promise) -> Unit) {
    val promise = synchronized(this) { pending.remove(id) } ?: return
    action(promise)
  }

  companion object {
    private const val GOOGLE_TTS = "com.google.android.tts"
    private const val TAG = "IgrisHindi"
    private val MALE_VOICES = listOf("hi-in-x-hie", "hi-in-x-hic")
  }
}
