// window-roundtrip.jsx - After Effects round-trip spike for Windows95AssetHelper
//
// ExtendScript (ES3). Run from After Effects: File > Scripts > Run Script File,
// or from a console with AE already open:
//   "C:\Program Files\Adobe\Adobe After Effects (Beta)\Support Files\AfterFX.com" -r "<abs path>\window-roundtrip.jsx"
//
// What it proves, in one file (see notes/.../research/02-ae-export.md):
//   1. app.version string format in the installed beta
//   2. shape layers built purely by match name (rects + free paths + fills)
//   3. a React95 pixel-icon SVG path ("M x y h n" runs) converted to shape paths in ES3
//   4. text layer in W95FA via TextDocument.fontObject, width measured for parity
//   5. hold keyframes on position (Win95 has no easing)
//   6. a z-order raise expressed as a layer split (layer.index is read-only)
//   7. package mode: app.newProject -> build -> project.save(.aep) -> newProject -> import as PROJECT
//
// ES3 rules: var only, no arrow functions, no Array.prototype.map, no JSON, no trailing commas.

#target aftereffects

// ---------------------------------------------------------------- config

var CONFIG = {
    fps: 30,
    sceneW: 640,
    sceneH: 480,
    duration: 10,          // seconds
    winW: 200,
    winH: 120,
    fontFamily: "W95FA",   // OTF nameID 1 (family), read from fonts/W95FA.otf
    fontStyle: "Regular",  // OTF nameID 2 (subfamily)
    fontPostScript: "W95FARegular", // OTF nameID 6; what TextDocument.font expects pre-24.0
    fontSize: 11,          // px at comp resolution; React95 title bars use 11px
    packageMode: true      // true = new project, save .aep, re-import; false = build into the open project
};

// Win95 system colours (React95 / classic Windows 95 palette)
var COLOR = {
    face: "#c0c0c0",
    lightest: "#ffffff",
    light: "#dfdfdf",
    shadow: "#808080",
    darkest: "#000000",
    titleActive: "#000080",
    titleText: "#ffffff",
    desktop: "#008080"
};

// SVG colour keywords that @react95/icons uses in its stroke attributes
var SVG_NAMED = {
    gray: "#808080",
    silver: "#c0c0c0",
    navy: "#000080",
    teal: "#008080",
    white: "#ffffff",
    black: "#000000"
};

