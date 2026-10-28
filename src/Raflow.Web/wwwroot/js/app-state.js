(() => {
  const R = (window.Raflow = {});
  R.$ = (selector, root = document) => root.querySelector(selector);
  R.$$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  R.esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  R.uid = (prefix = "id") =>
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  R.graph = { nodes: [], connections: [] };
  R.tables = new Map();
  R.dirtyTables = new Set();
  R.dirtyG = false;
  R.connectMode = false;
  R.connectFrom = null;
  R.drag = null;
  R.activeTab = "flow";

  R.status = (message, bad = false) => {
    const el = R.$("#status");
    if (!el) return;
    el.textContent = message;
    el.style.color = bad ? "#c24141" : "";
  };

  R.api = async (url, opts = {}) => {
    const response = await fetch(url, {
      ...opts,
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(data.error || `HTTP ${response.status}`);
    return data;
  };

  R.normalizeTable = (table, id) => {
    table.id ||= id;
    table.name ||= "Decision table";
    table.inputs ||= [];
    table.outputs ||= [];
    table.rules ||= [];
    table.inputs.forEach((c) => {
      c.id ||= R.uid("in");
      c.label ||= c.source || "Input";
      c.source ||= "person.value";
    });
    table.outputs.forEach((c) => {
      c.id ||= R.uid("out");
      c.label ||= c.source || "Output";
      c.source ||= "result.value";
    });
    table.rules.forEach((rule) => {
      rule.inputs ||= {};
      rule.outputs ||= {};
    });
    return table;
  };

  R.blankTable = (id, name = "Decision table") => ({
    id,
    name,
    inputs: [{ id: R.uid("in"), label: "Age", source: "person.age" }],
    outputs: [{ id: R.uid("out"), label: "Result", source: "result.value" }],
    rules: [{ inputs: {}, outputs: {} }],
  });
})();
