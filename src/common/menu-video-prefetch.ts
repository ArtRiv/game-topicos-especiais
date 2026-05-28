// ---------------------------------------------------------------------------
// Menu background video prefetch.
//
// The HIGH FANTASY main menu uses assets/ui/landscape.mp4 (~12 MB). If we only
// queue it via Phaser's Loader from SplashScene, the user can race through
// splash → intro → menu before the download finishes, and the video appears
// 1–2 seconds late.
//
// To fix that, this module:
//   1. Injects a <link rel="preload" as="video"> hint at module-load time so
//      the browser starts the HTTP request as early as possible — before
//      Phaser is even constructed.
//   2. Issues a parallel `fetch()` for the same URL and stores the resulting
//      blob URL. Phaser scenes can call `getMenuVideoSrc()` and use the blob
//      URL with `this.load.video()`; the browser serves it from memory and
//      `loadeddata` fires within a frame or two.
//
// Both mechanisms hit the same URL, so the browser's HTTP cache dedupes — the
// fetch piggybacks on the preload hint's in-flight request and we don't pay
// for the bytes twice.
// ---------------------------------------------------------------------------

const VIDEO_URL = 'assets/ui/landscape.mp4';

let blobUrlPromise: Promise<string> | null = null;
let resolvedBlobUrl: string | null = null;

export function startMenuVideoPrefetch(): void {
  if (blobUrlPromise) return; // idempotent — only run once per page load

  // 1) Browser preload hint. `as="video"` is honored by Chromium/Firefox; on
  //    Safari it falls back to a no-op which is fine — the fetch() below
  //    still warms the HTTP cache.
  if (typeof document !== 'undefined') {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'video';
    link.href = VIDEO_URL;
    document.head.appendChild(link);
  }

  // 2) Real fetch into a Blob so we can hand Phaser a blob: URL that loads
  //    synchronously off the bytes already in memory.
  blobUrlPromise = fetch(VIDEO_URL, { credentials: 'same-origin' })
    .then((res) => {
      if (!res.ok) throw new Error(`menu video prefetch failed: ${res.status}`);
      return res.blob();
    })
    .then((blob) => {
      resolvedBlobUrl = URL.createObjectURL(blob);
      return resolvedBlobUrl;
    })
    .catch((err) => {
      console.warn('[menu-video-prefetch] falling back to network URL', err);
      // Soft fallback: hand back the original URL so Phaser still works.
      return VIDEO_URL;
    });
}

// Returns the blob URL if the prefetch has finished; otherwise null.
// Synchronous so scenes can pick the best available source without async/await
// in their preload() (which would race the Loader queue).
export function getMenuVideoSrcSync(): string {
  return resolvedBlobUrl ?? VIDEO_URL;
}

// Awaitable version for scenes that can pause before queueing.
export function getMenuVideoSrc(): Promise<string> {
  if (!blobUrlPromise) startMenuVideoPrefetch();
  return blobUrlPromise!;
}
