#!/usr/bin/env python3
"""
adong-ai-daily · 零构建静态日报站编译器（纯 Python 标准库）

功能：
1. 若传入 --ingest-candidates 与 --ingest-curated，先按候选短 ID（如 N001）精确回填真实 URL、
   多源共振列表与点赞/Star 热度，生成标准化单日账本 data/daily/YYYY-MM-DD.json。
2. 扫描 data/daily/*.json，编译生成静态站所需数据层：
   - site/data/site_meta.json   站点配置与外链元数据
   - site/data/manifest.json    全部期数列表（按日期倒序）与统计摘要
   - site/data/daily/*.json     单日账本数据
   - site/data/search.json      跨月全库检索索引（支持搜事件标题、摘要、阿东判断、来源）
   - site/feed/atom.xml         标准 Atom 1.0 订阅源
"""

from __future__ import annotations

import argparse
import html
import json
import re
import shutil
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
BEIJING_TZ = timezone(timedelta(hours=8))

CATEGORY_ORDER = [
    "科研进展",
    "技术突破",
    "产品发布",
    "融资并购",
    "开源工具",
    "重磅观点",
    "行业动态",
    "政策监管",
    "产业观察",
]

BANNED_CLICHES = [
    "意义重大", "里程碑式", "颠覆性", "铺平了道路", "随着大模型的发展",
    "生态建设加速", "资本市场看好相关领域", "值得关注的重要动态", "引爆全网",
]


def weekday_zh(date_str: str) -> str:
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        return ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][dt.weekday()]
    except ValueError:
        return ""


def clean_url(url: str) -> str:
    return re.sub(r"[?&]scm=[^&]+", "", url or "").rstrip("?&")


