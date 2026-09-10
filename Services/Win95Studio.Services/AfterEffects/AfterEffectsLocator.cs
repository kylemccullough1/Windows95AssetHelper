using Microsoft.Extensions.Options;
using Win95Studio.Models.Companion;

namespace Win95Studio.Services.AfterEffects;

/// <summary>Finds the After Effects install the companion should drive.</summary>
public interface IAfterEffectsLocator
{
    /// <summary>
    /// The install to use, or <see cref="AfterEffectsInfo.Missing"/>. Cheap enough to call per
    /// request: it is a directory enumeration, and the result is cached after the first hit.
    /// </summary>
    AfterEffectsInfo Locate();
}

/// <summary>
/// Locates <c>AfterFX.com</c> by looking where the Creative Cloud installer puts it.
///
/// <para>
/// <b>Why the filesystem and not the registry.</b> After Effects does register itself, but the
/// keys move between releases and the Beta channel registers differently again, so a registry
/// walk ends up being a list of paths to try with extra steps. The install layout, by contrast,
/// has not changed in a decade: <c>&lt;Program Files&gt;\Adobe\Adobe After Effects
/// &lt;edition&gt;\Support Files\AfterFX.com</c>.
/// </para>
///
/// <para>
/// <b>Why <c>AfterFX.com</c> and not <c>AfterFX.exe</c>.</b> They are different front ends to the
/// same application. The <c>.exe</c> is the GUI one and ignores a script argument; the <c>.com</c>
/// is a console subsystem stub that accepts <c>-r &lt;script&gt;</c> and writes the script's
/// output to stdout. Every automation route into After Effects goes through the <c>.com</c>.
/// </para>
///
/// <para>
/// When more than one install is present the newest by folder name wins, with the Beta channel
/// last: a Beta is what you have when you are testing After Effects, not when you are trying to
/// get work out.
/// </para>
/// </summary>
public sealed class AfterEffectsLocator : IAfterEffectsLocator
{
    private const string Executable = "AfterFX.com";

    private readonly CompanionOptions _options;
    private AfterEffectsInfo? _cached;

    public AfterEffectsLocator(IOptions<CompanionOptions> options) => _options = options.Value;

    public AfterEffectsInfo Locate() => _cached ??= Search();

    private AfterEffectsInfo Search()
    {
        // A configured path wins outright, including over a newer install: someone who set it
        // did so because the search picked the wrong one.
        if (!string.IsNullOrWhiteSpace(_options.AfterEffectsPath))
        {
            var configured = _options.AfterEffectsPath;
            return File.Exists(configured)
                ? new AfterEffectsInfo(true, configured, Path.GetFileName(Path.GetDirectoryName(Path.GetDirectoryName(configured)) ?? configured))
                : AfterEffectsInfo.Missing;
        }

        var candidates = new List<(string Path, string Version)>();

        foreach (var adobe in AdobeRoots())
        {
            if (!Directory.Exists(adobe))
            {
                continue;
            }

            foreach (var install in SafeDirectories(adobe, "Adobe After Effects*"))
            {
                var executable = Path.Combine(install, "Support Files", Executable);
                if (File.Exists(executable))
                {
                    candidates.Add((executable, Path.GetFileName(install)));
                }
            }
        }

        if (candidates.Count == 0)
        {
            return AfterEffectsInfo.Missing;
        }

        // Beta last, then newest name first. Folder names sort usefully because the edition is a
        // year: "Adobe After Effects 2026" > "Adobe After Effects 2025".
        var best = candidates
            .OrderBy(c => c.Version.Contains("Beta", StringComparison.OrdinalIgnoreCase))
            .ThenByDescending(c => c.Version, StringComparer.OrdinalIgnoreCase)
            .First();

        return new AfterEffectsInfo(true, best.Path, best.Version);
    }

    private static IEnumerable<string> AdobeRoots()
    {
        yield return Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Adobe");
        // 32-bit Program Files, for completeness. After Effects has been 64-bit only for years,
        // but the folder costs one Directory.Exists to rule out.
        yield return Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Adobe");
    }

    /// <summary>
    /// Enumerate matching subdirectories, treating an unreadable root as an empty one.
    ///
    /// A locked-down machine can refuse a directory listing under Program Files, and a companion
    /// that throws on start-up because of it is worse than one that reports After Effects as not
    /// found and lets the studio fall back to downloads.
    /// </summary>
    private static IEnumerable<string> SafeDirectories(string root, string pattern)
    {
        try
        {
            return Directory.EnumerateDirectories(root, pattern);
        }
        catch (Exception e) when (e is UnauthorizedAccessException or IOException)
        {
            return [];
        }
    }
}
