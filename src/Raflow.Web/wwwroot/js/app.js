(() => {
  const R = window.Raflow,
    { $, $$ } = R;

  $("#save").addEventListener("click", async () => {
    try {
      for (const id of R.dirtyTables) {
        const table = R.tables.get(id);
        if (table)
          await R.api(`/api/tables/${encodeURIComponent(id)}`, {
            method: "PUT",
            body: JSON.stringify(table),
          });
      }
      if (R.dirtyG) {
        R.graph = await R.api("/api/graph", {
          method: "PUT",
          body: JSON.stringify(R.graph),
        });
        R.graph.nodes
          .filter((n) => n.type === "decision")
          .forEach((n) => {
            n.tableId ||= n.id;
          });
      }
      R.dirtyTables.clear();
      R.dirtyG = false;
      R.status("All changes saved");
    } catch (error) {
      R.status(error.message, true);
    }
  });

  async function init() {
    try {
      R.graph = await R.api("/api/graph");
      R.graph.nodes.forEach((node) => {
        if (node.type === "decision") node.tableId ||= node.id;
      });
      // Load saved table names so the graph labels are correct after a page refresh.
      for (const node of R.graph.nodes.filter((n) => n.type === "decision")) {
        const table = await R.loadTable(node.tableId, node.title);
        if (node.title !== table.name) {
          node.title = table.name;
          R.dirtyG = true;
        }
      }
      R.renderGraph();
      R.status("Ready");
    } catch (error) {
      R.graph = {
        nodes: [
          { id: "request", type: "request", title: "Request", x: 50, y: 170 },
          {
            id: "decision",
            type: "decision",
            title: "Credit Card Rules",
            x: 340,
            y: 120,
            tableId: "decision",
          },
          {
            id: "response",
            type: "response",
            title: "Response",
            x: 700,
            y: 170,
          },
        ],
        connections: [
          { id: "c1", from: "request", to: "decision" },
          { id: "c2", from: "decision", to: "response" },
        ],
      };
      R.renderGraph();
      R.status(`Preview mode: ${error.message}`, true);
    }
    R.refreshTestTables();
  }

  window.addEventListener("resize", R.wires);
  init();
})();
