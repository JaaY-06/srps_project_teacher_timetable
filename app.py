# ============================================================
#  app.py  —  Flask Backend + Graph Theory Engine
#  Run this file to start the web server:  python app.py
# ============================================================

from flask import Flask, jsonify, request, render_template
import networkx as nx
import json
import os
from itertools import combinations

# ── Create the Flask app ─────────────────────────────────────
app = Flask(__name__)

# ── Path to our teacher data file ────────────────────────────
DATA_FILE = os.path.join(os.path.dirname(__file__), "data", "teachers.json")


# ============================================================
#  HELPER: Load / Save teachers from JSON file
# ============================================================

def load_data():
    """Read the teachers.json file and return its contents."""
    with open(DATA_FILE, "r") as f:
        return json.load(f)

def save_data(data):
    """Write updated data back to teachers.json."""
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2)


# ============================================================
#  GRAPH ENGINE: Build conflict graph + run coloring
# ============================================================

def build_conflict_graph(teachers):
    """
    Build a NetworkX graph where:
      - Each node  = a teacher
      - Each edge  = a conflict (same dept OR shared subject)
    Two teachers who share an edge CANNOT be in the same time slot.
    """
    G = nx.Graph()

    # Add every teacher as a node
    for t in teachers:
        G.add_node(t["id"], name=t["name"], dept=t["dept"], subjects=t["subjects"])

    # Add edges between teachers that conflict
    for t1, t2 in combinations(teachers, 2):
        shared = set(t1["subjects"]) & set(t2["subjects"])
        same_dept = t1["dept"] == t2["dept"]

        if shared or same_dept:
            reason = "shared_subject" if shared else "same_dept"
            G.add_edge(t1["id"], t2["id"], reason=reason)

    return G


def auto_assign_slots(teachers):
    """
    Use graph coloring to automatically assign time slots.
    Graph coloring guarantees that no two conflicting teachers
    share the same slot (color).
    """
    G = build_conflict_graph(teachers)

    # NetworkX greedy_color assigns each node a 'color' (integer)
    # We treat each color as a slot number
    coloring = nx.coloring.greedy_color(G, strategy="largest_first")

    NUM_SLOTS = 5
    for t in teachers:
        color = coloring.get(t["id"], 0)
        t["slot"] = (color % NUM_SLOTS) + 1   # Map color → slot 1–5

    return teachers


def check_conflicts(teachers):
    """
    After any manual edit, re-check if two conflicting teachers
    are now in the same slot.  Returns a list of conflict pairs.
    """
    G = build_conflict_graph(teachers)
    slot_map = {t["id"]: t["slot"] for t in teachers}

    conflicts = []
    for t1_id, t2_id in G.edges():
        if slot_map.get(t1_id) is not None and slot_map.get(t1_id) == slot_map.get(t2_id):
            conflicts.append({
                "teacher1": t1_id,
                "teacher2": t2_id,
                "slot":     slot_map[t1_id],
                "reason":   G[t1_id][t2_id]["reason"]
            })
    return conflicts


def get_graph_data(teachers):
    """
    Convert the conflict graph into a format D3.js can read:
      { nodes: [...], links: [...] }
    D3 uses 'links' instead of 'edges'.
    """
    G = build_conflict_graph(teachers)
    slot_map = {t["id"]: t["slot"] for t in teachers}

    nodes = []
    for node_id, attrs in G.nodes(data=True):
        nodes.append({
            "id":   node_id,
            "name": attrs["name"],
            "dept": attrs["dept"],
            "slot": slot_map.get(node_id)
        })

    links = []
    conflicts = {(c["teacher1"], c["teacher2"]) for c in check_conflicts(teachers)}
    for t1_id, t2_id, attrs in G.edges(data=True):
        is_conflict = (t1_id, t2_id) in conflicts or (t2_id, t1_id) in conflicts
        links.append({
            "source":      t1_id,
            "target":      t2_id,
            "reason":      attrs["reason"],
            "is_conflict": is_conflict
        })

    return {"nodes": nodes, "links": links}


# ============================================================
#  FLASK ROUTES: The API endpoints the browser calls
# ============================================================

@app.route("/")
def index():
    """Serve the main dashboard page (templates/index.html)."""
    return render_template("index.html")


