namespace Win95Studio.Models.Files;

/// <summary>
/// One level of the folder tree, as the studio's Browse For Folder dialog shows it.
/// </summary>
/// <param name="Path">
/// The folder being listed, or null for the top level — the drive list, which is not itself a
/// folder anyone can export into.
/// </param>
/// <param name="Parent">One level up, or null when already at the top.</param>
public sealed record FolderListing(string? Path, string? Parent, IReadOnlyList<FolderEntry> Entries);

/// <summary>
/// One row of the dialog.
/// </summary>
/// <param name="Drive">
/// True for a drive root, so the dialog can draw a drive rather than a folder. It is a display
/// hint only; a drive root is a perfectly good export target.
/// </param>
public sealed record FolderEntry(string Name, string Path, bool Drive);

/// <summary>The body of <c>POST /api/folders</c>: make <paramref name="Name"/> inside <paramref name="Parent"/>.</summary>
public sealed record CreateFolderRequest(string Parent, string Name);
