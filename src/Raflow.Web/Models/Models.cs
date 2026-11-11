using System.Text.Json;

namespace Raflow.Web.Models;


public sealed class DecisionTable
{
    public string Id { get; set; } = "decision";
    public string Name { get; set; } = "Decision table";

    // FIRST, UNIQUE, PRIORITY or COLLECT
    public string HitPolicy { get; set; } = "FIRST";

    public List<TableColumn> Inputs { get; set; } = [];
    public List<TableColumn> Outputs { get; set; } = [];
    public List<DecisionRule> Rules { get; set; } = [];
}

public sealed class DecisionRule
{
    public int Priority { get; set; } = 0;

    // Existing conditions — kept for backward compatibility
    public Dictionary<string, string> Inputs { get; set; } = new();

    // New grouped conditions
    public List<DecisionConditionGroup> ConditionGroups { get; set; } = [];

    public Dictionary<string, string> Outputs { get; set; } = new();
}

public sealed class DecisionConditionGroup
{
    // AND or OR
    public string Operator { get; set; } = "AND";

    // Column ID -> condition
    public Dictionary<string, string> Conditions { get; set; } = new();
}


public sealed class TableColumn
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Label { get; set; } = "Field";
    public string Source { get; set; } = "person.age";
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
    public List<ExpressionAssignment> Expressions { get; set; } = [];

    public List<ResponseMapping> ResponseMappings { get; set; } = [];
}

public sealed class ResponseMapping
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    public string Output { get; set; } = "";

    public string Source { get; set; } = "";
}

public sealed class ExpressionAssignment
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    public string Output { get; set; } = "";

    public string Formula { get; set; } = "";
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


public sealed class DataSchema
{
    public List<SchemaField> Fields { get; set; } = [];
}

public sealed class SchemaField
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    public string Name { get; set; } = "";

    // String, Number, Integer, Boolean, Object or Array
    public string Type { get; set; } = "String";

    public bool Required { get; set; } = false;

    public string Description { get; set; } = "";

    // Used by Object fields
    public List<SchemaField> Properties { get; set; } = [];

    // Used by Array fields
    public string? ItemType { get; set; }
}



public sealed class WorkspaceSnapshot
{
    public FlowGraph Graph { get; set; } = new();

    public Dictionary<string, DecisionTable> Tables { get; set; } = new();

    public DataSchema InputSchema { get; set; } = new();

    public DataSchema OutputSchema { get; set; } = new();
}


public sealed class CreateFolderRequest
{
    public string Name { get; set; } = "";
}

public sealed class CreateWorkflowRequest
{
    public string Name { get; set; } = "";
    public string FolderId { get; set; } = "";
}

public sealed class SaveWorkflowRequest
{
    public string? Title { get; set; }
    public string? ChangeDescription { get; set; }
}

public sealed class ActivateVersionRequest
{
    public int VersionId { get; set; }
}


