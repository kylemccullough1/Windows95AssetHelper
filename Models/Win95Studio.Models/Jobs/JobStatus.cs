namespace Win95Studio.Models.Jobs;

/// <summary>Where a build has got to.</summary>
public enum JobState
{
    Queued,
    Running,
    Succeeded,
    Failed,
}

/// <summary>
/// A build's public state, polled by the studio once a second.
///
/// <see cref="Percent"/> is coarse and step-based on purpose. After Effects reports its own
/// progress into a log file it flushes every couple of hundred comps, and turning that into a
/// smooth bar would mean tailing and parsing a file the companion does not own the format of.
/// Naming the current step honestly is more useful than a bar that lies smoothly.
/// </summary>
public sealed record JobStatus(
    string Id,
    JobState State,
    string Step,
    int Percent,
    string? ProjectPath,
    IReadOnlyList<string> Log,
    string? Error);
