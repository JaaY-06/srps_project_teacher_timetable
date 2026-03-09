// ============================================================
//  conflict_graph.js  —  D3.js Force-Directed Conflict Graph
//
//  This file draws an interactive graph where:
//    - Each CIRCLE = a teacher
//    - Each LINE   = a conflict relationship
//    - RED lines   = teachers currently assigned to the same slot
//    - You can DRAG nodes around to explore the graph
// ============================================================

// ── D3 color scales for departments ──────────────────────────
const DEPT_COLORS = {
  "Computer": "#4a9eff",
  "Commerce": "#f59e0b"
};

const SLOT_COLORS = [
  "#00e5cc", "#a78bfa", "#f472b6", "#34d399", "#fb923c"
];


// ============================================================
//  Main render function — called by timetable.js after fetch
// ============================================================

function renderConflictGraph(graphData) {
  const container = document.getElementById("conflict-graph");
  const W = container.clientWidth  || 400;
  const H = container.clientHeight || 380;

  // Remove any previous SVG before redrawing
  d3.select("#conflict-graph svg").remove();

  // ── 1. Create the SVG canvas ──────────────────────────────
  const svg = d3.select("#conflict-graph")
    .append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  // Background rectangle (for click-to-deselect)
  svg.append("rect")
    .attr("width", W).attr("height", H)
    .attr("fill", "transparent")
    .on("click", () => clearHighlight());

  // ── 2. Define an arrowhead marker (optional decoration) ───
  svg.append("defs").append("marker")
    .attr("id", "arrowhead")
    .attr("viewBox", "-0 -5 10 10")
    .attr("refX", 20).attr("refY", 0)
    .attr("orient", "auto")
    .attr("markerWidth", 6).attr("markerHeight", 6)
    .append("path")
    .attr("d", "M 0,-5 L 10,0 L 0,5")
    .attr("fill", "#2d3748");

  // ── 3. Create the D3 Force Simulation ─────────────────────
  //
  // A "force simulation" treats nodes like physical objects:
  //   - forceLink:   edges act like springs pulling nodes together
  //   - forceManyBody: nodes repel each other (like magnets)
  //   - forceCenter:  pulls everything toward the middle
  //
  const simulation = d3.forceSimulation(graphData.nodes)
    .force("link",   d3.forceLink(graphData.links)
                       .id(d => d.id)
                       .distance(90)
                       .strength(0.4))
    .force("charge", d3.forceManyBody().strength(-220))
    .force("center", d3.forceCenter(W / 2, H / 2))
    .force("collision", d3.forceCollide().radius(36));

  // ── 4. Draw LINKS (edges / lines) ─────────────────────────
  const linkGroup = svg.append("g").attr("class", "links");

  const link = linkGroup.selectAll("line")
    .data(graphData.links)
    .enter()
    .append("line")
    .attr("stroke",       d => d.is_conflict ? "#ff4d6d" : "#2d3748")
    .attr("stroke-width", d => d.is_conflict ? 2.5 : 1.5)
    .attr("stroke-opacity", d => d.is_conflict ? 0.9 : 0.5)
    .attr("stroke-dasharray", d => d.is_conflict ? "none" : "4,3");

  // Glowing effect on conflict edges
  linkGroup.selectAll("line.glow")
    .data(graphData.links.filter(d => d.is_conflict))
    .enter()
    .append("line")
    .attr("stroke", "#ff4d6d")
    .attr("stroke-width", 6)
    .attr("stroke-opacity", 0.15);

  // ── 5. Draw NODES (circles for each teacher) ──────────────
  const nodeGroup = svg.append("g").attr("class", "nodes");

  const node = nodeGroup.selectAll("g")
    .data(graphData.nodes)
    .enter()
    .append("g")
    .attr("class", "node-group")
    .call(
      // Make nodes draggable with D3 drag behavior
      d3.drag()
        .on("start", dragStarted)
        .on("drag",  dragging)
        .on("end",   dragEnded)
    )
    .on("click", (event, d) => {
      event.stopPropagation();
      highlightNeighbors(d, link, node);
    });

  // Outer ring (slot color indicator)
  node.append("circle")
    .attr("r", 22)
    .attr("fill", "transparent")
    .attr("stroke", d => d.slot ? SLOT_COLORS[(d.slot - 1) % SLOT_COLORS.length] : "#2d3748")
    .attr("stroke-width", 2)
    .attr("stroke-opacity", 0.6);

  // Main circle (dept color)
  node.append("circle")
    .attr("r", 18)
    .attr("fill", d => DEPT_COLORS[d.dept] || "#4a9eff")
    .attr("fill-opacity", 0.2)
    .attr("stroke", d => DEPT_COLORS[d.dept] || "#4a9eff")
    .attr("stroke-width", 2);

  // Conflict indicator dot (red dot in corner if conflicted)
  node.filter(d => {
    return graphData.links.some(
      l => l.is_conflict && (l.source.id === d.id || l.target.id === d.id)
    );
  })
  .append("circle")
    .attr("r", 5)
    .attr("cx", 13).attr("cy", -13)
    .attr("fill", "#ff4d6d")
    .attr("stroke", "#0d1117")
    .attr("stroke-width", 1.5);

  // Teacher name label (short surname)
  node.append("text")
    .text(d => d.name.split(" ").pop())
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .attr("font-size", "9px")
    .attr("font-family", "'DM Mono', monospace")
    .attr("fill", d => DEPT_COLORS[d.dept] || "#fff")
    .attr("pointer-events", "none");

  // Slot badge below the node
  node.append("text")
    .text(d => d.slot ? `S${d.slot}` : "–")
    .attr("text-anchor", "middle")
    .attr("dy", "32px")
    .attr("font-size", "9px")
    .attr("font-family", "'DM Mono', monospace")
    .attr("fill", d => d.slot ? SLOT_COLORS[(d.slot - 1) % SLOT_COLORS.length] : "#8892a4")
    .attr("pointer-events", "none");

  // Tooltip on hover
  node.append("title")
    .text(d => `${d.name}\n${d.dept} Dept\nSlot: ${d.slot || "unassigned"}`);

  // ── 6. Animate: update positions on each simulation tick ──
  //
  // Every "tick" the simulation recalculates node positions.
  // We update the SVG elements to match.
  //
  simulation.on("tick", () => {
    // Update link positions
    link
      .attr("x1", d => d.source.x).attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x).attr("y2", d => d.target.y);

    // Also update glow lines
    linkGroup.selectAll("line.glow")
      .attr("x1", d => d.source.x).attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x).attr("y2", d => d.target.y);

    // Update node positions (translate the whole group)
    node.attr("transform", d => `translate(${d.x},${d.y})`);
  });


  // ── Drag handlers ─────────────────────────────────────────
  function dragStarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;  // fx/fy = fixed position (locks node during drag)
    d.fy = d.y;
  }

  function dragging(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragEnded(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;  // Release the fixed position
    d.fy = null;
  }
}


// ============================================================
//  Highlight neighbors when a node is clicked
// ============================================================

function highlightNeighbors(selectedNode, link, node) {
  // Find all neighbor IDs
  const neighbors = new Set([selectedNode.id]);

  link.each(d => {
    if (d.source.id === selectedNode.id) neighbors.add(d.target.id);
    if (d.target.id === selectedNode.id) neighbors.add(d.source.id);
  });

  // Dim non-neighbors
  node.attr("opacity", d => neighbors.has(d.id) ? 1 : 0.25);
  link.attr("opacity", d =>
    (d.source.id === selectedNode.id || d.target.id === selectedNode.id) ? 1 : 0.1
  );
}

function clearHighlight() {
  d3.selectAll(".node-group").attr("opacity", 1);
  d3.selectAll("line").attr("opacity", 1);
}
