// text-metrics.jsx - diagnostic for the W95FA width mismatch found by window-roundtrip.jsx
//
// Run 1 of the spike measured "My Computer" at 11 px as 66.03 px wide in AE, while the font's
// own advance widths (and Chrome) say 55.75 px. This script isolates what AE is doing:
//   - "M", "MM", "MMMM": the differences give the per-glyph advance AE actually uses
//     (font says 7.26 px per M at 11 px). +1 px per glyph = tracking-like; x1.18 = scaling.
//   - Arial as a control font ("M" = 9.16 px, "MM" = 18.33, "MMMM" = 36.65, "My Computer" = 66.02,
//     "Notepad" = 41.59 at 11 px, from arial.ttf's hmtx). NOTE: Arial's "My Computer" = 66.02 is
//     within 0.01 px of what run 1 measured for the "W95FA" layer, so the leading suspicion is
//     that AE drew Arial while reporting W95FA. If the W95FA rows below equal the Arial rows,
//     that is confirmed.
//   - explicit tracking 0 vs 100, and auto-kern OFF vs METRIC, to see which setting moves it.
//   - TextDocument.baselineLocs (advance-based) beside sourceRectAtTime (ink-based).
// Builds into the OPEN project (one throwaway comp), no save. ES3.

#target aftereffects

var FONTS = [
    { label: "W95FA", ps: "W95FARegular" },
    { label: "Arial", ps: "ArialMT" }
];
var STRINGS = ["M", "MM", "MMMM", "My Computer", "Notepad"];
var SIZE = 11;

// Run 2 (2026-09-07 01:55) showed M/MM/MMMM exact (7.26 px each) but "My Computer" 67.09 vs 55.75
// expected, so the extra width sits in other glyphs. Per-glyph pass: AE advance = (span(ccc)-span(c))/2,
// compared with hmtx advances from the OTF (units/1000 em): M660 y429 space219 C580 o500 m660 p500
// u500 t260 e500 r260 N580 a500 d500.
var GLYPHS = [
    { c: "M", u: 660 }, { c: "N", u: 580 }, { c: "C", u: 580 }, { c: "y", u: 429 }, { c: " ", u: 219 },
    { c: "o", u: 500 }, { c: "m", u: 660 }, { c: "p", u: 500 }, { c: "u", u: 500 }, { c: "t", u: 260 },
    { c: "e", u: 500 }, { c: "r", u: 260 }, { c: "a", u: 500 }, { c: "d", u: 500 }
];

var LOG = [];
function log(s) { LOG.push(String(s)); }

