using System.Collections.Concurrent;
using System.IO.Compression;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Win95Studio.Models.Jobs;
using Win95Studio.Services.AfterEffects;

namespace Win95Studio.Services.Jobs;

/// <summary>Accepts bundles and turns them into After Effects projects.</summary>
public interface IBuildJobService
{
    /// <summary>
    /// Unpack a bundle and start building. Returns as soon as the job is queued: a build is
    /// minutes long, so the HTTP request that starts it must not be the one that waits for it.
    /// </summary>
    Task<string> StartAsync(BuildRequest request, Stream bundle, CancellationToken cancellationToken);

    /// <summary>The job's current state, or null if the id is unknown.</summary>
    JobStatus? Status(string id);
}

/// <summary>
/// Runs a build: unpack, package, scene, done.
///
/// <para>
/// <b>Why the work is not on the request thread.</b> A full-catalogue package is about three
/// minutes in After Effects. Holding an HTTP request open for that means fighting every idle
/// timeout between the browser and here for no benefit, so the request queues the job and the
/// studio polls. It also means a browser refresh mid-build loses the progress bar, not the build.
/// </para>
///
/// <para>
/// <b>Why in memory.</b> Job history has no value once the companion stops: the artefact is a
/// file on disk that either exists or does not, and re-running is cheap. A dictionary that dies
/// with the process is the honest storage for that, and it is one fewer thing to install.
/// </para>
///
/// <para>
/// <b>The two steps are not interchangeable.</b> The package must exist before the scene runs,
/// because the scene script imports it by path and gives up if it is not there. That ordering is
/// the whole two-stage design — assets are built once and referenced, never copied into a scene —
/// so the job runs them in sequence and stops at the first failure rather than pressing on.
/// </para>
/// </summary>
public sealed class BuildJobService : IBuildJobService
{
    private readonly IAfterEffectsRunner _runner;
    private readonly CompanionOptions _options;
    private readonly ILogger<BuildJobService> _logger;
    private readonly ConcurrentDictionary<string, JobStatus> _jobs = new();

    public BuildJobService(
        IAfterEffectsRunner runner,
        IOptions<CompanionOptions> options,
        ILogger<BuildJobService> logger)
    {
        _runner = runner;
        _options = options.Value;
        _logger = logger;
    }

    public JobStatus? Status(string id) => _jobs.GetValueOrDefault(id);

    public async Task<string> StartAsync(
        BuildRequest request,
        Stream bundle,
        CancellationToken cancellationToken)
    {
        var id = Guid.NewGuid().ToString("n")[..12];
        var staging = Path.Combine(StagingRoot(), id);
        Directory.CreateDirectory(staging);

        // Unpacking happens on the request, not the background task, so a corrupt or oversized
        // bundle fails as a 400 with a message rather than as a job that mysteriously died.
        var log = new List<string>();
        await ExtractAsync(bundle, staging, log, cancellationToken);

        _jobs[id] = new JobStatus(id, JobState.Queued, "Queued", 0, null, log, null);

        // Deliberately not awaited, and deliberately not tied to the request's CancellationToken:
        // the build must outlive the HTTP call that asked for it. Failures land in the job's own
        // status, which is what the studio is polling.
        _ = Task.Run(() => RunAsync(id, request, staging), CancellationToken.None);

        return id;
    }

