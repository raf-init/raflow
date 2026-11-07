using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using Raflow.Web.Models;

namespace Raflow.Web.Services;

public sealed class RuleStore
{
    private readonly object gate = new();
    private readonly string tablesPath, graphPath;
    private readonly JsonSerializerOptions json = new() { WriteIndented = true };
    private readonly ExpressionEngine _expressions;
    private Dictionary<string, DecisionTable> tables;
    private FlowGraph graph;

    public RuleStore(IWebHostEnvironment env, ExpressionEngine expressions)
    {
        _expressions = expressions;
        var dir = Path.Combine(env.ContentRootPath, "App_Data");
        Directory.CreateDirectory(dir);
        tablesPath = Path.Combine(dir, "tables.json");
        graphPath = Path.Combine(dir, "graph.json");
        tables = Read(tablesPath, new Dictionary<string, DecisionTable>());
        graph = Read(graphPath, DefaultGraph());
        if (graph.Nodes is null || graph.Nodes.Count == 0) graph = DefaultGraph();

        // Migrate the previous single-table JSON file if it exists.
        if (tables.Count == 0)
        {
            var oldPath = Path.Combine(dir, "rules.json");
            var old = ReadLegacy(oldPath);
            var seed = old ?? DefaultTable();
            seed.Id = "decision";
            tables[seed.Id] = seed;
            Write(tablesPath, tables);
        }

        foreach (var node in graph.Nodes.Where(n => n.Type == "decision"))
        {
            node.TableId ??= node.Id;
            if (!tables.ContainsKey(node.TableId))
                tables[node.TableId] = BlankTable(node.TableId, node.Title);
        }
        Write(tablesPath, tables);
        Write(graphPath, graph);
    }

    private T Read<T>(string path, T fallback)
    {
        try { return File.Exists(path) ? JsonSerializer.Deserialize<T>(File.ReadAllText(path), json) ?? fallback : fallback; }
        catch { return fallback; }
    }

    private DecisionTable? ReadLegacy(string path)
    {
        try
        {
            if (!File.Exists(path)) return null;
            using var doc = JsonDocument.Parse(File.ReadAllText(path));
            var root = doc.RootElement;
            var t = DefaultTable();
            if (root.TryGetProperty("name", out var name)) t.Name = name.GetString() ?? t.Name;
            if (root.TryGetProperty("rules", out var rules) && rules.ValueKind == JsonValueKind.Array)
            {
                t.Rules.Clear();
                foreach (var old in rules.EnumerateArray())
                {
                    var rule = new DecisionRule();
                    rule.Inputs[t.Inputs[0].Id] = GetString(old, "annualIncome", "*");
                    rule.Inputs[t.Inputs[1].Id] = GetString(old, "creditScore", "*");
                    rule.Inputs[t.Inputs[2].Id] = GetString(old, "employment", "*");
                    rule.Outputs[t.Outputs[0].Id] = GetString(old, "cardType", "Standard");
                    rule.Outputs[t.Outputs[1].Id] = GetString(old, "creditLimit", "5000");
                    rule.Outputs[t.Outputs[2].Id] = GetString(old, "annualFee", "0");
                    t.Rules.Add(rule);
                }
            }
            return t;
        }
        catch { return null; }
    }

    private static string GetString(JsonElement obj, string key, string fallback) =>
        obj.TryGetProperty(key, out var value) ? (value.ValueKind == JsonValueKind.String ? value.GetString() : value.ToString()) ?? fallback : fallback;

    private void Write<T>(string path, T value)
    {
        var tmp = path + ".tmp";
        File.WriteAllText(tmp, JsonSerializer.Serialize(value, json));
        File.Move(tmp, path, true);
    }

    private static T Clone<T>(T value) => JsonSerializer.Deserialize<T>(JsonSerializer.Serialize(value))!;

    public DecisionTable GetTable(string? id = null)
    {
        lock (gate)
        {
            id = string.IsNullOrWhiteSpace(id) ? "decision" : id;
            if (!tables.TryGetValue(id, out var table))
            {
                table = BlankTable(id, "Decision table");
                tables[id] = table;
                Write(tablesPath, tables);
            }
            return Clone(table);
        }
    }

