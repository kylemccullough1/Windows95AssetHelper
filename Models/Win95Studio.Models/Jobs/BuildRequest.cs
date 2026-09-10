namespace Win95Studio.Models.Jobs;

/// <summary>
/// What the studio asks the companion to build, sent as the <c>spec</c> part of the multipart
/// upload alongside the bundle zip.
///
/// Every path in the generated scripts is already absolute by the time this arrives: the studio
/// asked for the output folder *before* generating, so both scripts can run unattended. The
/// companion therefore never rewrites a script, which is what keeps it a dumb executor rather
/// than a second copy of the generator.
/// </summary>
/// <param name="OutputPath">The folder the user browsed to. Everything the job writes is under it.</param>
/// <param name="ProjectFileName">File name of the finished scene project, e.g. <c>desktop.aep</c>.</param>
/// <param name="PackageScriptName">Name of the package script inside the bundle.</param>
/// <param name="SceneScriptName">Name of the scene script inside the bundle.</param>
public sealed record BuildRequest(
    string OutputPath,
    string ProjectFileName,
    string PackageScriptName,
    string SceneScriptName);
