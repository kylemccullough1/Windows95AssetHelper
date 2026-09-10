using System.Diagnostics;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Win95Studio.Services.AfterEffects;

/// <summary>What one script run produced.</summary>
/// <param name="Succeeded">True when the expected artefact exists and the process did not fail.</param>
/// <param name="Log">Everything worth showing the user: our own lines plus the process's output.</param>
public sealed record ScriptRun(bool Succeeded, IReadOnlyList<string> Log, string? Error);

/// <summary>Runs one generated ExtendScript file in After Effects and waits for its output.</summary>
public interface IAfterEffectsRunner
{
    /// <param name="scriptPath">The <c>.jsx</c> to run. Must already be unattended — see the note below.</param>
    /// <param name="expectedArtifact">
    /// A file the script is supposed to produce. Its appearance, not the process exiting, is what
    /// counts as success.
    /// </param>
    Task<ScriptRun> RunAsync(string scriptPath, string expectedArtifact, CancellationToken cancellationToken);
}

/// <summary>
/// Drives After Effects through <c>AfterFX.com -r</c>.
///
/// <para>
/// <b>The script must be unattended.</b> Nothing here can dismiss a dialog. The generator has an
/// explicit mode for this — pass <c>outputPath</c> / <c>projectPath</c> and it stops calling
/// <c>Folder.selectDialog</c> and <c>alert</c> and writes a log file instead — and the studio
/// always uses it on this route. A script that opens a modal here does not fail, it hangs until
/// <see cref="CompanionOptions.ScriptTimeoutSeconds"/>.
/// </para>
///
/// <para>
/// <b>Why success is a file and not an exit code.</b> <c>AfterFX.com</c> is a thin stub in front
/// of a long-running GUI application. Depending on version and on whether After Effects was
/// already open, it may block until the script finishes, or hand the script over to a running
/// instance and exit 0 immediately — and it exits 0 in both cases, including when the script
/// threw. So the process exit is treated as a hint, and the artefact the script was asked to
/// write is the actual test. Waiting for the file to stop growing before declaring victory is
/// what stops a half-written <c>.aep</c> being handed back as finished.
/// </para>
/// </summary>
public sealed class AfterEffectsRunner : IAfterEffectsRunner
{
    /// <summary>How often to look for the artefact once the process is out of the way.</summary>
    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(1);

    /// <summary>
    /// Consecutive polls at an unchanged size before a file counts as finished. Two is enough:
    /// After Effects writes an <c>.aep</c> in one pass, and the poll interval is a second.
    /// </summary>
    private const int StableChecks = 2;

    private readonly IAfterEffectsLocator _locator;
    private readonly CompanionOptions _options;
    private readonly ILogger<AfterEffectsRunner> _logger;

    public AfterEffectsRunner(
        IAfterEffectsLocator locator,
        IOptions<CompanionOptions> options,
        ILogger<AfterEffectsRunner> logger)
    {
        _locator = locator;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<ScriptRun> RunAsync(
        string scriptPath,
        string expectedArtifact,
        CancellationToken cancellationToken)
    {
        var log = new List<string>();
        var install = _locator.Locate();
        if (!install.Found || install.Path is null)
        {
            return new ScriptRun(false, log, "After Effects was not found on this machine.");
        }

        // A stale artefact from a previous run would make this one look instantly successful.
        TryDelete(expectedArtifact, log);

        var start = new ProcessStartInfo
        {
            FileName = install.Path,
            // Separate arguments rather than one string: ArgumentList quotes each one properly,
            // and every path here contains spaces ("Program Files", "Adobe After Effects").
            ArgumentList = { "-r", scriptPath },
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };

        log.Add($"> {Path.GetFileName(install.Path)} -r {Path.GetFileName(scriptPath)}");
        _logger.LogInformation("Running {Script} in {Install}", scriptPath, install.Version);

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(_options.ScriptTimeoutSeconds));

        try
        {
            using var process = Process.Start(start)
                ?? throw new InvalidOperationException($"Could not start {install.Path}.");

            // Read both streams before waiting. A process whose output fills the pipe buffer
            // blocks writing to it, and then waiting for exit never returns.
            var stdout = process.StandardOutput.ReadToEndAsync(timeout.Token);
            var stderr = process.StandardError.ReadToEndAsync(timeout.Token);
            await process.WaitForExitAsync(timeout.Token);

            AddLines(log, await stdout);
            AddLines(log, await stderr);
            log.Add($"AfterFX exited with code {process.ExitCode}");
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            // The process itself timed out. The artefact wait below still gets its chance: After
            // Effects may well be finishing the script with the stub already gone.
            log.Add($"AfterFX did not exit within {_options.ScriptTimeoutSeconds}s; still waiting for output.");
        }

        var appeared = await WaitForArtifactAsync(expectedArtifact, log, timeout.Token, cancellationToken);
        if (!appeared)
        {
            return new ScriptRun(
                false,
                log,
                $"After Effects did not produce {Path.GetFileName(expectedArtifact)}. " +
                "Its own log is above; the usual cause is a script that stopped on a dialog.");
        }

        log.Add($"produced {expectedArtifact}");
        return new ScriptRun(true, log, null);
    }

    /// <summary>
    /// Wait until the artefact exists and has stopped changing size.
    /// </summary>
    private static async Task<bool> WaitForArtifactAsync(
        string path,
        List<string> log,
        CancellationToken timeout,
        CancellationToken cancellationToken)
    {
        long lastSize = -1;
        var stable = 0;

        while (!timeout.IsCancellationRequested)
        {
            var info = new FileInfo(path);
            if (info.Exists && info.Length > 0)
            {
                if (info.Length == lastSize)
                {
                    if (++stable >= StableChecks)
                    {
                        return true;
                    }
                }
                else
                {
                    stable = 0;
                    lastSize = info.Length;
                }
            }

            try
            {
                await Task.Delay(PollInterval, timeout);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }

        // Distinguish "the user cancelled" from "we gave up", because only one of them is a bug.
        log.Add(cancellationToken.IsCancellationRequested
            ? "cancelled while waiting for After Effects"
            : "timed out waiting for After Effects");
        return false;
    }

    private static void AddLines(List<string> log, string output)
    {
        foreach (var line in output.Split('\n', StringSplitOptions.RemoveEmptyEntries))
        {
            var trimmed = line.TrimEnd('\r');
            if (trimmed.Length > 0)
            {
                log.Add(trimmed);
            }
        }
    }

    private static void TryDelete(string path, List<string> log)
    {
        try
        {
            if (File.Exists(path))
            {
                File.Delete(path);
                log.Add($"removed previous {Path.GetFileName(path)}");
            }
        }
        catch (IOException e)
        {
            // Almost always "the file is open in After Effects". Worth saying out loud, because
            // the run will now look like it produced nothing new.
            log.Add($"could not remove previous {Path.GetFileName(path)}: {e.Message}");
        }
    }
}
