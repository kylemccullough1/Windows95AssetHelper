using Win95Studio.Models.Files;
using Win95Studio.Services.Files;

namespace Win95Studio.Companion.Endpoints;

/// <summary>
/// The filesystem behind the studio's Browse For Folder dialog.
///
/// The endpoints do no validating of their own: they hand the path to the service and translate
/// its exceptions into HTTP. Keeping the rules in the service is what lets the same "is this a
/// legal folder name" question be asked from somewhere that is not a web request.
/// </summary>
public static class FolderEndpoints
{
    public static IEndpointRouteBuilder MapFolderEndpoints(this IEndpointRouteBuilder routes)
    {
        var folders = routes.MapGroup("/folders");

        // No path = the top level (drives, Desktop, Documents), which is where the dialog opens
        // the first time.
        folders.MapGet("", (string? path, IFolderService service) => Run(() => service.List(path)));

        folders.MapPost("", (CreateFolderRequest request, IFolderService service) =>
            Run(() => service.Create(request.Parent, request.Name)));

        return routes;
    }

    /// <summary>
    /// Translate the service's two failure modes into the two statuses that mean something to
    /// the dialog: a folder that is gone (refresh from the top) and a name it will not accept
    /// (say so and let the user retype).
    /// </summary>
    private static IResult Run(Func<FolderListing> action)
    {
        try
        {
            return Results.Ok(action());
        }
        catch (DirectoryNotFoundException e)
        {
            return Results.Problem(e.Message, statusCode: StatusCodes.Status404NotFound);
        }
        catch (Exception e) when (e is ArgumentException or UnauthorizedAccessException or IOException)
        {
            return Results.Problem(e.Message, statusCode: StatusCodes.Status400BadRequest);
        }
    }
}
