#!/usr/bin/env python3
"""记分牌场景指标的占位协议脚本。

这些指标的口径已按总览保真稿写入 .bw/metrics.toml，历史来源还没接入。
按指标协议退出 2：不写 0，不写示意读数。接入可按日/周核对的来源后，换成真正的采集脚本。
"""

import sys

name = next((arg for arg in sys.argv[1:] if not arg.startswith("-")), "指标")
print(f"{name}还没有可按日/周核对的历史来源", file=sys.stderr)
sys.exit(2)
