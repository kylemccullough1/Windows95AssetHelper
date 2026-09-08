import { useCallback, useMemo, useRef, useState } from 'react'
import {
  Button,
  Desktop,
  Icons,
  TaskBar,
  WindowLayer,
  WindowManagerProvider,
  useWindowManager,
} from '@duckdgoose/win95-ui'

import { findIcon, type IconAsset } from '../assets/catalog'
import { emptyScene, sceneAssetIds, type PlacedIcon, type Scene } from '../scene/types'
import { SCENE_ICON_KEY, SCENE_TAG_KEY, sceneWindowsFrom } from '../scene/fromWindowManager'
import { AssetBrowser, type DropMode } from './AssetBrowser'
import { PlacedIcons } from './PlacedIcons'
import { ExportPanel } from './ExportPanel'
import { SceneFrame } from './SceneFrame'

/*
 * The studio desktop.
 *
 * Two surfaces share one screen, which is the shape Kyle picked: the window manager from
 * @duckdgoose/win95-ui keeps owning windows (drag, resize, snap, minimise, stack) and a new
 * free-placement layer owns everything dropped from the asset browser. The scene document is the
 * exportable projection of both.
 *
 * Scene windows and the studio's own windows live in the same manager and are told apart by the
 * `data.scene` tag — see scene/fromWindowManager.ts. Without that, exporting would put the asset
 * browser and the export panel into the comp.
 *
 * The recorder from research note 03 is deliberately absent. The pillar Kyle kept is "every asset
 * on its own layer, composed and exported", not "capture movement over time", so the scene is
 * static and the export needs no keyframes at all. The hold-keyframe and layer-split machinery
 * the spike proved still applies if animation ever comes back — nothing here forecloses it.
 */

let nextInstance = 0
let nextWindow = 0

/** Comp sizes worth offering. `null` means "whatever the desktop currently is". */
const SIZE_PRESETS: { label: string; size: { width: number; height: number } | null }[] = [
  { label: 'Fit to desktop', size: null },
  { label: '640 × 480', size: { width: 640, height: 480 } },
  { label: '800 × 600', size: { width: 800, height: 600 } },
  { label: '1280 × 720', size: { width: 1280, height: 720 } },
  { label: '1920 × 1080', size: { width: 1920, height: 1080 } },
]

