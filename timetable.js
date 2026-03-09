// ============================================================
//  timetable.js  —  Timetable Grid + Drag-and-Drop Logic
//  This file handles:
//    1. Fetching timetable data from Flask
//    2. Building the HTML grid table
//    3. Drag-and-drop to reassign teacher slots
//    4. Showing/hiding conflict highlights
// ============================================================

// ── Global State ─────────────────────────────────────────────
let appState = {
  teachers:   [],   // List of teacher objects
  timeSlots:  {},   // { "1": "10:00-10:50", ... }
  conflicts:  [],   // List of conflict pairs
  filterDept: "All" // Current department filter
};

let draggedTeacher = null;  // Tracks which teacher card is being dragged


// ============================================================
//  STEP 1: Fetch timetable data from Flask API
// ============================================================

async function fetchTimetable() {
  try {
    // Call GET /api/timetable on the Flask server
    const response = await fetch("/api/timetable");
    const data     = await response.json();

    // Save to our global state
    appState.teachers  = data.teachers;
    appState.timeSlots = data.time_slots;
    appState.conflicts = data.conflicts;

    // Render everything
    renderGrid();
    updateStats(data.stats);
    updateConflictBanner(data.conflicts);

    // Also update the conflict graph (defined in conflict_graph.js)
    renderConflictGraph(data.graph);

  } catch (err) {
    console.error("Failed to fetch timetable:", err);
    document.getElementById("timetable-grid").innerHTML =
      `<p style="color:#ff4d6d;padding:20px">Error loading data. Is the Flask server running?</p>`;
  }
}


// ============================================================
//  STEP 2: Build the HTML grid table
// ============================================================

