using Win95Studio.Companion.Endpoints;
using Win95Studio.Services;

/*
 * The local companion.
 *
 * The studio runs in a browser and can do everything except the last two inches: it cannot write
 * to a folder the user picked, and it cannot start After Effects. This process can do both, and
 * that is the whole of its job. It generates nothing — the scripts arrive already written, with
 * every path baked in — so there is no second copy of the exporter here to drift out of step
 * with the one in App/src/export.
 *
 * It is deliberately small enough to read in one sitting: three endpoint groups, three services,
 * no database, no auth.
 */

var builder = WebApplication.CreateBuilder(args);

/*
 * Loopback only, on a fixed port the studio knows.
 *
 * The fixed port is what lets the studio find the companion with no configuration — it probes
 * http://127.0.0.1:5795/api/health and either gets an answer or falls back to downloads.
 *
 * Binding to 127.0.0.1 rather than the default is the security boundary, and it is doing real
 * work: this server unpacks uploaded archives and runs scripts as the signed-in user. On 0.0.0.0
 * that would be reachable from anything on the same network. On loopback it is reachable only by
 * code already running as this user, which can do all of it anyway.
 *
 * Overridable by --urls, because a port collision must not be a dead end.
 */
builder.WebHost.UseUrls("http://127.0.0.1:5795");

builder.Services.AddProblemDetails();

/*
 * CORS: loopback origins only.
 *
 * The studio is served from Vite on a different origin, so the browser will not let it read this
 * server's responses without a policy. `AllowAnyOrigin` is not it — this server unpacks archives
 * and runs scripts, so "any web page you have open can drive After Effects" is a real
 * description of what that would mean.
 *
 * A fixed list of ports was the first version and it is wrong in practice: Vite takes the next
 * free port when 5173 is busy, which it routinely is when the duckdgoose site is also running,
 * and the companion then silently refuses the studio with a CORS error that says nothing about
 * ports. Allowing any loopback origin instead keeps the property that matters — the caller is
 * already code running on this machine as this user, which can start AfterFX.com itself anyway —
 * without a failure mode nobody would diagnose.
 */
const string StudioCors = "studio";
builder.Services.AddCors(options => options.AddPolicy(StudioCors, policy => policy
    .SetIsOriginAllowed(IsLoopback)
    .AllowAnyHeader()
    .AllowAnyMethod()));

static bool IsLoopback(string origin) =>
    Uri.TryCreate(origin, UriKind.Absolute, out var uri)
    && (uri.IsLoopback || uri.Host is "localhost");

// One call per layer. This file names the layers; it does not know which services are behind it.
builder.Services.AddCompanionServices(builder.Configuration);

var app = builder.Build();

app.UseExceptionHandler();
app.UseCors(StudioCors);

// One group per area. Adding an area means a file under Endpoints/ and one line here, so
// Program.cs never grows a route.
var api = app.MapGroup("/api");
api.MapHealthEndpoints();
api.MapFolderEndpoints();
api.MapJobEndpoints();

app.Run();
