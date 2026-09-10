namespace Win95Studio.Models.Companion;

/// <summary>
/// What <c>GET /api/health</c> answers: who the companion is, and whether it can see After
/// Effects.
///
/// The studio treats a failed request as "not installed" and carries on offering downloads, so
/// this type only ever describes a companion that is actually running.
/// </summary>
public sealed record CompanionInfo(string Version, AfterEffectsInfo AfterEffects);

/// <summary>
/// The After Effects install the companion will drive.
/// </summary>
/// <param name="Found">False when nothing was located; the studio then hides the one-click route.</param>
/// <param name="Path">
/// Full path to <c>AfterFX.com</c>. That is the console front end, not <c>AfterFX.exe</c>: the
/// <c>.com</c> stub is the one that accepts <c>-r</c> and writes to stdout.
/// </param>
/// <param name="Version">
/// The install's display name, taken from its folder — "Adobe After Effects 2026", "Adobe After
/// Effects (Beta)". Not the build number: reading that means launching the application.
/// </param>
public sealed record AfterEffectsInfo(bool Found, string? Path, string? Version)
{
    public static AfterEffectsInfo Missing { get; } = new(false, null, null);
}
