#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 codex 的 4 个用户线程从 thread_history_1.sqlite 提取成可读的 markdown 对话记录。"""
import sqlite3, json, os, re, textwrap

DB = os.path.expanduser("~/.codex/thread_history_1.sqlite")
STATE = os.path.expanduser("~/.codex/state_5.sqlite")
OUT = "/home/lyuzhilin/ai-research-workspace/.tmp-codex-recover"
os.makedirs(OUT, exist_ok=True)

# 顶层用户线程 (去重: id == session 且非 subagent) —— 从 rollout/db 里拿到确切的 4 个
THREADS = {
    "01a061f9-c8a1-7f13-955f-4099427d8ce9": "实现 A2A 与第二个专业 Agent",
    "01a0654c-983c-7c63-8bec-30dfdc6c863a": "解决每次对话 reconnection 问题",
    "01a065f3-1f8f-7ea0-a3c6-0ca7cbf91d00": "查找之前的对话",
    "01a065fe-bba5-7383-9297-572ba9e93046": "恢复 Codex 近两天对话记录",
}

def esc(t):
    return (t or "").strip()

def get_thread_meta(tid):
    con = sqlite3.connect(STATE); cur = con.cursor()
    cur.execute("SELECT title, datetime(created_at,'unixepoch','localtime'), datetime(updated_at,'unixepoch','localtime'), model, first_user_message, tokens_used, cli_version FROM threads WHERE id=?", (tid,))
    row = cur.fetchone(); con.close()
    return row

con = sqlite3.connect(DB); cur = con.cursor()

for tid, name in THREADS.items():
    meta = get_thread_meta(tid)
    rows = cur.execute(
        "SELECT item_type, item_json, created_at_ms, rollout_ordinal FROM thread_items "
        "WHERE thread_id=? ORDER BY created_at_ms ASC, item_id ASC", (tid,)).fetchall()
    lines = []
    lines.append(f"# {name}\n")
    if meta:
        lines.append(f"- **线程 ID**: `{tid}`")
        lines.append(f"- **创建**: {meta[1]}  |  最后更新: {meta[2]}")
        lines.append(f"- **模型**: {meta[3] or '?'}  |  cli: {meta[6] or '?'}  |  tokens: {meta[5] or 0}")
        lines.append(f"- **首条消息**: {esc(meta[4])[:90]}")
    lines.append("")
    # 统计
    from collections import Counter
    cnt = Counter(r[0] for r in rows)
    lines.append(f"> 消息条目统计: 用户 {cnt.get('userMessage',0)} | 助手 {cnt.get('agentMessage',0)} | 命令 {cnt.get('commandExecution',0)} | 文件变更 {cnt.get('fileChange',0)} | 推理片段 {cnt.get('reasoning',0)}")
    lines.append("")
    lines.append("---")
    lines.append("")

    for item_type, item_json, ts, ordinal in rows:
        try:
            d = json.loads(item_json)
        except Exception:
            continue
        if item_type == "userMessage":
            # content: 数组, 可能带附件/文本; 也有 content[].type=="image" 等
            texts = []
            for c in d.get("content", []):
                if c.get("type") == "text":
                    texts.append(c.get("text", ""))
                elif c.get("type") in ("image", "image_url", "screenshot", "input_image"):
                    texts.append(f"[图片附件 {c.get('type')}]")
            body = "\n".join(t for t in texts if t.strip())
            if body.strip():
                lines.append(f"## 🧑 用户\n\n{body.strip()}\n")
        elif item_type == "agentMessage":
            text = esc(d.get("text"))
            if text:
                lines.append(f"## 🤖 Codex 助手\n\n{text}\n")
        elif item_type == "commandExecution":
            cmd = d.get("command") or d.get("command_text") or ""
            if isinstance(cmd, dict):
                cmd = cmd.get("text") or cmd.get("command") or json.dumps(cmd, ensure_ascii=False)
            desc = esc(d.get("description")) or ""
            lines.append(f"```bash\n# 命令{(' | '+desc) if desc else ''}\n{esc(str(cmd))[:400]}\n```\n")
        elif item_type == "fileChange":
            path = d.get("path") or d.get("file_path") or ""
            kind = d.get("change_type") or d.get("type") or "edit"
            lines.append(f"- 📄 文件{kind}: `{path}`\n")
        # 忽略 reasoning / webSearch / imageView / contextCompaction 细节, 避免噪音

    outfile = os.path.join(OUT, f"{name}.md")
    with open(outfile, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"[OK] {name}  ->  {outfile}  ({len(rows)} 条目)")

con.close()
print("\n完成。")
