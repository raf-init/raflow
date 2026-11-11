using Microsoft.AspNetCore.Mvc;
using Raflow.Web.Models;
using Raflow.Web.Services;

namespace Raflow.Controllers;

[ApiController]
[Route("api")]
public sealed class ApiController(
    RuleStore store,
    WorkflowStore workflows) : ControllerBase
{
    [HttpGet("table")]
    public ActionResult<DecisionTable> GetLegacyTable() => Ok(store.GetTable("decision"));

    [HttpPut("table")]
    public ActionResult<DecisionTable> SaveLegacyTable(DecisionTable table)
    {
        table.Id = "decision";
        return Ok(store.SaveTable(table));
    }

    [HttpGet("tables/{id}")]
    public ActionResult<DecisionTable> GetTable(string id) => Ok(store.GetTable(id));

    [HttpPut("tables/{id}")]
    public ActionResult<DecisionTable> SaveTable(string id, DecisionTable table)
    {
        if (!string.Equals(id, table.Id, StringComparison.Ordinal))
            return BadRequest(new { error = "Table id in URL and body must match." });
        if (table.Inputs is null || table.Outputs is null || table.Rules is null)
            return BadRequest(new { error = "Inputs, outputs, and rules are required." });
        if (table.Inputs.Any(c => string.IsNullOrWhiteSpace(c.Id) || string.IsNullOrWhiteSpace(c.Source)) ||
            table.Outputs.Any(c => string.IsNullOrWhiteSpace(c.Id) || string.IsNullOrWhiteSpace(c.Source)))
            return BadRequest(new { error = "Every column needs an ID and a source path." });
        return Ok(store.SaveTable(table));
    }

    [HttpGet("graph")]
    public ActionResult<FlowGraph> GetGraph() => Ok(store.GetGraph());

    [HttpPut("graph")]
    public ActionResult<FlowGraph> SaveGraph(FlowGraph graph)
    {
        if (graph.Nodes is null || graph.Connections is null)
            return BadRequest(new { error = "Nodes and connections are required." });
        var ids = graph.Nodes.Select(n => n.Id).ToHashSet();
        if (graph.Connections.Any(c => !ids.Contains(c.From) || !ids.Contains(c.To) || c.From == c.To))
            return BadRequest(new { error = "Invalid connection." });
        return Ok(store.SaveGraph(graph));
    }

    [HttpPost("evaluate")]
    public IActionResult Evaluate(EvaluateRequest request)
    {
        if (request.Input.ValueKind != System.Text.Json.JsonValueKind.Object)
            return BadRequest(new { error = "Input must be a JSON object." });
        return ExecuteEvaluation(() => store.Evaluate(request));
    }

    [HttpPost("evaluate-flow")]
    public IActionResult EvaluateFlow(FlowEvaluateRequest request)
    {
        if (request.Input.ValueKind != System.Text.Json.JsonValueKind.Object)
            return BadRequest(new { error = "Input must be a JSON object." });
        return ExecuteEvaluation(() => store.EvaluateFlow(request));
    }

    [HttpPost("workflows/{id}/evaluate")]
    public IActionResult EvaluateWorkflow(
    string id,
    FlowEvaluateRequest request)
    {
        if (request.Input.ValueKind != System.Text.Json.JsonValueKind.Object)
        {
            return BadRequest(new
            {
                error = "Input must be a JSON object."
            });
        }

        var snapshot = workflows.LoadActive(id);

        if (snapshot is null)
        {
            return NotFound(new
            {
                error = "Workflow not found or has no active version."
            });
        }

        return ExecuteEvaluation(() => store.EvaluateFlow(snapshot, request));
    }


    [HttpGet("workflows/{id}/sample-input")]
    public IActionResult GetWorkflowSampleInput(string id)
    {
        var snapshot = workflows.LoadActive(id);

        if (snapshot is null)
            return NotFound(new { error = "Workflow not found or has no active version." });

        return Ok(store.BuildSampleInput(snapshot));
    }


    private IActionResult ExecuteEvaluation(Func<object> evaluation)
    {
        try
        {
            return Ok(evaluation());
        }
        catch (RuleEvaluationException ex)
        {
            return BadRequest(new
            {
                error = ex.Message
            });
        }
    }


}
