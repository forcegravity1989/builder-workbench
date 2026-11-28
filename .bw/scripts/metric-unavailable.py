#!/usr/bin/env python3
"""记分牌场景指标的占位协议脚本。

这些指标的口径已按总览保真稿写入 .bw/metrics.toml，历史来源还没接入。
按指标协议返回空 points（合法 JSON、退出码 0）：读数保持「未知」，
既不写 0，也不写示意读数。执行器把空 points 记为「无数据」，不当作采集失败。
接入可按日/周核对的来源后，换成真正的采集脚本。
"""

import json
import sys

sys.stderr.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8")

name = next((arg for arg in sys.argv[1:] if not arg.startswith("-")), "指标")
print(f"{name}还没有可按日/周核对的历史来源", file=sys.stderr)
json.dump({"points": []}, sys.stdout, ensure_ascii=False)
print(file=sys.stdout)
sys.exit(0)
