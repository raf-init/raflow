(() => {
  const R = window.Raflow;
  const { $, $$ } = R;

  let variables = [];

  R.getWorkflowVariables = () => variables;

  async function loadVariables() {
    try {
      const result = await R.api("/api/variables");
      console.log("Variables API response:", result);
      variables = Array.isArray(result) ? result : result.variables || [];
      renderVariables();
    } catch (error) {
      R.status(`Could not load variables: ${error.message}`, true);
    }
  }

  function renderVariables() {
    const container = $("#variables-list");

    if (!variables.length) {
      container.innerHTML = '<p class="muted">No variables defined yet.</p>';
      return;
    }

    container.innerHTML = variables
      .map(
        (variable, index) => `
      <div class="schema-field">
        <div class="schema-field-main">
          <input
            type="text"
            class="variable-name"
            data-index="${index}"
            value="${escapeHtml(variable.name)}"
            placeholder="Variable name"
          />

          <select class="variable-type" data-index="${index}">
            ${["String", "Number", "Integer", "Boolean", "Object", "Array"]
              .map(
                (type) => `
                <option value="${type}" ${variable.dataType === type ? "selected" : ""}>
                  ${type}
                </option>
              `,
              )
              .join("")}
          </select>

          <button class="icon-button delete-variable"
            data-index="${index}" title="Delete variable">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>

        <input
          type="text"
          class="variable-description"
          data-index="${index}"
          value="${escapeHtml(variable.description || "")}"
          placeholder="Description (optional)"
        />
      </div>
    `,
      )
      .join("");

    $$(".variable-name, .variable-type, .variable-description").forEach(
      (input) => {
        input.addEventListener("change", () => {
          const index = Number(input.dataset.index);
          const variable = variables[index];

          if (input.classList.contains("variable-name")) {
            variable.name = input.value.trim();
          } else if (input.classList.contains("variable-type")) {
            variable.dataType = input.value;
          } else {
            variable.description = input.value;
          }

          saveVariables();
        });
      },
    );

    $$(".delete-variable").forEach((button) => {
      button.addEventListener("click", () => {
        variables.splice(Number(button.dataset.index), 1);
        saveVariables();
      });
    });
  }

  async function saveVariables() {
    try {
      variables = await R.api("/api/variables", {
        method: "PUT",
        body: JSON.stringify(variables),
      });

      renderVariables();
      R.status("Variables saved");
    } catch (error) {
      R.status(`Could not save variables: ${error.message}`, true);
    }
  }

  function escapeHtml(value) {
    return String(value).replace(
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

  $("#add-variable").addEventListener("click", () => {
    variables.push({
      id: crypto.randomUUID().replaceAll("-", ""),
      name: "",
      dataType: "String",
      description: "",
    });

    renderVariables();
  });

  loadVariables();

  let constants = [];

  R.getWorkflowConstants = () => constants;

  async function loadConstants() {
    try {
      const result = await R.api("/api/constants");
      constants = Array.isArray(result) ? result : result.constants || [];
      renderConstants();
    } catch (error) {
      R.status(`Could not load constants: ${error.message}`, true);
    }
  }

  function renderConstants() {
    const container = $("#constants-list");

    if (!constants.length) {
      container.innerHTML = '<p class="muted">No constants defined yet.</p>';
      return;
    }

    container.innerHTML = constants
      .map(
        (constant, index) => `
      <div class="schema-field">
        <div class="schema-field-main">
          <input
            type="text"
            class="constant-name"
            data-index="${index}"
            value="${escapeHtml(constant.name)}"
            placeholder="Constant name"
          />

          <select class="constant-type" data-index="${index}">
            ${["String", "Number", "Integer", "Boolean", "Object", "Array"]
              .map(
                (type) => `
                <option value="${type}" ${constant.dataType === type ? "selected" : ""}>
                  ${type}
                </option>
              `,
              )
              .join("")}
          </select>

          <button class="icon-button delete-constant"
            data-index="${index}" title="Delete constant">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>

        <textarea
          class="constant-value"
          data-index="${index}"
          rows="2"
          placeholder="Value (valid JSON)"
        >${escapeHtml(getConstantValue(constant.value))}</textarea>

        <input
          type="text"
          class="constant-description"
          data-index="${index}"
          value="${escapeHtml(constant.description || "")}"
          placeholder="Description (optional)"
        />
      </div>
    `,
      )
      .join("");

    $$(
      ".constant-name, .constant-type, .constant-value, .constant-description",
    ).forEach((input) => {
      input.addEventListener("change", () => {
        const index = Number(input.dataset.index);
        const constant = constants[index];

        if (input.classList.contains("constant-name")) {
          constant.name = input.value.trim();
        } else if (input.classList.contains("constant-type")) {
          constant.dataType = input.value;
        } else if (input.classList.contains("constant-value")) {
          try {
            constant.value = JSON.parse(input.value);
          } catch {
            R.status("Constant value must be valid JSON.", true);
            return;
          }
        } else {
          constant.description = input.value;
        }

        saveConstants();
      });
    });

    $$(".delete-constant").forEach((button) => {
      button.addEventListener("click", () => {
        constants.splice(Number(button.dataset.index), 1);
        saveConstants();
      });
    });
  }

  function getConstantValue(value) {
    if (value == null) return '""';

    if (typeof value === "object" && value.value !== undefined) {
      value = value.value;
    }

    return JSON.stringify(value, null, 2);
  }

  async function saveConstants() {
    try {
      constants = await R.api("/api/constants", {
        method: "PUT",
        body: JSON.stringify(constants),
      });

      if (!Array.isArray(constants)) {
        constants = constants.constants || [];
      }

      renderConstants();
      R.status("Constants saved");
    } catch (error) {
      R.status(`Could not save constants: ${error.message}`, true);
    }
  }

  $("#add-constant").addEventListener("click", () => {
    constants.push({
      id: crypto.randomUUID().replaceAll("-", ""),
      name: "",
      dataType: "String",
      value: "",
      description: "",
    });

    renderConstants();
  });

  loadConstants();
})();
