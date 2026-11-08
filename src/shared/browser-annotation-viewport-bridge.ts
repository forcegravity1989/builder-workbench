import { GRAB_BUDGET, type BrowserGrabRect } from './browser-grab-types'

export type BrowserAnnotationViewportBridgeMarker = {
  id: string
  index: number
  rectPage: BrowserGrabRect
  rectViewport: BrowserGrabRect
  isFixed: boolean
  selector?: string
}

export type BrowserSetAnnotationViewportBridgeArgs = {
  browserPageId: string
  enabled: boolean
  emitViewport: boolean
  markers: BrowserAnnotationViewportBridgeMarker[]
  token: string
}

export type BrowserAnnotationViewportBridgeOptions = {
  enabled: boolean
  emitViewport: boolean
  markers: BrowserAnnotationViewportBridgeMarker[]
  token: string
}

export const BROWSER_ANNOTATION_VIEWPORT_BRIDGE_WORLD_ID = 1207
export const BROWSER_ANNOTATION_VIEWPORT_MESSAGE_PREFIX = '__orca_annotation_viewport__:'

export function browserAnnotationMarkerSelector(selector: string): string | undefined {
  // Grab payloads may contain a display-only truncation suffix, never a DOM identity.
  return selector.length > 0 &&
    selector.length <= GRAB_BUDGET.selectorMaxLength &&
    !selector.endsWith(' (truncated)')
    ? selector
    : undefined
}

export function isValidBrowserAnnotationViewportBridgeToken(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{16,80}$/.test(value)
}

function isValidBrowserGrabRect(value: unknown): value is BrowserGrabRect {
  if (!value || typeof value !== 'object') {
    return false
  }
  const rect = value as Record<string, unknown>
  return (
    typeof rect.x === 'number' &&
    Number.isFinite(rect.x) &&
    typeof rect.y === 'number' &&
    Number.isFinite(rect.y) &&
    typeof rect.width === 'number' &&
    Number.isFinite(rect.width) &&
    rect.width >= 0 &&
    typeof rect.height === 'number' &&
    Number.isFinite(rect.height) &&
    rect.height >= 0
  )
}

export function isValidBrowserAnnotationViewportBridgeMarkers(
  value: unknown
): value is BrowserAnnotationViewportBridgeMarker[] {
  return (
    Array.isArray(value) &&
    value.length <= 50 &&
    value.every((marker) => {
      if (!marker || typeof marker !== 'object') {
        return false
      }
      const candidate = marker as Record<string, unknown>
      return (
        typeof candidate.id === 'string' &&
        candidate.id.length > 0 &&
        candidate.id.length <= 100 &&
        Number.isInteger(candidate.index) &&
        (candidate.index as number) >= 0 &&
        (candidate.index as number) < 100 &&
        (candidate.selector === undefined ||
          (typeof candidate.selector === 'string' &&
            candidate.selector.length <= GRAB_BUDGET.selectorMaxLength)) &&
        typeof candidate.isFixed === 'boolean' &&
        isValidBrowserGrabRect(candidate.rectPage) &&
        isValidBrowserGrabRect(candidate.rectViewport)
      )
    })
  )
}

