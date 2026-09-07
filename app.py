"""个人工作台后端 — Flask + SQLite
启动: python3 app.py
访问: http://localhost:5000/
"""
import sqlite3
import os
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory, g

APP_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(APP_DIR, "workbench.db")
STATIC_DIR = os.path.join(APP_DIR, "static")

app = Flask(__name__, static_folder=STATIC_DIR, static_url_path="")


# ---------- DB helpers ----------
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = sqlite3.connect(DB_PATH)
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS todos (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            parent_id TEXT,
            note TEXT DEFAULT '',
            done INTEGER DEFAULT 0,
            expanded INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0,
            created_at TEXT
        );
        CREATE TABLE IF NOT EXISTS dones (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            todo_id TEXT,
            date TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            note TEXT DEFAULT '',
            created_at TEXT
        );
        CREATE TABLE IF NOT EXISTS habits (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            emoji TEXT DEFAULT '🌟',
            type TEXT DEFAULT 'check',
            unit TEXT DEFAULT '',
            created_at TEXT
        );
        CREATE TABLE IF NOT EXISTS habit_records (
            id TEXT PRIMARY KEY,
            habit_id TEXT NOT NULL,
            date TEXT NOT NULL,
            value REAL DEFAULT 0,
            created_at TEXT,
            UNIQUE(habit_id, date)
        );
        """
    )
    db.commit()
    db.close()


def uid():
    return os.urandom(6).hex() + datetime.now().strftime("%H%M%S")


def row_to_dict(row):
    return {k: row[k] for k in row.keys()}


# ---------- Pages ----------
@app.route("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.route("/<path:filename>")
def page(filename):
    if filename.startswith("api/"):
        return jsonify({"error": "not found"}), 404
    return send_from_directory(STATIC_DIR, filename)


# ---------- API: Todos ----------
@app.route("/api/todos", methods=["GET"])
def list_todos():
    rows = get_db().execute("SELECT * FROM todos ORDER BY sort_order").fetchall()
    return jsonify([row_to_dict(r) for r in rows])


@app.route("/api/todos", methods=["POST"])
def create_todo():
    data = request.get_json(force=True)
    tid = data.get("id") or uid()
    db = get_db()
    db.execute(
        "INSERT INTO todos (id, title, parent_id, note, done, expanded, sort_order, created_at) VALUES (?,?,?,?,?,?,?,?)",
        (
            tid,
            data["title"],
            data.get("parent_id"),
            data.get("note", ""),
            1 if data.get("done") else 0,
            1 if data.get("expanded", True) else 0,
            data.get("sort_order", 0),
            datetime.now().isoformat(),
        ),
    )
    db.commit()
    return jsonify({"id": tid}), 201


@app.route("/api/todos/<tid>", methods=["PUT"])
def update_todo(tid):
    data = request.get_json(force=True)
    db = get_db()
    fields = []
    vals = []
    for k in ("title", "parent_id", "note", "done", "expanded", "sort_order"):
        if k in data:
            fields.append(f"{k}=?")
            v = data[k]
            if k in ("done", "expanded"):
                v = 1 if v else 0
            vals.append(v)
    if fields:
        vals.append(tid)
        db.execute(f"UPDATE todos SET {', '.join(fields)} WHERE id=?", vals)
        db.commit()
    return jsonify({"ok": True})


@app.route("/api/todos/<tid>", methods=["DELETE"])
def delete_todo(tid):
    db = get_db()
    # collect descendants
    desc = [tid]
    q = [tid]
    while q:
        cur = q.pop()
        children = db.execute("SELECT id FROM todos WHERE parent_id=?", (cur,)).fetchall()
        for c in children:
            desc.append(c["id"])
            q.append(c["id"])
    placeholders = ",".join("?" * len(desc))
    db.execute(f"DELETE FROM todos WHERE id IN ({placeholders})", desc)
    db.execute(f"UPDATE dones SET todo_id=NULL WHERE todo_id IN ({placeholders})", desc)
    db.commit()
    return jsonify({"ok": True})


# ---------- API: Dones ----------
@app.route("/api/dones", methods=["GET"])
def list_dones():
    rows = get_db().execute("SELECT * FROM dones ORDER BY date, start_time").fetchall()
    return jsonify([row_to_dict(r) for r in rows])


@app.route("/api/dones", methods=["POST"])
def create_done():
    data = request.get_json(force=True)
    did = data.get("id") or uid()
    db = get_db()
    db.execute(
        "INSERT INTO dones (id, title, todo_id, date, start_time, end_time, note, created_at) VALUES (?,?,?,?,?,?,?,?)",
        (
            did,
            data["title"],
            data.get("todo_id"),
            data["date"],
            data["start_time"],
            data["end_time"],
            data.get("note", ""),
            datetime.now().isoformat(),
        ),
    )
    db.commit()
    return jsonify({"id": did}), 201


@app.route("/api/dones/<did>", methods=["PUT"])
def update_done(did):
    data = request.get_json(force=True)
    db = get_db()
    fields = []
    vals = []
    for k in ("title", "todo_id", "date", "start_time", "end_time", "note"):
        if k in data:
            fields.append(f"{k}=?")
            vals.append(data[k])
    if fields:
        vals.append(did)
        db.execute(f"UPDATE dones SET {', '.join(fields)} WHERE id=?", vals)
        db.commit()
    return jsonify({"ok": True})


@app.route("/api/dones/<did>", methods=["DELETE"])
def delete_done(did):
    get_db().execute("DELETE FROM dones WHERE id=?", (did,))
    get_db().commit()
    return jsonify({"ok": True})


# ---------- API: Habits ----------
@app.route("/api/habits", methods=["GET"])
def list_habits():
    db = get_db()
    habits = [row_to_dict(r) for r in db.execute("SELECT * FROM habits ORDER BY created_at").fetchall()]
    for h in habits:
        recs = db.execute(
            "SELECT date, value FROM habit_records WHERE habit_id=? ORDER BY date", (h["id"],)
        ).fetchall()
        h["records"] = [{"date": r["date"], "value": r["value"]} for r in recs]
    return jsonify(habits)


@app.route("/api/habits", methods=["POST"])
def create_habit():
    data = request.get_json(force=True)
    hid = data.get("id") or uid()
    db = get_db()
    db.execute(
        "INSERT INTO habits (id, name, emoji, type, unit, created_at) VALUES (?,?,?,?,?,?)",
        (
            hid,
            data["name"],
            data.get("emoji", "🌟"),
            data.get("type", "check"),
            data.get("unit", ""),
            datetime.now().isoformat(),
        ),
    )
    db.commit()
    return jsonify({"id": hid}), 201


@app.route("/api/habits/<hid>", methods=["DELETE"])
def delete_habit(hid):
    db = get_db()
    db.execute("DELETE FROM habit_records WHERE habit_id=?", (hid,))
    db.execute("DELETE FROM habits WHERE id=?", (hid,))
    db.commit()
    return jsonify({"ok": True})


@app.route("/api/habits/<hid>/record", methods=["POST"])
def set_habit_record(hid):
    data = request.get_json(force=True)
    db = get_db()
    rid = uid()
    db.execute(
        "INSERT INTO habit_records (id, habit_id, date, value, created_at) VALUES (?,?,?,?,?) "
        "ON CONFLICT(habit_id, date) DO UPDATE SET value=excluded.value",
        (rid, hid, data["date"], data["value"], datetime.now().isoformat()),
    )
    db.commit()
    rec = db.execute(
        "SELECT date, value FROM habit_records WHERE habit_id=? AND date=?", (hid, data["date"])
    ).fetchone()
    return jsonify({"date": rec["date"], "value": rec["value"]})


# ---------- Seed data (only on first run) ----------
def seed_if_empty():
    db = sqlite3.connect(DB_PATH)
    if db.execute("SELECT COUNT(*) FROM todos").fetchone()[0] > 0:
        db.close()
        return
    now = datetime.now().isoformat()
    today = datetime.now().strftime("%Y-%m-%d")
    yd = datetime.fromtimestamp(datetime.now().timestamp() - 86400).strftime("%Y-%m-%d")
    todos = [
        ("t1", "产品设计", None, "Q4 重点项目，需要完成交互稿与视觉稿", 0, 1, 0),
        ("t2", "完成首页原型", "t1", "参考竞品 A、B 的布局", 0, 1, 0),
        ("t3", "用户调研访谈", "t1", "", 1, 0, 1),
        ("t4", "技术方案", None, "", 0, 1, 1),
        ("t5", "数据库表设计", "t4", "注意索引与分表", 0, 0, 0),
    ]
    for t in todos:
        db.execute("INSERT INTO todos (id,title,parent_id,note,done,expanded,sort_order,created_at) VALUES (?,?,?,?,?,?,?,?)", (*t, now))
    dones = [
        ("d1", "梳理首页信息架构", "t2", today, "09:30", "11:00", "确定了三大模块的优先级"),
        ("d2", "竞品分析报告", "t2", today, "14:00", "15:30", "整理了 5 个竞品的截图"),
        ("d3", "阅读《设计心理学》", None, yd, "21:00", "22:00", "第 3 章"),
    ]
    for d in dones:
        db.execute("INSERT INTO dones (id,title,todo_id,date,start_time,end_time,note,created_at) VALUES (?,?,?,?,?,?,?,?)", (*d, now))
    habits = [
        ("h1", "锻炼", "🏃", "check", ""),
        ("h2", "读书", "📚", "check", ""),
        ("h3", "喝水", "💧", "number", "杯"),
        ("h4", "睡眠", "😴", "time", "小时"),
    ]
    for h in habits:
        db.execute("INSERT INTO habits (id,name,emoji,type,unit,created_at) VALUES (?,?,?,?,?,?)", (*h, now))
    db.execute("INSERT INTO habit_records (id,habit_id,date,value,created_at) VALUES (?,?,?,?,?)", (uid(), "h1", yd, 1, now))
    db.execute("INSERT INTO habit_records (id,habit_id,date,value,created_at) VALUES (?,?,?,?,?)", (uid(), "h2", today, 1, now))
    db.execute("INSERT INTO habit_records (id,habit_id,date,value,created_at) VALUES (?,?,?,?,?)", (uid(), "h3", today, 4, now))
    db.execute("INSERT INTO habit_records (id,habit_id,date,value,created_at) VALUES (?,?,?,?,?)", (uid(), "h4", today, 7.5, now))
    db.commit()
    db.close()


if __name__ == "__main__":
    init_db()
    seed_if_empty()
    print("=" * 50)
    print("  个人工作台已启动")
    print(f"  本地访问:  http://localhost:5000/")
    print(f"  局域网访问: http://<本机IP>:5000/")
    print("=" * 50)
    app.run(host="0.0.0.0", port=5000, debug=False)
