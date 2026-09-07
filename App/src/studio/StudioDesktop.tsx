import {
  Button,
  Desktop,
  DesktopIcon,
  Icons,
  TaskBar,
  WindowLayer,
  WindowManagerProvider,
  useWindowManager,
  type IconName,
} from '@duckdgoose/win95-ui'

/*
 * The studio desktop. For now this is a scaffold: it proves the published-package route works
 * end to end (npm link, one React, Tailwind reaching into the package, windows that drag,
 * resize, snap, minimise and stack). The asset registry from research note 04 replaces this
 * hard-coded list, and the recorder from note 03 subscribes to the same window manager.
 */

type AppSpec = {
  id: string
  title: string
  icon: IconName
  body: string
}

const APPS: AppSpec[] = [
  {
    id: 'my-computer',
    title: 'My Computer',
    icon: 'MyComputer',
    body: 'Drag this window by its title bar. Drag it to an edge to snap. Double-click the title bar to maximise. Every one of those is a reducer action, and the recorder will log exactly these.',
  },
  {
    id: 'notepad',
    title: 'Notepad',
    icon: 'Notepad',
    body: 'Open both windows and click between them. The stacking order you see here is what becomes layer splits in After Effects, because a layer index cannot be keyframed.',
  },
]

function Shell() {
  const wm = useWindowManager()

  const open = (app: AppSpec) => {
    const Icon = Icons[app.icon]
    wm.open({
      id: app.id,
      title: app.title,
      icon: <Icon variant="16x16_4" />,
      content: <div className="p-3 text-[12px] leading-relaxed">{app.body}</div>,
      initialRect: { width: 360, height: 200 },
    })
  }

  return (
    <Desktop>
      {/* Icon column. The real desktop lets these be dragged anywhere; DesktopIcon already
          supports that, and the studio will persist the offsets. */}
      <div className="flex w-[92px] flex-col gap-2 p-2">
        {APPS.map((app) => (
          <DesktopIcon
            key={app.id}
            icon={Icons[app.icon]}
            label={app.title}
            onOpen={() => open(app)}
          />
        ))}
      </div>

      <WindowLayer />

      <TaskBar
        startMenu={
          <div className="flex w-[160px] flex-col gap-[2px]">
            {APPS.map((app) => (
              <Button
                key={app.id}
                className="w-full justify-start px-2 text-left"
                onClick={() => open(app)}
              >
                {app.title}
              </Button>
            ))}
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