// Icon paths copied verbatim from @react95/icons 2.5.3 svg/*.svg (viewBox "0 -0.5 16 16").
// Each <path stroke="colour" d="..."> is one entry. Every "h n" is a one-pixel-tall run.
var ICONS = {
    Computer3_16: [
        { c: "gray",   d: "M3 0h3M1 1h2m3 0h5M0 2h1m7 0h2m1 0h2M0 3h1m1 0h2m6 0h2m1 0h2M0 4h1m3 0h2m6 0h1m1 0h1M0 5h1m5 0h2m3 0h1m1 0h2M0 6h1m9 0h2m1 0h2M0 7h1m9 0h2m1 0h2M0 8h1m9 0h2m1 0h2M0 9h1m9 0h2m1 0h2M0 10h1m9 0h2m1 0h1M1 11h2m7 0h2m-9 1h2m5 0h2m-7 1h2m3 0h2m-5 1h3" },
        { c: "silver", d: "M3 1h3M1 2h1m2 0h4m2 0h1M1 3h1m4 0h4m2 0h1M1 4h1m6 0h4m1 0h1M1 5h1m8 0h1M1 6h1m6 0h2M1 7h1m6 0h2M1 8h1m6 0h2M1 9h1m6 0h2m-9 1h2m5 0h2m-7 1h2m3 0h2m-5 1h2m1 0h2m-3 1h3" },
        { c: "#fff",   d: "M2 2h2m0 1h2m0 1h2m0 1h2" },
        { c: "#000",   d: "M2 4h1m12 0h1M2 5h1m9 0h1m2 0h1M2 6h1m9 0h1m2 0h1M2 7h1m9 0h1m2 0h1M2 8h1m9 0h1m2 0h1M2 9h1m9 0h1m2 0h1m-4 1h1m1 0h1M0 11h1m11 0h2M1 12h2m9 0h1M3 13h2m7 0h1m-8 1h2m3 0h2m-5 1h3" },
        { c: "navy",   d: "M3 4h1m0 1h2m1 1h1M7 7h1M7 8h1M7 9h1m-5 1h2m2 0h1m-3 1h3m-1 1h1" },
        { c: "#00f",   d: "M3 5h1M3 6h1m1 0h2M3 7h1m1 0h2M4 8h1M3 9h1m1 0h2m-2 1h2" },
        { c: "#0ff",   d: "M4 6h1M4 7h1M3 8h1m1 0h2M4 9h1" }
    ],
    Notepad_16: [
        { c: "#000",   d: "M5 0h9M4 1h1m8 0h2M3 2h1m9 0h1m1 0h1m-3 1h1m1 0h1M2 4h1m9 0h1m2 0h1m-4 1h1m2 0h1M1 6h1m9 0h1m3 0h1m-5 1h1m3 0h1M0 8h1m9 0h1m4 0h1m-6 1h1m4 0h1M0 10h10m5 0h1M4 11h1m10 0h1M4 12h1m10 0h1M4 13h1m10 0h1M4 14h1m10 0h1M5 15h10" },
        { c: "gray",   d: "M5 1h1m2 0h1m2 0h1m2 13h1" },
        { c: "teal",   d: "M6 1h2m1 0h2m1 0h1M3 3h1m1 0h6m1 0h1M5 4h5M2 5h1m8 0h1M1 7h1m8 0h1M0 9h1m8 0h1" },
        { c: "#0ff",   d: "M4 2h9M4 3h1m6 0h1M3 4h2m5 0h2M3 5h8M2 6h9M2 7h8M1 8h9M1 9h8" },
        { c: "silver", d: "M14 2h1m-1 1h1m-2 1h2m-2 1h2m-3 1h3m-3 1h3m-4 1h4m-4 1h2m1 0h1m-5 1h5M5 11h10M5 12h7m2 0h1M5 13h10M5 14h9" },
        { c: "#fff",   d: "M13 9h1m-2 3h2" }
    ]
};

// The Win95 close-button glyph in the same run format: 8 wide x 7 tall, origin (0,0)
var CLOSE_GLYPH = "M0 0h2m4 0h2M1 1h2m2 0h2M2 2h4M3 3h2M2 4h4M1 5h2m2 0h2M0 6h2m4 0h2";

// ---------------------------------------------------------------- logging

var LOG = [];
function log(s) { LOG.push(String(s)); }

// ---------------------------------------------------------------- colour helpers

// "#rgb" | "#rrggbb" | svg keyword -> [r, g, b] in 0..1 (what AE colour properties take)
function rgb(c) {
    var h = c;
    if (SVG_NAMED[h] !== undefined) { h = SVG_NAMED[h]; }
    h = h.replace("#", "");
    if (h.length === 3) { h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2); }
    return [
        parseInt(h.substr(0, 2), 16) / 255,
        parseInt(h.substr(2, 2), 16) / 255,
        parseInt(h.substr(4, 2), 16) / 255
    ];
}

// ---------------------------------------------------------------- shape helpers
//
// A shape layer's root is layer.property("ADBE Root Vectors Group").
// Each "ADBE Vector Group" has its own contents at property("ADBE Vectors Group").
// Adding to an indexed group invalidates sibling references (scripting guide), so
// helpers never keep a reference across an addProperty on the same group.

// New shape layer whose (0,0) is the comp's top-left, so shape coordinates == comp pixels.
function addShapeLayer(comp, name) {
    var layer = comp.layers.addShape();
    layer.name = name;
    layer.property("ADBE Transform Group").property("ADBE Position").setValue([0, 0]);
    return layer;
}

function contentsOf(layer) {
    return layer.property("ADBE Root Vectors Group");
}

