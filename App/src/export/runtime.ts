/**
 * The ExtendScript (ES3) runtime shared by every generated script.
 *
 * This is source code held as a string. It is emitted verbatim into each `.jsx` the studio
 * produces, above the generated data. Keeping it here — rather than duplicating it into each
 * generator — means the AE-side logic has exactly one definition.
 *
 * Everything in it is ES3: `var` only, no arrow functions, no `Array.prototype.map`/`forEach`,
 * no `JSON`, no trailing commas, no template literals.
 *
 * The behaviour encoded here is not guesswork — it is what
 * `Scripts/spike/window-roundtrip.jsx` established against a real After Effects 27.0 beta, and
 * the findings in research note 07. Three of those findings are load-bearing:
 *
 *  1. `addText()` inherits the user's live Character panel. Kyle's had All Caps and a stroke on,
 *     which silently rendered every title in uppercase and 2 px wider. Every inheritable
 *     TextDocument attribute must be reset explicitly. See resetTextDocument below.
 *  2. `horizontalScale` / `verticalScale` are **fractions** (1 = 100%), not percentages. The
 *     scripting guide says "in pixels", which is wrong. Setting them to 100 makes text 100x too
 *     big — measured at exactly 100.000x.
 *  3. Shape coordinates equal comp pixels only when the shape layer's Position is [0,0];
 *     precomp layers placed in a parent comp are centre-anchored instead.
 */