    public DecisionTable SaveTable(DecisionTable value)
    {
        lock (gate)
        {
            if (string.IsNullOrWhiteSpace(value.Id)) value.Id = "decision";
            value.Inputs ??= [];
            value.Outputs ??= [];
            value.Rules ??= [];
            tables[value.Id] = Clone(value);
            Write(tablesPath, tables);
            return Clone(value);
        }
    }

    public FlowGraph GetGraph() { lock (gate) return Clone(graph); }

    public FlowGraph SaveGraph(FlowGraph value)
    {
        lock (gate)
        {
            value.Nodes ??= [];
            value.Connections ??= [];
            foreach (var node in value.Nodes.Where(n => n.Type == "decision"))
            {
                node.TableId ??= node.Id;
                if (!tables.ContainsKey(node.TableId))
                    tables[node.TableId] = BlankTable(node.TableId, node.Title);
            }
            graph = Clone(value);
            Write(tablesPath, tables);
            Write(graphPath, graph);
            return Clone(graph);
        }
    }

    public object Evaluate(EvaluateRequest request)
    {
        var table = GetTable(request.TableId);
        var input = request.Input.ValueKind == JsonValueKind.Object ? request.Input : JsonDocument.Parse("{}").RootElement;
        for (var i = 0; i < table.Rules.Count; i++)
        {
            var rule = table.Rules[i];
            if (!table.Inputs.All(col => Matches(GetPath(input, col.Source), rule.Inputs.GetValueOrDefault(col.Id, "*"))))
                continue;

            var output = new Dictionary<string, object?>();
            foreach (var col in table.Outputs)
                SetPath(output, col.Source, ParseOutput(rule.Outputs.GetValueOrDefault(col.Id, "")));
            return new { matched = true, ruleNumber = i + 1, output };
        }
        return new { matched = false, ruleNumber = (int?)null, output = new Dictionary<string, object?>() };
    }

    // Execute the decision nodes in the saved flow, following connections from Request.
    // Each table receives the accumulated context, including outputs from earlier tables.
    // Existing editor evaluation still works using its current working copy.
    public object EvaluateFlow(FlowEvaluateRequest request)
    {
        return EvaluateFlow(ExportWorkspace(), request);
    }

