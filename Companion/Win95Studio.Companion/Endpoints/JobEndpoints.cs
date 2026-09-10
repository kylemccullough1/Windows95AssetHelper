using System.Text.Json;
using Win95Studio.Models.Jobs;
using Win95Studio.Services.Jobs;

namespace Win95Studio.Companion.Endpoints;

/// <summary>
/// Starting a build and watching it.
///
/// Two endpoints and no streaming. A build reports four coarse steps over several minutes, so
/// there is nothing worth pushing; a POST that returns an id and a GET the studio polls once a
/// second has no reconnection semantics to get wrong and survives a page refresh.
/// </summary>
public static class JobEndpoints
{
    /// <summary>
    /// The JSON in the <c>spec</c> form field is written by the browser's <c>JSON.stringify</c>,
    /// so its property names are camelCase while the record's are Pascal. Reading the part by
    /// hand means saying so here rather than relying on whatever the host's default happens to
    /// be — this is one specific string, not the API's global serialisation.
    /// </summary>
    private static readonly JsonSerializerOptions SpecJson = new(JsonSerializerDefaults.Web);

    public static IEndpointRouteBuilder MapJobEndpoints(this IEndpointRouteBuilder routes)
    {
        var jobs = routes.MapGroup("/jobs");

        /*
         * Multipart rather than JSON, because half the body is bytes.
         *
         * The bundle is the same zip the download route produces: the two generated scripts plus
         * the PNG artwork they import. Base64 in a JSON field would inflate a 7 MB catalogue to
         * 9 MB of string and push it through a JSON parser on both ends, for no gain. Multipart
         * sends the bytes as bytes and the spec as a small field beside them.
         */
        jobs.MapPost("", async (
            HttpRequest http,
            IBuildJobService builds,
            CancellationToken cancellationToken) =>
        {
            if (!http.HasFormContentType)
            {
                return Results.Problem(
                    "Send multipart/form-data with a 'spec' field and a 'bundle' file.",
                    statusCode: StatusCodes.Status415UnsupportedMediaType);
            }

            var form = await http.ReadFormAsync(cancellationToken);
            var bundle = form.Files["bundle"];
            if (bundle is null || !form.TryGetValue("spec", out var raw))
            {
                return Results.Problem(
                    "Both a 'spec' field and a 'bundle' file are required.",
                    statusCode: StatusCodes.Status400BadRequest);
            }

            BuildRequest? spec;
            try
            {
                spec = JsonSerializer.Deserialize<BuildRequest>(raw.ToString(), SpecJson);
            }
            catch (JsonException e)
            {
                return Results.Problem(
                    $"The spec is not valid JSON: {e.Message}",
                    statusCode: StatusCodes.Status400BadRequest);
            }

            if (spec is null || string.IsNullOrWhiteSpace(spec.OutputPath))
            {
                return Results.Problem(
                    "The spec must name an output folder.",
                    statusCode: StatusCodes.Status400BadRequest);
            }

            try
            {
                await using var stream = bundle.OpenReadStream();
                var id = await builds.StartAsync(spec, stream, cancellationToken);
                return Results.Ok(new { id });
            }
            catch (Exception e) when (e is InvalidDataException or ArgumentException)
            {
                // A malformed or oversized bundle. Worth a 400 with the reason rather than a job
                // that appears and immediately dies, which is much harder to explain in the UI.
                return Results.Problem(e.Message, statusCode: StatusCodes.Status400BadRequest);
            }
        });

        jobs.MapGet("/{id}", (string id, IBuildJobService builds) =>
        {
            var status = builds.Status(id);
            // A 404 here means "this companion has restarted", since jobs live in memory. The
            // studio surfaces it as a failed export, which is the truth: whatever was running is
            // no longer being watched.
            return status is null
                ? Results.Problem($"No job {id}.", statusCode: StatusCodes.Status404NotFound)
                : Results.Ok(status);
        });

        return routes;
    }
}
