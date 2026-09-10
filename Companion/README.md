# Companion — the local After Effects runner

A small ASP.NET Core service that does the two things the studio in the browser cannot: write to
a folder you picked, and start After Effects.

```
dotnet run --project Companion/Win95Studio.Companion     # from the repo root
```

Run it from the **repo root** — the `--project` path is relative to wherever you are. In Rider,
open `Win95AssetHelper.slnx` and use the run configuration generated from the launch settings; the
command line above is the same thing without the IDE.

It always listens on the loopback address `Program.cs` pins with `UseUrls`. Because that call is in
code rather than in configuration, it does not depend on `Properties/launchSettings.json` and is
the same whether you launch from the CLI or from Rider — and it is the one place to change if you
ever need to. `--urls` overrides it for a single run.

Start it before pressing *Set up in After Effects…* in the studio's export panel; the studio
probes it when the panel opens and silently falls back to downloads if it is not there.

## What it is not

It is **not** a second exporter. Every script it runs arrives already written, with every path
already resolved, because the studio asks for the output folder before it generates anything. The
companion unzips, runs, and reports. Nothing here knows what a comp is, and there is no copy of
the generator to drift out of step with `App/src/export`.

## Projects

Dependency direction is strictly downward, same as the portfolio repo:

```
Companion/Win95Studio.Companion   the web host: three endpoint groups, no logic
Services/Win95Studio.Services     locating After Effects, running it, browsing folders, jobs
Models/Win95Studio.Models         the JSON that crosses the wire; references nothing
```

## Endpoints

| | |
|---|---|
| `GET /api/health` | Version, and the After Effects install it found. Always 200 while the process is up. |
| `GET /api/folders?path=` | One level of the tree. No path = drives, Desktop and Documents. |
| `POST /api/folders` | Create one subfolder (`{parent, name}`). |
| `POST /api/jobs` | multipart: `spec` (JSON) + `bundle` (zip). Returns `{id}` immediately. |
| `GET /api/jobs/{id}` | State, current step, coarse percent, the log, the finished project's path. |

## The three decisions worth knowing

**It binds loopback only, and CORS allows loopback origins only.** This process unpacks uploaded
archives and runs scripts as the signed-in user. Bound to all interfaces it would be reachable from
anything on the network. On loopback the only callers are things already running as this user,
which could start `AfterFX.com` themselves anyway.

A fixed allow-list of dev-server ports was tried first and is worse in practice: Vite silently
moves to another port when its default is taken — commonly by another project's dev server — and
the companion then refuses the studio with a CORS error that never mentions ports. Accepting any
loopback origin keeps the property that matters and drops the failure mode nobody would diagnose.

**It drives `AfterFX.com`, never `AfterFX.exe`.** They are different front ends to the same
application: the `.exe` is the GUI one and ignores a script argument, the `.com` is a console stub
that accepts `-r <script>`. The locator finds it by walking `<Program Files>\Adobe\Adobe After
Effects *\Support Files\`, newest first and Beta last, rather than through the registry — the
install layout has been stable for a decade and the registry keys have not. `Companion:AfterEffectsPath`
in `appsettings.json` overrides it.

**Success is a file, not an exit code.** `AfterFX.com` exits 0 whether the script finished, threw,
or was merely handed to an already-running instance. So each step names a file the script is
supposed to produce, and the runner waits for that file to appear *and stop growing* before
calling it done. A stale copy from a previous run is deleted first, or the run would look
instantly successful.

## Where things go

Under the folder you browse to:

```
<chosen>/Win95Assets/Win95Assets.aep    the asset package and its own assets/ folder
<chosen>/<scene>.aep                    the finished scene project
<chosen>/win95-*-log.txt                what After Effects logged; the job reads these back
```

Bundles are unpacked to `%LOCALAPPDATA%\Win95AssetStudio\jobs\<id>` and deleted when the job
ends. Job state is in memory and dies with the process — the artefact is a file on disk that
either exists or does not, and re-running is cheap.
