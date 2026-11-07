using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using System.Text.Json;
using Raflow.Web.Models;

namespace Raflow.Web.Services;

public sealed class WorkflowStore
{
    private readonly string connectionString;

    private readonly JsonSerializerOptions json =
        new(JsonSerializerDefaults.Web)
        {
            WriteIndented = false
        };

    public WorkflowStore(IWebHostEnvironment env, RuleStore rules)
    {
        var dir = Path.Combine(env.ContentRootPath, "App_Data");
        Directory.CreateDirectory(dir);

        var db = Path.Combine(dir, "ruleflow.db");

        connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = db,
            ForeignKeys = true
        }.ToString();

        Initialize();

        // Create a starter folder and workflow on first launch.
        if (!ListWorkflows().Any())
        {
            var folderId = CreateFolder("General");
            var workflowId = CreateWorkflow(
                folderId,
                "My first workflow");

            SaveVersion(
                workflowId,
                rules.ExportWorkspace(),
                "Initial version",
                "Initial import from the existing RuleFlow editor",
                activate: true);
        }
    }

    private SqliteConnection Open()
    {
        var connection = new SqliteConnection(connectionString);
        connection.Open();
        return connection;
    }

    private void Initialize()
    {
        using var connection = Open();
        using var command = connection.CreateCommand();

        command.CommandText = """
            PRAGMA journal_mode=WAL;

            CREATE TABLE IF NOT EXISTS Folders (
                Id TEXT PRIMARY KEY,
                UserId TEXT NOT NULL,
                Name TEXT NOT NULL,
                CreatedAt TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS Workflows (
                Id TEXT PRIMARY KEY,
                UserId TEXT NOT NULL,
                FolderId TEXT NOT NULL REFERENCES Folders(Id),
                Name TEXT NOT NULL,
                ActiveVersionId INTEGER NULL,
                CreatedAt TEXT NOT NULL,
                UpdatedAt TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS WorkflowVersions (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                WorkflowId TEXT NOT NULL REFERENCES Workflows(Id)
                    ON DELETE CASCADE,
                VersionNumber INTEGER NOT NULL,
                SnapshotJson TEXT NOT NULL,
                CreatedBy TEXT NOT NULL,
                CreatedAt TEXT NOT NULL,
                Title TEXT NOT NULL DEFAULT '',
                ChangeDescription TEXT NOT NULL,
                IsActive INTEGER NOT NULL DEFAULT 0,
                UNIQUE(WorkflowId, VersionNumber)
            );

            CREATE INDEX IF NOT EXISTS
                IX_WorkflowVersions_Workflow
            ON WorkflowVersions(WorkflowId, VersionNumber DESC);
            """;

        command.ExecuteNonQuery();

        using var columnCheck = connection.CreateCommand();
        columnCheck.CommandText = "PRAGMA table_info(WorkflowVersions);";

        var titleExists = false;

        using (var reader = columnCheck.ExecuteReader())
        {
            while (reader.Read())
            {
                if (reader.GetString(1) == "Title")
                {
                    titleExists = true;
                    break;
                }
            }
        }

        if (!titleExists)
        {
            using var alter = connection.CreateCommand();
            alter.CommandText = """
        ALTER TABLE WorkflowVersions
        ADD COLUMN Title TEXT NOT NULL DEFAULT '';
        """;

            alter.ExecuteNonQuery();
        }
    }


    public bool RenameFolder(string folderId, string name)
    {
        using var connection = Open();
        using var command = connection.CreateCommand();

        command.CommandText = """
            UPDATE Folders
            SET Name = $name
            WHERE Id = $id AND UserId = 'dev'
            """;

        command.Parameters.AddWithValue("$id", folderId);
        command.Parameters.AddWithValue("$name", Clean(name, "New folder"));

        return command.ExecuteNonQuery() > 0;
    }

    public bool DeleteFolder(string folderId)
    {
        using var connection = Open();
        using var command = connection.CreateCommand();

        command.CommandText = """
            DELETE FROM Folders
            WHERE Id = $id
            AND UserId = 'dev'
            AND NOT EXISTS (
                SELECT 1 FROM Workflows WHERE FolderId = $id
            )
            """;

        command.Parameters.AddWithValue("$id", folderId);

        return command.ExecuteNonQuery() > 0;
    }

    public bool RenameWorkflow(string workflowId, string name)
    {
        using var connection = Open();
        using var command = connection.CreateCommand();

        command.CommandText = """
            UPDATE Workflows
            SET Name = $name,
                UpdatedAt = $now
            WHERE Id = $id AND UserId = 'dev'
            """;

        command.Parameters.AddWithValue("$id", workflowId);
        command.Parameters.AddWithValue("$name", Clean(name, "New workflow"));
        command.Parameters.AddWithValue(
            "$now",
            DateTimeOffset.UtcNow.ToString("O"));

        return command.ExecuteNonQuery() > 0;
    }

    public bool DeleteWorkflow(string workflowId)
    {
        using var connection = Open();
        using var transaction = connection.BeginTransaction();

        using var command = connection.CreateCommand();
        command.Transaction = transaction;

        command.CommandText = """
            DELETE FROM Workflows
            WHERE Id = $id AND UserId = 'dev'
            """;

        command.Parameters.AddWithValue("$id", workflowId);

        var deleted = command.ExecuteNonQuery() > 0;

        transaction.Commit();

        return deleted;
    }

    public string CreateFolder(string name)
    {
        var id = Guid.NewGuid().ToString("N");

        using var connection = Open();
        using var command = connection.CreateCommand();

        command.CommandText = """
            INSERT INTO Folders
                (Id, UserId, Name, CreatedAt)
            VALUES
                ($id, 'dev', $name, $now)
            """;

        command.Parameters.AddWithValue("$id", id);
        command.Parameters.AddWithValue("$name", Clean(name, "New folder"));
        command.Parameters.AddWithValue(
            "$now",
            DateTimeOffset.UtcNow.ToString("O"));

        command.ExecuteNonQuery();

        return id;
    }

    public string CreateWorkflow(string folderId, string name)
    {
        var id = Guid.NewGuid().ToString("N");
        var now = DateTimeOffset.UtcNow.ToString("O");

        using var connection = Open();
        using var command = connection.CreateCommand();

        command.CommandText = """
            INSERT INTO Workflows
                (Id, UserId, FolderId, Name, CreatedAt, UpdatedAt)
            VALUES
                ($id, 'dev', $folder, $name, $now, $now)
            """;

        command.Parameters.AddWithValue("$id", id);
        command.Parameters.AddWithValue("$folder", folderId);
        command.Parameters.AddWithValue("$name", Clean(name, "New workflow"));
        command.Parameters.AddWithValue("$now", now);

        command.ExecuteNonQuery();

        return id;
    }

    public List<object> ListWorkflows()
    {
        using var connection = Open();
        using var command = connection.CreateCommand();

        command.CommandText = """
            SELECT
                f.Id,
                f.Name,
                w.Id,
                w.Name,
                w.ActiveVersionId,
                w.UpdatedAt,
                (
                    SELECT MAX(VersionNumber)
                    FROM WorkflowVersions v
                    WHERE v.WorkflowId = w.Id
                )
            FROM Folders f
            LEFT JOIN Workflows w ON w.FolderId = f.Id
            WHERE f.UserId = 'dev'
            ORDER BY f.CreatedAt, w.CreatedAt
            """;

        using var reader = command.ExecuteReader();

        var rows = new List<object>();

        while (reader.Read())
        {
            rows.Add(new
            {
                folderId = reader.GetString(0),
                folderName = reader.GetString(1),

                workflowId = reader.IsDBNull(2)
                    ? null
                    : reader.GetString(2),

                workflowName = reader.IsDBNull(3)
                    ? null
                    : reader.GetString(3),

                activeVersionId = reader.IsDBNull(4)
                    ? (long?)null
                    : reader.GetInt64(4),

                updatedAt = reader.IsDBNull(5)
                    ? null
                    : reader.GetString(5),

                latestVersion = reader.IsDBNull(6)
                    ? (long?)null
                    : reader.GetInt64(6)
            });
        }

        return rows;
    }

    public void SaveVersion(
        string workflowId,
        WorkspaceSnapshot snapshot,
        string? title,
        string? description,
        bool activate = false)
    {
        using var connection = Open();
        using var transaction = connection.BeginTransaction();

        using var check = connection.CreateCommand();
        check.Transaction = transaction;

        check.CommandText = """
            SELECT COALESCE(MAX(VersionNumber), 0) + 1
            FROM WorkflowVersions
            WHERE WorkflowId = $id
            """;

        check.Parameters.AddWithValue("$id", workflowId);

        var version = Convert.ToInt32(check.ExecuteScalar());

        using var command = connection.CreateCommand();
        command.Transaction = transaction;

        command.CommandText = """
            INSERT INTO WorkflowVersions
            (WorkflowId, VersionNumber, SnapshotJson,
            CreatedBy, CreatedAt, Title, ChangeDescription, IsActive)
            VALUES
            ($workflow, $version, $snapshot,
            'dev', $now, $title, $description, 0);

            SELECT last_insert_rowid();
            """;

        command.Parameters.AddWithValue("$workflow", workflowId);
        command.Parameters.AddWithValue("$version", version);
        command.Parameters.AddWithValue(
            "$snapshot",
            JsonSerializer.Serialize(snapshot, json));
        command.Parameters.AddWithValue(
            "$now",
            DateTimeOffset.UtcNow.ToString("O"));
        command.Parameters.AddWithValue(
            "$title",
        Clean(title, $"Version {version}"));
        command.Parameters.AddWithValue(
            "$description",
            Clean(description, "Saved changes"));

        var versionId = Convert.ToInt64(command.ExecuteScalar());

        if (activate)
        {
            SetActive(connection, transaction, workflowId, versionId);
        }

        using var update = connection.CreateCommand();
        update.Transaction = transaction;

        update.CommandText = """
            UPDATE Workflows
            SET UpdatedAt = $now
            WHERE Id = $id
            """;

        update.Parameters.AddWithValue(
            "$now",
            DateTimeOffset.UtcNow.ToString("O"));
        update.Parameters.AddWithValue("$id", workflowId);

        update.ExecuteNonQuery();

        transaction.Commit();
    }

    public WorkspaceSnapshot? LoadActive(string workflowId)
    {
        using var connection = Open();
        using var command = connection.CreateCommand();

        command.CommandText = """
            SELECT v.SnapshotJson
            FROM Workflows w
            JOIN WorkflowVersions v
                ON v.Id = w.ActiveVersionId
            WHERE w.Id = $id
            """;

        command.Parameters.AddWithValue("$id", workflowId);

        var value = command.ExecuteScalar() as string;

        if (value is null)
            return null;

        return JsonSerializer.Deserialize<WorkspaceSnapshot>(
            value,
            json);
    }

    public object Versions(string workflowId)
    {
        using var connection = Open();
        using var command = connection.CreateCommand();

        command.CommandText = """
            SELECT
            Id,
            VersionNumber,
            CreatedBy,
            CreatedAt,
            Title,
            ChangeDescription,
            IsActive
            FROM WorkflowVersions
            WHERE WorkflowId = $id
            ORDER BY VersionNumber DESC
            """;

        command.Parameters.AddWithValue("$id", workflowId);

        using var reader = command.ExecuteReader();

        var versions = new List<object>();

        while (reader.Read())
        {
            versions.Add(new
            {
                id = reader.GetInt64(0),
                versionNumber = reader.GetInt32(1),
                createdBy = reader.GetString(2),
                createdAt = reader.GetString(3),
                title = reader.GetString(4),
                changeDescription = reader.GetString(5),
                isActive = reader.GetInt32(6) == 1
            });
        }

        return versions;
    }

    public bool Activate(string workflowId, long versionId)
    {
        using var connection = Open();
        using var transaction = connection.BeginTransaction();

        using var check = connection.CreateCommand();
        check.Transaction = transaction;

        check.CommandText = """
            SELECT COUNT(*)
            FROM WorkflowVersions
            WHERE Id = $version
              AND WorkflowId = $workflow
            """;

        check.Parameters.AddWithValue("$version", versionId);
        check.Parameters.AddWithValue("$workflow", workflowId);

        if (Convert.ToInt32(check.ExecuteScalar()) == 0)
        {
            transaction.Rollback();
            return false;
        }

        SetActive(connection, transaction, workflowId, versionId);

        transaction.Commit();

        return true;
    }

    private static void SetActive(
        SqliteConnection connection,
        SqliteTransaction transaction,
        string workflowId,
        long versionId)
    {
        using var clear = connection.CreateCommand();
        clear.Transaction = transaction;

        clear.CommandText = """
            UPDATE WorkflowVersions
            SET IsActive = 0
            WHERE WorkflowId = $workflow
            """;

        clear.Parameters.AddWithValue("$workflow", workflowId);
        clear.ExecuteNonQuery();

        using var set = connection.CreateCommand();
        set.Transaction = transaction;

        set.CommandText = """
            UPDATE WorkflowVersions
            SET IsActive = 1
            WHERE Id = $version;

            UPDATE Workflows
            SET ActiveVersionId = $version
            WHERE Id = $workflow;
            """;

        set.Parameters.AddWithValue("$version", versionId);
        set.Parameters.AddWithValue("$workflow", workflowId);

        set.ExecuteNonQuery();
    }

    private static string Clean(string? value, string fallback)
    {
        if (string.IsNullOrWhiteSpace(value))
            return fallback;

        value = value.Trim();

        return value[..Math.Min(value.Length, 120)];
    }
}
