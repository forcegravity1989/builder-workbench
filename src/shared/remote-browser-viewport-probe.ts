// The remote page viewer reads the shared page's CSS viewport size with one fixed expression so it can
// map pointer positions. The host recognises exactly this expression and leaves it out of the access
// log; any other page script is recorded.
export const REMOTE_BROWSER_VIEWPORT_PROBE_EXPRESSION =
  'JSON.stringify({ width: window.innerWidth, height: window.innerHeight })'