@app.route("/api/timetable", methods=["GET"])
def get_timetable():
    """
    GET /api/timetable
    Returns the full timetable: teachers with their assigned slots,
    the time slot labels, any current conflicts, and graph data.
    """
    data      = load_data()
    teachers  = data["teachers"]
    time_slots = data["time_slots"]

    # If no slots assigned yet, auto-assign via graph coloring
    if all(t["slot"] is None for t in teachers):
        teachers = auto_assign_slots(teachers)
        data["teachers"] = teachers
        save_data(data)

    conflicts  = check_conflicts(teachers)
    graph_data = get_graph_data(teachers)

    return jsonify({
        "teachers":   teachers,
        "time_slots": time_slots,
        "conflicts":  conflicts,
        "graph":      graph_data,
        "stats": {
            "total_teachers":   len(teachers),
            "total_conflicts":  len(conflicts),
            "slots_used":       len(set(t["slot"] for t in teachers if t["slot"]))
        }
    })


@app.route("/api/update_slot", methods=["POST"])
def update_slot():
    """
    POST /api/update_slot
    Body: { "teacher_id": "T1", "new_slot": 3 }

    Move a teacher to a new time slot.
    Returns whether the move caused any conflicts.
    """
    body       = request.get_json()
    teacher_id = body.get("teacher_id")
    new_slot   = int(body.get("new_slot"))

    data     = load_data()
    teachers = data["teachers"]

    # Find and update the teacher's slot
    for t in teachers:
        if t["id"] == teacher_id:
            t["slot"] = new_slot
            break
    else:
        return jsonify({"error": f"Teacher {teacher_id} not found"}), 404

    data["teachers"] = teachers
    save_data(data)

    conflicts  = check_conflicts(teachers)
    graph_data = get_graph_data(teachers)

    return jsonify({
        "status":     "conflict" if conflicts else "ok",
        "conflicts":  conflicts,
        "graph":      graph_data,
        "stats": {
            "total_teachers":  len(teachers),
            "total_conflicts": len(conflicts),
            "slots_used":      len(set(t["slot"] for t in teachers if t["slot"]))
        }
    })


@app.route("/api/add_teacher", methods=["POST"])
def add_teacher():
    """
    POST /api/add_teacher
    Body: { "name": "Dr. New", "dept": "Computer", "subjects": ["Math"] }

    Add a new teacher and auto-assign them a non-conflicting slot.
    """
    body = request.get_json()
    data = load_data()

    # Generate a new unique ID
    existing_ids = [t["id"] for t in data["teachers"]]
    new_num      = len(existing_ids) + 1
    new_id       = f"T{new_num}"
    while new_id in existing_ids:
        new_num += 1
        new_id = f"T{new_num}"

    new_teacher = {
        "id":       new_id,
        "name":     body.get("name", "New Teacher"),
        "dept":     body.get("dept", "Computer"),
        "subjects": body.get("subjects", []),
        "slot":     None
    }

    data["teachers"].append(new_teacher)

    # Re-run graph coloring for all teachers
    data["teachers"] = auto_assign_slots(data["teachers"])
    save_data(data)

    conflicts  = check_conflicts(data["teachers"])
    graph_data = get_graph_data(data["teachers"])

    return jsonify({
        "status":      "ok",
        "new_teacher": new_teacher,
        "conflicts":   conflicts,
        "graph":       graph_data
    })


@app.route("/api/auto_assign", methods=["POST"])
def auto_assign():
    """
    POST /api/auto_assign
    Re-run the graph coloring algorithm to auto-assign ALL teachers
    to conflict-free slots.  Useful to reset after manual edits.
    """
    data             = load_data()
    data["teachers"] = auto_assign_slots(data["teachers"])
    save_data(data)

    conflicts  = check_conflicts(data["teachers"])
    graph_data = get_graph_data(data["teachers"])

    return jsonify({
        "status":    "ok",
        "teachers":  data["teachers"],
        "conflicts": conflicts,
        "graph":     graph_data
    })


@app.route("/api/reset", methods=["POST"])
def reset():
    """
    POST /api/reset
    Clear all slot assignments so everything is unassigned.
    """
    data = load_data()
    for t in data["teachers"]:
        t["slot"] = None
    save_data(data)
    return jsonify({"status": "ok", "message": "All slots cleared"})


# ── Start the server ─────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 50)
    print("  Timetable Dashboard running!")
    print("  Open your browser at: http://localhost:5000")
    print("=" * 50)
    app.run(debug=True, port=5000)
