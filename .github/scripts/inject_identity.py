#!/usr/bin/env python3
"""把身份信息注入部署产物 _site/（不进入 git 历史）。

做两件事：
1. 生成 _site/js/identity.local.js —— 前端运行时读取的唯一数据源；
2. 替换 _site/**/*.html 里的 {{NAME}} / {{EMAIL}} / {{GITHUB}} 占位符，
   让不执行 JS 的爬虫和 noscript 访客也能看到正确内容。

未提供值的占位符一律清掉，绝不留在产物里（曾经因为没配 SITE_EMAIL，
线上页面把 {{EMAIL}} 直接暴露了出去）。

用法：
    python3 .github/scripts/inject_identity.py _site

环境变量：
    SITE_NAME / SITE_EMAIL / SITE_GITHUB（缺省即视为未配置，对应条目会被移除）
    SITE_WEB3FORMS_KEY（可选，只写进运行时数据源，供「私信小纸条」使用；
                        缺失时该功能整体隐身，不会出现坏掉的表单）
"""

import html
import json
import os
import pathlib
import re
import sys

PLACEHOLDERS = ("NAME", "EMAIL", "GITHUB")
# 只写进运行时数据源、不参与 HTML 占位符替换的额外键：环境变量后缀 -> identity 键名
# （web3formsKey 只在 JS 里用，页面里没有对应占位符）
EXTRA_IDENTITY = {"WEB3FORMS_KEY": "web3formsKey"}
TOKEN = re.compile(r"\{\{(\w+)\}\}")


def main() -> int:
    site = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "_site")
    if not site.is_dir():
        print(f"error: 目录不存在：{site}（请先复制静态资源）", file=sys.stderr)
        return 1

    values = {key: os.environ.get(f"SITE_{key}", "").strip() for key in PLACEHOLDERS}
    extra = {
        identity_key: os.environ.get(f"SITE_{env_key}", "").strip()
        for env_key, identity_key in EXTRA_IDENTITY.items()
    }

    # 1) 运行时数据源（PLACEHOLDERS 小写后与 js/identity.js 的 DEFAULTS 对齐；
    #    EXTRA_IDENTITY 的值已经是驼峰键名）
    identity = {key.lower(): value for key, value in values.items() if value}
    identity.update({key: value for key, value in extra.items() if value})
    target = site / "js" / "identity.local.js"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        "window.IDENTITY = " + json.dumps(identity, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )

    # 2) 构建期占位符替换 + 兜底清理
    pages = 0
    dropped: set = set()
    for page in sorted(site.rglob("*.html")):
        text = page.read_text(encoding="utf-8")
        original = text

        for key, value in values.items():
            if value:
                text = text.replace("{{%s}}" % key, html.escape(value, quote=True))

        # 未配置的条目连着它所在的那一行 <li> 一起删掉（本站的 <li> 都是单行）
        kept = []
        for line in text.splitlines(keepends=True):
            if "{{" in line and line.lstrip().startswith("<li"):
                dropped.update(TOKEN.findall(line))
                continue
            kept.append(line)
        text = "".join(kept)

        # 剩下零星的占位符（注释等）直接清空，产物里不允许出现 {{
        rest = TOKEN.findall(text)
        if rest:
            dropped.update(rest)
            text = TOKEN.sub("", text)

        if text != original:
            page.write_text(text, encoding="utf-8")
            pages += 1

    missing = [key for key, value in values.items() if not value]
    print(f"注入完成：identity={sorted(identity)}，替换 HTML {pages} 个")
    if missing:
        print(
            "警告：以下值未配置，相关条目已从页面移除：%s" % ", ".join(missing),
            file=sys.stderr,
        )
    missing_extra = [key for key, value in extra.items() if not value]
    if missing_extra:
        print(
            "提示：以下运行时配置未提供，对应功能保持隐身：%s" % ", ".join(missing_extra),
            file=sys.stderr,
        )
    if dropped:
        print(f"已清除残留占位符：{', '.join(sorted(dropped))}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
