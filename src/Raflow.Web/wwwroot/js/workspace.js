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
    expandedFolders: JSON.parse(
      localStorage.getItem("raflow.expandedFolders") || "{}",
    ),
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
      dialog.className = "workspace-input-dialog";

      dialog.innerHTML = `
      <form method="dialog" class="workspace-input-form">
        <h3>${title}</h3>

        <input
          id="dialogInput"
          placeholder="${placeholder}"
          required
        />

        <div class="workspace-dialog-actions">
          <button type="button" id="dialogCancel">Cancel</button>
          <button type="submit" value="ok">Continue</button>
        </div>
      </form>
    `;

      document.body.appendChild(dialog);

      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) {
          dialog.close();
        }
      });

      dialog.querySelector("#dialogCancel").addEventListener("click", () => {
        dialog.close();
      });

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

  function askVersionDetails() {
    return new Promise((resolve) => {
      const dialog = document.createElement("dialog");
      dialog.className = "workspace-input-dialog version-dialog";

      dialog.innerHTML = `
      <form method="dialog" class="workspace-input-form">
        <h3>Save workflow version</h3>

        <label for="versionTitle">Version title</label>
        <input
          id="versionTitle"
          value="Updated rules"
          placeholder="e.g. Improved credit rules"
          required
        />

        <label for="versionDescription">What changed?</label>
        <textarea
          id="versionDescription"
          placeholder="Describe the changes..."
        >Saved changes</textarea>

        <div class="workspace-dialog-actions">
          <button type="button" id="versionCancel">Cancel</button>
          <button type="submit" value="save">Save version</button>
        </div>
      </form>
    `;

      document.body.appendChild(dialog);

      dialog.querySelector("#versionCancel").addEventListener("click", () => {
        dialog.close();
      });

      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
      });

      dialog.addEventListener("close", () => {
        const result =
          dialog.returnValue === "save"
            ? {
                title: dialog.querySelector("#versionTitle").value.trim(),
                description: dialog
                  .querySelector("#versionDescription")
                  .value.trim(),
              }
            : null;

        dialog.remove();
        resolve(result && result.title ? result : null);
      });

      dialog.showModal();
      dialog.querySelector("#versionTitle").focus();
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

      const isExpanded = state.expandedFolders[folder.id] ?? true;

      const title = document.createElement("div");
      title.className = "workspace-folder-title";

      const chevron = document.createElement("i");
      chevron.className = `fa-solid ${
        isExpanded ? "fa-chevron-down" : "fa-chevron-right"
      } workspace-folder-chevron`;

      const folderIcon = document.createElement("i");
      folderIcon.className = "fa-solid fa-folder";

      const folderName = document.createElement("span");
      folderName.textContent = folder.name;

      title.append(chevron, folderIcon, folderName);

      const folderActions = document.createElement("div");
      folderActions.className = "workspace-item-actions";

      folderActions.append(
        button("✎", "workspace-action", () => renameFolder(folder)),
        button("×", "workspace-action delete", () => deleteFolder(folder)),
      );

      title.appendChild(folderActions);

      title.addEventListener("click", (event) => {
        if (event.target.closest(".workspace-item-actions")) return;

        state.expandedFolders[folder.id] = !isExpanded;

        localStorage.setItem(
          "raflow.expandedFolders",
          JSON.stringify(state.expandedFolders),
        );

        renderWorkspace();
      });

      folderElement.appendChild(title);

      const workflowList = document.createElement("div");
      workflowList.className = "workspace-folder-workflows";
      workflowList.hidden = !isExpanded;

      for (const workflow of folder.workflows) {
        const item = document.createElement("div");
        item.className = "workspace-workflow-row";

        const openButton = button("", "workspace-workflow", () =>
          openWorkflow(workflow),
        );

        const icon = document.createElement("i");
        icon.className = "fa-solid fa-diagram-project";

        const name = document.createElement("span");
        name.className = "workflow-name";
        name.textContent = workflow.workflowName;

        openButton.append(icon, name);

        if (workflow.workflowId === state.activeWorkflowId) {
          openButton.classList.add("selected");
        }

        if (workflow.activeVersionId) {
          openButton.title = `Active version ID: ${workflow.activeVersionId}`;
        }

        const actions = document.createElement("div");
        actions.className = "workspace-item-actions";

        actions.append(
          button("✎", "workspace-action", () => renameWorkflow(workflow)),
          button("×", "workspace-action delete", () =>
            deleteWorkflow(workflow),
          ),
        );

        item.append(openButton, actions);
        workflowList.appendChild(item);
      }

      folderElement.appendChild(workflowList);
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
        `/api/workspace/workflows/${encodeURIComponent(workflowId)}/versions`,
      );

      versions.replaceChildren();

      if (!items.length) {
        versions.textContent = "No versions available.";
        return;
      }

      // Render version entries into either the sidebar or history modal.
      function renderVersionItems(container, versionItems) {
        container.replaceChildren();

        for (const version of versionItems) {
          const item = document.createElement("div");
          item.className = "workspace-version";

          const info = document.createElement("div");

          const name = document.createElement("strong");
          name.textContent = `Version ${version.versionNumber} — ${version.title || "Untitled"}`;

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
                  await api(
                    `/api/workspace/workflows/${encodeURIComponent(workflowId)}/activate`,
                    {
                      method: "POST",
                      body: JSON.stringify({
                        versionId: version.id,
                      }),
                    },
                  );

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

          container.appendChild(item);
        }
      }

      // Keep the sidebar compact.
      renderVersionItems(versions, items.slice(0, 3));

      // Show the full history in a separate modal.
      if (items.length > 3) {
        const viewAll = button(
          `View all ${items.length} versions`,
          "workspace-view-all",
          () => {
            const dialog = document.createElement("dialog");
            dialog.className = "workspace-history-dialog";

            const header = document.createElement("div");
            header.className = "workspace-history-header";

            const title = document.createElement("h3");
            title.textContent = "Version history";

            const close = button("×", "workspace-history-close", () => {
              dialog.close();
            });

            header.append(title, close);

            const list = document.createElement("div");
            list.className = "workspace-history-list";

            renderVersionItems(list, items);

            dialog.append(header, list);
            document.body.appendChild(dialog);

            dialog.addEventListener("click", (event) => {
              if (event.target === dialog) dialog.close();
            });

            dialog.addEventListener("close", () => dialog.remove());

            dialog.showModal();
          },
        );

        versions.appendChild(viewAll);
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

  async function renameFolder(folder) {
    const name = await askText("Rename folder", folder.name);
    if (!name) return;

    try {
      await api(`/api/workspace/folders/${folder.id}`, {
        method: "PUT",
        body: JSON.stringify({ name }),
      });

      await loadWorkspace();
    } catch (error) {
      alert(error.message);
    }
  }

  async function deleteFolder(folder) {
    if (!confirm(`Delete folder "${folder.name}"? It must be empty.`)) return;

    try {
      await api(`/api/workspace/folders/${folder.id}`, {
        method: "DELETE",
      });

      await loadWorkspace();
    } catch (error) {
      alert(error.message);
    }
  }

  async function renameWorkflow(workflow) {
    const name = await askText("Rename workflow", workflow.workflowName);

    if (!name) return;

    try {
      await api(`/api/workspace/workflows/${workflow.workflowId}`, {
        method: "PUT",
        body: JSON.stringify({ name }),
      });

      await loadWorkspace();
    } catch (error) {
      alert(error.message);
    }
  }

  async function deleteWorkflow(workflow) {
    if (
      !confirm(
        `Delete workflow "${workflow.workflowName}" and all its versions?`,
      )
    )
      return;

    const wasActive = workflow.workflowId === state.activeWorkflowId;

    try {
      await api(`/api/workspace/workflows/${workflow.workflowId}`, {
        method: "DELETE",
      });

      if (wasActive) {
        state.activeWorkflowId = null;
        state.activeWorkflowName = null;

        localStorage.removeItem("raflow.activeWorkflowId");
        localStorage.removeItem("raflow.activeWorkflowName");

        versions.textContent = "Select a workflow.";
      }

      await loadWorkspace();

      if (wasActive) {
        window.location.reload();
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
    askVersionDetails,
  };

  loadWorkspace();
})();
