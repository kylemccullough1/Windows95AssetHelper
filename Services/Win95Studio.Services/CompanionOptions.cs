namespace Win95Studio.Services;

/// <summary>
/// The handful of things about this machine the companion is allowed to be told rather than
/// discover. Bound from the <c>Companion</c> section of appsettings.
/// </summary>
public sealed class CompanionOptions
{
    /// <summary>
    /// Full path to <c>AfterFX.com</c>, when the automatic search finds the wrong install (or
    /// none). Empty means "search".
    /// </summary>
    public string AfterEffectsPath { get; set; } = string.Empty;

    /// <summary>
    /// How long one After Effects script may run before the job gives up on it.
    ///
    /// The default is generous because a full-catalogue package build was measured at just under
    /// three minutes on a real machine and a slower one is not a failure. What this timeout is
    /// really for is the case After Effects makes easy to hit: a script that put up a modal
    /// dialog nobody is looking at, which otherwise waits for ever.
    /// </summary>
    public int ScriptTimeoutSeconds { get; set; } = 900;

    /// <summary>
    /// Largest bundle the companion will accept, in megabytes. The full catalogue is about 7 MB
    /// of PNG; the cap exists so a malformed or hostile upload cannot fill the disk.
    /// </summary>
    public int MaxBundleMegabytes { get; set; } = 64;

    /// <summary>
    /// Where bundles are unpacked. Empty means a <c>Win95AssetStudio</c> folder under the user's
    /// local application data, which is the right answer on every machine and needs no setup.
    /// </summary>
    public string StagingPath { get; set; } = string.Empty;
}
