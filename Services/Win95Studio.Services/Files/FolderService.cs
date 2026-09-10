using Win95Studio.Models.Files;

namespace Win95Studio.Services.Files;

/// <summary>
/// The filesystem, as the studio's Browse For Folder dialog needs to see it.
/// </summary>
public interface IFolderService
{
    /// <summary>List a folder, or the drive roots when <paramref name="path"/> is null or empty.</summary>
    FolderListing List(string? path);

    /// <summary>Create a subfolder and return its parent's listing, so the dialog can redraw.</summary>
    FolderListing Create(string parent, string name);
}

/// <summary>
/// Reads directories for the browse dialog.
///
/// <para>
/// <b>Why this exists instead of a native dialog.</b> The companion is a web server with no
/// window. A native folder picker it opened would appear behind the browser, with nothing on
/// screen explaining why the page had stopped responding, and it would be a Windows 11 dialog in
/// the middle of a Windows 95 desktop. Serving the tree as data and drawing the dialog in the
/// studio keeps the illusion and keeps the interaction where the user is looking.
/// </para>
///
/// <para>
/// <b>On access.</b> This deliberately does not sandbox the user to particular folders. It runs
/// as the user, on their own machine, bound to loopback, so it can already see exactly what they
/// can see, and an export target could reasonably be anywhere. What it does do is refuse to
/// <em>traverse</em> — a listing is one level, a create is one name with no separators in it —
/// so a malformed path cannot be turned into a walk somewhere unintended.
/// </para>
/// </summary>
public sealed class FolderService : IFolderService
{
    public FolderListing List(string? path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return Roots();
        }

        var full = Normalize(path);
        if (!Directory.Exists(full))
        {
            throw new DirectoryNotFoundException($"{full} does not exist.");
        }

        var entries = SafeSubdirectories(full)
            .Select(d => new FolderEntry(Path.GetFileName(d), ToWebPath(d), false))
            .OrderBy(e => e.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var parent = Directory.GetParent(full)?.FullName;
        return new FolderListing(ToWebPath(full), parent is null ? null : ToWebPath(parent), entries);
    }

    public FolderListing Create(string parent, string name)
    {
        var full = Normalize(parent);
        if (!Directory.Exists(full))
        {
            throw new DirectoryNotFoundException($"{full} does not exist.");
        }

        // One segment, nothing else. Rejecting separators and invalid characters here is what
        // makes "create a folder" incapable of becoming "create a folder three levels up".
        var trimmed = name.Trim();
        if (trimmed.Length == 0
            || trimmed is "." or ".."
            || trimmed.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0
            || trimmed.Contains('/')
            || trimmed.Contains('\\'))
        {
            throw new ArgumentException($"{name} is not a valid folder name.", nameof(name));
        }

        Directory.CreateDirectory(Path.Combine(full, trimmed));
        return List(full);
    }

    /// <summary>
    /// The top level: every ready drive, plus the two folders someone is actually likely to
    /// export into. Desktop and Documents are shortcuts, not a different kind of thing — they
    /// come back as ordinary folder entries whose path happens to be somewhere useful.
    /// </summary>
    private static FolderListing Roots()
    {
        var entries = new List<FolderEntry>();

        foreach (var special in new[] { Environment.SpecialFolder.Desktop, Environment.SpecialFolder.MyDocuments })
        {
            var path = Environment.GetFolderPath(special);
            if (!string.IsNullOrEmpty(path) && Directory.Exists(path))
            {
                entries.Add(new FolderEntry(Path.GetFileName(path), ToWebPath(path), false));
            }
        }

        foreach (var drive in DriveInfo.GetDrives())
        {
            // IsReady is false for an empty optical drive or a disconnected network mapping, and
            // touching one of those is a several-second stall.
            if (!drive.IsReady)
            {
                continue;
            }

            var label = string.IsNullOrWhiteSpace(drive.VolumeLabel)
                ? drive.Name
                : $"{drive.VolumeLabel} ({drive.Name.TrimEnd('\\')})";
            entries.Add(new FolderEntry(label, ToWebPath(drive.RootDirectory.FullName), true));
        }

        return new FolderListing(null, null, entries);
    }

    /// <summary>
    /// Enumerate subdirectories, treating an unreadable folder as an empty one.
    ///
    /// System folders under a drive root routinely refuse a listing, and the dialog showing them
    /// as empty is a far better outcome than the request failing with a 500 the moment someone
    /// double-clicks C:.
    /// </summary>
    private static IEnumerable<string> SafeSubdirectories(string path)
    {
        try
        {
            return Directory.EnumerateDirectories(path).Where(NotHidden).ToList();
        }
        catch (Exception e) when (e is UnauthorizedAccessException or IOException)
        {
            return [];
        }
    }

    private static bool NotHidden(string path)
    {
        try
        {
            var attributes = File.GetAttributes(path);
            return !attributes.HasFlag(FileAttributes.Hidden) && !attributes.HasFlag(FileAttributes.System);
        }
        catch (Exception e) when (e is UnauthorizedAccessException or IOException)
        {
            return false;
        }
    }

    /// <summary>
    /// Resolve to a full path, rejecting anything that is not one.
    ///
    /// <c>Path.GetFullPath</c> is what collapses <c>..</c> segments, so a path that arrives with
    /// them is normalised before it is ever used rather than being passed through.
    /// </summary>
    private static string Normalize(string path)
    {
        var full = Path.GetFullPath(path.Trim());
        if (!Path.IsPathFullyQualified(full))
        {
            throw new ArgumentException($"{path} is not an absolute path.", nameof(path));
        }
        return full;
    }

    /// <summary>
    /// Forward slashes on the way out.
    ///
    /// Every path the companion returns ends up in two places: a JSON string, and — once the
    /// user picks it — a literal inside a generated ExtendScript file. ExtendScript's
    /// <c>File</c> and <c>Folder</c> take forward slashes on Windows, and forward slashes need
    /// no escaping in either format, so normalising here means neither hop has to think about it.
    /// </summary>
    private static string ToWebPath(string path) => path.Replace('\\', '/');
}
