
using Microsoft.AspNetCore.Mvc;
using Raflow.Web.Models;
using Raflow.Web.Services;

namespace Raflow.Web.Controllers;

[ApiController]
[Route("api/workspace")]
public sealed class WorkspaceController(
    WorkflowStore workflows,
    RuleStore rules) : ControllerBase
{
    [HttpGet]
    public IActionResult List()
    {
        return Ok(workflows.ListWorkflows());
    }

    [HttpPost("folders")]
    public IActionResult CreateFolder(CreateFolderRequest request)
    {
        var id = workflows.CreateFolder(request.Name);
        return Ok(new { id });
    }

    [HttpPut("folders/{id}")]
    public IActionResult RenameFolder(
            string id,
            CreateFolderRequest request)
    {
        return workflows.RenameFolder(id, request.Name)
            ? Ok(new { renamed = true })
            : NotFound(new { error = "Folder not found." });
    }

    [HttpDelete("folders/{id}")]
    public IActionResult DeleteFolder(string id)
    {
        return workflows.DeleteFolder(id)
            ? Ok(new { deleted = true })
            : BadRequest(new
            {
                error = "Folder not found or it still contains workflows."
            });
    }

    [HttpPut("workflows/{id}")]
    public IActionResult RenameWorkflow(
        string id,
        CreateFolderRequest request)
    {
        return workflows.RenameWorkflow(id, request.Name)
            ? Ok(new { renamed = true })
            : NotFound(new { error = "Workflow not found." });
    }

    [HttpDelete("workflows/{id}")]
    public IActionResult DeleteWorkflow(string id)
    {
        return workflows.DeleteWorkflow(id)
            ? Ok(new { deleted = true })
            : NotFound(new { error = "Workflow not found." });
    }
    [HttpPost("workflows")]
    public IActionResult CreateWorkflow(CreateWorkflowRequest request)
    {
        try
        {
            var id = workflows.CreateWorkflow(
                request.FolderId,
                request.Name);

            // Every new workflow starts with its own empty workspace.
            var emptySnapshot = new WorkspaceSnapshot
            {
                Graph = new FlowGraph(),
                Tables = new Dictionary<string, DecisionTable>()
            };

            workflows.SaveVersion(
                id,
                emptySnapshot,
                "Initial empty workflow",
                activate: true);

            return Ok(new { id });
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("workflows/{id}/save")]
    public IActionResult Save(
        string id,
        SaveWorkflowRequest request)
    {
        try
        {
            workflows.SaveVersion(
                id,
                rules.ExportWorkspace(),
                request.ChangeDescription ?? "Saved changes");

            return Ok(new
            {
                saved = true,
                versions = workflows.Versions(id)
            });
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("workflows/{id}/load")]
    public IActionResult Load(string id)
    {
        var snapshot = workflows.LoadActive(id);

        if (snapshot is null)
        {
            return NotFound(new
            {
                error = "Workflow has no active version."
            });
        }

        rules.ImportWorkspace(snapshot);

        return Ok(new
        {
            loaded = true,
            graph = snapshot.Graph
        });
    }

    [HttpGet("workflows/{id}/versions")]
    public IActionResult Versions(string id)
    {
        return Ok(workflows.Versions(id));
    }

    [HttpPost("workflows/{id}/activate")]
    public IActionResult Activate(
        string id,
        ActivateVersionRequest request)
    {
        return workflows.Activate(id, request.VersionId)
            ? Ok(new { activated = true })
            : NotFound(new
            {
                error = "Version not found for this workflow."
            });
    }
}
