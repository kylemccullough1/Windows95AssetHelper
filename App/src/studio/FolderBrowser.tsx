import { useCallback, useEffect, useState } from 'react'
import { Button, Icons, Input } from '@duckdgoose/win95-ui'

import { createFolder, listFolder, type FolderListing } from '../export/companion'

/**
 * "Browse For Folder", rebuilt.
 *
 * A native folder dialog was the obvious first answer and is the wrong one here for two reasons.
 * The companion is a web server with no window of its own, so a native dialog it opened would
 * appear behind the browser with nothing on screen explaining why the page had stopped
 * responding. And the studio is a Windows 95 desktop — a modern Windows 11 folder picker landing
 * in the middle of it is a seam a user can see.
 *
 * So the companion exposes the filesystem as data (`/api/folders`) and the dialog is drawn here
 * in the same chrome as everything else. It is the real Windows 95 dialog's shape: a tree you
 * walk one level at a time, the selected path in a field underneath, New Folder, OK and Cancel.
 *
 * It walks one level at a time rather than rendering an expandable tree because that needs a
 * request per expanded node and a cache to match, and choosing an export folder is a five-click
 * job. If it ever becomes a browsing tool, revisit.
 */

type Props = {
  title: string
  /** Where to start. Falls back to the drive list when null or unreadable. */
  initialPath?: string | null
  /** Called with the chosen absolute path. */
  onChoose: (path: string) => void
  onCancel: () => void
}

export function FolderBrowser({ title, initialPath = null, onChoose, onCancel }: Props) {
  const [listing, setListing] = useState<FolderListing | null>(null)
  const [selected, setSelected] = useState<string | null>(initialPath)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const [newFolderName, setNewFolderName] = useState<string | null>(null)

  const load = useCallback(async (path: string | null) => {
    setBusy(true)
    setError(null)
    try {
      const next = await listFolder(path)
      setListing(next)
      setSelected(next.path)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      // A path that no longer exists must not strand the dialog with nothing to show. Fall back
      // to the drive list, which always resolves.
      if (path !== null) {
        try {
          setListing(await listFolder(null))
          setSelected(null)
        } catch {
          /* the companion is gone; the error above already says so */
        }
      }
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void load(initialPath)
  }, [load, initialPath])

  async function makeFolder(name: string) {
    if (!listing?.path || name.trim() === '') return
    setBusy(true)
    try {
      const next = await createFolder(listing.path, name.trim())
      setListing(next)
      setNewFolderName(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3 text-[12px]">
      <p className="text-[#404040]">{title}</p>

      <div className="win95-sunken min-h-0 flex-1 overflow-y-auto bg-white">
        {/* One row up, whenever there is somewhere to go. The drive list has no parent. */}
        {listing !== null && listing.path !== null && (
          <Row
            icon={<Icons.FolderOpen variant="16x16_4" />}
            label=".."
            onOpen={() => void load(listing.parent)}
          />
        )}
        {listing?.entries.map((entry) => (
          <Row
            key={entry.path}
            icon={
              entry.drive ? (
                <Icons.MyComputer variant="16x16_4" />
              ) : (
                <Icons.Folder variant="16x16_4" />
              )
            }
            label={entry.name}
            selected={entry.path === selected}
            onSelect={() => setSelected(entry.path)}
            onOpen={() => void load(entry.path)}
          />
        ))}
        {listing !== null && listing.entries.length === 0 && (
          <p className="p-3 text-center text-[#808080]">
            {listing.path === null ? 'No drives found.' : 'No subfolders here.'}
          </p>
        )}
        {busy && listing === null && <p className="p-3 text-center text-[#808080]">Reading…</p>}
      </div>

      <label className="flex items-center gap-2">
        <span className="shrink-0">Folder:</span>
        <Input
          value={selected ?? ''}
          readOnly
          className="min-w-0 flex-1"
          // Read-only rather than editable: the value has to be a folder the companion can
          // actually write to, and validating a typed path is a round trip the dialog would then
          // have to explain. Double-click your way there instead.
          title="Double-click a folder to go into it"
        />
      </label>

      {newFolderName !== null && (
        <label className="flex items-center gap-2">
          <span className="shrink-0">New folder:</span>
          <Input
            autoFocus
            value={newFolderName}
            className="min-w-0 flex-1"
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void makeFolder(newFolderName)
              if (e.key === 'Escape') setNewFolderName(null)
            }}
          />
          <Button onClick={() => void makeFolder(newFolderName)}>Create</Button>
        </label>
      )}

      {error && <p className="text-[11px] text-[#800000]">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button
          disabled={busy || listing?.path === null || newFolderName !== null}
          onClick={() => setNewFolderName('')}
        >
          New Folder
        </Button>
        <Button
          disabled={selected === null || busy}
          onClick={() => selected !== null && onChoose(selected)}
        >
          OK
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

/**
 * One row of the list. Single click selects, double click descends — the Windows 95 convention,
 * and the reason the OK button can commit a folder you are standing next to rather than only one
 * you have opened.
 */
function Row({
  icon,
  label,
  selected = false,
  onSelect,
  onOpen,
}: {
  icon: React.ReactNode
  label: string
  selected?: boolean
  onSelect?: () => void
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      className={`flex w-full cursor-pointer items-center gap-1 px-1 py-[1px] text-left ${
        selected ? 'bg-[#000080] text-white' : 'hover:bg-[#000080]/10'
      }`}
      onClick={onSelect}
      onDoubleClick={onOpen}
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  )
}