    // New overload: evaluates an independent workflow snapshot.
    public object EvaluateFlow(
        WorkspaceSnapshot snapshot,
        FlowEvaluateRequest request)
    {
        var flow = snapshot.Graph ?? new FlowGraph();

        var workflowTables = snapshot.Tables
            ?? new Dictionary<string, DecisionTable>();

        var context = JsonNode.Parse(request.Input.GetRawText()) as JsonObject
            ?? new JsonObject();

        var nodes = flow.Nodes.ToDictionary(
            n => n.Id,
            StringComparer.Ordinal);

        var outgoing = flow.Connections
            .GroupBy(c => c.From)
            .ToDictionary(
                g => g.Key,
                g => g.Select(c => c.To).ToList(),
                StringComparer.Ordinal);

        var visited = new HashSet<string>(StringComparer.Ordinal);
        var steps = new List<object>();
        var allMatched = true;

        var starts = flow.Nodes
            .Where(n => n.Type == "request")
            .Select(n => n.Id)
            .ToList();

        if (starts.Count == 0)
        {
            var destinations = flow.Connections
                .Select(c => c.To)
                .ToHashSet(StringComparer.Ordinal);

            starts = flow.Nodes
                .Where(n => !destinations.Contains(n.Id))
                .Select(n => n.Id)
                .ToList();
        }

        void Visit(string nodeId)
        {
            if (!visited.Add(nodeId) ||
                !nodes.TryGetValue(nodeId, out var node))
                return;

            Console.WriteLine($"Executing node: {node.Id} ({node.Type})");

            if (node.Type == "decision")
            {
                var tableId = string.IsNullOrWhiteSpace(node.TableId)
                    ? node.Id
                    : node.TableId;

                // IMPORTANT: Read from this workflow's snapshot,
                // never from the shared RuleStore tables.
                if (!workflowTables.TryGetValue(tableId, out var table))
                {
                    table = BlankTable(tableId, node.Title);
                }

                using var inputDoc = JsonDocument.Parse(context.ToJsonString());

                var matched = false;
                int? ruleNumber = null;

                var output = new Dictionary<string, object?>();

                for (var i = 0; i < table.Rules.Count; i++)
                {
                    var rule = table.Rules[i];

                    if (!table.Inputs.All(col =>
                        Matches(
                            GetPath(inputDoc.RootElement, col.Source),
                            rule.Inputs.GetValueOrDefault(col.Id, "*"))))
                    {
                        continue;
                    }

                    matched = true;
                    ruleNumber = i + 1;

                    foreach (var col in table.Outputs)
                    {
                        SetPath(
                            output,
                            col.Source,
                            ParseOutput(
                                rule.Outputs.GetValueOrDefault(col.Id, "")));
                    }

                    break;
                }

                var outputNode =
                    JsonSerializer.SerializeToNode(output) as JsonObject
                    ?? new JsonObject();

                MergeObject(context, outputNode);

                allMatched &= matched;

                steps.Add(new
                {
                    nodeId = node.Id,
                    tableId,
                    tableName = table.Name,
                    matched,
                    ruleNumber,
                    output = outputNode.DeepClone()
                });
            }

            if (node.Type == "expression")
            {
                Console.WriteLine($"Expression assignments: {node.Expressions?.Count ?? 0}");

                foreach (var expression in node.Expressions ?? [])
                {
                    Console.WriteLine($"Output: {expression.Output}");
                    Console.WriteLine($"Formula: {expression.Formula}");
                }

                var expressionOutputs = new JsonObject();

                foreach (var expression in node.Expressions ?? [])
                {
                    if (string.IsNullOrWhiteSpace(expression.Output) ||
                        string.IsNullOrWhiteSpace(expression.Formula))
                        continue;

                    var value = _expressions.Evaluate(expression.Formula, context);

                    Console.WriteLine($"Calculated value: {value}");

                    SetPath(expressionOutputs, expression.Output, value);
                }

                MergeObject(context, expressionOutputs);

                steps.Add(new
                {
                    nodeId = node.Id,
                    type = "expression",
                    output = expressionOutputs.DeepClone()
                });
            }


            if (outgoing.TryGetValue(nodeId, out var nextNodes))
            {
                foreach (var next in nextNodes)
                {
                    Visit(next);
                }
            }
        }

        foreach (var start in starts)
        {
            Visit(start);
        }

        return new
        {
            matched = allMatched,
            steps,
            output = context
        };
    }

    private static void MergeObject(JsonObject target, JsonObject source)
    {
        foreach (var pair in source)
        {
            if (pair.Value is JsonObject sourceChild && target[pair.Key] is JsonObject targetChild)
                MergeObject(targetChild, sourceChild);
            else
                target[pair.Key] = pair.Value?.DeepClone();
        }
    }

    private static JsonElement GetPath(JsonElement root, string path)
    {
        var current = root;
        foreach (var segment in (path ?? "").Split('.', StringSplitOptions.RemoveEmptyEntries))
        {
            if (current.ValueKind != JsonValueKind.Object || !current.TryGetProperty(segment, out var next))
                return default;
            current = next;
        }
        return current;
    }

    private static bool Matches(JsonElement actual, string? condition)
    {
        var s = (condition ?? "*").Trim();
        if (s is "" or "*") return true;
        if (actual.ValueKind == JsonValueKind.Undefined || actual.ValueKind == JsonValueKind.Null) return false;
        var op = new[] { ">=", "<=", "!=", ">", "<", "=" }.FirstOrDefault(candidate => s.StartsWith(candidate, StringComparison.Ordinal)) ?? "";
        if (op == "") return string.Equals(actual.ToString(), s.Trim('"', '\''), StringComparison.OrdinalIgnoreCase);
        var expected = s[op.Length..].Trim().Trim('"', '\'');
        if (decimal.TryParse(actual.ToString(), NumberStyles.Any, CultureInfo.InvariantCulture, out var a) &&
            decimal.TryParse(expected, NumberStyles.Any, CultureInfo.InvariantCulture, out var b))
            return op switch { ">" => a > b, ">=" => a >= b, "<" => a < b, "<=" => a <= b, "=" => a == b, "!=" => a != b, _ => false };
        var comparison = string.Compare(actual.ToString(), expected, StringComparison.OrdinalIgnoreCase);
        return op switch { "=" => comparison == 0, "!=" => comparison != 0, ">" => comparison > 0, ">=" => comparison >= 0, "<" => comparison < 0, "<=" => comparison <= 0, _ => false };
    }