def load_site_config(cfg_path: Path | None = None) -> dict[str, Any]:
    path = cfg_path or (REPO_ROOT / "site.config.json")
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def ingest_day(candidates_path: Path, curated_path: Path, out_daily_dir: Path, config: dict[str, Any]) -> Path:
    candidates_data = json.loads(candidates_path.read_text(encoding="utf-8"))
    curated = json.loads(curated_path.read_text(encoding="utf-8"))

    blob = json.dumps(curated, ensure_ascii=False)
    hits = [w for w in BANNED_CLICHES if w in blob]
    if hits:
        print(f"⚠️ 文风提示：检测到套话词 {hits}，建议保持平实克制。", file=sys.stderr)

    cand_map: dict[str, dict[str, Any]] = {
        c["id"]: c for c in (candidates_data.get("candidates") or [])
    }

    enriched_items: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    for raw_item in curated.get("items") or []:
        cid = str(raw_item.get("id") or "").strip()
        if not cid or cid in seen_ids:
            continue
        base = cand_map.get(cid)
        if not base:
            print(f"⚠️ 跳过未知候选 ID: {cid}", file=sys.stderr)
            continue
        seen_ids.add(cid)

        cat = raw_item.get("category") or base.get("suggested_category") or "行业动态"
        if cat not in CATEGORY_ORDER:
            cat = "行业动态"

        heat_badge = ""
        cleaned_sources = []
        for s in base.get("sources") or []:
            s_copy = dict(s)
            s_copy["url"] = clean_url(s_copy.get("url", ""))
            cleaned_sources.append(s_copy)
            if not heat_badge and s.get("heat"):
                h = s["heat"]
                h_str = f"{h/1000:.1f}k" if h >= 1000 else str(h)
                unit = s.get("heat_unit") or ""
                heat_badge = f"{h_str} {unit}".strip()

        enriched_items.append({
            "id": cid,
            "category": cat,
            "headline": (raw_item.get("headline") or base["title"]).strip(),
            "one_liner": (raw_item.get("one_liner") or base.get("summary") or "").strip(),
            "adong_note": (raw_item.get("adong_note") or "").strip(),
            "primary_url": clean_url(base["primary_url"]),
            "primary_source": base["primary_source"],
            "tier": base.get("tier", "media"),
            "author": base.get("author", ""),
            "resonance_count": base.get("resonance_count", 1),
            "heat_badge": heat_badge,
            "focus_hits": base.get("focus_hits") or [],
            "sources": cleaned_sources,
        })

    if not enriched_items:
        raise ValueError("ingest 失败：有效精选条目数为 0")

    item_by_id = {it["id"]: it for it in enriched_items}

    top_ids = [tid for tid in (curated.get("top_picks") or []) if tid in item_by_id]
    for it in enriched_items:
        if len(top_ids) >= 4:
            break
        if it["id"] not in top_ids:
            top_ids.append(it["id"])
    top_picks = [item_by_id[tid] for tid in top_ids[:4]]

    insights = []
    for ins in curated.get("insights") or []:
        ev_ids = [eid for eid in (ins.get("evidence_ids") or []) if eid in item_by_id]
        insights.append({
            "title": (ins.get("title") or "").strip(),
            "body": (ins.get("body") or "").strip(),
            "evidence_ids": ev_ids,
        })

    date_str = curated.get("date") or candidates_data.get("date") or datetime.now(BEIJING_TZ).strftime("%Y-%m-%d")
    update_time = candidates_data.get("update_time") or datetime.now(BEIJING_TZ).strftime("%Y-%m-%d %H:%M:%S")

    daily_payload = {
        "schema_version": "2.0",
        "date": date_str,
        "weekday": weekday_zh(date_str),
        "update_time": update_time,
        "daily_take": (curated.get("daily_take") or "").strip(),
        "stats": {
            **(candidates_data.get("stats") or {}),
            "selected_count": len(enriched_items),
        },
        "top_picks": top_picks,
        "insights": insights,
        "categories": CATEGORY_ORDER,
        "items": enriched_items,
        "sources_telemetry": candidates_data.get("sources") or [],
    }

    out_daily_dir.mkdir(parents=True, exist_ok=True)
    target = out_daily_dir / f"{date_str}.json"
    target.write_text(json.dumps(daily_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return target


def build_atom_feed(days_payloads: list[dict[str, Any]], config: dict[str, Any]) -> str:
    base_url = (config.get("base_url") or "https://adongwanai.github.io/adong-ai-daily").rstrip("/")
    feed_url = config.get("feed_url") or f"{base_url}/feed/atom.xml"
    title = html.escape(config.get("site_title", "阿东 AI 日报"))
    subtitle = html.escape(config.get("subtitle", "一线 Agent 工程师的每日 AI 情报账本"))
    author_name = html.escape(config.get("author_name", "阿东玩 AI"))
    updated = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    entries_xml: list[str] = []
    for day in days_payloads[:20]:
        d = day["date"]
        entry_url = f"{base_url}/#/{d}"
        entry_updated = f"{d}T01:00:00Z"

        html_parts: list[str] = []
        if day.get("daily_take"):
            html_parts.append(f"<p><strong>⚡ 今日主线判断：</strong>{html.escape(day['daily_take'])}</p>")

        if day.get("insights"):
            html_parts.append("<h3>🔭 阿东今日趋势判断</h3><ul>")
            for ins in day["insights"]:
                html_parts.append(f"<li><strong>{html.escape(ins['title'])}</strong>：{html.escape(ins['body'])}</li>")
            html_parts.append("</ul>")

        if day.get("top_picks"):
            html_parts.append("<h3>🏆 今日必读 Top Picks</h3><ul>")
            for it in day["top_picks"]:
                note = f"<br/><em>💡 阿东注：{html.escape(it['adong_note'])}</em>" if it.get("adong_note") else ""
                html_parts.append(
                    f"<li><a href=\"{html.escape(it['primary_url'])}\"><strong>[{html.escape(it['category'])}] {html.escape(it['headline'])}</strong></a>"
                    f" — {html.escape(it.get('one_liner', ''))}{note}</li>"
                )
            html_parts.append("</ul>")

        content_escaped = html.escape("".join(html_parts))
        entry_title = html.escape(f"{config.get('site_title', '阿东 AI 日报')} · {d} {day.get('weekday', '')}")
        entries_xml.append(
            f"""  <entry>
    <title>{entry_title}</title>
    <link href="{entry_url}" rel="alternate" type="text/html"/>
    <id>{entry_url}</id>
    <updated>{entry_updated}</updated>
    <content type="html">{content_escaped}</content>
  </entry>"""
        )

    return f"""<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>{title}</title>
  <subtitle>{subtitle}</subtitle>
  <link href="{feed_url}" rel="self" type="application/atom+xml"/>
  <link href="{base_url}/" rel="alternate" type="text/html"/>
  <id>{base_url}/</id>
  <updated>{updated}</updated>
  <author>
    <name>{author_name}</name>
  </author>
{chr(10).join(entries_xml)}
</feed>
"""


def build_static_site(data_dir: Path, site_dir: Path, config: dict[str, Any]) -> None:
    daily_src = data_dir / "daily"
    daily_src.mkdir(parents=True, exist_ok=True)

    site_data_dir = site_dir / "data"
    site_daily_dir = site_data_dir / "daily"
    site_feed_dir = site_dir / "feed"
    site_daily_dir.mkdir(parents=True, exist_ok=True)
    site_feed_dir.mkdir(parents=True, exist_ok=True)

    # 清理过期的 site/data/daily/*.json
    for old_f in site_daily_dir.glob("*.json"):
        old_f.unlink()

    daily_files = sorted(daily_src.glob("*.json"), key=lambda p: p.stem, reverse=True)
    days_manifest: list[dict[str, Any]] = []
    search_entries: list[dict[str, Any]] = []
    loaded_days: list[dict[str, Any]] = []

    for fpath in daily_files:
        payload = json.loads(fpath.read_text(encoding="utf-8"))
        d = payload["date"]
        loaded_days.append(payload)

        # 复制单日 JSON 至 site/data/daily/
        shutil.copyfile(fpath, site_daily_dir / f"{d}.json")

        st = payload.get("stats") or {}
        days_manifest.append({
            "date": d,
            "weekday": payload.get("weekday") or weekday_zh(d),
            "update_time": payload.get("update_time", ""),
            "daily_take": payload.get("daily_take", ""),
            "selected_count": st.get("selected_count", len(payload.get("items") or [])),
            "raw_articles": st.get("raw_articles", 0),
            "multi_source_clusters": st.get("multi_source_clusters", 0),
            "insight_count": len(payload.get("insights") or []),
        })

        # 写入跨日检索索引
        for ins_idx, ins in enumerate(payload.get("insights") or [], 1):
            search_entries.append({
                "kind": "insight",
                "date": d,
                "id": f"INS-{ins_idx}",
                "category": "阿东判断",
                "title": ins.get("title", ""),
                "summary": ins.get("body", ""),
                "source": config.get("author_name", "阿东玩 AI"),
                "url": f"#/{d}",
                "resonance_count": 1,
            })

        for it in payload.get("items") or []:
            search_entries.append({
                "kind": "item",
                "date": d,
                "id": it["id"],
                "category": it["category"],
                "title": it["headline"],
                "summary": it.get("one_liner", ""),
                "adong_note": it.get("adong_note", ""),
                "source": it["primary_source"],
                "url": it["primary_url"],
                "resonance_count": it.get("resonance_count", 1),
                "heat_badge": it.get("heat_badge", ""),
            })

    site_meta = {
        "site_title": config.get("site_title", "阿东 AI 日报"),
        "brand_badge": config.get("brand_badge", "ADONG AI DAILY"),
        "subtitle": config.get("subtitle", "一线 Agent 工程师的每日 AI 情报账本"),
        "author_name": config.get("author_name", "阿东玩 AI"),
        "author_url": config.get("author_url", "https://adongwanai.github.io/"),
        "author_intro": config.get("author_intro", ""),
        "repository_url": config.get("repository_url", "https://github.com/adongwanai/adong-ai-daily"),
        "links": config.get("links") or [],
        "categories": CATEGORY_ORDER,
    }

    manifest = {
        "generated_at": datetime.now(BEIJING_TZ).strftime("%Y-%m-%d %H:%M:%S"),
        "total_days": len(days_manifest),
        "total_items": sum(x["selected_count"] for x in days_manifest),
        "latest_date": days_manifest[0]["date"] if days_manifest else None,
        "days": days_manifest,
    }

    (site_data_dir / "site_meta.json").write_text(json.dumps(site_meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (site_data_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (site_data_dir / "search.json").write_text(json.dumps({"items": search_entries}, ensure_ascii=False) + "\n", encoding="utf-8")
    (site_feed_dir / "atom.xml").write_text(build_atom_feed(loaded_days, config), encoding="utf-8")
    (site_dir / ".nojekyll").write_text("", encoding="utf-8")

    print(f"✅ 静态站构建完成：共 {len(days_manifest)} 期日报，检索库 {len(search_entries)} 条记录 -> {site_dir}")


def main() -> None:
    parser = argparse.ArgumentParser(description="adong-ai-daily · 静态站构建工具")
    parser.add_argument("--data-dir", default=str(REPO_ROOT / "data"), help="数据目录（含 daily/*.json）")
    parser.add_argument("--site-dir", default=str(REPO_ROOT / "site"), help="静态网页目录")
    parser.add_argument("--config", default=str(REPO_ROOT / "site.config.json"), help="站点配置文件")
    parser.add_argument("--ingest-candidates", default="", help="可选：待入库的候选池 JSON")
    parser.add_argument("--ingest-curated", default="", help="可选：待入库的策展 JSON")
    args = parser.parse_args()

    config = load_site_config(Path(args.config))
    data_dir = Path(args.data_dir)
    site_dir = Path(args.site_dir)

    if args.ingest_candidates and args.ingest_curated:
        saved = ingest_day(
            candidates_path=Path(args.ingest_candidates),
            curated_path=Path(args.ingest_curated),
            out_daily_dir=data_dir / "daily",
            config=config,
        )
        print(f"📥 已合并生成单日账本: {saved}")

    build_static_site(data_dir=data_dir, site_dir=site_dir, config=config)


if __name__ == "__main__":
    main()