// Run 3 root cause: addText() inherits the Character panel state, and All Caps was on, so every
// lowercase glyph got its uppercase advance. Reset EVERY inheritable attribute before setting ours.
// Returns a short description of what the panel had, for the log.
function resetTextDocument(td) {
    var before = "";
    try { before += "caps=" + td.fontCapsOption + " "; } catch (e0) { before += "caps=n/a "; }
    try { before += "hScale=" + td.horizontalScale + " vScale=" + td.verticalScale + " bshift=" + td.baselineShift + " "; } catch (e1) {}
    try { before += "fauxB=" + td.fauxBold + " fauxI=" + td.fauxItalic + " "; } catch (e2) {}
    try { before += "stroke=" + td.applyStroke + " tsume=" + td.tsume + " lig=" + td.ligature; } catch (e3) {}
    try { td.fontCapsOption = FontCapsOption.FONT_NORMAL_CAPS; } catch (r0) {}
    // FRACTIONS, not percentages: 1 = 100%. See run 4.
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

function fontObj(ps) {
    try {
        var list = app.fonts.getFontsByPostScriptName(ps);
        return list.length > 0 ? list[0] : null;
    } catch (e) { return null; }
}

// returns the baseline span (advance-based width) or -1
function spanOf(comp, font, str, size) {
    var layer = comp.layers.addText(str);
    var tdProp = layer.property("ADBE Text Properties").property("ADBE Text Document");
    var td = tdProp.value;
    resetTextDocument(td);
    var fo = fontObj(font.ps);
    if (fo !== null) { td.fontObject = fo; } else { td.font = font.ps; }
    td.fontSize = size;
    td.justification = ParagraphJustification.LEFT_JUSTIFY;
    tdProp.setValue(td);
    var span = -1;
    try { var l = tdProp.value.baselineLocs; if (l && l.length >= 4) { span = l[2] - l[0]; } } catch (e2) {}
    layer.remove();
    return span;
}

function measure(comp, font, str, tracking, kernMode) {
    var layer = comp.layers.addText(str);
    var tdProp = layer.property("ADBE Text Properties").property("ADBE Text Document");
    var td = tdProp.value;
    var panel = resetTextDocument(td);
    var fo = fontObj(font.ps);
    if (fo !== null) { td.fontObject = fo; } else { td.font = font.ps; }
    td.fontSize = SIZE;
    td.tracking = tracking;
    td.fillColor = [1, 1, 1];
    td.justification = ParagraphJustification.LEFT_JUSTIFY;
    var kernNote = "n/a";
    try {
        if (kernMode === "off") { td.autoKernType = AutoKernType.NO_AUTO_KERN; kernNote = "NO_AUTO_KERN"; }
        else if (kernMode === "metric") { td.autoKernType = AutoKernType.METRIC_KERN; kernNote = "METRIC_KERN"; }
    } catch (e) { kernNote = "autoKernType unsupported: " + e; }
    tdProp.setValue(td);

    var back = tdProp.value;
    var r = layer.sourceRectAtTime(0, false);
    var bl = "n/a";
    try {
        var locs = back.baselineLocs;   // [x0,y0,x1,y1, ...] per line, layer space
        if (locs && locs.length >= 4) { bl = (locs[2] - locs[0]).toFixed(2); }
    } catch (e2) { bl = "unsupported"; }
    var capsNow = "n/a"; try { capsNow = String(back.fontCapsOption); } catch (e3) {}
    log(font.label + " | '" + str + "' | panel had [" + panel + "] now caps=" + capsNow + " | tracking=" + back.tracking + " kern=" + kernNote +
        " | font=" + back.font + " size=" + back.fontSize +
        " | sourceRect w=" + r.width.toFixed(2) + " left=" + r.left.toFixed(2) + " h=" + r.height.toFixed(2) +
        " | baseline span=" + bl);
    layer.remove();
}

function main() {
    log("text-metrics.jsx  " + new Date().toString());
    log("app.version=" + app.version);
    var comp = app.project.items.addComp("Text metrics (delete me)", 640, 120, 1.0, 1, 30);
    app.beginUndoGroup("Text metrics");

    for (var f = 0; f < FONTS.length; f++) {
        var found = fontObj(FONTS[f].ps);
        log("--- " + FONTS[f].label + ": " + (found ? "found " + found.familyName + "/" + found.styleName : "NOT FOUND, will substitute"));
        for (var s = 0; s < STRINGS.length; s++) {
            measure(comp, FONTS[f], STRINGS[s], 0, "off");
        }
        // settings sweep on one string
        measure(comp, FONTS[f], "My Computer", 0, "metric");
        measure(comp, FONTS[f], "My Computer", 0, "none");
        measure(comp, FONTS[f], "My Computer", 100, "off");
        measure(comp, FONTS[f], "My Computer", -100, "off");
    }

    // per-glyph advances in W95FA at 11 px and at 100 px
    var w95 = FONTS[0];
    var sizes = [11, 100];
    for (var si = 0; si < sizes.length; si++) {
        var sz = sizes[si];
        log("--- W95FA per-glyph advances at " + sz + " px (AE vs hmtx)");
        var sumAE = 0, sumFont = 0;
        for (var g = 0; g < GLYPHS.length; g++) {
            var one = spanOf(comp, w95, GLYPHS[g].c, sz);
            var three = spanOf(comp, w95, GLYPHS[g].c + GLYPHS[g].c + GLYPHS[g].c, sz);
            var adv = (three - one) / 2;
            var expect = GLYPHS[g].u * sz / 1000;
            log("'" + (GLYPHS[g].c === " " ? "space" : GLYPHS[g].c) + "' AE=" + adv.toFixed(2) + " font=" + expect.toFixed(2) +
                " diff=" + (adv - expect).toFixed(2) + " ratio=" + (adv / expect).toFixed(3) + " (single span=" + one.toFixed(2) + ")");
        }
        log("'My Computer' span at " + sz + " px: AE=" + spanOf(comp, w95, "My Computer", sz).toFixed(2) + " font=" + (5068 * sz / 1000).toFixed(2));
        log("'Notepad' span at " + sz + " px: AE=" + spanOf(comp, w95, "Notepad", sz).toFixed(2) + " font=" + (3340 * sz / 1000).toFixed(2));
    }
    app.endUndoGroup();

    var out = new File(Folder.desktop.fsName + "/text-metrics-log.txt");
    out.encoding = "UTF-8";
    if (out.open("w")) { out.write(LOG.join("\n")); out.close(); log("wrote " + out.fsName); }
    else { log("could not write log file"); }
    alert(LOG.join("\n"));
}

try { main(); } catch (err) { alert("text-metrics FAILED\n" + err.toString() + "\nline " + err.line + "\n\n" + LOG.join("\n")); }
