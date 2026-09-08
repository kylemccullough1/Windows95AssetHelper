import { useCallback, useRef, useState } from 'react'
import {
  Button,
  Desktop,
  Icons,
  TaskBar,
  WindowLayer,
  WindowManagerProvider,
  useWindowManager,
} from '@duckdgoose/win95-ui'

import type { IconAsset } from '../assets/catalog'
import { emptyScene, sceneAssetIds, type PlacedIcon, type Scene } from '../scene/types'
import { AssetBrowser } from './AssetBrowser'
import { PlacedIcons } from './PlacedIcons'
import { ExportPanel } from './ExportPanel'

/*
 * The studio desktop.
 *
 * Two surfaces share one screen, which is the shape Kyle picked: the window manager from
 * @duckdgoose/win95-ui keeps owning windows (drag, resize, snap, minimise, stack) and a new
 * free-placement layer owns everything dropped from the asset browser. The scene document is the
 * exportable projection of both.
 *
 * The recorder from research note 03 is deliberately absent. The pillar Kyle kept is "every asset
 * on its own layer, composed and exported", not "capture movement over time", so the scene is
 * static and the export needs no keyframes at all. The hold-keyframe and layer-split machinery
 * the spike proved still applies if animation ever comes back — nothing here forecloses it.
 */

let nextInstance = 0

function Shell() {
  const wm = useWindowManager()
  const [scene, setScene] = useState<Scene>(() => emptyScene('Desktop'))
  const [selected, setSelected] = useState<string | null>(null)

  // Windows are opened once with fixed content, but the scene keeps changing underneath them, so
  // panel content reads the scene through a ref rather than a value captured at open() time.
  const sceneRef = useRef(scene)
  sceneRef.current = scene

  const placeAsset = useCallback((asset: IconAsset) => {
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
  }, [])

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

  const openBrowser = () => {
    wm.open({
      id: 'asset-browser',
      title: 'Asset Browser',
      icon: <Icons.Folder variant="16x16_4" />,
      content: <AssetBrowser onPlace={placeAsset} />,
      initialRect: { width: 460, height: 420 },
    })
  }

  const openExport = () => {
    wm.open({
      id: 'export',
      title: 'Export to After Effects',
      icon: <Icons.MyComputer variant="16x16_4" />,
      content: <ExportPanel getScene={() => sceneRef.current} />,
      initialRect: { width: 430, height: 380 },
    })
  }

  const distinct = sceneAssetIds(scene).length

  return (
    <Desktop>
      <PlacedIcons
        icons={scene.icons}
        selectedId={selected}
        onSelect={setSelected}
        onMove={moveIcon}
      />

      <WindowLayer />

      <TaskBar
        startMenu={
          <div className="flex w-[210px] flex-col gap-[2px]">
            <Button className="w-full justify-start px-2 text-left" onClick={openBrowser}>
              Asset Browser…
            </Button>
            <Button className="w-full justify-start px-2 text-left" onClick={openExport}>
              Export to After Effects…
            </Button>
            <Button
              className="w-full justify-start px-2 text-left"
              disabled={selected === null}
              onClick={removeSelected}
            >
              Delete selected icon
            </Button>
            <hr className="my-1 border-t border-[#808080]" />
            <span className="px-2 py-1 text-[11px] text-[#404040]">
              {scene.icons.length} icon{scene.icons.length === 1 ? '' : 's'} · {distinct} distinct
              asset{distinct === 1 ? '' : 's'}
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
