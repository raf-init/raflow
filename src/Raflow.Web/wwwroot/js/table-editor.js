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
      <div class="heading rules-heading">
  <div>
    <h2>Rules</h2>
    <p>Conditions match input paths; output cells set output paths.</p>
  </div>
  <div class="table-actions">
    <button type="button" data-action="import-csv" data-table="${esc(id)}">
      Import CSV
    </button>
    <button type="button" data-action="export-csv" data-table="${esc(id)}">
      Export CSV
    </button>
    <button type="button" data-action="import-excel" data-table="${esc(id)}">
      Import Excel
    </button>
    <button type="button" data-action="export-excel" data-table="${esc(id)}">
      Export Excel
    </button>
    <button type="button" data-action="add-rule" data-table="${esc(id)}">
      ＋ Add rule
    </button>
    <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      data-csv-file="${esc(id)}" hidden>
  </div>
</div>
      <div class="tablewrap dynamic-rules"><table><thead><tr><th rowspan="2">#</th>${table.inputs.length ? `<th colspan="${table.inputs.length}">INPUT CONDITIONS</th>` : ""}${table.outputs.length ? `<th colspan="${table.outputs.length}">OUTPUT VALUES</th>` : ""}<th rowspan="2"></th></tr><tr>${allColumns.map((c) => `<th><span>${esc(c.label)}</span><small>${esc(c.source)}</small></th>`).join("")}</tr></thead>
      <tbody>${table.rules.map((rule, ri) => `<tr><td>${ri + 1}</td>${table.inputs.map((c) => `<td><input aria-label="${esc(c.label)} condition" data-edit="rule" data-table="${esc(id)}" data-rule="${ri}" data-kind="inputs" data-col="${esc(c.id)}" value="${esc(rule.inputs[c.id] ?? "*")}"></td>`).join("")}${table.outputs.map((c) => `<td><input aria-label="${esc(c.label)} output" data-edit="rule" data-table="${esc(id)}" data-rule="${ri}" data-kind="outputs" data-col="${esc(c.id)}" value="${esc(rule.outputs[c.id] ?? "")}"></td>`).join("")}<td><button type="button" class="danger" data-action="remove-rule" data-table="${esc(id)}" data-rule="${ri}">×</button></td></tr>`).join("")}</tbody></table></div>
      <p class="count">${table.rules.length} rules · ${table.inputs.length} inputs · ${table.outputs.length} outputs</p>`;
  };

  function tableToCsv(table) {
    const headers = [
      ...table.inputs.map((c) => `INPUT: ${c.label} [${c.source}]`),
      ...table.outputs.map((c) => `OUTPUT: ${c.label} [${c.source}]`),
    ];

    const rows = [
      ["Table", table.name],
      headers,
      ...table.rules.map((rule) => [
        ...table.inputs.map((c) => rule.inputs[c.id] ?? "*"),
        ...table.outputs.map((c) => rule.outputs[c.id] ?? ""),
      ]),
    ];

    return rows
      .map((row) =>
        row
          .map((value) => {
            let text = String(value ?? "");

            // Avoid spreadsheet formula injection.
            if (/^[\s]*[=+\-@]/.test(text)) {
              text = "'" + text;
            }

            return `"${text.replace(/"/g, '""')}"`;
          })
          .join(","),
      )
      .join("\r\n");
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;

    text = text.replace(/^\uFEFF/, "");

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];

      if (ch === '"' && quoted && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = !quoted;
      } else if (ch === "," && !quoted) {
        row.push(cell);
        cell = "";
      } else if ((ch === "\n" || ch === "\r") && !quoted) {
        if (ch === "\r" && next === "\n") i++;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += ch;
      }
    }

    row.push(cell);
    rows.push(row);

    if (quoted) {
      throw new Error("CSV contains an unclosed quoted field.");
    }

    return rows.filter((r) => r.some((v) => v.trim() !== ""));
  }

  function downloadCsv(table) {
    const csv = "\uFEFF" + tableToCsv(table);
    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download =
      (table.name || "decision-table").replace(/[\\/:*?"<>|]/g, "_") + ".csv";

    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function importRowsIntoTable(table, rows) {
    if (!rows || rows.length < 3 || rows[0][0] !== "Table") {
      throw new Error(
        "Invalid file. Expected a RuleFlow-exported CSV or Excel file.",
      );
    }

    const name = String(rows[0][1] || table.name);
    const headers = rows[1];
    const inputCount = table.inputs.length;
    const outputCount = table.outputs.length;

    if (headers.length !== inputCount + outputCount) {
      throw new Error(
        "The number of file columns does not match this decision table.",
      );
    }

    const expectedHeaders = [
      ...table.inputs.map((c) => `INPUT: ${c.label} [${c.source}]`),
      ...table.outputs.map((c) => `OUTPUT: ${c.label} [${c.source}]`),
    ];

    if (!expectedHeaders.every((header, i) => header === headers[i])) {
      throw new Error("File headers do not match the current table columns.");
    }

    const rules = rows.slice(2).map((row, index) => {
      if (row.length !== headers.length) {
        throw new Error(
          `Row ${index + 3} has ${row.length} cells; expected ${headers.length}.`,
        );
      }

      return {
        inputs: Object.fromEntries(
          table.inputs.map((c, i) => [c.id, String(row[i] ?? "*")]),
        ),
        outputs: Object.fromEntries(
          table.outputs.map((c, i) => [
            c.id,
            String(row[inputCount + i] ?? ""),
          ]),
        ),
      };
    });

    if (
      !confirm(
        `Replace the rules in "${table.name}" with ${rules.length} imported rules?`,
      )
    ) {
      return false;
    }

    table.rules = rules;
    table.name = name;

    return true;
  }

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

  $("#tablePanels").addEventListener("change", async (event) => {
    const fileInput = event.target.closest("[data-csv-file]");
    if (!fileInput || !fileInput.files.length) return;

    const id = fileInput.dataset.csvFile;
    const table = R.tables.get(id);
    const file = fileInput.files[0];

    try {
      if (!table) throw new Error("Decision table not found.");

      const extension = file.name.split(".").pop().toLowerCase();
      const importType = fileInput.dataset.importType || "csv";

      if (importType === "excel" && extension !== "xlsx") {
        throw new Error("Please select an Excel .xlsx file.");
      }

      if (importType === "csv" && extension !== "csv") {
        throw new Error("Please select a CSV .csv file.");
      }
      let rows;

      if (extension === "csv") {
        rows = parseCsv(await file.text());
      } else if (extension === "xlsx") {
        if (typeof XLSX === "undefined") {
          throw new Error(
            "Excel library did not load. Refresh the page and try again.",
          );
        }

        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });

        if (!workbook.SheetNames.length) {
          throw new Error("The Excel file contains no worksheets.");
        }

        const worksheet = workbook.Sheets[workbook.SheetNames[0]];

        rows = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: "",
          raw: false,
        });

        rows = rows.filter((row) =>
          row.some((value) => String(value).trim() !== ""),
        );
      } else {
        throw new Error("Please select a .csv or .xlsx file.");
      }

      if (importRowsIntoTable(table, rows)) {
        R.markTableDirty(id);
        R.renderTableEditor(id);
        R.status("File imported. Save your changes to persist them.");
      }
    } catch (error) {
      alert(`Import failed: ${error.message}`);
    } finally {
      fileInput.value = "";
    }
  });

  $("#tablePanels").addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const { action, table: id, kind, col, rule: ruleIndex } = button.dataset;
    const table = R.tables.get(id);
    if (!table) return;

    if (action === "import-csv" || action === "import-excel") {
      const panel = button.closest(".table-editor");
      const fileInput = panel?.querySelector(
        `[data-csv-file="${CSS.escape(id)}"]`,
      );

      if (fileInput) {
        // Remember which file types this button should accept.
        fileInput.dataset.importType =
          action === "import-excel" ? "excel" : "csv";
        fileInput.click();
      }

      return;
    }

    if (action === "export-csv") {
      downloadCsv(table);
      return;
    }

    if (action === "export-excel") {
      if (typeof XLSX === "undefined") {
        alert("Excel library did not load. Please refresh the page.");
        return;
      }

      const rows = [
        ["Table", table.name],
        [
          ...table.inputs.map((c) => `INPUT: ${c.label} [${c.source}]`),
          ...table.outputs.map((c) => `OUTPUT: ${c.label} [${c.source}]`),
        ],
        ...table.rules.map((rule) => [
          ...table.inputs.map((c) => rule.inputs[c.id] ?? "*"),
          ...table.outputs.map((c) => rule.outputs[c.id] ?? ""),
        ]),
      ];

      const worksheet = XLSX.utils.aoa_to_sheet(rows);
      const workbook = XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(workbook, worksheet, "Decision Table");

      const filename = (table.name || "decision-table").replace(
        /[\\/:*?"<>|]/g,
        "_",
      );

      XLSX.writeFile(workbook, `${filename}.xlsx`);
      return;
    }

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
