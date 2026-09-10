using System.Reflection;
using Win95Studio.Models.Companion;
using Win95Studio.Services.AfterEffects;

namespace Win95Studio.Companion.Endpoints;

/// <summary>
/// The one endpoint the studio calls before anything else: is the companion here, and can it see
/// After Effects?
/// </summary>
public static class HealthEndpoints
{
    public static IEndpointRouteBuilder MapHealthEndpoints(this IEndpointRouteBuilder routes)
    {
        // Always 200 when the process is up, including when After Effects is missing. "Running
        // but cannot find After Effects" is a state the studio shows a specific message for, and
        // a non-200 would collapse it into "not installed" on the client, which is a different
        // and less fixable problem.
        routes.MapGet("/health", (IAfterEffectsLocator locator) => Results.Ok(
            new CompanionInfo(Version(), locator.Locate())));

        return routes;
    }

    private static string Version() =>
        Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "0.0.0";
}
