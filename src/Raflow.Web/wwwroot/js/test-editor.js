(() => {
  const R = window.Raflow;
  const { $ } = R;

  let currentMode = "json";
  let currentInput = {};
  let customFields = [];
  let customFieldId = 0;

  const escapeHtml = (value) =>
    String(value ?? "").replace(
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

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getValue(object, path) {
    return path.split(".").reduce((current, key) => current?.[key], object);
  }

  function setValue(object, path, value) {
    const parts = path.split(".");
    let current = object;

    parts.forEach((part, index) => {
      if (index === parts.length - 1) {
        current[part] = value;
      } else {
        current[part] ??= {};
        current = current[part];
      }
    });
  }

  function defaultValue(type, field) {
    switch (type) {
      case "String":
        return "";
      case "Number":
      case "Integer":
        return 0;
      case "Boolean":
        return false;
      case "Object":
        return {};
      case "Array":
        return [];
      default:
        return null;
    }
  }

  function getInputSchema() {
    return R.getSchema?.("input") || { fields: [] };
  }

  function renderSchemaFields(fields, parentPath = "") {
    return (fields || [])
      .map((field) => {
        const path = parentPath ? `${parentPath}.${field.name}` : field.name;

        const value = getValue(currentInput, path);
        const type = field.type || "String";

        if (type === "Object" && field.properties?.length) {
          return `
          <div class="test-field full-width">
            <strong>${escapeHtml(field.name)}</strong>
            ${
              field.description
                ? `<p class="hint">${escapeHtml(field.description)}</p>`
                : ""
            }
            <div class="test-nested-fields">
              ${renderSchemaFields(field.properties, path)}
            </div>
          </div>
        `;
        }

        const label = `
        <span>
          ${escapeHtml(field.name)}
          ${field.required ? '<span aria-label="required">*</span>' : ""}
        </span>
        ${
          field.description
            ? `<small class="hint">${escapeHtml(field.description)}</small>`
            : ""
        }
      `;

        let control = "";

        if (type === "Boolean") {
          control = `
          <select data-form-path="${escapeHtml(path)}"
                  data-form-type="Boolean">
            <option value="true" ${value === true ? "selected" : ""}>True</option>
            <option value="false" ${value === false ? "selected" : ""}>False</option>
          </select>
        `;
        } else if (type === "Array" || type === "Object") {
          const arrayValue = value ?? defaultValue(type);
          control = `
          <textarea data-form-path="${escapeHtml(path)}"
                    data-form-type="${type}"
                    rows="3">${escapeHtml(JSON.stringify(arrayValue, null, 2))}</textarea>
        `;
        } else {
          control = `
          <input
            data-form-path="${escapeHtml(path)}"
            data-form-type="${type}"
            type="${type === "Number" || type === "Integer" ? "number" : "text"}"
            ${type === "Integer" ? 'step="1"' : ""}
            value="${escapeHtml(value ?? defaultValue(type))}">
        `;
        }

        return `
        <label class="test-field">
          ${label}
          ${control}
        </label>
      `;
      })
      .join("");
  }

  function renderForm() {
    const schema = getInputSchema();

    if (!schema.fields?.length) {
      $("#testInputFields").innerHTML =
        '<p class="muted">No Input Schema fields defined. You can still add custom context fields below.</p>';
    } else {
      $("#testInputFields").innerHTML = renderSchemaFields(schema.fields);
    }

    renderCustomFields();
  }

  function renderCustomFields() {
    const container = $("#testCustomFields");

    container.innerHTML = `
      <div class="test-custom-heading">
        <div>
          <strong>Custom workflow context</strong>
          <p class="hint">
            Add additional values using paths such as loan.amount.
          </p>
        </div>
        <button type="button" id="addTestCustomField">
          + Add custom field
        </button>
      </div>

      <div class="test-custom-list">
        ${customFields
          .map(
            (field, index) => `
          <div class="test-custom-row" data-custom-index="${index}">
            <label>
              Source path
              <input data-custom-path
                     value="${escapeHtml(field.path)}"
                     placeholder="e.g. loan.amount">
            </label>

            <label>
              Data type
              <select data-custom-type>
                ${["String", "Number", "Integer", "Boolean", "Object", "Array"]
                  .map(
                    (type) => `
                    <option value="${type}"
                      ${field.type === type ? "selected" : ""}>
                      ${type}
                    </option>
                  `,
                  )
                  .join("")}
              </select>
            </label>

            <label class="custom-value">
              Value
              ${renderCustomValue(field)}
            </label>

            <button type="button" data-remove-custom="${index}">
              Remove
            </button>
          </div>
        `,
          )
          .join("")}
      </div>
    `;
  }

  function renderCustomValue(field) {
    if (field.type === "Boolean") {
      return `
        <select data-custom-value>
          <option value="true" ${field.value === true ? "selected" : ""}>True</option>
          <option value="false" ${field.value === false ? "selected" : ""}>False</option>
        </select>
      `;
    }

    if (field.type === "Object" || field.type === "Array") {
      return `
        <textarea data-custom-value rows="3">${escapeHtml(
          JSON.stringify(
            field.value ?? (field.type === "Array" ? [] : {}),
            null,
            2,
          ),
        )}</textarea>
      `;
    }

    return `
      <input data-custom-value
             type="${field.type === "Number" || field.type === "Integer" ? "number" : "text"}"
             ${field.type === "Integer" ? 'step="1"' : ""}
             value="${escapeHtml(field.value ?? "")}">
    `;
  }

  function parseValue(value, type) {
    if (type === "String") return value;

    if (type === "Boolean") return value === "true";

    if (type === "Number" || type === "Integer") {
      if (value.trim() === "") {
        throw new Error("Please enter a numeric value.");
      }

      const number = Number(value);

      if (!Number.isFinite(number)) {
        throw new Error(`Invalid ${type.toLowerCase()} value.`);
      }

      if (type === "Integer" && !Number.isInteger(number)) {
        throw new Error("Integer fields cannot contain decimal values.");
      }

      return number;
    }

    let parsed;

    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error(`Please enter valid JSON for the ${type} field.`);
    }

    if (type === "Array" && !Array.isArray(parsed)) {
      throw new Error("This field must contain a JSON array.");
    }

    if (
      type === "Object" &&
      (parsed === null || Array.isArray(parsed) || typeof parsed !== "object")
    ) {
      throw new Error("This field must contain a JSON object.");
    }

    return parsed;
  }

  function readFormInput() {
    const result = clone(currentInput);

    // Read fields generated from the Input Schema.
    $("#testInputFields")
      .querySelectorAll("[data-form-path]")
      .forEach((control) => {
        const value = parseValue(control.value, control.dataset.formType);

        setValue(result, control.dataset.formPath, value);
      });

    // Read additional custom context fields.
    $("#testCustomFields")
      .querySelectorAll(".test-custom-row")
      .forEach((row) => {
        const path = row.querySelector("[data-custom-path]").value.trim();

        if (!path) return;

        const type = row.querySelector("[data-custom-type]").value;
        const value = parseValue(
          row.querySelector("[data-custom-value]").value,
          type,
        );

        setValue(result, path, value);
      });

    return result;
  }

  function setMode(mode) {
    currentMode = mode;

    $("#testJsonMode").classList.toggle("hidden", mode !== "json");
    $("#testFormMode").classList.toggle("hidden", mode !== "form");
    $("#testCustomFields").classList.toggle("hidden", mode !== "form");

    R.$$(".test-mode").forEach((button) => {
      button.classList.toggle("active", button.dataset.testMode === mode);
    });
  }

  function readJsonInput() {
    const parsed = JSON.parse($("#testInput").value);

    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("Workflow input must be a JSON object.");
    }

    return parsed;
  }

  // Switch between JSON and Form without losing values.
  R.$$(".test-mode").forEach((button) => {
    button.addEventListener("click", () => {
      try {
        if (currentMode === "json") {
          currentInput = readJsonInput();
          renderForm();
        } else {
          currentInput = readFormInput();
          $("#testInput").value = JSON.stringify(currentInput, null, 2);
        }

        setMode(button.dataset.testMode);
      } catch (error) {
        $("#result").textContent = error.message;
      }
    });
  });

  // Add custom context fields.
  $("#testCustomFields").addEventListener("click", (event) => {
    if (event.target.id === "addTestCustomField") {
      customFields.push({
        id: ++customFieldId,
        path: "",
        type: "String",
        value: "",
      });

      renderCustomFields();
      return;
    }

    const removeIndex = event.target.dataset.removeCustom;

    if (removeIndex !== undefined) {
      customFields.splice(Number(removeIndex), 1);
      renderCustomFields();
    }
  });

  // Keep custom field state when changing its type or value.
  $("#testCustomFields").addEventListener("change", (event) => {
    const row = event.target.closest(".test-custom-row");
    if (!row) return;

    const index = Number(row.dataset.customIndex);
    const field = customFields[index];
    if (!field) return;

    field.path = row.querySelector("[data-custom-path]").value;
    field.type = row.querySelector("[data-custom-type]").value;

    if (event.target.matches("[data-custom-type]")) {
      field.value = defaultValue(field.type);
      renderCustomFields();
    } else if (event.target.matches("[data-custom-value]")) {
      field.value = event.target.value;
    }
  });

  // Preserve custom field values before a rerender.
  $("#testCustomFields").addEventListener("input", (event) => {
    const row = event.target.closest(".test-custom-row");
    if (!row) return;

    const field = customFields[Number(row.dataset.customIndex)];
    if (!field) return;

    if (event.target.matches("[data-custom-path]")) {
      field.path = event.target.value;
    } else if (event.target.matches("[data-custom-value]")) {
      field.value = event.target.value;
    }
  });

  // Run the workflow using the same API for both modes.
  $("#testForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const workflowId = window.RaflowWorkspace?.getActiveWorkflowId();

      if (!workflowId) {
        throw new Error("Please select a workflow before running a test.");
      }

      const input = currentMode === "form" ? readFormInput() : readJsonInput();

      const output = await R.api(
        `/api/workflows/${encodeURIComponent(workflowId)}/evaluate`,
        {
          method: "POST",
          body: JSON.stringify({ input }),
        },
      );

      if (currentMode === "json") {
        $("#testInput").value = JSON.stringify(input, null, 2);
      } else {
        currentInput = input;
      }

      $("#result").textContent = JSON.stringify({ input, ...output }, null, 2);
    } catch (error) {
      $("#result").textContent =
        error instanceof SyntaxError
          ? `Invalid JSON: ${error.message}`
          : error.message;
    }
  });

  R.refreshTestTables = () => {};
})();
