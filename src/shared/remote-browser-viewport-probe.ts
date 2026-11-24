// The remote page viewer reads the shared page's CSS viewport size with one fixed expression so it can
// map pointer positions. A team-read host allows exactly this expression and no other page script.
export const REMOTE_BROWSER_VIEWPORT_PROBE_EXPRESSION =
  'JSON.stringify({ width: window.innerWidth, height: window.innerHeight })'
