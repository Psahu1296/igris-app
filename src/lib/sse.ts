/**
 * Incremental parser for maestro's /chat/stream.
 *
 * maestro answers with sse-starlette's EventSourceResponse, so the wire format is
 * standard SSE: frames separated by a blank line, each carrying an `event:` name
 * and a `data:` payload. sse-starlette also emits `: ping` comment lines to keep
 * the connection alive through proxies — those are not events and must be dropped,
 * or Render's idle timeout handling looks like a protocol error.
 *
 * Written as a stateful parser rather than a split() because chunk boundaries fall
 * wherever the network decides, frequently mid-frame.
 *
 * **Line endings are CRLF, not LF.** sse-starlette's ServerSentEvent defaults to
 * `DEFAULT_SEPARATOR = "\r\n"` (sse/sse.py:260) and maestro never passes `sep`, so
 * every frame ends `\r\n\r\n`. That sequence contains no two adjacent `\n`, so a
 * parser scanning for `\n\n` finds nothing and reports a stream that closed without
 * answering — which is exactly what the phone did on 2026-09-23. The spec allows
 * CRLF, CR or LF, so normalise all three rather than matching one.
 */

export type SseFrame = { event: string; data: string };

export function createSseParser() {
  let buffer = '';
  // A chunk can end between the CR and LF of one separator. Normalising a dangling
  // CR to LF there would invent a blank line and split a frame in half, so hold it
  // back and let the next chunk decide what it was.
  let pendingCr = false;

  return function push(chunk: string): SseFrame[] {
    if (pendingCr) {
      chunk = '\r' + chunk;
      pendingCr = false;
    }
    if (chunk.endsWith('\r')) {
      pendingCr = true;
      chunk = chunk.slice(0, -1);
    }

    buffer += chunk.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const frames: SseFrame[] = [];

    // Frames end on a blank line. Anything after the last one is a partial frame
    // and stays in the buffer for the next chunk.
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const raw = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      let event = 'message';
      const data: string[] = [];

      for (const line of raw.split('\n')) {
        if (line.startsWith(':')) continue; // keep-alive comment
        // Per the SSE spec a single leading space after the colon is a delimiter
        // and everything after it is payload — so strip exactly that, never trim(),
        // which would eat indentation Igris put in a code block on purpose.
        if (line.startsWith('event:')) event = strip(line.slice(6)).trim();
        else if (line.startsWith('data:')) data.push(strip(line.slice(5)));
      }

      if (data.length > 0) frames.push({ event, data: data.join('\n') });
      boundary = buffer.indexOf('\n\n');
    }

    return frames;
  };
}

const strip = (value: string) => (value.startsWith(' ') ? value.slice(1) : value);