export const ES3_RUNTIME = `
// ---------------------------------------------------------------- logging

var LOG = [];
function log(s) { LOG.push(String(s)); }

function writeLog(folder, filename) {
    var f = new File(folder.fsName + "/" + filename);
    f.encoding = "UTF-8";
    if (f.open("w")) { f.write(LOG.join("\\n")); f.close(); return true; }
    return false;
}

// ---------------------------------------------------------------- shape helpers
//
// A shape layer's root is layer.property("ADBE Root Vectors Group"); each "ADBE Vector Group"
// holds its own contents at property("ADBE Vectors Group"). The scripting guide warns that
// adding a property to an indexed group invalidates existing sibling references, so nothing
// here holds a reference across an addProperty on the same group.

function addShapeLayer(comp, name) {
    var layer = comp.layers.addShape();
    layer.name = name;
    // Position [0,0] is what makes shape coordinates identical to comp pixel coordinates.
    layer.property("ADBE Transform Group").property("ADBE Position").setValue([0, 0]);
    return layer;
}

function contentsOf(layer) {
    return layer.property("ADBE Root Vectors Group");
}

// One group per colour holding N rectangles and a single fill. Rect paths in AE are
// centre-anchored, so position is the centre, not the top-left corner.
function addColorGroup(contents, name, rgb, rects) {
    var grp = contents.addProperty("ADBE Vector Group");
    grp.name = name;
    var gc = grp.property("ADBE Vectors Group");
    for (var i = 0; i < rects.length; i++) {
        var r = rects[i];               // [x, y, w, h]
        var rect = gc.addProperty("ADBE Vector Shape - Rect");
        rect.property("ADBE Vector Rect Size").setValue([r[2], r[3]]);
        rect.property("ADBE Vector Rect Position").setValue([r[0] + r[2] / 2, r[1] + r[3] / 2]);
    }
    var fill = gc.addProperty("ADBE Vector Graphic - Fill");
    fill.property("ADBE Vector Fill Color").setValue(rgb);
    return rects.length;
}

// Build one comp per asset: the "every asset is its own comp" pillar.
function buildAssetComp(folder, asset, fps, duration) {
    var comp = app.project.items.addComp(asset.n, asset.w, asset.h, 1.0, duration, fps);
    comp.parentFolder = folder;
    var layer = addShapeLayer(comp, asset.n);
    var contents = contentsOf(layer);
    var total = 0;
    for (var i = 0; i < asset.l.length; i++) {
        total += addColorGroup(contents, asset.l[i].k, asset.l[i].c, asset.l[i].r);
    }
    return { comp: comp, shapes: total };
}

// ---------------------------------------------------------------- footage assets
//
// The default package format. Each asset's PNG is copied next to the .aep and imported as
// footage, then wrapped in a comp so that "every asset is its own comp" still holds and the
// scene script can resolve it by the same name as the shape route.
//
// Pixel-exact where the shape route is not: rendering a shape-built icon and comparing against
// the package's own PNG showed 99 of 256 pixels differing and 31 colours where the source has 7,
// because After Effects anti-aliases dense shape geometry. The PNG route differs in 0 pixels.

// Copy one file, returning the destination File or null.
function copyAsset(sourceDir, destDir, name) {
    var source = new File(sourceDir + "/" + name);
    if (!source.exists) { return null; }
    var dest = new File(destDir.fsName + "/" + name);
    if (!source.copy(dest)) { return null; }
    return dest;
}

// Import a PNG as footage and wrap it in a comp of exactly its own size, so the comp is a 1:1
// container and nothing is scaled.
function buildFootageComp(folder, compName, file, fps, duration) {
    var footage = app.project.importFile(new ImportOptions(file));
    footage.parentFolder = folder;
    var comp = app.project.items.addComp(compName, footage.width, footage.height, 1.0, duration, fps);
    comp.parentFolder = folder;
    comp.layers.add(footage);
    return comp;
}

// ---------------------------------------------------------------- text
//
// Finding 1 above. addText() adopts whatever the Character panel currently has, so every
// inheritable attribute is reset before the script sets its own. The 24.0+ fields are wrapped
// individually because an older AE throws on assignment rather than ignoring it.
function resetTextDocument(td) {
    try { td.fontCapsOption = FontCapsOption.FONT_NORMAL_CAPS; } catch (e1) {}
    td.horizontalScale = 1;   // FRACTIONS, not percentages -- finding 2
    td.verticalScale = 1;
    td.baselineShift = 0;
    td.tsume = 0;
    td.tracking = 0;
    td.autoLeading = true;
    td.applyStroke = false;
    td.applyFill = true;
    try { td.fauxBold = false; td.fauxItalic = false; } catch (e2) {}
    try { td.ligature = false; } catch (e3) {}
    try { td.autoKernType = AutoKernType.NO_AUTO_KERN; } catch (e4) {}
}

// Returns a FontObject when AE 24+ can find the font, else null and the caller falls back to
// setting TextDocument.font by PostScript name (which silently substitutes if absent).
function findFont(postScriptName) {
    if (parseFloat(app.version) < 24) { return null; }
    try {
        var list = app.fonts.getFontsByPostScriptName(postScriptName);
        if (list.length > 0) { return list[0]; }
    } catch (e) {}
    return null;
}

function addTextLayer(comp, str, postScriptName, fontObj, size, rgb, x, baselineY) {
    var layer = comp.layers.addText(str);
    var prop = layer.property("ADBE Text Properties").property("ADBE Text Document");
    var td = prop.value;
    resetTextDocument(td);
    if (fontObj !== null) { td.fontObject = fontObj; } else { td.font = postScriptName; }
    td.fontSize = size;
    td.fillColor = rgb;
    td.justification = ParagraphJustification.LEFT_JUSTIFY;
    prop.setValue(td);
    // Point text anchors at the baseline-left, so y is the baseline, not the box top.
    layer.property("ADBE Transform Group").property("ADBE Position").setValue([x, baselineY]);
    return layer;
}

// ---------------------------------------------------------------- placement

// A precomp layer is centre-anchored in its parent, but scenes are authored in top-left
// coordinates. This is the only conversion between the two.
function centreOf(x, y, w, h) {
    return [x + w / 2, y + h / 2];
}

// ---------------------------------------------------------------- project lookup

function findFolder(name) {
    for (var i = 1; i <= app.project.numItems; i++) {
        var it = app.project.item(i);
        if (it instanceof FolderItem && it.name === name) { return it; }
    }
    return null;
}

// Depth-first search for a comp by name, used by the scene script to resolve assets that came
// from a previously imported package .aep.
function findComp(name) {
    for (var i = 1; i <= app.project.numItems; i++) {
        var it = app.project.item(i);
        if (it instanceof CompItem && it.name === name) { return it; }
    }
    return null;
}

// ---------------------------------------------------------------- unattended safety
//
// app.beginSuppressDialogs() stops After Effects putting up modal dialogs. That matters for a
// run started by "AfterFX.com -r": nobody is watching the application, so a dialog would hang
// the build until someone noticed and dismissed it. endSuppressDialogs(false) restores normal
// behaviour without showing a summary alert.
//
// Only used for unattended runs. An interactive run should keep its dialogs.
//
// (Research note 07 suggested app.beginSuppressPanelRefresh() as a speed lever for large builds.
// Probed against After Effects 27.0x37: it does not exist -- "ReferenceError: Function
// app.beginSuppressPanelRefresh is undefined". It was never needed; the measured build rate is
// 526 shapes/second without it.)
function suppressDialogs(on) {
    try {
        if (on) { app.beginSuppressDialogs(); } else { app.endSuppressDialogs(false); }
        return true;
    } catch (e) { return false; }
}
`
