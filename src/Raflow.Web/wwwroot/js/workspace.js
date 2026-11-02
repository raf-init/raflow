(() => {
  const tree = document.getElementById("workspaceTree");
  const versions = document.getElementById("workflowVersions");
  const addFolder = document.getElementById("addFolder");
  const addWorkflow = document.getElementById("addWorkflow");

  if (!tree || !versions) return;

  const state = {
    folders: [],
    activeWorkflowId: localStorage.getItem("raflow.activeWorkflowId"),
    activeWorkflowName: localStorage.getItem("raflow.activeWorkflowName"),
  };

  async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Request failed: ${response.status}`);
    }

    return response.json();
  }

  function button(text, className, onClick) {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = text;

    if (className) element.className = className;

    element.addEventListener("click", onClick);

    return element;
  }

  function askText(title, placeholder = "") {
    return new Promise((resolve) => {
      const dialog = document.createElement("dialog");

      dialog.innerHTML = `
      <form method="dialog" style="padding:20px; min-width:280px">
        <h3 style="margin-top:0">${title}</h3>
        <input
          id="dialogInput"
          placeholder="${placeholder}"
          style="width:100%;padding:9px;margin-bottom:15px"
          required
        />
        <div style="display:flex;justify-content:flex-end;gap:8px">
          <button value="cancel">Cancel</button>
          <button value="ok">Continue</button>
        </div>
      </form>
    `;

      document.body.appendChild(dialog);

      dialog.addEventListener("close", () => {
        const value =
          dialog.returnValue === "ok"
            ? dialog.querySelector("#dialogInput").value.trim()
            : null;

        dialog.remove();
        resolve(value || null);
      });

      dialog.showModal();
      dialog.querySelector("#dialogInput").focus();
    });
  }

  async function loadWorkspace() {
    try {
      const rows = await api("/api/workspace");

      state.folders = rows;

      renderWorkspace();

      // Restore the selected workflow after a browser reload.
      const activeWorkflow = state.folders.find(
        (row) => row.workflowId === state.activeWorkflowId,
      );

      if (activeWorkflow) {
        state.activeWorkflowName = activeWorkflow.workflowName;
        await loadVersions(state.activeWorkflowId);
        await loadSampleInput(state.activeWorkflowId);
      } else {
        state.activeWorkflowId = null;
        state.activeWorkflowName = null;
        localStorage.removeItem("raflow.activeWorkflowId");
        localStorage.removeItem("raflow.activeWorkflowName");
        versions.textContent = "Select a workflow.";
      }
    } catch (error) {
      tree.textContent = "Could not load workspace.";
      console.error(error);
    }
  }

  function renderWorkspace() {
    tree.replaceChildren();

    const folders = new Map();

    for (const row of state.folders) {
      if (!folders.has(row.folderId)) {
        folders.set(row.folderId, {
          id: row.folderId,
          name: row.folderName,
          workflows: [],
        });
      }

      if (row.workflowId) {
        folders.get(row.folderId).workflows.push(row);
      }
    }

    if (folders.size === 0) {
      tree.textContent = "No folders yet.";
      return;
    }

    for (const folder of folders.values()) {
      const folderElement = document.createElement("div");
      folderElement.className = "workspace-folder";

      const title = document.createElement("div");
      title.className = "workspace-folder-title";
      title.textContent = `📁 ${folder.name}`;

      folderElement.appendChild(title);

      for (const workflow of folder.workflows) {
        const item = button(
          `◈ ${workflow.workflowName}`,
          "workspace-workflow",
          () => openWorkflow(workflow),
        );

        if (workflow.workflowId === state.activeWorkflowId) {
          item.classList.add("selected");
        }

        if (workflow.activeVersionId) {
          item.title = `Active version ID: ${workflow.activeVersionId}`;
        }

        folderElement.appendChild(item);
      }

      tree.appendChild(folderElement);
    }
  }

  async function openWorkflow(workflow) {
    try {
      await api(`/api/workspace/workflows/${workflow.workflowId}/load`, {
        method: "POST",
      });

      state.activeWorkflowId = workflow.workflowId;
      state.activeWorkflowName = workflow.workflowName;

      localStorage.setItem("raflow.activeWorkflowId", workflow.workflowId);

      localStorage.setItem("raflow.activeWorkflowName", workflow.workflowName);

      window.location.reload();
    } catch (error) {
      alert(error.message);
    }
  }

  async function loadSampleInput(workflowId) {
    const input = document.getElementById("testInput");

    if (!input) return;

    // Don't overwrite user edits when the workspace refreshes.
    if (input.dataset.sampleWorkflowId === workflowId) return;

    try {
      const sample = await api(
        `/api/workflows/${encodeURIComponent(workflowId)}/sample-input`,
      );

      input.value = JSON.stringify(sample, null, 2);
      input.dataset.sampleWorkflowId = workflowId;
    } catch (error) {
      console.error("Could not load workflow sample input:", error);
    }
  }

  async function loadVersions(workflowId) {
    versions.replaceChildren();

    const heading = document.createElement("p");
    heading.className = "workspace-empty";
    heading.textContent = "Loading versions...";
    versions.appendChild(heading);

    try {
      const items = await api(
        `/api/workspace/workflows/${workflowId}/versions`,
      );

      versions.replaceChildren();

      if (!items.length) {
        versions.textContent = "No versions available.";
        return;
      }

      for (const version of items) {
        const item = document.createElement("div");
        item.className = "workspace-version";

        const info = document.createElement("div");

        const name = document.createElement("strong");
        name.textContent = `Version ${version.versionNumber}`;

        const description = document.createElement("small");
        description.textContent = version.changeDescription;

        const date = document.createElement("small");
        date.textContent = new Date(version.createdAt).toLocaleString();

        info.append(name, description, date);
        item.appendChild(info);

        if (version.isActive) {
          const active = document.createElement("span");
          active.className = "version-active";
          active.textContent = "ACTIVE";
          item.appendChild(active);
        } else {
          item.appendChild(
            button("Activate", "version-activate", async () => {
              if (!confirm(`Activate version ${version.versionNumber}?`))
                return;

              try {
                await api(`/api/workspace/workflows/${workflowId}/activate`, {
                  method: "POST",
                  body: JSON.stringify({
                    versionId: version.id,
                  }),
                });

                await openWorkflow({
                  workflowId,
                  workflowName: state.activeWorkflowName,
                });
              } catch (error) {
                alert(error.message);
              }
            }),
          );
        }

        versions.appendChild(item);
      }
    } catch (error) {
      versions.textContent = "Could not load versions.";
      console.error(error);
    }
  }

  async function createFolder() {
    const name = await askText("Create folder", "Folder name");

    if (!name) return;

    try {
      await api("/api/workspace/folders", {
        method: "POST",
        body: JSON.stringify({ name }),
      });

      await loadWorkspace();
    } catch (error) {
      alert(error.message);
    }
  }

  async function createWorkflow() {
    if (!state.folders.length) {
      alert("Create a folder first.");
      return;
    }

    const name = await askText("Create workflow", "Workflow name");

    if (!name) return;

    const options = state.folders
      .map((folder, index) => `${index + 1}. ${folder.folderName}`)
      .join("\n");

    const choice = await askText(
      `Choose a folder (enter its number):\n${options}`,
      "1",
    );

    if (!choice) return;

    const index = Number(choice) - 1;

    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= state.folders.length
    ) {
      alert("Invalid folder selection.");
      return;
    }

    const folderId = state.folders[index].folderId;

    try {
      const result = await api("/api/workspace/workflows", {
        method: "POST",
        body: JSON.stringify({ name, folderId }),
      });

      await loadWorkspace();

      const workflow = state.folders.find(
        (row) => row.workflowId === result.id,
      );

      if (workflow) {
        await openWorkflow(workflow);
      }
    } catch (error) {
      alert(error.message);
    }
  }

  if (addFolder) {
    addFolder.addEventListener("click", createFolder);
  }

  if (addWorkflow) {
    addWorkflow.addEventListener("click", createWorkflow);
  }

  // Expose a small interface for the existing editor's Save handler.
  window.RaflowWorkspace = {
    getActiveWorkflowId: () => state.activeWorkflowId,
    refresh: loadWorkspace,
    refreshVersions: () => {
      if (state.activeWorkflowId) {
        return loadVersions(state.activeWorkflowId);
      }
    },
  };

  loadWorkspace();
})();
