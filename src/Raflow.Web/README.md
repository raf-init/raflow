# Raflow MVC

A .NET 9 MVC visual rule editor with a node canvas and configurable decision tables.

## Run

```bash
dotnet restore
dotnet run
```

## Decision tables

- Flow and Test rule are permanent tabs.
- Clicking **Edit table** on a decision node opens a separate closable editor tab.
- Each decision node has its own table ID and independently saved schema.
- Add, edit, and remove input/output columns. Each column has a display label and a dotted source path such as `person.age` or `eligibility.limit`.
- Add rules; first matching rule wins.
- Conditions support `*`, exact text/numeric values, and `=`, `!=`, `>`, `>=`, `<`, `<=`.
- Test rule accepts JSON input and evaluates the selected decision table.
- Tables and graph are persisted to `App_Data/tables.json` and `App_Data/graph.json`.

The initial table retains a credit-card example to demonstrate the editor. Newly added decision nodes start with a small generic schema that can be changed or replaced.

## Evaluating a connected flow

The **Test rule** tab now calls `POST /api/evaluate-flow`. It starts at the Request node and follows saved graph connections. Every reachable Decision Table node runs in traversal order; its output is merged into the context before the next decision table runs. The response includes per-table `steps` and the final combined `output` object.

To use multiple tables in sequence, connect Request → first decision table → second decision table → Response, then click **Save changes** before testing. Column source paths in later tables can read values produced by earlier tables (for example, `eligibility.cardType`).
