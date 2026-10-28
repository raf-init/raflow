(() => {
  const R = window.Raflow,
    { $, $$, esc } = R;

  R.loadTable = async (id, title) => {
    if (R.tables.has(id)) return R.tables.get(id);
    try {
      R.tables.set(
        id,
        R.normalizeTable(
          await R.api(`/api/tables/${encodeURIComponent(id)}`),
          id,
        ),
      );
    } catch (error) {
      R.tables.set(id, R.blankTable(id, title || "Decision table"));
      R.status(`API unavailable; editing local table (${error.message})`, true);
    }
    return R.tables.get(id);
  };

  R.markTableDirty = (id) => {
    R.dirtyTables.add(id);
    R.status("Unsaved decision-table changes");
  };

  R.syncTableName = (tableId, newName) => {
    const name = newName.trim() || "Decision table";
    const table = R.tables.get(tableId);
    if (table) table.name = name;
    const node = R.graph.nodes.find(
      (n) => n.type === "decision" && (n.tableId || n.id) === tableId,
    );
    if (node && node.title !== name) {
      node.title = name;
      R.dirtyG = true;
      R.renderGraph();
    }
    const tabLabel = $(
      `#tabs .tab[data-tab="${CSS.escape(`table:${tableId}`)}"] span.tab-title`,
    );
    if (tabLabel) tabLabel.textContent = name;
    R.refreshTestTables?.();
  };

  R.setTab = (key) => {
    R.activeTab = key;
    $$("#tabs .tab").forEach((button) =>
      button.classList.toggle("active", button.dataset.tab === key),
    );
    $$(".main > .panel, #tablePanels > .panel").forEach((panel) => {
      const panelKey = panel.dataset.panel || panel.id;
      panel.classList.toggle("hidden", panelKey !== key);
    });
    if (key === "flow") R.wires();
  };

  R.openTableTab = (id) => {
    const key = `table:${id}`;
    let button = $(`#tabs .tab[data-tab="${CSS.escape(key)}"]`);
    if (!button) {
      button = document.createElement("button");
      button.className = "tab table-tab";
      button.dataset.tab = key;
      button.innerHTML = `<span class="tab-title">${esc(R.tables.get(id)?.name || "Decision table")}</span><span class="tab-close" role="button" aria-label="Close tab" title="Close tab">×</span>`;
      button.addEventListener("click", (event) => {
        if (event.target.closest(".tab-close")) {
          event.stopPropagation();
          button.remove();
          $(`#tablePanels [data-panel="${CSS.escape(key)}"]`)?.remove();
          R.setTab("flow");
          return;
        }
        R.setTab(key);
      });
      $("#tabs").appendChild(button);
    }
    let panel = $(`#tablePanels [data-panel="${CSS.escape(key)}"]`);
    if (!panel) {
      panel = document.createElement("section");
      panel.className = "panel hidden table-editor";
      panel.dataset.panel = key;
      panel.innerHTML = `<div class="table-editor-content"><p>Loading decision table…</p></div>`;
      $("#tablePanels").appendChild(panel);
    }
    R.setTab(key);
    R.renderTableEditor(id);
  };

  R.renderTableEditor = (id) => {
    const table = R.tables.get(id),
      key = `table:${id}`;
    const panel = $(`#tablePanels [data-panel="${CSS.escape(key)}"]`);
    if (!table || !panel) return;
    const tabTitle = $(`#tabs .tab[data-tab="${CSS.escape(key)}"] .tab-title`);
    if (tabTitle) tabTitle.textContent = table.name || "Decision table";

    const columnConfig = (kind, columns) => `
      <div class="column-heading"><h3>${kind === "inputs" ? "Input columns" : "Output columns"}</h3>
      <button type="button" data-action="add-column" data-kind="${kind}" data-table="${esc(id)}">＋ Add ${kind === "inputs" ? "input" : "output"}</button></div>
      <div class="column-list">${columns
        .map(
          (column) => `<div class="column-config">
        <label>Label<input data-edit="column" data-table="${esc(id)}" data-kind="${kind}" data-col="${esc(column.id)}" data-prop="label" value="${esc(column.label)}"></label>
        <label>Source path<input data-edit="column" data-table="${esc(id)}" data-kind="${kind}" data-col="${esc(column.id)}" data-prop="source" value="${esc(column.source)}" placeholder="person.age"></label>
        <button type="button" class="danger" title="Remove column" data-action="remove-column" data-table="${esc(id)}" data-kind="${kind}" data-col="${esc(column.id)}">×</button>
      </div>`,
        )
        .join(
          "",
        )}${columns.length ? "" : `<p class="empty-note">No ${kind} yet. Add a column to define a source path.</p>`}</div>`;

    const allColumns = [
      ...table.inputs.map((c) => ({ ...c, kind: "inputs" })),
      ...table.outputs.map((c) => ({ ...c, kind: "outputs" })),
    ];
    panel.innerHTML = `<div class="heading"><div><h1>Decision table</h1><p>First matching rule wins. Conditions support *, =, !=, &gt;, &gt;=, &lt; and &lt;=.</p></div>
      <label class="table-name">Table name<input data-edit="name" data-table="${esc(id)}" value="${esc(table.name)}"></label></div>
      <div class="schema-grid">${columnConfig("inputs", table.inputs)}${columnConfig("outputs", table.outputs)}</div>
      <div class="heading rules-heading"><div><h2>Rules</h2><p>Conditions match input paths; output cells set output paths.</p></div><button type="button" data-action="add-rule" data-table="${esc(id)}">＋ Add rule</button></div>
      <div class="tablewrap dynamic-rules"><table><thead><tr><th rowspan="2">#</th>${table.inputs.length ? `<th colspan="${table.inputs.length}">INPUT CONDITIONS</th>` : ""}${table.outputs.length ? `<th colspan="${table.outputs.length}">OUTPUT VALUES</th>` : ""}<th rowspan="2"></th></tr><tr>${allColumns.map((c) => `<th><span>${esc(c.label)}</span><small>${esc(c.source)}</small></th>`).join("")}</tr></thead>
      <tbody>${table.rules.map((rule, ri) => `<tr><td>${ri + 1}</td>${table.inputs.map((c) => `<td><input aria-label="${esc(c.label)} condition" data-edit="rule" data-table="${esc(id)}" data-rule="${ri}" data-kind="inputs" data-col="${esc(c.id)}" value="${esc(rule.inputs[c.id] ?? "*")}"></td>`).join("")}${table.outputs.map((c) => `<td><input aria-label="${esc(c.label)} output" data-edit="rule" data-table="${esc(id)}" data-rule="${ri}" data-kind="outputs" data-col="${esc(c.id)}" value="${esc(rule.outputs[c.id] ?? "")}"></td>`).join("")}<td><button type="button" class="danger" data-action="remove-rule" data-table="${esc(id)}" data-rule="${ri}">×</button></td></tr>`).join("")}</tbody></table></div>
      <p class="count">${table.rules.length} rules · ${table.inputs.length} inputs · ${table.outputs.length} outputs</p>`;
  };

  $("#tablePanels").addEventListener("change", (event) => {
    const field = event.target.closest("[data-edit]");
    if (!field) return;
    const id = field.dataset.table,
      table = R.tables.get(id);
    if (!table) return;
    if (field.dataset.edit === "name") {
      const name = field.value.trim() || "Decision table";
      field.value = name;
      table.name = name;
      R.syncTableName(id, name);
    } else if (field.dataset.edit === "column") {
      const col = table[field.dataset.kind].find(
        (c) => c.id === field.dataset.col,
      );
      if (col) col[field.dataset.prop] = field.value.trim();
      R.renderTableEditor(id);
    } else if (field.dataset.edit === "rule") {
      const rule = table.rules[Number(field.dataset.rule)];
      if (rule) rule[field.dataset.kind][field.dataset.col] = field.value;
    }
    R.markTableDirty(id);
  });

  $("#tablePanels").addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const { action, table: id, kind, col, rule: ruleIndex } = button.dataset;
    const table = R.tables.get(id);
    if (!table) return;
    if (action === "add-column") {
      const isInput = kind === "inputs";
      const column = {
        id: R.uid(isInput ? "in" : "out"),
        label: isInput ? "New input" : "New output",
        source: isInput ? "person.value" : "result.value",
      };
      table[kind].push(column);
      table.rules.forEach((rule) => {
        rule[kind][column.id] = isInput ? "*" : "";
      });
    } else if (action === "remove-column") {
      table[kind] = table[kind].filter((c) => c.id !== col);
      table.rules.forEach((rule) => delete rule[kind][col]);
    } else if (action === "add-rule") {
      table.rules.push({
        inputs: Object.fromEntries(table.inputs.map((c) => [c.id, "*"])),
        outputs: Object.fromEntries(table.outputs.map((c) => [c.id, ""])),
      });
    } else if (action === "remove-rule") {
      table.rules.splice(Number(ruleIndex), 1);
    }
    R.markTableDirty(id);
    R.renderTableEditor(id);
  });
})();
