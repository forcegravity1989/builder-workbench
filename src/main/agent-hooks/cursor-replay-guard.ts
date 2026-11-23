// Cursor imports Claude hooks; only its native hook may report its events.
export function buildPosixCursorReplayGuardLines(): string[] {
  return ['if [ -n "$CURSOR_VERSION" ] && [ -n "$CURSOR_PROJECT_DIR" ]; then', '  exit 0', 'fi']
}

export function buildWindowsCursorReplayGuardLines(): string[] {
  // Cursor owns stdin; an imported Claude hook must exit without draining its pipe.
  return ['if not "%CURSOR_VERSION%"=="" if not "%CURSOR_PROJECT_DIR%"=="" exit /b 0']
}
