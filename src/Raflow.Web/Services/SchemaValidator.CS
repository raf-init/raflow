using System.Text.Json;
using Raflow.Web.Models;

namespace Raflow.Web.Services;

public sealed class SchemaValidator
{
    public List<string> Validate(JsonElement input, DataSchema schema)
    {
        var errors = new List<string>();

        ValidateFields(input, schema.Fields, "", errors);

        return errors;
    }

    private void ValidateFields(
        JsonElement data,
        List<SchemaField> fields,
        string parentPath,
        List<string> errors)
    {
        if (data.ValueKind != JsonValueKind.Object)
        {
            errors.Add(
                $"{FormatPath(parentPath)} must be an object."
            );

            return;
        }

        foreach (var field in fields)
        {
            var path = string.IsNullOrEmpty(parentPath)
                ? field.Name
                : $"{parentPath}.{field.Name}";

            if (!data.TryGetProperty(field.Name, out var value))
            {
                if (field.Required)
                    errors.Add($"Required field '{path}' is missing.");

                continue;
            }

            ValidateField(value, field, path, errors);
        }
    }

    private void ValidateField(
        JsonElement value,
        SchemaField field,
        string path,
        List<string> errors)
    {
        switch (field.Type)
        {
            case "String":
                if (value.ValueKind != JsonValueKind.String)
                    errors.Add($"Field '{path}' must be a string.");
                break;

            case "Number":
                if (value.ValueKind != JsonValueKind.Number)
                    errors.Add($"Field '{path}' must be a number.");
                break;

            case "Integer":
                if (value.ValueKind != JsonValueKind.Number ||
                    !value.TryGetInt64(out _))
                    errors.Add($"Field '{path}' must be an integer.");
                break;

            case "Boolean":
                if (value.ValueKind != JsonValueKind.True &&
                    value.ValueKind != JsonValueKind.False)
                    errors.Add($"Field '{path}' must be a boolean.");
                break;

            case "Object":
                if (value.ValueKind != JsonValueKind.Object)
                {
                    errors.Add($"Field '{path}' must be an object.");
                    break;
                }

                ValidateFields(
                    value,
                    field.Properties ?? [],
                    path,
                    errors
                );
                break;

            case "Array":
                if (value.ValueKind != JsonValueKind.Array)
                {
                    errors.Add($"Field '{path}' must be an array.");
                    break;
                }

                ValidateArray(value, field, path, errors);
                break;
        }
    }

    private void ValidateArray(
        JsonElement array,
        SchemaField field,
        string path,
        List<string> errors)
    {
        var itemType = field.ItemType ?? "String";
        var index = 0;

        foreach (var item in array.EnumerateArray())
        {
            var itemPath = $"{path}[{index}]";

            var itemField = new SchemaField
            {
                Name = itemPath,
                Type = itemType,
                Properties = field.Properties ?? []
            };

            ValidateField(item, itemField, itemPath, errors);

            index++;
        }
    }

    private string FormatPath(string path)
    {
        return string.IsNullOrEmpty(path) ? "Input" : path;
    }
}
