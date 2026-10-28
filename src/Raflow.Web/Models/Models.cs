using System.Text.Json;

namespace Raflow.Models;

public sealed class DecisionTable
{
    public string Id { get; set; } = "decision";
    public string Name { get; set; } = "Decision table";
    public List<TableColumn> Inputs { get; set; } = [];
    public List<TableColumn> Outputs { get; set; } = [];
    public List<DecisionRule> Rules { get; set; } = [];
}

public sealed class TableColumn
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Label { get; set; } = "Field";
    public string Source { get; set; } = "person.age";
}

public sealed class DecisionRule
{
    public Dictionary<string, string> Inputs { get; set; } = new();
    public Dictionary<string, string> Outputs { get; set; } = new();
}

public sealed class EvaluateRequest
{
    public string? TableId { get; set; }
    public JsonElement Input { get; set; }
}

public sealed class FlowGraph
{
    public List<FlowNode> Nodes { get; set; } = [];
    public List<FlowConnection> Connections { get; set; } = [];
}

public sealed class FlowNode
{
    public string Id { get; set; } = "";
    public string Type { get; set; } = "";
    public string Title { get; set; } = "";
    public double X { get; set; }
    public double Y { get; set; }
    public string? TableId { get; set; }
}

public sealed class FlowConnection
{
    public string Id { get; set; } = "";
    public string From { get; set; } = "";
    public string To { get; set; } = "";
}

public sealed class FlowEvaluateRequest
{
    public JsonElement Input { get; set; }
}
