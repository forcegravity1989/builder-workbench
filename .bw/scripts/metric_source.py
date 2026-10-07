"""Read metric input files from their recorded Git revision, never the dirty checkout."""

import os
import subprocess
from pathlib import Path


def read_source_text(data_root: Path, path: str | Path, ref: str | None = None) -> str:
    root = data_root.resolve()
    source = Path(path)
    if source.is_absolute():
        try:
            source = source.relative_to(root)
        except ValueError as error:
            raise RuntimeError(f"数据文件不在仓库内:{source}") from error
    if ".." in source.parts:
        raise RuntimeError(f"数据文件路径不能越出仓库:{source}")
    revision = ref or os.environ.get("BW_METRICS_DATA_COMMIT", "").strip() or "HEAD"
    object_name = f"{revision}:{source.as_posix()}"
    try:
        result = subprocess.run(
            ["git", "-C", str(root), "cat-file", "blob", object_name],
            capture_output=True, text=True, encoding="utf-8", stdin=subprocess.DEVNULL,
        )
    except OSError as error:
        raise RuntimeError(f"读取数据提交失败:{error}") from error
    if result.returncode:
        raise RuntimeError(f"读不到数据提交 {object_name}:{result.stderr.strip()[:300]}")
    return result.stdout