// Why: persisted badges need to follow guest scroll without a React roundtrip;
// the bridge resolves captured selectors once and paints live element bounds in a closed shadow overlay.
export function buildBrowserAnnotationViewportBridgeScript({
  emitViewport,
  enabled,
  markers,
  token
}: BrowserAnnotationViewportBridgeOptions): string {
  return `(() => {
  'use strict';

  const enabled = ${JSON.stringify(enabled)};
  const emitViewportMessages = ${JSON.stringify(emitViewport)};
  const markers = ${JSON.stringify(markers)};
  const token = ${JSON.stringify(token)};
  const prefix = ${JSON.stringify(BROWSER_ANNOTATION_VIEWPORT_MESSAGE_PREFIX)};
  const stateKey = '__orcaBrowserAnnotationViewportBridge';
  const hostAttribute = 'data-orca-browser-annotation-overlay';
  const markerSize = 24;

  const removeOverlay = (state) => {
    if (state && state.host && state.host.parentNode) {
      state.host.parentNode.removeChild(state.host);
    }
  };

  const cleanup = (state) => {
    if (!state) return;
    state.visibilityObserver?.disconnect();
    if (state.raf) {
      cancelAnimationFrame(state.raf);
    }
    if (state.requestUpdate) {
      window.removeEventListener('scroll', state.requestUpdate, true);
      document.removeEventListener('scroll', state.requestUpdate, true);
      window.removeEventListener('resize', state.requestUpdate, true);
    }
    removeOverlay(state);
  };

  const existing = globalThis[stateKey];
  if (!enabled) {
    cleanup(existing);
    delete globalThis[stateKey];
    return true;
  }

  const toNumber = (value, fallback) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;

  const readViewport = () => ({
    scrollX: toNumber(window.scrollX, toNumber(window.pageXOffset, 0)),
    scrollY: toNumber(window.scrollY, toNumber(window.pageYOffset, 0))
  });

  const emitViewport = () => {
    if (!emitViewportMessages) return;
    try {
      console.debug(prefix + token + ':' + JSON.stringify(readViewport()));
    } catch (e) {}
  };

  const getRoot = () => document.body || document.documentElement;

  const ensureOverlay = (state) => {
    if (state.host && state.shadowRoot) {
      return state.shadowRoot;
    }
    const root = getRoot();
    if (!root) return null;
    const host = document.createElement('div');
    host.setAttribute(hostAttribute, '');
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;contain:layout style paint;overflow:hidden;';
    const shadowRoot = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = '.marker{box-sizing:border-box;position:absolute;left:0;top:0;width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:9999px;border:1px solid rgba(255,255,255,0.95);background:#2563eb;color:#fff;font:600 11px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 10px 24px rgba(0,0,0,.18);will-change:transform;pointer-events:none;user-select:none;}';
    shadowRoot.appendChild(style);
    root.appendChild(host);
    state.host = host;
    state.shadowRoot = shadowRoot;
    return shadowRoot;
  };

  const updateMarkers = (state, nextMarkers) => {
    state.markers = Array.isArray(nextMarkers) ? nextMarkers : [];
    if (state.markers.length === 0) {
      removeOverlay(state);
      state.host = null;
      state.shadowRoot = null;
      state.markerElements = new Map();
      state.markerTargets = new Map();
      state.visibilityObserver?.disconnect();
      state.observedTargets = new Set();
      return;
    }
    const shadowRoot = ensureOverlay(state);
    if (!shadowRoot) return;
    const liveIds = new Set();
    const liveTargets = new Set();
    if (!state.observedTargets) state.observedTargets = new Set();
    if (!state.targetVisibility) state.targetVisibility = new WeakMap();
    if (!state.visibilityObserver && typeof IntersectionObserver === 'function') {
      // Let Chromium resolve clipping and fixed containing blocks instead of duplicating CSS rules.
      state.visibilityObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => state.targetVisibility.set(entry.target, entry.isIntersecting));
        state.requestUpdate?.();
      });
    }
    state.markers.forEach((marker) => {
      liveIds.add(marker.id);
      if (!state.markerTargets) state.markerTargets = new Map();
      if (!state.markerTargets.has(marker.id) && marker.selector) {
        let target = null;
        try {
          const matches = document.querySelectorAll(marker.selector);
          if (matches.length === 1) target = matches[0];
        } catch (e) {}
        state.markerTargets.set(marker.id, target);
      }
      const target = state.markerTargets.get(marker.id);
      if (target) liveTargets.add(target);
      let element = state.markerElements.get(marker.id);
      if (!element) {
        element = document.createElement('span');
        element.className = 'marker';
        shadowRoot.appendChild(element);
        state.markerElements.set(marker.id, element);
      }
      element.textContent = String(marker.index + 1);
    });
    state.markerElements.forEach((element, id) => {
      if (!liveIds.has(id)) {
        element.remove();
        state.markerElements.delete(id);
        state.markerTargets?.delete(id);
      }
    });
    state.observedTargets.forEach((target) => {
      if (!liveTargets.has(target)) {
        state.visibilityObserver?.unobserve(target);
        state.observedTargets.delete(target);
      }
    });
    liveTargets.forEach((target) => {
      if (!state.observedTargets.has(target)) {
        state.visibilityObserver?.observe(target);
        state.observedTargets.add(target);
      }
    });
  };

  const positionMarkers = (state) => {
    if (!state.markers || state.markers.length === 0) return;
    const viewport = readViewport();
    const viewportWidth = toNumber(window.innerWidth, 0);
    const viewportHeight = toNumber(window.innerHeight, 0);
    state.markers.forEach((marker) => {
      const element = state.markerElements.get(marker.id);
      if (!element) return;
      const target = state.markerTargets?.get(marker.id);
      if (marker.selector && (!target || !target.isConnected || target.getClientRects().length === 0)) {
        element.style.display = 'none';
        return;
      }
      const sourceRect = target ? target.getBoundingClientRect() : (marker.isFixed ? marker.rectViewport : marker.rectPage);
      const x = target || marker.isFixed ? sourceRect.x : sourceRect.x - viewport.scrollX;
      const y = target || marker.isFixed ? sourceRect.y : sourceRect.y - viewport.scrollY;
      const width = toNumber(sourceRect.width, 0);
      const height = toNumber(sourceRect.height, 0);
      const visible = (!target || state.targetVisibility.get(target) !== false) &&
        x + width >= 0 &&
        y + height >= 0 &&
        x <= viewportWidth &&
        y <= viewportHeight;
      if (!visible) {
        element.style.display = 'none';
        return;
      }
      element.style.display = 'flex';
      element.style.transform =
        'translate3d(' +
        (x + width / 2 - markerSize / 2) +
        'px,' +
        (y + height - markerSize / 2) +
        'px,0)';
    });
  };

  if (existing && existing.requestUpdate) {
    existing.emitViewport = emitViewport;
    updateMarkers(existing, markers);
    existing.requestUpdate();
    return true;
  }

  const state = {
    raf: 0,
    emitViewport,
    host: null,
    markerElements: new Map(),
    markers: [],
    shadowRoot: null,
    requestUpdate: null
  };

  state.requestUpdate = () => {
    if (state.raf) return;
    state.raf = requestAnimationFrame(() => {
      state.raf = 0;
      positionMarkers(state);
      state.emitViewport();
    });
  };

  updateMarkers(state, markers);
  window.addEventListener('scroll', state.requestUpdate, true);
  document.addEventListener('scroll', state.requestUpdate, true);
  window.addEventListener('resize', state.requestUpdate, true);
  globalThis[stateKey] = state;
  state.requestUpdate();
  return true;
})();`
}
