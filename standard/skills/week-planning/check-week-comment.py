#!/usr/bin/env python3
"""校验运作活①评论是不是 Workbench 能解析的周计划格式。

读标准输入或第一个文件参数。退出码 0 = 过;非 0 把缺什么打到 stderr。
挂评论之前跑一遍,过了再贴。
"""
import sys
from typing import Optional

HEAD_GOAL = "周目标"
HEAD_SCOPE = "本周纳入"
HEAD_READINGS = "本周指标读数"


def heading_matches(line: str, name: str) -> bool:
    t = line.strip()
    if not t.startswith("##"):
        return False
    rest = t[2:].strip()
    return (
        rest == name
        or rest.startswith(name + "(")
        or rest.startswith(name + "（")
        or rest.startswith(name + " ")
    )


def has_heading(body: str, name: str) -> bool:
    return any(heading_matches(l, name) for l in body.splitlines())


def first_line_under(body: str, name: str) -> Optional[str]:
    lines = body.splitlines()
    i = 0
    while i < len(lines):
        if heading_matches(lines[i], name):
            i += 1
            break
        i += 1
    else:
        return None
    while i < len(lines):
        t = lines[i].strip()
        if t.startswith("##"):
            return None
        if t and not t.startswith(">"):
            return t
        i += 1
    return None


def main() -> int:
    if len(sys.argv) > 1:
        with open(sys.argv[1], encoding="utf-8") as f:
            body = f.read()
    else:
        body = sys.stdin.read()
    errs = []
    if not has_heading(body, HEAD_GOAL):
        errs.append(f"缺二级标题 `## {HEAD_GOAL}`")
    elif not first_line_under(body, HEAD_GOAL):
        errs.append(f"`## {HEAD_GOAL}` 下面要有内容,不能空着")
    if not has_heading(body, HEAD_SCOPE):
        errs.append(f"缺二级标题 `## {HEAD_SCOPE}`")
    if not has_heading(body, HEAD_READINGS):
        errs.append(f"缺二级标题 `## {HEAD_READINGS}`")
    if errs:
        print("周计划评论格式不对:", file=sys.stderr)
        for e in errs:
            print(f"  - {e}", file=sys.stderr)
        return 1
    print("周计划评论格式通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