    private static object? ParseOutput(string? value)
    {
        var s = (value ?? "").Trim();
        if (s.Length == 0) return "";
        if (decimal.TryParse(s, NumberStyles.Any, CultureInfo.InvariantCulture, out var number)) return number;
        if (bool.TryParse(s, out var boolean)) return boolean;
        if (s == "null") return null;
        return s;
    }

    private static void SetPath(Dictionary<string, object?> root, string path, object? value)
    {
        var parts = (path ?? "").Split('.', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 0) return;
        var current = root;
        for (var i = 0; i < parts.Length - 1; i++)
        {
            if (current.GetValueOrDefault(parts[i]) is not Dictionary<string, object?> next)
                current[parts[i]] = next = new Dictionary<string, object?>();
            current = next;
        }
        current[parts[^1]] = value;
    }


    private static void SetPath(JsonObject root, string path, decimal value)
    {
        var parts = (path ?? "").Split('.', StringSplitOptions.RemoveEmptyEntries);

        if (parts.Length == 0)
            return;

        var current = root;

        for (var i = 0; i < parts.Length - 1; i++)
        {
            if (current[parts[i]] is not JsonObject next)
            {
                next = new JsonObject();
                current[parts[i]] = next;
            }

            current = next;
        }

        current[parts[^1]] = JsonValue.Create(value);
    }


    private static DecisionTable BlankTable(string id, string name) => new()
    {
        Id = id,
        Name = name,
        Inputs = [new() { Id = "input-1", Label = "Age", Source = "person.age" }],
        Outputs = [new() { Id = "output-1", Label = "Result", Source = "result.value" }],
        Rules = [new() { Inputs = new() { ["input-1"] = "*" }, Outputs = new() { ["output-1"] = "" } }]
    };

    private static DecisionTable DefaultTable(string id = "decision", string name = "Credit Card Eligibility")
    {
        var income = new TableColumn { Id = "annualIncome", Label = "Annual income", Source = "person.annualIncome" };
        var score = new TableColumn { Id = "creditScore", Label = "Credit score", Source = "person.creditScore" };
        var employment = new TableColumn { Id = "employment", Label = "Employment", Source = "person.employment" };
        var card = new TableColumn { Id = "cardType", Label = "Card type", Source = "eligibility.cardType" };
        var limit = new TableColumn { Id = "creditLimit", Label = "Credit limit", Source = "eligibility.creditLimit" };
        var fee = new TableColumn { Id = "annualFee", Label = "Annual fee", Source = "eligibility.annualFee" };
        var t = new DecisionTable { Id = id, Name = name, Inputs = [income, score, employment], Outputs = [card, limit, fee] };
        var rows = new (string income, string score, string employment, string card, string limit, string fee)[]
        {
            ("> 150000", "> 750", "Employed", "Platinum Elite", "80000", "0"),
            ("> 100000", "> 720", "Employed", "Platinum", "50000", "195"),
            ("> 75000", "> 700", "Employed", "Gold Plus", "40000", "95"),
            ("> 50000", "> 680", "Employed", "Gold", "25000", "75"),
            ("> 30000", "> 650", "Employed", "Silver", "15000", "45"),
            ("> 25000", "> 620", "Employed", "Standard Plus", "10000", "25"),
            ("> 0", "> 580", "Employed", "Standard", "5000", "15")
        };
        foreach (var r in rows)
        {
            t.Rules.Add(new DecisionRule
            {
                Inputs = new() { [income.Id] = r.income, [score.Id] = r.score, [employment.Id] = r.employment },
                Outputs = new() { [card.Id] = r.card, [limit.Id] = r.limit, [fee.Id] = r.fee }
            });
        }
        return t;
    }

    private static FlowGraph DefaultGraph() => new()
    {
        Nodes =
        [
            new() { Id = "request", Type = "request", Title = "Request", X = 50, Y = 170 },
            new() { Id = "decision", Type = "decision", Title = "Credit Card Rules", X = 340, Y = 120, TableId = "decision" },
            new() { Id = "response", Type = "response", Title = "Response", X = 700, Y = 170 }
        ],
        Connections = [new() { Id = "c1", From = "request", To = "decision" }, new() { Id = "c2", From = "decision", To = "response" }]
    };


