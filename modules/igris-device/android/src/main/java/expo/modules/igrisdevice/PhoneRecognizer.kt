package expo.modules.igrisdevice

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException

class RecognitionException(message: String) : CodedException("ERR_RECOGNITION", message, null)

/**
 * The phone's own speech recogniser (Google's, via android.speech), for when the Mac
 * is not there to run Whisper (src/lib/voice/stt.ts).
 *
 * Whisper on the Mac stays the first choice: it carries the domain prompt that keeps
 * "Igris" and "dhaba" as words. But with maestro only on Render there was no mic at
 * all (2026-09-25), and a slightly worse transcript beats none.
 *
 * One utterance per call: listens, ends on its own silence detection, resolves with
 * the best transcript ("" when nothing was said). SpeechRecognizer must be created and
 * driven on the main thread, so everything here posts to it.
 */
class PhoneRecognizer(private val context: Context) {
  private val main = Handler(Looper.getMainLooper())
  private var recognizer: SpeechRecognizer? = null
  private var pending: Promise? = null

  fun available(): Boolean = SpeechRecognizer.isRecognitionAvailable(context)

  fun listen(language: String, promise: Promise) = main.post {
    settle("") // a second listen ends the first
    if (!available()) {
      promise.reject(RecognitionException("This phone has no speech recogniser."))
      return@post
    }
    val r = SpeechRecognizer.createSpeechRecognizer(context)
    recognizer = r
    pending = promise
    r.setRecognitionListener(object : RecognitionListener {
      override fun onResults(results: Bundle) {
        settle(results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty())
      }

      override fun onError(error: Int) {
        when (error) {
          // Silence is an answer, not a failure: nothing was said.
          SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> settle("")
          SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> fail("Igris needs microphone permission.")
          SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT ->
            fail("Speech recognition needs the internet (or Google's offline voice pack).")
          else -> fail("Speech recognition failed (code $error).")
        }
      }

      override fun onReadyForSpeech(params: Bundle?) {}
      override fun onBeginningOfSpeech() {}
      override fun onRmsChanged(rmsdB: Float) {}
      override fun onBufferReceived(buffer: ByteArray?) {}
      override fun onEndOfSpeech() {}
      override fun onPartialResults(partialResults: Bundle?) {}
      override fun onEvent(eventType: Int, params: Bundle?) {}
    })
    r.startListening(
      Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
        .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        // en-IN hears Indian English and most Hinglish; the Mac's Whisper does better.
        .putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
        .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        .putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName),
    )
  }

  /** Stop listening now; what was heard so far is still transcribed and resolved. */
  fun stop() = main.post { recognizer?.stopListening() }

  fun shutdown() = main.post { settle("") }

  private fun settle(text: String) {
    pending?.resolve(text)
    release()
  }

  private fun fail(message: String) {
    pending?.reject(RecognitionException(message))
    release()
  }

  private fun release() {
    pending = null
    recognizer?.destroy()
    recognizer = null
  }
}
