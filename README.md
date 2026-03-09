# 📅 Timetable Graph Dashboard
### Flask + D3.js + Graph Theory — College Schedule Optimizer

---

## What This Does
This project builds a **live web dashboard** that:
- Uses **graph coloring** (NetworkX) to automatically assign teachers to non-conflicting time slots
- Shows a **drag-and-drop timetable grid** where you can manually reassign slots
- Renders an **interactive conflict graph** using D3.js
- Detects and highlights any **scheduling conflicts** in real time

---

## Project Structure
```
timetable_project/
│
├── app.py                    ← Flask server + all API routes + graph engine
├── requirements.txt          ← Python packages to install
├── data/
│   └── teachers.json         ← Teacher data (edit to add your own teachers)
│
├── templates/
│   └── index.html            ← The web dashboard HTML
│
└── static/
    ├── css/style.css         ← All styling
    └── js/
        ├── timetable.js      ← Grid rendering + drag-and-drop
        └── conflict_graph.js ← D3.js graph visualization
```

---

## How to Run (Step by Step)

### Step 1 — Make sure Python is installed
Open a terminal and type:
```
python --version
```
You should see Python 3.8 or higher.

### Step 2 — Install required packages
```bash
cd timetable_project
pip install -r requirements.txt
```
This installs Flask (web server) and NetworkX (graph library).

### Step 3 — Start the server
```bash
python app.py
```
You'll see:
```
==================================================
  Timetable Dashboard running!
  Open your browser at: http://localhost:5000
==================================================
```

### Step 4 — Open the dashboard
Go to your browser and visit: **http://localhost:5000**

---

## How to Use the Dashboard

| Action | How |
|--------|-----|
| Auto-assign slots | Click **⟳ Auto-Assign** button |
| Move a teacher    | Drag their card to a new time slot column |
| Add a teacher     | Click **+ Add Teacher** and fill in the form |
| Filter by dept    | Click **Computer** or **Commerce** filter buttons |
| Reset all slots   | Click **↺ Reset All** |
| See conflicts     | Red cards + red graph edges show conflicts |

---

## How to Add Your Own Teachers
Edit `data/teachers.json` and add entries like:
```json
{
  "id": "T7",
  "name": "Prof. Your Name",
  "dept": "Computer",
  "subjects": ["Subject1", "Subject2"],
  "slot": null
}
```
Save the file and refresh the browser. Click **Auto-Assign** to generate the schedule.

---

## API Endpoints (for reference)
| Endpoint | Method | What it does |
|----------|--------|--------------|
| `/api/timetable`   | GET  | Get full timetable data |
| `/api/update_slot` | POST | Move a teacher to a new slot |
| `/api/add_teacher` | POST | Add a new teacher |
| `/api/auto_assign` | POST | Re-run graph coloring |
| `/api/reset`       | POST | Clear all slot assignments |

---

## The Graph Theory Behind It
- Each teacher is a **node** in a conflict graph
- Two teachers share an **edge** if they're in the same department or teach the same subject
- The schedule is solved as a **graph coloring problem**: assign colors (time slots) so no two connected nodes share the same color
- **NetworkX's greedy_color** algorithm handles this automatically
