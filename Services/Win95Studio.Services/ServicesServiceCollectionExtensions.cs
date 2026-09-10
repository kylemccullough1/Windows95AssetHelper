using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Win95Studio.Services.AfterEffects;
using Win95Studio.Services.Files;
using Win95Studio.Services.Jobs;

namespace Win95Studio.Services;

/// <summary>
/// This project's composition root. One call from the host; every service registered here, so
/// adding a service is a one-line change in this file rather than a change to Program.cs.
/// </summary>
public static class ServicesServiceCollectionExtensions
{
    public static IServiceCollection AddCompanionServices(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.Configure<CompanionOptions>(configuration.GetSection("Companion"));

        // Singletons, all three, for reasons that are not "it is cheaper".
        //
        // The locator caches the After Effects it found, and re-running a directory search per
        // request would be pointless work over a path that cannot change while the process runs.
        // The job service *is* the job list: scoping it would mean every poll asking a different
        // instance about a job it has never heard of. The runner is stateless and follows them.
        services.AddSingleton<IAfterEffectsLocator, AfterEffectsLocator>();
        services.AddSingleton<IAfterEffectsRunner, AfterEffectsRunner>();
        services.AddSingleton<IBuildJobService, BuildJobService>();

        // The folder service holds nothing, so scoped is fine and keeps the default shape.
        services.AddScoped<IFolderService, FolderService>();

        return services;
    }
}
