#!/usr/bin/env python3
"""
adong-ai-daily · 静态站产物完整性校验脚本（纯标准库）
"""

from __future__ import annotations

import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def main() -> None:
    site_dir = REPO_ROOT / "site"
    errors: list[str] = []

    for req in ("index.html", "style.css", "app.js", "data/manifest.json", "data/site_meta.json", "data/search.json", "feed/atom.xml"):
        if not (site_dir / req).exists():
            errors.append(f"缺少必要文件: site/{req}")

    if errors:
        for e in errors:
            print(f"❌ {e}", file=sys.stderr)
        sys.exit(1)

    manifest = json.loads((site_dir / "data" / "manifest.json").read_text(encoding="utf-8"))
    days = manifest.get("days") or []
    if not days:
        errors.append("manifest.json 中没有任何日报期数（days 为空）")

    for d_meta in days:
        d = d_meta.get("date")
        day_file = site_dir / "data" / "daily" / f"{d}.json"
        if not day_file.exists():
            errors.append(f"缺少单日账本文件: {day_file}")
            continue
        payload = json.loads(day_file.read_text(encoding="utf-8"))
        items = payload.get("items") or []
        if not items:
            errors.append(f"{d}.json 条目为空")
        ids = {it["id"] for it in items}
        for it in items:
            if not str(it.get("primary_url", "")).startswith(("http://", "https://")):
                errors.append(f"{d}.json 条目 {it.get('id')} 缺少合法 URL: {it.get('primary_url')}")
        for ins in payload.get("insights") or []:
            for eid in ins.get("evidence_ids") or []:
                if eid not in ids:
                    errors.append(f"{d}.json 趋势判断引用了不存在的条目 ID: {eid}")

    # 校验 Atom XML 语法合法性
    try:
        ET.parse(site_dir / "feed" / "atom.xml")
    except ET.ParseError as exc:
        errors.append(f"atom.xml XML 语法错误: {exc}")

    # 确保网页中不包含创作者内部按钮残留
    html_js = (site_dir / "index.html").read_text(encoding="utf-8") + (site_dir / "app.js").read_text(encoding="utf-8")
    for forbidden in ("一键复制社群早报", "导出自媒体卡片", "复制选题"):
        if forbidden in html_js:
            errors.append(f"公开网页中残留内部按钮文案: {forbidden}")

    if errors:
        for e in errors:
            print(f"❌ {e}", file=sys.stderr)
        sys.exit(1)

    print(f"✅ 站点校验全部通过：{len(days)} 期日报、Atom RSS 与检索库完整有效。")


if __name__ == "__main__":
    main()