function renderGrid() {
  const container = document.getElementById("timetable-grid");
  container.innerHTML = "";  // Clear old content

  // Filter teachers by department if a filter is active
  const teachers = appState.filterDept === "All"
    ? appState.teachers
    : appState.teachers.filter(t => t.dept === appState.filterDept);

  if (teachers.length === 0) {
    container.innerHTML = `<p style="color:#8892a4;padding:20px">No teachers match the filter.</p>`;
    return;
  }

  // Get sorted slot keys: ["1","2","3","4","5"]
  const slotKeys = Object.keys(appState.timeSlots).sort();

  // ── Build the <table> element ─────────────────────────────
  const table = document.createElement("table");
  table.className = "tt-table";

  // ── Header Row: blank cell + one cell per time slot ───────
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  // Blank top-left corner cell
  const cornerCell = document.createElement("th");
  cornerCell.style.width = "130px";
  headerRow.appendChild(cornerCell);

  // One header cell per time slot
  slotKeys.forEach(slotKey => {
    const th = document.createElement("th");
    th.className = "tt-slot-header";
    th.innerHTML = `
      <div>Slot ${slotKey}</div>
      <div>${appState.timeSlots[slotKey]}</div>
    `;
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // ── Body Rows: one row per teacher ────────────────────────
  const tbody = document.createElement("tbody");

  teachers.forEach(teacher => {
    const row = document.createElement("tr");

    // Left label cell: teacher name + dept
    const labelCell = document.createElement("td");
    labelCell.className = "tt-teacher-header";
    labelCell.innerHTML = `
      ${teacher.name}
      <span class="tt-teacher-dept">${teacher.dept}</span>
    `;
    row.appendChild(labelCell);

    // One cell per time slot
    slotKeys.forEach(slotKey => {
      const slotNum = parseInt(slotKey);
      const cell    = document.createElement("td");
      cell.className = "tt-cell";

      // Mark this cell as a drop target
      cell.dataset.teacherId = teacher.id;
      cell.dataset.slotNum   = slotNum;

      // If this teacher is assigned to THIS slot, show their card
      if (teacher.slot === slotNum) {
        const isConflict = appState.conflicts.some(
          c => (c.teacher1 === teacher.id || c.teacher2 === teacher.id)
            && c.slot === slotNum
        );
        cell.appendChild(createTeacherCard(teacher, isConflict));
      }

      // ── Drag-and-Drop events on each cell ─────────────────

      // When a dragged card hovers over this cell
      cell.addEventListener("dragover", e => {
        e.preventDefault();  // Needed to allow dropping
        cell.classList.add("drag-over");
      });

      // When the card leaves the cell without dropping
      cell.addEventListener("dragleave", () => {
        cell.classList.remove("drag-over");
      });

      // When the user releases (drops) on this cell
      cell.addEventListener("drop", async e => {
        e.preventDefault();
        cell.classList.remove("drag-over");

        if (!draggedTeacher) return;

        // Don't do anything if dropped on same slot
        if (draggedTeacher.slot === slotNum) return;

        // Call Flask API to update the slot
        await updateSlot(draggedTeacher.id, slotNum);
      });

      row.appendChild(cell);
    });

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  container.appendChild(table);
}


// ============================================================
//  Helper: Create a draggable teacher card element
// ============================================================

function createTeacherCard(teacher, isConflict) {
  const card = document.createElement("div");
  card.className = `tt-card dept-${teacher.dept} ${isConflict ? "has-conflict" : ""}`;
  card.draggable = true;

  // Show first subject as subtitle
  const subj = teacher.subjects[0] || "";
  card.innerHTML = `
    <div class="tt-card-name">${teacher.name.split(" ").pop()}</div>
    <div class="tt-card-subj">${subj}</div>
  `;

  // When drag STARTS, remember which teacher we're dragging
  card.addEventListener("dragstart", () => {
    draggedTeacher = teacher;
    setTimeout(() => card.classList.add("dragging"), 0);
  });

  // When drag ENDS (regardless of drop result)
  card.addEventListener("dragend", () => {
    draggedTeacher = null;
    card.classList.remove("dragging");
    document.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over"));
  });

  return card;
}


// ============================================================
//  STEP 3: Send slot update to Flask, then re-render
// ============================================================

async function updateSlot(teacherId, newSlot) {
  try {
    // POST to Flask with the teacher ID and new slot number
    const response = await fetch("/api/update_slot", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ teacher_id: teacherId, new_slot: newSlot })
    });
    const data = await response.json();

    // Update our local state with the new teacher slots
    // (We re-fetch to get the full updated picture)
    await fetchTimetable();

  } catch (err) {
    console.error("Failed to update slot:", err);
  }
}


// ============================================================
//  Button Actions (called from HTML onclick attributes)
// ============================================================

async function autoAssign() {
  try {
    await fetch("/api/auto_assign", { method: "POST" });
    await fetchTimetable();
  } catch (err) { console.error(err); }
}

async function resetAll() {
  if (!confirm("Clear all slot assignments?")) return;
  try {
    await fetch("/api/reset", { method: "POST" });
    await fetchTimetable();
  } catch (err) { console.error(err); }
}

function filterDept(btn) {
  // Update active filter button styling
  document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");

  appState.filterDept = btn.dataset.dept;
  renderGrid();  // Re-render grid with filter applied
}

function openAddTeacherModal() {
  document.getElementById("add-modal").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("add-modal").classList.add("hidden");
}

async function submitAddTeacher() {
  const name     = document.getElementById("inp-name").value.trim();
  const dept     = document.getElementById("inp-dept").value;
  const subjects = document.getElementById("inp-subjects").value
                     .split(",").map(s => s.trim()).filter(Boolean);

  if (!name) { alert("Please enter a teacher name."); return; }

  try {
    await fetch("/api/add_teacher", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ name, dept, subjects })
    });
    closeModal();
    await fetchTimetable();
  } catch (err) { console.error(err); }
}


// ============================================================
//  Update Stats Bar
// ============================================================

function updateStats(stats) {
  document.querySelector("#stat-teachers .stat-num").textContent  = stats.total_teachers;
  document.querySelector("#stat-slots .stat-num").textContent     = stats.slots_used;
  document.querySelector("#stat-conflicts .stat-num").textContent = stats.total_conflicts;

  const conflictPill = document.getElementById("stat-conflicts");
  if (stats.total_conflicts > 0) {
    conflictPill.classList.add("has-conflicts");
  } else {
    conflictPill.classList.remove("has-conflicts");
  }
}


// ============================================================
//  Conflict Banner (shown at bottom when conflicts exist)
// ============================================================

function updateConflictBanner(conflicts) {
  const banner = document.getElementById("conflict-banner");
  const detail = document.getElementById("conflict-detail");

  if (conflicts.length === 0) {
    banner.classList.add("hidden");
    return;
  }

  banner.classList.remove("hidden");

  const c = conflicts[0];
  detail.textContent =
    ` ${c.teacher1} and ${c.teacher2} are both in Slot ${c.slot} (${c.reason.replace("_", " ")})`;
}

function hideBanner() {
  document.getElementById("conflict-banner").classList.add("hidden");
}


// ============================================================
//  Boot: load the timetable when the page opens
// ============================================================
fetchTimetable();
