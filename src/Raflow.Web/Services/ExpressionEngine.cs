
using System.Globalization;
using System.Text.Json.Nodes;

namespace Raflow.Web.Services;

public sealed class ExpressionEngine
{
    public decimal Evaluate(
    string formula,
    JsonObject context,
    JsonObject? constants = null)
    {
        if (string.IsNullOrWhiteSpace(formula))
            throw new ArgumentException("Formula cannot be empty.");

        var parser = new Parser(formula, context, constants ?? new JsonObject());
        return parser.Parse();
    }

    private sealed class Parser(
        string formula,
        JsonObject context,
        JsonObject constants)
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

                "SUM" when arguments.Count > 0 =>
                    arguments.Sum(),

                "MIN" when arguments.Count > 0 =>
                    arguments.Min(),

                "MAX" when arguments.Count > 0 =>
                    arguments.Max(),

                "AVERAGE" when arguments.Count > 0 =>
                    arguments.Average(),

                "POWER" when arguments.Count == 2 =>
                    Power(arguments[0], arguments[1]),

                "SQRT" when arguments.Count == 1 && arguments[0] >= 0 =>
                    (decimal)Math.Sqrt((double)arguments[0]),

                "MOD" when arguments.Count == 2 && arguments[1] != 0 =>
                    arguments[0] % arguments[1],

                "CEILING" when arguments.Count == 2 && arguments[1] > 0 =>
                    decimal.Ceiling(arguments[0] / arguments[1]) * arguments[1],

                "FLOOR" when arguments.Count == 2 && arguments[1] > 0 =>
                    decimal.Floor(arguments[0] / arguments[1]) * arguments[1],

                _ => throw Error($"Unknown function or invalid arguments: {name}")
            };
        }

        private decimal Power(decimal number, decimal exponent)
        {
            var result = Math.Pow((double)number, (double)exponent);

            if (!double.IsFinite(result) ||
                result > (double)decimal.MaxValue ||
                result < (double)decimal.MinValue)
                throw Error("POWER result is outside the supported range.");

            return (decimal)result;
        }

        private decimal ResolveVariable(string path)
        {
            // First check runtime workflow context.
            if (TryResolveNumber(context, path, out var value))
                return value;

            // Then check workflow constants.
            if (TryResolveNumber(constants, path, out value))
                return value;

            throw Error($"Unknown variable or constant: {path}");
        }

        private bool TryResolveNumber(
            JsonObject source,
            string path,
            out decimal value)
        {
            JsonNode? current = source;

            foreach (var segment in path.Split('.'))
            {
                if (current is not JsonObject obj ||
                    !obj.TryGetPropertyValue(segment, out current))
                {
                    value = 0;
                    return false;
                }
            }

            if (current is not null && decimal.TryParse(
        current.ToString(),
        NumberStyles.Number,
        CultureInfo.InvariantCulture,
        out value))
            {
                return true;
            }

            value = 0;
            return false;
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
