(() => {
  const R = window.Raflow,
    { $ } = R;

  $("#testForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const input = JSON.parse($("#testInput").value);
      const output = await R.api("/api/evaluate-flow", {
        method: "POST",
        body: JSON.stringify({ input }),
      });
      $("#result").textContent = JSON.stringify({ input, ...output }, null, 2);
    } catch (error) {
      $("#result").textContent =
        error instanceof SyntaxError
          ? `Invalid JSON: ${error.message}`
          : error.message;
    }
  });
})();