    private async Task RunAsync(string id, BuildRequest request, string staging)
    {
        var log = new List<string>(_jobs[id].Log);

        void Report(JobState state, string step, int percent, string? projectPath = null, string? error = null) =>
            _jobs[id] = new JobStatus(id, state, step, percent, projectPath, [.. log], error);

        try
        {
            Directory.CreateDirectory(request.OutputPath);

            // Stage one: the asset package. Its own script knows where to put it; the companion
            // only needs to know which file proves it worked.
            Report(JobState.Running, "Building the asset package in After Effects", 15);
            var packageAep = Path.Combine(request.OutputPath, "Win95Assets", "Win95Assets.aep");
            var package = await _runner.RunAsync(
                Path.Combine(staging, request.PackageScriptName), packageAep, CancellationToken.None);
            log.AddRange(package.Log);

            if (!package.Succeeded)
            {
                Report(JobState.Failed, "The asset package failed", 100, error: package.Error);
                return;
            }

            // Stage two: the scene, which imports the package that now exists.
            Report(JobState.Running, "Building the scene in After Effects", 60);
            var projectPath = Path.Combine(request.OutputPath, request.ProjectFileName);
            var scene = await _runner.RunAsync(
                Path.Combine(staging, request.SceneScriptName), projectPath, CancellationToken.None);
            log.AddRange(scene.Log);

            if (!scene.Succeeded)
            {
                Report(JobState.Failed, "The scene failed", 100, error: scene.Error);
                return;
            }

            // After Effects writes its own log beside the output. Folding it in means the studio
            // shows what the script actually did, not just what the companion saw from outside.
            Report(JobState.Running, "Reading the After Effects log", 95);
            foreach (var name in new[] { "win95-package-log.txt", "win95-scene-log.txt" })
            {
                AppendIfPresent(log, Path.Combine(request.OutputPath, name));
            }

            Report(JobState.Succeeded, "Done", 100, ToWebPath(projectPath));
            _logger.LogInformation("Job {Id} built {Project}", id, projectPath);
        }
        catch (Exception e)
        {
            _logger.LogError(e, "Job {Id} failed", id);
            log.Add(e.ToString());
            Report(JobState.Failed, "Failed", 100, error: e.Message);
        }
        finally
        {
            TryDeleteDirectory(staging);
        }
    }

    /// <summary>
    /// Unpack the bundle into the staging folder.
    ///
    /// <para>
    /// Entry names are checked against the staging root before anything is written. A zip entry
    /// name is attacker-controlled data — <c>..\..\Windows\System32\…</c> is a legal one — and
    /// <c>ExtractToDirectory</c> on the whole archive would be a shorter way to write this that
    /// hands a local web server the ability to write anywhere the user can. This companion only
    /// ever receives bundles from the studio, but "the only client is trustworthy" is not a
    /// property of the server, and it is one <c>StartsWith</c>.
    /// </para>
    /// </summary>
    private async Task ExtractAsync(
        Stream bundle,
        string staging,
        List<string> log,
        CancellationToken cancellationToken)
    {
        var root = Path.GetFullPath(staging) + Path.DirectorySeparatorChar;
        var limit = (long)_options.MaxBundleMegabytes * 1024 * 1024;
        long written = 0;

        using var archive = new ZipArchive(bundle, ZipArchiveMode.Read, leaveOpen: true);
        foreach (var entry in archive.Entries)
        {
            // A directory entry: nothing to write, and CreateDirectory below covers it anyway.
            if (entry.Name.Length == 0)
            {
                continue;
            }

            var target = Path.GetFullPath(Path.Combine(staging, entry.FullName));
            if (!target.StartsWith(root, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidDataException($"Bundle entry '{entry.FullName}' escapes the staging folder.");
            }

            written += entry.Length;
            if (written > limit)
            {
                throw new InvalidDataException($"Bundle is larger than the {_options.MaxBundleMegabytes} MB limit.");
            }

            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            await using var source = entry.Open();
            await using var destination = File.Create(target);
            await source.CopyToAsync(destination, cancellationToken);
        }

        log.Add($"unpacked {archive.Entries.Count} files into {ToWebPath(staging)}");
    }

    private string StagingRoot()
    {
        if (!string.IsNullOrWhiteSpace(_options.StagingPath))
        {
            return _options.StagingPath;
        }

        return Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Win95AssetStudio",
            "jobs");
    }

    private static void AppendIfPresent(List<string> log, string path)
    {
        if (!File.Exists(path))
        {
            return;
        }

        try
        {
            log.Add($"--- {Path.GetFileName(path)} ---");
            log.AddRange(File.ReadAllLines(path));
        }
        catch (IOException e)
        {
            log.Add($"could not read {path}: {e.Message}");
        }
    }

    /// <summary>
    /// Clean up the staging copy of the artwork. Best effort: the finished project no longer
    /// references it (the package script copied what it needed next to the .aep), so failing to
    /// delete it wastes disk rather than breaking anything.
    /// </summary>
    private void TryDeleteDirectory(string path)
    {
        try
        {
            Directory.Delete(path, recursive: true);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            _logger.LogWarning(e, "Could not clean up staging folder {Path}", path);
        }
    }

    private static string ToWebPath(string path) => path.Replace('\\', '/');
}