// Axis-aligned filled rectangle. AE rect paths are centre-anchored: position = centre.
function addRect(contents, name, x, y, w, h, colour) {
    var grp = contents.addProperty("ADBE Vector Group");
    grp.name = name;
    var gc = grp.property("ADBE Vectors Group");
    var rect = gc.addProperty("ADBE Vector Shape - Rect");
    rect.property("ADBE Vector Rect Size").setValue([w, h]);
    rect.property("ADBE Vector Rect Position").setValue([x + w / 2, y + h / 2]);
    var fill = gc.addProperty("ADBE Vector Graphic - Fill");
    fill.property("ADBE Vector Fill Color").setValue(rgb(colour));
    return grp.propertyIndex;
}

// One closed 4-vertex polygon covering pixel rect [x, y, w, 1]
function pixelRunShape(x, y, w) {
    var s = new Shape();
    s.vertices = [[x, y], [x + w, y], [x + w, y + 1], [x, y + 1]];
    s.inTangents = [[0, 0], [0, 0], [0, 0], [0, 0]];
    s.outTangents = [[0, 0], [0, 0], [0, 0], [0, 0]];
    s.closed = true;
    return s;
}

// Parse a @react95/icons path "d" string (only M, m, h are used by those SVGs)
// into an array of {x, y, w} pixel runs.
function parseRuns(d) {
    var runs = [];
    var re = /([Mmh])\s*(-?\d+)(?:[ ,]\s*(-?\d+))?/g;
    var px = 0, py = 0, m;
    while ((m = re.exec(d)) !== null) {
        var cmd = m[1];
        var a = parseInt(m[2], 10);
        var b = m[3] !== undefined ? parseInt(m[3], 10) : 0;
        if (cmd === "M") { px = a; py = b; }
        else if (cmd === "m") { px += a; py += b; }
        else if (cmd === "h") { runs.push({ x: px, y: py, w: a }); px += a; }
    }
    return runs;
}

// One group per colour: N path shapes + one fill. ox/oy place the icon in comp pixels.
function addRuns(contents, name, colour, d, ox, oy) {
    var grp = contents.addProperty("ADBE Vector Group");
    grp.name = name;
    var gc = grp.property("ADBE Vectors Group");
    var runs = parseRuns(d);
    for (var i = 0; i < runs.length; i++) {
        var p = gc.addProperty("ADBE Vector Shape - Group");
        p.property("ADBE Vector Shape").setValue(pixelRunShape(ox + runs[i].x, oy + runs[i].y, runs[i].w));
    }
    var fill = gc.addProperty("ADBE Vector Graphic - Fill");
    fill.property("ADBE Vector Fill Color").setValue(rgb(colour));
    return runs.length;
}

// A whole icon = one group per <path> colour
function addIcon(contents, iconName, paths, ox, oy) {
    var total = 0;
    for (var i = 0; i < paths.length; i++) {
        total += addRuns(contents, iconName + " " + paths[i].c, paths[i].c, paths[i].d, ox, oy);
    }
    return total;
}

// ---------------------------------------------------------------- keyframe helper

