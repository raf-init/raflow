
using System.Globalization;
using System.Text.Json.Nodes;

namespace Raflow.Web.Services;

public sealed class ExpressionEngine
{
    public decimal Evaluate(string formula, JsonObject context)
    {
        if (string.IsNullOrWhiteSpace(formula))
            throw new ArgumentException("Formula cannot be empty.");

        var parser = new Parser(formula, context);
        return parser.Parse();
    }

    private sealed class Parser(string formula, JsonObject context)
    {
        private int position;

        public decimal Parse()
        {
            var result = ParseExpression();
            SkipWhitespace();

            if (position < formula.Length)
                throw Error("Unexpected character.");

            return result;
        }

        private decimal ParseExpression()
        {
            var result = ParseTerm();

            while (true)
            {
                SkipWhitespace();

                if (Match('+'))
                    result += ParseTerm();
                else if (Match('-'))
                    result -= ParseTerm();
                else
                    return result;
            }
        }

        private decimal ParseTerm()
        {
            var result = ParseFactor();

            while (true)
            {
                SkipWhitespace();

                if (Match('*'))
                    result *= ParseFactor();
                else if (Match('/'))
                {
                    var divisor = ParseFactor();

                    if (divisor == 0)
                        throw Error("Division by zero.");

                    result /= divisor;
                }
                else
                    return result;
            }
        }

        private decimal ParseFactor()
        {
            SkipWhitespace();

            if (Match('-'))
                return -ParseFactor();

            if (Match('+'))
                return ParseFactor();

            if (Match('('))
            {
                var result = ParseExpression();

                SkipWhitespace();

                if (!Match(')'))
                    throw Error("Missing closing parenthesis.");

                return result;
            }

            if (position < formula.Length &&
                (char.IsDigit(formula[position]) || formula[position] == '.'))
            {
                var start = position;

                while (position < formula.Length &&
                       (char.IsDigit(formula[position]) || formula[position] == '.'))
                    position++;

                var numberText = formula[start..position];

                if (decimal.TryParse(
                    numberText,
                    NumberStyles.Number,
                    CultureInfo.InvariantCulture,
                    out var number))
                    return number;

                throw Error("Invalid number.");
            }

            return ParseIdentifier();
        }


        private decimal ParseIdentifier()
        {
            SkipWhitespace();

            var start = position;

            while (position < formula.Length &&
                   (char.IsLetterOrDigit(formula[position]) ||
                    formula[position] == '_' ||
                    formula[position] == '.'))
                position++;

            if (start == position)
                throw Error("Expected a number, variable or function.");

            var name = formula[start..position];

            SkipWhitespace();

            if (Match('('))
                return ParseFunction(name);

            return ResolveVariable(name);
        }

        private decimal ParseFunction(string name)
        {
            var arguments = new List<decimal>();

            SkipWhitespace();

            if (!Match(')'))
            {
                do
                {
                    arguments.Add(ParseExpression());

                    SkipWhitespace();
                }
                while (Match(','));

                if (!Match(')'))
                    throw Error("Missing closing parenthesis.");
            }

            return name.ToUpperInvariant() switch
            {
                "ABS" when arguments.Count == 1 =>
                    Math.Abs(arguments[0]),

                "ROUND" when arguments.Count == 2 =>
                    Math.Round(
                        arguments[0],
                        decimal.ToInt32(arguments[1]),
                        MidpointRounding.AwayFromZero),

                "SUM" =>
                    arguments.Sum(),

                "MIN" when arguments.Count > 0 =>
                    arguments.Min(),

                "MAX" when arguments.Count > 0 =>
                    arguments.Max(),

                "AVERAGE" when arguments.Count > 0 =>
                    arguments.Average(),

                _ => throw Error($"Unknown function or invalid arguments: {name}")
            };
        }

        private decimal ResolveVariable(string path)
        {
            JsonNode? current = context;

            foreach (var segment in path.Split('.'))
            {
                if (current is not JsonObject obj ||
                    !obj.TryGetPropertyValue(segment, out current))
                    throw Error($"Unknown variable: {path}");
            }

            if (current is null ||
                !decimal.TryParse(
                    current.ToString(),
                    NumberStyles.Number,
                    CultureInfo.InvariantCulture,
                    out var value))
                throw Error($"Variable is not numeric: {path}");

            return value;
        }



        private void SkipWhitespace()
        {
            while (position < formula.Length &&
                   char.IsWhiteSpace(formula[position]))
                position++;
        }

        private bool Match(char expected)
        {
            if (position >= formula.Length ||
                formula[position] != expected)
                return false;

            position++;
            return true;
        }

        private Exception Error(string message) =>
            new FormatException($"{message} Position: {position}.");
    }
}