function Shell() {
  const wm = useWindowManager()
  const [scene, setScene] = useState<Scene>(() => emptyScene('Desktop'))
  const [selected, setSelected] = useState<string | null>(null)
  const [sizeIndex, setSizeIndex] = useState(0)

  const preset = SIZE_PRESETS[sizeIndex].size
  // "Fit to desktop" keeps the export honestly WYSIWYG: what you composed is the comp. A fixed
  // preset needs the frame overlay below, because the desktop is then a different shape from the
  // comp and you cannot otherwise tell what is in frame.
  const frame = preset ?? { width: wm.workArea.width, height: wm.workArea.height }

  /**
   * The scene as it stands right now: stored icon placements plus windows derived live from the
   * manager. Windows are derived rather than stored because the manager already owns their
   * geometry, and keeping a second copy in state would mean syncing on every drag frame.
   */
  const currentScene = useMemo<Scene>(
    () => ({
      ...scene,
      width: Math.round(frame.width),
      height: Math.round(frame.height),
      windows: sceneWindowsFrom(wm.windows, wm.activeId, wm.workArea),
    }),
    [scene, frame.width, frame.height, wm.windows, wm.activeId, wm.workArea],
  )

  // Windows are opened once with fixed content, but the scene keeps changing underneath them, so
  // panel content reads the scene through a ref rather than a value captured at open() time.
  const sceneRef = useRef(currentScene)
  sceneRef.current = currentScene

  const placeAsset = useCallback(
    (asset: IconAsset, as: DropMode) => {
      if (as === 'window') {
        // A scene window: same catalogue asset, but it becomes a window comp with the icon in
        // its title bar rather than a bare sprite. The 16px variant is the right one for a title
        // bar; fall back to whatever was picked if this family has no 16px artwork.
        const titleIcon = findIcon(asset.id.replace(/_\d+x\d+_/, '_16x16_')) ?? asset
        const Icon = Icons.Folder
        wm.open({
          id: `scene-window-${nextWindow++}`,
          title: asset.name,
          icon: <Icon variant="16x16_4" />,
          content: (
            <div className="p-3 text-[12px] leading-relaxed text-[#404040]">
              Scene window. Drag, resize and snap it; the export uses its position and size.
              Its title bar carries <code>{titleIcon.id}</code>.
            </div>
          ),
          initialRect: { width: 320, height: 200 },
          data: { [SCENE_TAG_KEY]: 'true', [SCENE_ICON_KEY]: titleIcon.id },
        })
        return
      }

      setScene((current) => {
        // Cascade new drops so repeated placements do not stack invisibly on one another.
        const n = current.icons.length
        const icon: PlacedIcon = {
          instanceId: `icon-${nextInstance++}`,
          assetId: asset.id,
          x: 24 + (n % 6) * 84,
          y: 24 + Math.floor(n / 6) * 84,
          label: asset.name,
        }
        return { ...current, icons: [...current.icons, icon] }
      })
    },
    [wm],
  )

  const moveIcon = useCallback((instanceId: string, x: number, y: number) => {
    setScene((current) => ({
      ...current,
      icons: current.icons.map((icon) =>
        icon.instanceId === instanceId ? { ...icon, x, y } : icon,
      ),
    }))
  }, [])

  const removeSelected = useCallback(() => {
    setScene((current) => ({
      ...current,
      icons: current.icons.filter((icon) => icon.instanceId !== selected),
    }))
    setSelected(null)
  }, [selected])

  const clearScene = useCallback(() => {
    for (const win of wm.windows) {
      if (win.data?.[SCENE_TAG_KEY] === 'true') wm.close(win.id)
    }
    setScene((current) => ({ ...current, icons: [] }))
    setSelected(null)
  }, [wm])

  const openBrowser = () => {
    wm.open({
      id: 'asset-browser',
      title: 'Asset Browser',
      icon: <Icons.Folder variant="16x16_4" />,
      content: <AssetBrowser onPlace={placeAsset} />,
      initialRect: { width: 480, height: 440 },
    })
  }

  const openExport = () => {
    wm.open({
      id: 'export',
      title: 'Export to After Effects',
      icon: <Icons.MyComputer variant="16x16_4" />,
      content: <ExportPanel getScene={() => sceneRef.current} />,
      initialRect: { width: 430, height: 400 },
    })
  }

  const distinct = sceneAssetIds(currentScene).length

  return (
    <Desktop>
      <SceneFrame width={frame.width} height={frame.height} showOutline={preset !== null} />

      <PlacedIcons
        icons={scene.icons}
        selectedId={selected}
        onSelect={setSelected}
        onMove={moveIcon}
      />

      <WindowLayer />

      <TaskBar
        startMenu={
          <div className="flex w-[230px] flex-col gap-[2px]">
            <Button className="w-full justify-start px-2 text-left" onClick={openBrowser}>
              Asset Browser…
            </Button>
            <Button className="w-full justify-start px-2 text-left" onClick={openExport}>
              Export to After Effects…
            </Button>
            <hr className="my-1 border-t border-[#808080]" />

            <label className="flex items-center justify-between gap-2 px-2 py-1 text-[11px]">
              Comp size
              <select
                value={sizeIndex}
                className="border border-[#808080] bg-white px-1 text-[11px]"
                onChange={(e) => setSizeIndex(Number(e.target.value))}
              >
                {SIZE_PRESETS.map((option, index) => (
                  <option key={option.label} value={index}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <Button
              className="w-full justify-start px-2 text-left"
              disabled={selected === null}
              onClick={removeSelected}
            >
              Delete selected icon
            </Button>
            <Button
              className="w-full justify-start px-2 text-left"
              disabled={scene.icons.length === 0 && currentScene.windows.length === 0}
              onClick={clearScene}
            >
              Clear scene
            </Button>
            <hr className="my-1 border-t border-[#808080]" />
            <span className="px-2 py-1 text-[11px] text-[#404040]">
              {scene.icons.length} icon{scene.icons.length === 1 ? '' : 's'} ·{' '}
              {currentScene.windows.length} window{currentScene.windows.length === 1 ? '' : 's'} ·{' '}
              {distinct} asset{distinct === 1 ? '' : 's'}
              <br />
              {currentScene.width} × {currentScene.height}
            </span>
          </div>
        }
      />
    </Desktop>
  )
}

export function StudioDesktop() {
  return (
    <WindowManagerProvider>
      <Shell />
    </WindowManagerProvider>
  )
}
