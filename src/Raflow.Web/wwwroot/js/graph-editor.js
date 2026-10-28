(() => {
  const R = window.Raflow,
    { $, $$, esc } = R;

  R.renderGraph = () => {
    const host = $("#nodes");
    if (!host) return;
    host.innerHTML = R.graph.nodes
      .map(
        (
          n,
        ) => `<div class="node" data-id="${esc(n.id)}" data-type="${esc(n.type)}" style="left:${Number(n.x) || 0}px;top:${Number(n.y) || 0}px">
      <button type="button" class="remove-node" data-remove="${esc(n.id)}" title="Remove component">×</button>
      <span class="port in"></span><div class="nodehead"><span class="nodeicon">${n.type === "decision" ? "▦" : n.type === "request" ? "↳" : "◉"}</span><span><div class="nodetitle">${esc(n.title)}</div><div class="nodesub">${n.type === "decision" ? "Decision table" : n.type === "request" ? "Input context" : "Output context"}</div></span></div>
      ${n.type === "decision" ? `<button type="button" class="nodefoot" data-edit="${esc(n.id)}">Edit table →</button>` : ""}<span class="port out"></span></div>`,
      )
      .join("");

    host.querySelectorAll(".node").forEach((el) => {
      el.addEventListener("pointerdown", (event) => {
        if (event.target.closest("button") || R.connectMode) return;
        const node = R.graph.nodes.find((n) => n.id === el.dataset.id);
        if (!node) return;
        R.drag = {
          id: node.id,
          x: node.x,
          y: node.y,
          px: event.clientX,
          py: event.clientY,
        };
        el.setPointerCapture(event.pointerId);
      });
      el.addEventListener("click", () => {
        if (!R.connectMode) return;
        if (!R.connectFrom) {
          R.connectFrom = el.dataset.id;
          el.classList.add("selected");
          R.status("Click destination node");
        } else if (R.connectFrom !== el.dataset.id) {
          if (
            !R.graph.connections.some(
              (c) => c.from === R.connectFrom && c.to === el.dataset.id,
            )
          )
            R.graph.connections.push({
              id: R.uid("connection"),
              from: R.connectFrom,
              to: el.dataset.id,
            });
          R.connectMode = false;
          R.connectFrom = null;
          $("#connect").textContent = "Connect nodes";
          R.dirtyG = true;
          R.renderGraph();
          R.status("Unsaved graph changes");
        }
      });
    });

    host.querySelectorAll("[data-edit]").forEach((button) =>
      button.addEventListener("click", async (event) => {
        event.stopPropagation();
        const node = R.graph.nodes.find((n) => n.id === button.dataset.edit);
        if (!node) return;
        node.tableId ||= node.id;
        const table = await R.loadTable(node.tableId, node.title);
        if (node.title !== table.name) {
          node.title = table.name;
          R.dirtyG = true;
          R.renderGraph();
        }
        R.openTableTab(node.tableId);
        R.refreshTestTables();
      }),
    );

    host.querySelectorAll("[data-remove]").forEach((button) =>
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const id = button.dataset.remove;
        R.graph.nodes = R.graph.nodes.filter((n) => n.id !== id);
        R.graph.connections = R.graph.connections.filter(
          (c) => c.from !== id && c.to !== id,
        );
        R.dirtyG = true;
        R.renderGraph();
        R.status("Component removed — save changes");
      }),
    );
    R.wires();
    R.refreshTestTables();
  };

  R.wires = () => {
    const svg = $("#wires");
    const canvas = $("#canvas");

    if (!svg || !canvas) return;

    const nodes = new Map(R.graph.nodes.map((n) => [n.id, n]));

    const width = Math.max(
      canvas.clientWidth,
      ...R.graph.nodes.map((n) => (Number(n.x) || 0) + 240),
      900,
    );

    const height = Math.max(
      canvas.clientHeight,
      ...R.graph.nodes.map((n) => (Number(n.y) || 0) + 140),
      600,
    );

    // Set both SVG attributes and CSS dimensions.
    svg.setAttribute("width", width);
    svg.setAttribute("height", height);
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

    svg.style.width = `${width}px`;
    svg.style.height = `${height}px`;

    svg.innerHTML = R.graph.connections
      .map((c) => {
        const from = nodes.get(c.from);
        const to = nodes.get(c.to);

        if (!from || !to) return "";

        // Node width is 190px; ports are vertically positioned at top: 34px.
        const x1 = Number(from.x) + 190;
        const y1 = Number(from.y) + 38;

        const x2 = Number(to.x);
        const y2 = Number(to.y) + 38;

        const curve = Math.max(40, Math.abs(x2 - x1) * 0.4);

        return `<path class="wire"
            d="M ${x1} ${y1}
               C ${x1 + curve} ${y1},
                 ${x2 - curve} ${y2},
                 ${x2} ${y2}" />`;
      })
      .join("");
  };

  document.addEventListener("pointermove", (event) => {
    if (!R.drag) return;
    const node = R.graph.nodes.find((n) => n.id === R.drag.id);
    if (!node) return;
    node.x = Math.max(0, R.drag.x + event.clientX - R.drag.px);
    node.y = Math.max(0, R.drag.y + event.clientY - R.drag.py);
    const el = document.querySelector(`[data-id="${CSS.escape(node.id)}"]`);
    if (el) {
      el.style.left = `${node.x}px`;
      el.style.top = `${node.y}px`;
    }
    R.wires();
  });
  document.addEventListener("pointerup", () => {
    if (R.drag) {
      R.dirtyG = true;
      R.status("Unsaved graph changes");
    }
    R.drag = null;
  });

  R.addComponent = (type, x, y) => {
    const labels = {
      request: "Request",
      decision: "Decision Table",
      response: "Response",
    };
    const count = R.graph.nodes.filter((n) => n.type === type).length + 1;
    const id = R.uid(type);
    const node = {
      id,
      type,
      title: count === 1 ? labels[type] : `${labels[type]} ${count}`,
      x,
      y,
    };
    if (type === "decision") {
      node.tableId = id;
      R.tables.set(id, R.blankTable(id, node.title));
      R.dirtyTables.add(id);
    }
    R.graph.nodes.push(node);
    R.dirtyG = true;
    R.renderGraph();
    R.status("Component added — save changes");
  };

  document.querySelectorAll("[data-component]").forEach((component) => {
    component.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", component.dataset.component);
      event.dataTransfer.effectAllowed = "copy";
    });
  });
  const canvas = $("#canvas");
  canvas?.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    canvas.classList.add("drop-target");
  });
  canvas?.addEventListener("dragleave", (event) => {
    if (!canvas.contains(event.relatedTarget))
      canvas.classList.remove("drop-target");
  });
  canvas?.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    canvas.classList.remove("drop-target");
    const type = event.dataTransfer.getData("text/plain");
    if (!["request", "decision", "response"].includes(type)) return;
    const rect = canvas.getBoundingClientRect();
    R.addComponent(
      type,
      Math.max(0, event.clientX - rect.left + canvas.scrollLeft - 95),
      Math.max(0, event.clientY - rect.top + canvas.scrollTop - 25),
    );
  });

  $("#addNode").addEventListener("click", () => {
    const count = R.graph.nodes.filter((n) => n.type === "decision").length;
    R.addComponent("decision", 250 + (count % 3) * 40, 70 + count * 85);
  });
  $("#connect").addEventListener("click", () => {
    R.connectMode = !R.connectMode;
    R.connectFrom = null;
    $("#connect").textContent = R.connectMode
      ? "Cancel connection"
      : "Connect nodes";
    $$(".node").forEach((n) => n.classList.remove("selected"));
    R.status(R.connectMode ? "Click source node" : "Connection cancelled");
  });
  $("#removeLink").addEventListener("click", () => {
    if (R.graph.connections.length) {
      R.graph.connections.pop();
      R.dirtyG = true;
      R.wires();
      R.status("Connection removed — save changes");
    } else R.status("No connections to remove", true);
  });
  $("#tabs").addEventListener("click", (event) => {
    const button = event.target.closest(".tab");
    if (button && !button.classList.contains("table-tab"))
      R.setTab(button.dataset.tab);
  });
})();
