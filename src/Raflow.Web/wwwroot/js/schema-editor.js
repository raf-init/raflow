(() => {
  const R = window.Raflow;
  const $ = R.$;

  let activeSchema = "input";

  // UI state only. This is not saved as schema data.
  const collapsedFields = new Set();

  const schemas = {
    input: { fields: [] },
    output: { fields: [] },
  };

  const types = ["String", "Number", "Integer", "Boolean", "Object", "Array"];

  function escapeHtml(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char],
    );
  }

  // Find a field at any nesting level using its index path.
  function getField(schemaName, path) {
    const indexes = path.split(".").map(Number);
    let fields = schemas[schemaName].fields;
    let field = null;

    for (const index of indexes) {
      field = fields[index];
      if (!field) return null;

      fields = field.properties || [];
    }

    return field;
  }

  function isObjectLike(field) {
    return (
      field.type === "Object" ||
      (field.type === "Array" && field.itemType === "Object")
    );
  }

  // Recursively render a field and its nested properties.
  function renderField(field, path, schemaName) {
    field.properties ||= [];

    const collapseKey = `${schemaName}:${field.id || path}`;
    const isCollapsed = collapsedFields.has(collapseKey);

    const propertiesHtml = isObjectLike(field)
      ? `
        <div class="schema-properties">
          <div class="schema-properties-header">
            <button type="button"
                    class="schema-collapse-toggle"
                    aria-expanded="${!isCollapsed}">
              ${isCollapsed ? "▶" : "▼"}
            </button>

            <strong>Properties (${field.properties.length})</strong>
          </div>

          <div class="schema-properties-content ${isCollapsed ? "hidden" : ""}">
            <div class="schema-child-fields">
              ${field.properties
                .map((child, index) =>
                  renderField(child, `${path}.${index}`, schemaName),
                )
                .join("")}
            </div>

            <button type="button" class="schema-child-add">
              + Add property
            </button>
          </div>
        </div>
      `
      : "";

    return `
      <div class="schema-field ${path.includes(".") ? "schema-child-field" : ""}"
           data-path="${path}">

        <input class="schema-field-name"
               value="${escapeHtml(field.name)}"
               placeholder="Field name">

        <select class="schema-field-type">
          ${types
            .map(
              (type) => `
                <option value="${type}" ${field.type === type ? "selected" : ""}>
                  ${type}
                </option>
              `,
            )
            .join("")}
        </select>

        ${
          field.type === "Array"
            ? `
              <select class="schema-field-item-type">
                ${types
                  .filter((type) => type !== "Array")
                  .map(
                    (type) => `
                      <option value="${type}"
                        ${(field.itemType || "String") === type ? "selected" : ""}>
                        Items: ${type}
                      </option>
                    `,
                  )
                  .join("")}
              </select>
            `
            : ""
        }

        <input class="schema-field-description"
               value="${escapeHtml(field.description)}"
               placeholder="Description (optional)">

        <label>
          <input type="checkbox" class="schema-field-required"
                 ${field.required ? "checked" : ""}>
          Required
        </label>

        ${propertiesHtml}

        <button type="button" class="schema-field-delete">Remove</button>
      </div>
    `;
  }

  function render(schemaName) {
    const container = $(`#${schemaName}-schema-fields`);
    const fields = schemas[schemaName].fields;

    if (!fields.length) {
      container.innerHTML = '<p class="muted">No fields defined yet.</p>';
      return;
    }

    container.innerHTML = fields
      .map((field, index) => renderField(field, String(index), schemaName))
      .join("");
  }

  function createField(name) {
    return {
      id: crypto.randomUUID(),
      name,
      type: "String",
      required: false,
      description: "",
      properties: [],
      itemType: "String",
    };
  }

  async function save(schemaName) {
    await R.api(`/api/schema/${schemaName}`, {
      method: "PUT",
      body: JSON.stringify(schemas[schemaName]),
    });
  }

  async function saveAndNotify(schemaName, message) {
    try {
      await save(schemaName);
      R.status(message);
    } catch (error) {
      R.status(error.message, true);
    }
  }

  async function load(schemaName) {
    schemas[schemaName] = await R.api(`/api/schema/${schemaName}`);
    schemas[schemaName].fields ||= [];
    render(schemaName);
  }

  // Switch between Input and Output schemas.
  R.$$(".schema-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      activeSchema = tab.dataset.schema;

      R.$$(".schema-tab").forEach((item) => {
        item.classList.toggle("active", item === tab);
      });

      R.$$(".schema-content").forEach((content) => {
        content.classList.toggle(
          "hidden",
          content.id !== `${activeSchema}-schema`,
        );
      });

      const isInput = activeSchema === "input";

      $("#schema-context-title").textContent = isInput
        ? "Input schema"
        : "Output schema";

      $("#schema-context-description").textContent = isInput
        ? "Define the data your workflow receives."
        : "Define the data your workflow produces.";

      $("#schema-context-icon").textContent = isInput ? "↓" : "↑";
    });
  });

  // Add a top-level field.
  $("#add-schema-field").addEventListener("click", async () => {
    const fields = schemas[activeSchema].fields;

    fields.push(createField(`field${fields.length + 1}`));

    render(activeSchema);
    await saveAndNotify(activeSchema, "Schema field added");
  });

  // Handle all nested field actions.
  ["input", "output"].forEach((schemaName) => {
    const container = $(`#${schemaName}-schema-fields`);

    container.addEventListener("click", async (event) => {
      // Handle collapse/expand first.
      const collapseButton = event.target.closest(".schema-collapse-toggle");

      if (collapseButton) {
        const row = collapseButton.closest(".schema-field");
        if (!row) return;

        const field = getField(schemaName, row.dataset.path);
        if (!field) return;

        const key = `${schemaName}:${field.id || row.dataset.path}`;

        if (collapsedFields.has(key)) {
          collapsedFields.delete(key);
        } else {
          collapsedFields.add(key);
        }

        render(schemaName);
        return;
      }

      const row = event.target.closest(".schema-field");
      if (!row) return;

      const path = row.dataset.path;
      const field = getField(schemaName, path);

      if (!field) return;

      // Remove a field.
      if (event.target.classList.contains("schema-field-delete")) {
        const indexes = path.split(".").map(Number);
        const index = indexes.pop();

        const parentFields = indexes.length
          ? getField(schemaName, indexes.join(".")).properties
          : schemas[schemaName].fields;

        parentFields.splice(index, 1);

        render(schemaName);
        await saveAndNotify(schemaName, "Schema field removed");
        return;
      }

      // Add a nested property.
      if (event.target.classList.contains("schema-child-add")) {
        field.properties ||= [];

        field.properties.push(
          createField(`property${field.properties.length + 1}`),
        );

        render(schemaName);
        await saveAndNotify(schemaName, "Property added");
      }
    });

    // Handle field changes.
    container.addEventListener("change", async (event) => {
      const row = event.target.closest(".schema-field");
      if (!row) return;

      const field = getField(schemaName, row.dataset.path);
      if (!field) return;

      const target = event.target;

      if (target.classList.contains("schema-field-name")) {
        field.name = target.value;
      }

      if (target.classList.contains("schema-field-description")) {
        field.description = target.value;
      }

      if (target.classList.contains("schema-field-required")) {
        field.required = target.checked;
      }

      if (target.classList.contains("schema-field-type")) {
        field.type = target.value;

        if (field.type === "Array") {
          field.itemType ||= "String";
        }

        render(schemaName);
      }

      if (target.classList.contains("schema-field-item-type")) {
        field.itemType = target.value;
        render(schemaName);
      }

      await saveAndNotify(schemaName, "Schema saved");
    });
  });

  // Load both schemas when the editor starts.
  Promise.all([load("input"), load("output")]).catch((error) =>
    R.status(error.message, true),
  );

  // Expose schema data for other editor components.
  R.getSchema = (schemaName) => schemas[schemaName];
})();