    public WorkspaceSnapshot ExportWorkspace()
    {
        lock (gate)
        {
            var snapshot = new WorkspaceSnapshot
            {
                Graph = Clone(graph)
            };

            foreach (var node in graph.Nodes.Where(n => n.Type == "decision"))
            {
                var id = node.TableId ?? node.Id;

                if (tables.TryGetValue(id, out var table))
                {
                    snapshot.Tables[id] = Clone(table);
                }
            }

            return snapshot;
        }
    }

    public void ImportWorkspace(WorkspaceSnapshot snapshot)
    {
        lock (gate)
        {
            graph = Clone(snapshot.Graph ?? new FlowGraph());

            tables = snapshot.Tables?
                .ToDictionary(p => p.Key, p => Clone(p.Value))
                ?? new Dictionary<string, DecisionTable>();

            foreach (var node in graph.Nodes.Where(n => n.Type == "decision"))
            {
                node.TableId ??= node.Id;

                if (!tables.ContainsKey(node.TableId))
                {
                    tables[node.TableId] = BlankTable(
                        node.TableId,
                        node.Title);
                }
            }

            Write(tablesPath, tables);
            Write(graphPath, graph);
        }
    }


    public JsonObject BuildSampleInput(WorkspaceSnapshot snapshot)
    {
        var graph = snapshot.Graph ?? new FlowGraph();
        var tables = snapshot.Tables ?? new Dictionary<string, DecisionTable>();

        var decisionNode = graph.Nodes.FirstOrDefault(n => n.Type == "decision");

        if (decisionNode is null)
            return new JsonObject();

        var tableId = string.IsNullOrWhiteSpace(decisionNode.TableId)
            ? decisionNode.Id
            : decisionNode.TableId!;

        if (!tables.TryGetValue(tableId, out var table) ||
            table.Rules.Count == 0)
            return new JsonObject();

        var firstRule = table.Rules[0];
        var sample = new JsonObject();

        foreach (var column in table.Inputs)
        {
            var condition = firstRule.Inputs.GetValueOrDefault(column.Id, "*");
            var value = GetSampleValue(condition);

            // Wildcard conditions don't tell us what value to use.
            if (value is null)
                continue;

            SetSamplePath(sample, column.Source, value);
        }

        return sample;
    }

    private static JsonNode? GetSampleValue(string? condition)
    {
        var value = (condition ?? "*").Trim();

        if (value is "" or "*")
            return null;

        var op = new[] { ">=", "<=", "!=", ">", "<", "=" }
            .FirstOrDefault(candidate => value.StartsWith(candidate, StringComparison.Ordinal)) ?? "";

        if (op == "")
            return ParseSampleValue(value);

        var expected = value[op.Length..].Trim().Trim('"', '\'');

        if (decimal.TryParse(
            expected,
            NumberStyles.Any,
            CultureInfo.InvariantCulture,
            out var number))
        {
            var sampleNumber = op switch
            {
                ">" => number + 1,
                ">=" => number,
                "<" => number - 1,
                "<=" => number,
                "!=" => number + 1,
                "=" => number,
                _ => number
            };

            return JsonValue.Create(sampleNumber);
        }

        // For text conditions, use a value that satisfies the comparison.
        var sampleText = op switch
        {
            ">" or "!=" => expected + "z",
            "<" => expected.Length > 0 ? expected[..^1] : expected,
            _ => expected
        };

        return JsonValue.Create(sampleText);
    }

    private static JsonNode? ParseSampleValue(string value)
    {
        try
        {
            return JsonNode.Parse(value);
        }
        catch (JsonException)
        {
            return JsonValue.Create(value);
        }
    }

    private static void SetSamplePath(JsonObject root, string path, JsonNode value)
    {
        var parts = path.Split('.', StringSplitOptions.RemoveEmptyEntries);

        if (parts.Length == 0)
            return;

        var current = root;

        for (var i = 0; i < parts.Length - 1; i++)
        {
            if (current[parts[i]] is not JsonObject child)
            {
                child = new JsonObject();
                current[parts[i]] = child;
            }

            current = child;
        }

        current[parts[^1]] = value.DeepClone();
    }

}
