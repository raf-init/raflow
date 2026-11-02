(() => {
  const R = window.Raflow,
    { $ } = R;

  // No separate table selector is needed for workflow testing.
  R.refreshTestTables = () => {};

  $("#testForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const workflowId = window.RaflowWorkspace?.getActiveWorkflowId();

      if (!workflowId) {
        throw new Error("Please select a workflow before running a test.");
      }

      const input = JSON.parse($("#testInput").value);

      const output = await R.api(
        `/api/workflows/${encodeURIComponent(workflowId)}/evaluate`,
        {
          method: "POST",
          body: JSON.stringify({ input }),
        },
      );

      $("#result").textContent = JSON.stringify({ input, ...output }, null, 2);
    } catch (error) {
      $("#result").textContent =
        error instanceof SyntaxError
          ? `Invalid JSON: ${error.message}`
          : error.message;
    }
  });
})();