// Win95 has no easing: every key is HOLD in and out.
function holdKeys(prop, times, values) {
    prop.setValuesAtTimes(times, values);
    for (var k = 1; k <= prop.numKeys; k++) {
        prop.setInterpolationTypeAtKey(k, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
    }
}

// ---------------------------------------------------------------- text document reset
//
// Spike run 3 finding: LayerCollection.addText() inherits the Character panel's current state.
// Kyle's panel had All Caps on, so every lowercase glyph was drawn (and measured) as its
// uppercase: "My Computer" came out 67.09 px instead of the font's 55.75. The generator must
// therefore reset EVERY inheritable TextDocument attribute before setting its own. 24.0+ fields
// are guarded so the same code runs on older AE.
function resetTextDocument(td) {
    var before = "";
    try { before += "caps=" + td.fontCapsOption; } catch (e0) { before += "caps=n/a"; }
    try { td.fontCapsOption = FontCapsOption.FONT_NORMAL_CAPS; } catch (r0) {}
    // FRACTIONS, not percentages: 1 = 100%. Setting these to 100 makes the text 100x too big
    // (proved by run 4: every advance came back exactly 100.000x the font's value).
    td.horizontalScale = 1;
    td.verticalScale = 1;
    td.baselineShift = 0;
    td.tsume = 0;
    td.tracking = 0;
    td.autoLeading = true;
    try { td.fauxBold = false; td.fauxItalic = false; } catch (r1) {}
    try { td.ligature = false; } catch (r2) {}
    try { td.autoKernType = AutoKernType.NO_AUTO_KERN; } catch (r3) {}
    td.applyStroke = false;
    td.applyFill = true;
    return before;
}

// ---------------------------------------------------------------- font lookup

// Returns { ps: postScriptName or null, obj: FontObject or null }
function findFont(family, style) {
    var result = { ps: null, obj: null };
    if (parseFloat(app.version) < 24) {
        log("font: app.fonts needs AE 24+; using PostScript name " + CONFIG.fontPostScript + " blind");
        result.ps = CONFIG.fontPostScript;
        return result;
    }
    try {
        var list = app.fonts.getFontsByPostScriptName(CONFIG.fontPostScript);
        if (list.length === 0) { list = app.fonts.getFontsByFamilyNameAndStyleName(family, style); }
        if (list.length === 0) {
            // fall back: any style whose family contains the name
            var all = app.fonts.allFonts;
            for (var i = 0; i < all.length && list.length === 0; i++) {
                for (var j = 0; j < all[i].length; j++) {
                    if (String(all[i][j].familyName).indexOf(family) >= 0) { list = [all[i][j]]; break; }
                }
            }
        }
        if (list.length > 0) {
            result.obj = list[0];
            result.ps = list[0].postScriptName;
            log("font: found " + list[0].familyName + " / " + list[0].styleName + " ps=" + result.ps + " tech=" + list[0].technology + " file=" + list[0].location);
        } else {
            log("font: MISSING - " + family + " not in app.fonts (install the .otf for all users)");
        }
    } catch (e) {
        log("font: lookup threw " + e);
    }
    return result;
}

// ---------------------------------------------------------------- builders

function buildIconComp(folder, name, paths) {
    var comp = app.project.items.addComp("Icon - " + name, 16, 16, 1.0, CONFIG.duration, CONFIG.fps);
    comp.parentFolder = folder;
    var layer = addShapeLayer(comp, name);
    var n = addIcon(contentsOf(layer), name, paths, 0, 0);
    log("icon comp " + name + ": " + paths.length + " colour groups, " + n + " pixel runs");
    return comp;
}

function buildWindowComp(folder, title, iconName, iconPaths, font) {
    var W = CONFIG.winW, H = CONFIG.winH;
    var comp = app.project.items.addComp("Window - " + title, W, H, 1.0, CONFIG.duration, CONFIG.fps);
    comp.parentFolder = folder;

    // --- chrome: face + 2px outset bevel (React95 Frame "window":
    //     inset 1px 1px #dfdfdf, inset -1px -1px #000, inset 2px 2px #fff, inset -2px -2px #808080)
    var chrome = addShapeLayer(comp, "Chrome");
    var c = contentsOf(chrome);
    addRect(c, "face", 0, 0, W, H, COLOR.face);
    addRect(c, "bevel outer top", 0, 0, W, 1, COLOR.light);
    addRect(c, "bevel outer left", 0, 0, 1, H, COLOR.light);
    addRect(c, "bevel outer bottom", 0, H - 1, W, 1, COLOR.darkest);
    addRect(c, "bevel outer right", W - 1, 0, 1, H, COLOR.darkest);
    addRect(c, "bevel inner top", 1, 1, W - 2, 1, COLOR.lightest);
    addRect(c, "bevel inner left", 1, 1, 1, H - 2, COLOR.lightest);
    addRect(c, "bevel inner bottom", 1, H - 2, W - 2, 1, COLOR.shadow);
    addRect(c, "bevel inner right", W - 2, 1, 1, H - 2, COLOR.shadow);

    // --- title bar: 2px bevel + 2px padding = (4,4); 18px tall
    var bar = addShapeLayer(comp, "Title bar");
    var bc = contentsOf(bar);
    addRect(bc, "title bar", 4, 4, W - 8, 18, COLOR.titleActive);

    // --- close button: 14x12 at the bar's right edge, own 1px bevel, X glyph
    var btn = addShapeLayer(comp, "Close button");
    var kc = contentsOf(btn);
    var bx = W - 4 - 2 - 14, by = 6;
    addRect(kc, "face", bx, by, 14, 12, COLOR.face);
    addRect(kc, "top", bx, by, 14, 1, COLOR.lightest);
    addRect(kc, "left", bx, by, 1, 12, COLOR.lightest);
    addRect(kc, "bottom", bx, by + 11, 14, 1, COLOR.darkest);
    addRect(kc, "right", bx + 13, by, 1, 12, COLOR.darkest);
    addRect(kc, "bottom inner", bx + 1, by + 10, 12, 1, COLOR.shadow);
    addRect(kc, "right inner", bx + 12, by + 1, 1, 10, COLOR.shadow);
    addRuns(kc, "x glyph", "#000", CLOSE_GLYPH, bx + 3, by + 2);

    // --- icon in the title bar
    var icon = addShapeLayer(comp, "Icon - " + iconName);
    addIcon(contentsOf(icon), iconName, iconPaths, 6, 5);

    // --- title text
    var text = comp.layers.addText(title);
    text.name = "Title text";
    var tdProp = text.property("ADBE Text Properties").property("ADBE Text Document");
    var td = tdProp.value;
    var panelHad = resetTextDocument(td);
    if (font.obj !== null) {
        td.fontObject = font.obj;          // 24.0+: exact font, no name substitution
    } else if (font.ps !== null) {
        td.font = font.ps;
    } else {
        td.font = CONFIG.fontPostScript;   // not installed: AE substitutes silently; the log says MISSING
    }
    td.fontSize = CONFIG.fontSize;
    td.fillColor = rgb(COLOR.titleText);
    td.justification = ParagraphJustification.LEFT_JUSTIFY;
    tdProp.setValue(td);
    // point text anchors at the baseline-left; baseline ~ bar top + 13 for an 11px font
    text.property("ADBE Transform Group").property("ADBE Position").setValue([26, 4 + 13]);

    var used = tdProp.value;
    var r = text.sourceRectAtTime(0, false);
    var span = "n/a";
    try { var bl = used.baselineLocs; if (bl && bl.length >= 4) { span = (bl[2] - bl[0]).toFixed(2); } } catch (eb) {}
    log("text '" + title + "': font=" + used.font + " size=" + used.fontSize + " panel had [" + panelHad + "]" +
        " sourceRect w=" + r.width.toFixed(2) + " h=" + r.height.toFixed(2) + " top=" + r.top.toFixed(2) + " left=" + r.left.toFixed(2) +
        " advance span=" + span + " (font tables: My Computer=55.75, Notepad=36.74 at 11px)");

    return comp;
}

// top-left window coordinates -> layer position (precomp layers anchor at their centre)
function winPos(x, y) {
    return [x + CONFIG.winW / 2, y + CONFIG.winH / 2];
}

function buildScene(folder, myComputerComp, notepadComp) {
    var scene = app.project.items.addComp("Scene - Spike", CONFIG.sceneW, CONFIG.sceneH, 1.0, CONFIG.duration, CONFIG.fps);
    scene.parentFolder = folder;

    var desk = scene.layers.addSolid(rgb(COLOR.desktop), "Desktop", CONFIG.sceneW, CONFIG.sceneH, 1.0);
    desk.locked = true;

    // Layer A: My Computer, three hold-keyframed positions, visible 0..6s, UNDER Notepad
    var a = scene.layers.add(myComputerComp);
    a.name = "My Computer";
    holdKeys(a.property("ADBE Transform Group").property("ADBE Position"),
             [0, 2, 4],
             [winPos(50, 40), winPos(160, 100), winPos(230, 30)]);
    a.inPoint = 0;
    a.outPoint = 6;
    a.label = 9;
    a.comment = "win:my-computer";

    // Notepad, static, whole duration, overlaps My Computer's third position
    var np = scene.layers.add(notepadComp);
    np.name = "Notepad";
    np.property("ADBE Transform Group").property("ADBE Position").setValue(winPos(150, 80));
    np.label = 11;
    np.comment = "win:notepad";

    // Raise at t=6: layer.index cannot be keyframed, so split. Same source, new layer on top.
    var a2 = scene.layers.add(myComputerComp);
    a2.name = "My Computer (raised @6s)";
    a2.startTime = 6;                       // precomp time restarts at the split
    a2.inPoint = 6;
    a2.outPoint = CONFIG.duration;
    holdKeys(a2.property("ADBE Transform Group").property("ADBE Position"), [6], [winPos(230, 30)]);
    a2.moveToBeginning();
    a2.label = 9;
    a2.comment = "win:my-computer";

    log("scene: " + scene.numLayers + " layers; A keys=" + a.property("ADBE Transform Group").property("ADBE Position").numKeys +
        " A.out=" + a.outPoint + " A2.in=" + a2.inPoint + " A2.index=" + a2.index + " Notepad.index=" + np.index + " A.index=" + a.index);
    return scene;
}

// ---------------------------------------------------------------- main

function main() {
    var started = new Date();
    log("window-roundtrip.jsx  " + started.toString());
    log("app.version=" + app.version + "  parseFloat=" + parseFloat(app.version) + "  buildName=" + app.buildName + "  lang=" + app.isoLanguage);

    var outDir = Folder.selectDialog("Choose an OUTPUT folder for the spike (.aep + spike-log.txt). Pick one outside the repo.");
    if (outDir === null) { alert("Cancelled: no output folder."); return; }
    log("outDir=" + outDir.fsName);

    if (CONFIG.packageMode) {
        app.newProject();               // prompts to save the open project if it is dirty
        log("packageMode: new project");
    }
    app.beginUndoGroup("Win95 spike");

    var font = findFont(CONFIG.fontFamily, CONFIG.fontStyle);

    var root = app.project.items.addFolder("Win95 Assets");
    var run = app.project.items.addFolder("Spike 2026-09-07");
    run.parentFolder = root;
    var winFolder = app.project.items.addFolder("Windows");  winFolder.parentFolder = run;
    var iconFolder = app.project.items.addFolder("Icons");   iconFolder.parentFolder = run;

    buildIconComp(iconFolder, "Computer3", ICONS.Computer3_16);
    buildIconComp(iconFolder, "Notepad", ICONS.Notepad_16);

    var myComputer = buildWindowComp(winFolder, "My Computer", "Computer3", ICONS.Computer3_16, font);
    var notepad = buildWindowComp(winFolder, "Notepad", "Notepad", ICONS.Notepad_16, font);
    var scene = buildScene(run, myComputer, notepad);
    scene.openInViewer();

    app.endUndoGroup();
    log("built: project has " + app.project.numItems + " items");

    if (CONFIG.packageMode) {
        var aep = new File(outDir.fsName + "/Win95Assets-spike.aep");
        app.project.save(aep);
        log("saved " + aep.fsName + " (" + aep.length + " bytes)");

        // Round trip: brand-new project, import the .aep as a project -> lands as a folder
        app.newProject();
        var io = new ImportOptions(aep);
        io.importAs = ImportAsType.PROJECT;
        var imported = app.project.importFile(io);
        log("re-imported: item='" + imported.name + "' type=" + imported.typeName + "; project now has " + app.project.numItems + " items");
        // open the scene comp from the imported copy so the result is visible immediately
        for (var i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (it instanceof CompItem && it.name === "Scene - Spike") { it.openInViewer(); break; }
        }
    }

    var ended = new Date();
    log("done in " + (ended.getTime() - started.getTime()) + " ms");

    var logFile = new File(outDir.fsName + "/spike-log.txt");
    logFile.encoding = "UTF-8";
    var wrote = logFile.open("w") && logFile.write(LOG.join("\n")) && logFile.close();
    if (!wrote) { log("WARNING: could not write spike-log.txt (enable Preferences > Scripting & Expressions > Allow Scripts to Write Files)"); }

    alert(LOG.join("\n"));
}

try {
    main();
} catch (err) {
    alert("Spike FAILED\n" + err.toString() + "\nline " + err.line + "\n\nlog so far:\n" + LOG.join("\n"));
}
