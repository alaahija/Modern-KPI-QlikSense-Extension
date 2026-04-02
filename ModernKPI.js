define(["qlik", "jquery", "text!./style.css"], function (qlik, $, cssContent) {

    /**
     * @file ModernKPI.js
     * @description A modern, customizable KPI card extension for Qlik Sense.
     * @author Ala Aldin Hija
     * @version 2.1.0
     * @license MIT
     */

    // ============================================
    // CSS INJECTION (guarded — inject once globally)
    // ============================================
    if (!document.getElementById("modern-kpi-ext-styles")) {
        $("<style>")
            .attr("id", "modern-kpi-ext-styles")
            .html(cssContent)
            .appendTo("head");
    }

    // ============================================
    // SECTION 1: UTILITY FUNCTIONS
    // Colors, formatting, escaping, expression parsing, animation
    // ============================================

    function fixColor(val, fallback) {
        if (fallback === undefined) fallback = "#cccccc";
        if (val === null || val === undefined) return fallback;
        if (typeof val === "string") { var trimmed = val.trim(); if (trimmed !== "") return trimmed; }
        if (typeof val === "object") {
            if (val.color !== undefined && typeof val.color === "string" && val.color.trim() !== "") return val.color.trim();
            if (val.hex !== undefined && typeof val.hex === "string" && val.hex.trim() !== "") return val.hex.trim();
            if (val.qString !== undefined && typeof val.qString === "string" && val.qString.trim() !== "") return val.qString.trim();
            if (val.value !== undefined && typeof val.value === "string" && val.value.trim() !== "") return val.value.trim();
            try { var jsonStr = JSON.stringify(val); if (jsonStr.indexOf('"color"') >= 0 || jsonStr.indexOf('"hex"') >= 0) { var parsed = JSON.parse(jsonStr); if (parsed.color) return parsed.color.trim(); if (parsed.hex) return parsed.hex.trim(); } } catch (_) {}
        }
        return fallback;
    }

    function getContrastColor(bgColor) {
        if (!bgColor) return "#222222";
        var hex = bgColor.replace("#", "");
        if (hex.length !== 6) return "#222222";
        var r = parseInt(hex.substr(0, 2), 16), g = parseInt(hex.substr(2, 2), 16), b = parseInt(hex.substr(4, 2), 16);
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5 ? "#ffffff" : "#222222";
    }

    function formatAsDuration(num, pattern) {
        var isNeg = num < 0, absVal = Math.abs(num), totalSeconds = Math.round(absVal * 86400);
        var hasBracketH = /\[h+\]/i.test(pattern), hasDays = /D/i.test(pattern);
        var days = 0, hours = 0, minutes = 0, seconds = 0;
        if (hasBracketH) { hours = Math.floor(totalSeconds / 3600); minutes = Math.floor((totalSeconds % 3600) / 60); seconds = totalSeconds % 60; }
        else if (hasDays) { days = Math.floor(totalSeconds / 86400); hours = Math.floor((totalSeconds % 86400) / 3600); minutes = Math.floor((totalSeconds % 3600) / 60); seconds = totalSeconds % 60; }
        else { hours = Math.floor(totalSeconds / 3600); minutes = Math.floor((totalSeconds % 3600) / 60); seconds = totalSeconds % 60; }
        var result = pattern;
        result = result.replace(/\[hh\]/gi, String(hours).padStart(2, '0')); result = result.replace(/\[h\]/gi, String(hours));
        result = result.replace(/DD/g, String(days).padStart(2, '0')); result = result.replace(/D/g, String(days));
        if (!hasBracketH) { result = result.replace(/hh/gi, String(hours).padStart(2, '0')); result = result.replace(/\bh\b/gi, String(hours)); }
        result = result.replace(/mm/g, String(minutes).padStart(2, '0')); result = result.replace(/\bm\b/g, String(minutes));
        result = result.replace(/ss/g, String(seconds).padStart(2, '0')); result = result.replace(/\bs\b/g, String(seconds));
        return (isNeg ? "-" : "") + result;
    }

    function isTimePattern(pattern) { if (!pattern) return false; return /\bh\b|hh|\[h|:mm|:ss|:m\b|:s\b/i.test(pattern.trim()) && !/#|0/.test(pattern.trim()); }

    function formatWithQlikPattern(num, pattern) {
        if (!pattern || pattern.trim() === "") return num.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
        var cleanPattern = pattern.trim();
        if (isTimePattern(cleanPattern)) return formatAsDuration(num, cleanPattern);
        var parts = cleanPattern.split(';'), positivePattern = parts[0] || cleanPattern, negativePattern = parts[1] || positivePattern;
        var usePattern = num < 0 ? negativePattern : positivePattern;
        var decimalMatch = usePattern.match(/\.(0+)/), decimalPlaces = decimalMatch ? decimalMatch[1].length : 0;
        var hasThousands = usePattern.indexOf(',') >= 0, formatted = Math.abs(num).toFixed(decimalPlaces);
        if (hasThousands) { var numParts = formatted.split('.'); numParts[0] = numParts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ','); formatted = numParts.join('.'); }
        var prefixMatch = usePattern.match(/^([^#0]*)/), prefix = prefixMatch ? prefixMatch[1] : '';
        var numericEndMatch = usePattern.match(/([#0.,]+)([^#0.,]*)$/), suffix = numericEndMatch && numericEndMatch[2] ? numericEndMatch[2] : '';
        return prefix + formatted + suffix;
    }

    function formatNumber(val, type, symbol, customMask) {
        if (val === null || val === undefined || isNaN(val)) return "-";
        var num = typeof val === "number" ? val : parseFloat(val); if (isNaN(num)) return "-";
        switch (type) {
            case "k": return (num / 1000).toFixed(2) + "K"; case "m": return (num / 1e6).toFixed(2) + "M"; case "b": return (num / 1e9).toFixed(2) + "B";
            case "km": if (Math.abs(num) >= 1e9) return (num / 1e9).toFixed(2) + "B"; if (Math.abs(num) >= 1e6) return (num / 1e6).toFixed(2) + "M"; if (Math.abs(num) >= 1000) return (num / 1000).toFixed(2) + "K"; return num.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
            case "currency": return (symbol || "$") + num.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
            case "percent": return (num * 100).toFixed(1) + "%";
            case "custom": if (customMask && customMask.trim() !== "") return formatWithQlikPattern(num, customMask); return num.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
            default: return num.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
        }
    }

    function getValueColor(colorInput, fallbackColor, autoContrast, bgColor) {
        var resolved = fixColor(colorInput, null); if (resolved) return resolved;
        if (autoContrast && bgColor) return getContrastColor(bgColor);
        return fixColor(fallbackColor, "#222222");
    }

    function escapeHtml(str) { return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

    function extractStringLiteral(expr) {
        if (!expr || typeof expr !== "string") return null;
        var trimmed = expr.trim(), withoutEquals = trimmed.charAt(0) === "=" ? trimmed.substring(1).trim() : trimmed;
        if ((withoutEquals.charAt(0) === "'" && withoutEquals.charAt(withoutEquals.length - 1) === "'") || (withoutEquals.charAt(0) === '"' && withoutEquals.charAt(withoutEquals.length - 1) === '"')) return withoutEquals.substring(1, withoutEquals.length - 1);
        return null;
    }

    var QLIK_EXPR_RE = /Date\(|AddMonths\(|Today\(|Sum\(|Count\(|Avg\(|Max\(|Min\(|If\(|Match\(|SubString\(/i;

    function parseTitleExpression(titleRaw) {
        var result = { displayText: titleRaw || "", expression: null, needsEval: false };
        if (typeof titleRaw !== "string" || titleRaw.trim() === "") return result;
        var trimmed = titleRaw.trim();
        var literal = extractStringLiteral(trimmed); if (literal !== null) { result.displayText = literal; return result; }
        if (trimmed.charAt(0) === "=") { var inner = trimmed.substring(1).trim(); var nestedLiteral = extractStringLiteral(inner); if (nestedLiteral !== null) { result.displayText = nestedLiteral; return result; } result.displayText = ""; result.expression = inner; result.needsEval = true; return result; }
        if (QLIK_EXPR_RE.test(trimmed)) { result.displayText = ""; result.expression = trimmed; result.needsEval = true; return result; }
        if (/[&|]/.test(trimmed) && trimmed.length > 3) { result.displayText = ""; result.expression = trimmed; result.needsEval = true; return result; }
        return result;
    }

    function ensureMeasureStructure(measure) {
        var defaultNumFormat = { qType: "U", qUseThou: 0, qFmt: "", qDec: "", qThou: "" };
        var defaultSortBy = { qSortByNumeric: 1, qSortByAscii: 1, qSortByLoadOrder: 1 };
        if (!measure) return { qDef: { qDef: "", qLabel: "", qNumFormat: defaultNumFormat }, qLibraryId: "", qValueExpression: { qv: "" }, qSortBy: defaultSortBy };
        if (!measure.qDef) { measure.qDef = { qDef: "", qLabel: "", qNumFormat: defaultNumFormat }; }
        else { if (typeof measure.qDef.qDef === 'undefined') measure.qDef.qDef = ""; if (typeof measure.qDef.qLabel === 'undefined') measure.qDef.qLabel = ""; if (measure.qDef.hasOwnProperty('qValueExpression')) delete measure.qDef.qValueExpression; if (!measure.qDef.qNumFormat || typeof measure.qDef.qNumFormat !== 'object') measure.qDef.qNumFormat = defaultNumFormat; }
        if (typeof measure.qLibraryId === 'undefined') measure.qLibraryId = "";
        if (!measure.qSortBy) measure.qSortBy = defaultSortBy;
        if (measure.hasOwnProperty('qAttributeExpressions') && !Array.isArray(measure.qAttributeExpressions)) measure.qAttributeExpressions = [];
        if (measure.hasOwnProperty('qAttributeDimensions') && !Array.isArray(measure.qAttributeDimensions)) measure.qAttributeDimensions = [];
        if (!measure.qValueExpression || typeof measure.qValueExpression !== 'object') measure.qValueExpression = { qv: "" };
        return measure;
    }

    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

    function animateCountUp(el, endVal, duration, formatFn, finalText) {
        if (!el || isNaN(endVal)) return;
        var prevVal = parseFloat(el.getAttribute('data-anim-prev')) || 0;
        if (prevVal === endVal) { if (finalText) el.textContent = finalText; return; }
        el.setAttribute('data-anim-prev', endVal);
        var startTime = null, dur = duration || 600, exact = finalText || formatFn(endVal);
        function step(timestamp) { if (!startTime) startTime = timestamp; var elapsed = timestamp - startTime, progress = Math.min(elapsed / dur, 1), easedProgress = easeOutCubic(progress); if (progress < 1) { el.textContent = formatFn(prevVal + (endVal - prevVal) * easedProgress); requestAnimationFrame(step); } else { el.textContent = exact; } }
        requestAnimationFrame(step);
    }

    // ============================================
    // SECTION 2: HTML BUILDERS
    // Arrow, mini chart SVG, comparison block
    // ============================================

    function buildArrow(arrowExpr, colorExpr, fallbackValue, layout, showArrows, posColor, negColor, invertLogic) {
        if (arrowExpr && arrowExpr.trim() !== "") { var col = colorExpr && colorExpr.trim() !== "" ? colorExpr.trim() : fixColor(layout.props.textColor, "#222222"); return '<span class="comp-arrow" style="color:' + col + '">' + arrowExpr.trim() + '</span>'; }
        if (!showArrows) return "";
        if (fallbackValue > 0) return '<span class="comp-arrow" style="color:' + (invertLogic ? fixColor(negColor, "#e04e4e") : fixColor(posColor, "#21a46f")) + '">↑</span>';
        if (fallbackValue < 0) return '<span class="comp-arrow" style="color:' + (invertLogic ? fixColor(posColor, "#21a46f") : fixColor(negColor, "#e04e4e")) + '">↓</span>';
        return "";
    }

    function buildMiniChart(layout, matrix, chartColIndex, dimIndex, xAxisColIndex, containerWidth, secondSeriesColIndex) {
        if (!matrix || !matrix.length) return "";
        var values = matrix.map(function (row) { return row[chartColIndex] ? row[chartColIndex].qNum : NaN; }).filter(function (v) { return typeof v === "number" && !isNaN(v); });
        if (!values.length) return "";
        var hasSecondSeries = layout.props.enableSecondSeries === true && secondSeriesColIndex !== null;
        var values2 = hasSecondSeries ? matrix.map(function (row) { return row[secondSeriesColIndex] ? row[secondSeriesColIndex].qNum : NaN; }).filter(function (v) { return typeof v === "number" && !isNaN(v); }) : [];
        var secondSeriesColor = hasSecondSeries ? fixColor(layout.props.secondSeriesColor, "#ff7043") : "#ff7043";
        var max = Math.max.apply(null, values.concat(values2.length ? values2 : [0]));
        if (max === 0) return "";
        var chartColor = layout.props.chartColor ? fixColor(layout.props.chartColor, "#6aa7ff") : "#6aa7ff";
        var count = values.length, chartType = layout.props.chartType || "bar", isLine = chartType === "line", isSparkline = chartType === "sparkline";
        var lineWidth = Math.max(0.5, Math.min(10, layout.props.chartLineWidth || 2));
        var showXAxis = layout.props.showXAxis === true && !isSparkline, xAxisFontSize = layout.props.xAxisFontSize || 10;
        var hasDim = dimIndex !== null, hasXAxisMeasure = xAxisColIndex !== null && layout.props.xAxisMeasure;
        var mode = layout.props.bottomSectionMode || "comparison", isBothMode = mode === "both";
        var userHeight = layout.props.chartHeight, svgHeight = (userHeight && userHeight > 0) ? userHeight : (isBothMode ? 50 : 70);
        var svg, i, x, y;
        if (isSparkline) {
            var sparkChartH = 40, sparkH = (userHeight && userHeight > 0) ? userHeight : (isBothMode ? 24 : 30);
            var sparkLineW = Math.max(0.5, Math.min(4, lineWidth)), padding = 2;
            svg = '<svg class="miniChart miniChart-sparkline" viewBox="0 0 100 ' + sparkChartH + '" preserveAspectRatio="none" style="height:' + sparkH + 'px;" xmlns="http://www.w3.org/2000/svg">';
            var minVal = Math.min.apply(null, values), range = max - minVal || 1, pts = [];
            for (i = 0; i < count; i++) { x = count > 1 ? (i / (count - 1)) * 100 : 50; y = padding + (sparkChartH - 2 * padding) - ((values[i] - minVal) / range * (sparkChartH - 2 * padding)); pts.push({ x: x, y: y }); }
            var sparkPath = pts.map(function (p, idx) { return (idx === 0 ? "M" : "L") + " " + p.x + " " + p.y; }).join(" ");
            svg += '<path d="' + sparkPath + '" stroke="' + chartColor + '" stroke-width="' + sparkLineW + '" fill="none" vector-effect="non-scaling-stroke" style="stroke-linecap:round;stroke-linejoin:round;"/>';
            var lastPt = pts[pts.length - 1];
            svg += '<circle cx="' + lastPt.x + '" cy="' + lastPt.y + '" r="2" fill="' + chartColor + '" stroke="none" vector-effect="non-scaling-stroke"/>';
            svg += '</svg>'; return svg;
        } else if (isLine) {
            var lineChartH = 100;
            svg = '<svg class="miniChart" viewBox="0 0 100 ' + lineChartH + '" preserveAspectRatio="none" style="height:' + svgHeight + 'px;" xmlns="http://www.w3.org/2000/svg">';
            svg += '<line class="miniChart-hover-line" x1="0" y1="0" x2="0" y2="' + lineChartH + '" stroke="#666666" stroke-width="1.5" vector-effect="non-scaling-stroke"/>';
            var points = [];
            for (i = 0; i < count; i++) { x = count > 1 ? (i / (count - 1)) * 100 : 50; y = lineChartH - (values[i] / max * lineChartH); points.push({ x: x, y: y }); }
            var linePath = points.map(function (p, idx) { return (idx === 0 ? "M" : "L") + " " + p.x + " " + p.y; }).join(" ");
            var gradId = "lineGrad_" + Math.random().toString(36).substr(2, 6);
            svg += '<defs><linearGradient id="' + gradId + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="' + chartColor + '" stop-opacity="0.2"/><stop offset="100%" stop-color="' + chartColor + '" stop-opacity="0.02"/></linearGradient></defs>';
            var areaPath = linePath + ' L ' + points[points.length - 1].x + ' ' + lineChartH + ' L ' + points[0].x + ' ' + lineChartH + ' Z';
            svg += '<path d="' + areaPath + '" fill="url(#' + gradId + ')" stroke="none"/>';
            svg += '<path class="miniChart-line" d="' + linePath + '" stroke="' + chartColor + '" stroke-width="' + lineWidth + '" fill="none" vector-effect="non-scaling-stroke" style="stroke:' + chartColor + ';stroke-linecap:round;stroke-linejoin:round;"/>';
            for (i = 0; i < points.length; i++) { svg += '<circle cx="' + points[i].x + '" cy="' + points[i].y + '" r="1.8" fill="' + chartColor + '" stroke="none" vector-effect="non-scaling-stroke"/>'; }
            if (hasSecondSeries && values2.length > 1) {
                var points2 = [];
                for (i = 0; i < values2.length; i++) { x = values2.length > 1 ? (i / (values2.length - 1)) * 100 : 50; y = lineChartH - (values2[i] / max * lineChartH); points2.push({ x: x, y: y }); }
                var linePath2 = points2.map(function (p, idx) { return (idx === 0 ? "M" : "L") + " " + p.x + " " + p.y; }).join(" ");
                svg += '<path d="' + linePath2 + '" stroke="' + secondSeriesColor + '" stroke-width="' + lineWidth + '" fill="none" vector-effect="non-scaling-stroke" style="stroke-linecap:round;stroke-linejoin:round;opacity:0.85;"/>';
                for (i = 0; i < points2.length; i++) { svg += '<circle cx="' + points2[i].x + '" cy="' + points2[i].y + '" r="1.8" fill="' + secondSeriesColor + '" stroke="none" vector-effect="non-scaling-stroke"/>'; }
            }
        } else {
            var barChartH = 100;
            svg = '<svg class="miniChart" viewBox="0 0 100 ' + barChartH + '" preserveAspectRatio="none" style="height:' + svgHeight + 'px;" xmlns="http://www.w3.org/2000/svg">';
            svg += '<line class="miniChart-hover-line" x1="0" y1="0" x2="0" y2="' + barChartH + '" stroke="#666666" stroke-width="1.5"/>';
            var barWidthPct = Math.max(10, Math.min(100, layout.props.chartBarWidth || 60)) / 100;
            var showSecondBars = hasSecondSeries && values2.length === count, groupCount = showSecondBars ? 2 : 1;
            var barWidth = count > 0 ? (100 / count) * barWidthPct / groupCount : 5, spacing = count > 0 ? (100 / count) * (1 - barWidthPct) : 0;
            for (i = 0; i < count; i++) {
                var height = (values[i] / max) * barChartH; x = i * (100 / count) + spacing / 2; y = barChartH - height;
                svg += '<rect x="' + x + '" y="' + y + '" width="' + barWidth + '" height="' + height + '" rx="2" fill="' + chartColor + '" style="fill:' + chartColor + '"/>';
                if (showSecondBars) { var h2 = (values2[i] / max) * barChartH, x2 = x + barWidth, y2 = barChartH - h2; svg += '<rect x="' + x2 + '" y="' + y2 + '" width="' + barWidth + '" height="' + h2 + '" rx="2" fill="' + secondSeriesColor + '" style="fill:' + secondSeriesColor + ';opacity:0.85;"/>'; }
            }
        }
        svg += '</svg>';
        var xAxisHtml = "";
        if (showXAxis && (hasDim || hasXAxisMeasure) && matrix.length > 0) {
            var xAxisExpr = layout.props.xAxisExpression, labels = [];
            matrix.forEach(function (row) {
                var label = "";
                if (hasXAxisMeasure && row[xAxisColIndex]) { label = row[xAxisColIndex].qText || ""; }
                else if (hasDim) { var dimValue = row[dimIndex] ? (row[dimIndex].qText || "") : ""; label = dimValue; if (xAxisExpr && xAxisExpr.trim() !== "" && !hasXAxisMeasure) { if (dimValue.indexOf("-") >= 0) { var parts = dimValue.split("-"); if (parts.length > 1) label = parts[parts.length - 1]; } if (xAxisExpr.trim().toLowerCase().indexOf("substring") >= 0 && dimValue.length > 3) { label = dimValue.substring(dimValue.length - 3); } } }
                labels.push(escapeHtml(label));
            });
            xAxisHtml = '<div class="mini-chart-xaxis" style="font-size:' + xAxisFontSize + 'px;">'; labels.forEach(function (lbl) { xAxisHtml += '<span class="mini-chart-xaxis-label">' + lbl + '</span>'; }); xAxisHtml += '</div>';
        }
        var valueLabelsHtml = "";
        if (layout.props.showValueLabels === true && !isSparkline) {
            var vlFontSize = layout.props.valueLabelFontSize || 9, vlColor = fixColor(layout.props.textColor, "#666666");
            valueLabelsHtml = '<div class="mini-chart-value-labels" style="font-size:' + vlFontSize + 'px;color:' + vlColor + ';">';
            values.forEach(function (val) { var lbl; if (Math.abs(val) >= 1e9) lbl = (val / 1e9).toFixed(1) + "B"; else if (Math.abs(val) >= 1e6) lbl = (val / 1e6).toFixed(1) + "M"; else if (Math.abs(val) >= 1e3) lbl = (val / 1e3).toFixed(1) + "K"; else if (val === Math.floor(val)) lbl = String(val); else lbl = val.toFixed(1); valueLabelsHtml += '<span class="mini-chart-value-label">' + escapeHtml(lbl) + '</span>'; });
            valueLabelsHtml += '</div>';
        }
        return svg + valueLabelsHtml + xAxisHtml;
    }

    function buildComparisonBlock(side, value, formatted, layout, compFontSize, autoContrast, bgColor) {
        var titleRaw = layout.props[side + "Title"] || "", title = escapeHtml(titleRaw);
        var titleFontSize = layout.props[side + "TitleFontSize"] || 12, titleFontWeight = layout.props[side + "TitleFontWeight"] || "500";
        var valueFontWeight = layout.props[side + "ValueFontWeight"] || "600";
        var iconUrl = layout.props[side + "IconUrl"], iconSize = layout.props[side + "IconSize"] || 16, iconPos = layout.props[side + "IconPosition"] || "before";
        var valueColorExpr = layout.props[side + "ValueColorExpr"], textColor = layout.props.textColor;
        var valueColor = getValueColor(valueColorExpr, textColor, autoContrast, bgColor);
        var prefix = layout.props[side + "ValuePrefix"] || "", suffix = layout.props[side + "ValueSuffix"] || "";
        var prefixHtml = prefix ? '<span class="val-prefix">' + escapeHtml(prefix) + '</span>' : "";
        var suffixHtml = suffix ? '<span class="val-suffix">' + escapeHtml(suffix) + '</span>' : "";
        var trendRaw = layout.props[side + "TrendText"] || "", trendColor = fixColor(layout.props[side + "TrendColor"], "#999999");
        var trendHtml = trendRaw.trim() ? '<div class="comp-trend" style="color:' + trendColor + ';">' + escapeHtml(trendRaw) + '</div>' : "";
        var iconHtml = iconUrl ? '<img class="comp-icon" src="' + iconUrl + '" style="width:' + iconSize + 'px;height:' + iconSize + 'px;" alt="">' : "";
        var showArrows = layout.props[side + "ShowArrows"] === true;
        var posColor = layout.props[side + "PosColor"] || layout.props.posColor || "#21a46f";
        var negColor = layout.props[side + "NegColor"] || layout.props.negColor || "#e04e4e";
        var invertLogic = layout.props[side + "InvertArrowLogic"] === true;
        var applyArrowColorToValue = layout.props[side + "ApplyArrowColorToValue"] === true;
        var arrow = buildArrow(layout.props[side + "ArrowExpr"], valueColorExpr, value, layout, showArrows, posColor, negColor, invertLogic);
        var autoColorBySign = layout.props[side + "AutoColorBySign"] === true, finalValueColor = valueColor;
        if (autoColorBySign && value !== null && value !== undefined) { if (value > 0) finalValueColor = fixColor(posColor, "#21a46f"); else if (value < 0) finalValueColor = fixColor(negColor, "#e04e4e"); }
        else if (applyArrowColorToValue && showArrows && value !== null && value !== undefined) { if (value > 0) finalValueColor = invertLogic ? fixColor(negColor, "#e04e4e") : fixColor(posColor, "#21a46f"); else if (value < 0) finalValueColor = invertLogic ? fixColor(posColor, "#21a46f") : fixColor(negColor, "#e04e4e"); }
        if (iconPos === "top") {
            return '<div class="comp-block"><div class="comp-icon-top">' + iconHtml + '</div><div class="comp-title" style="font-size:' + titleFontSize + 'px;font-weight:' + titleFontWeight + ';">' + title + '</div><div class="comp-value" style="font-size:' + compFontSize + 'px;font-weight:' + valueFontWeight + ';color:' + finalValueColor + '">' + arrow + prefixHtml + formatted + suffixHtml + '</div>' + trendHtml + '</div>';
        }
        return '<div class="comp-block"><div class="comp-title" style="font-size:' + titleFontSize + 'px;font-weight:' + titleFontWeight + ';">' + title + '</div><div class="comp-value" style="font-size:' + compFontSize + 'px;font-weight:' + valueFontWeight + ';color:' + finalValueColor + '">' + (iconPos === "before" ? iconHtml : "") + arrow + prefixHtml + formatted + suffixHtml + (iconPos === "after" ? iconHtml : "") + '</div>' + trendHtml + '</div>';
    }

    // ============================================
    // EXTENSION DEFINITION
    // ============================================
    return {
        // Add support for export and snapshots
        support: {
            snapshot: true,
            export: true,
            exportData: true
        },
        // Store backendApi reference for expression evaluation
        backendApi: null,

        controller: ["$scope", "$element", function ($scope, $element) {
            // Auto-repair corrupted measures on load
            if ($scope.backendApi && $scope.backendApi.getProperties) {
                $scope.backendApi.getProperties().then(function (props) {
                    var changed = false;
                    if (props.qHyperCubeDef && props.qHyperCubeDef.qMeasures) {
                        var measures = props.qHyperCubeDef.qMeasures;
                        for (var i = 0; i < measures.length; i++) {
                            if (!measures[i] || !measures[i].qDef || !measures[i].qValueExpression) {
                                measures[i] = ensureMeasureStructure(measures[i] || null);
                                changed = true;
                            }
                        }
                    }
                    if (changed) {
                        console.log("[ModernKPI] Auto-repaired corrupted measures.");
                        $scope.backendApi.setProperties(props);
                    }
                });
            }

            // Cleanup when the extension is destroyed (sheet navigation, object deletion)
            $scope.$on("$destroy", function () {
                // Remove orphaned tooltip appended to <body>
                var $tip = $element.data("kpiChartTooltip");
                if ($tip) {
                    $tip.remove();
                    $element.removeData("kpiChartTooltip");
                }
                // Unbind all namespaced events to prevent memory leaks
                $element.find(".miniChart").off(".kpiChart");
                $element.find(".tooltip-icon-trigger").off(".kpiFlip");
                $element.find(".kpi-flip-card-wrapper").off(".kpiFlip");
                $element.find(".flip-card-back").off(".kpiFlip");
                $element.find(".kpi-container").off(".kpiNav");
                // Clear stored data
                $element.removeData("kpiStructKey");
            });
        }],

        initialProperties: {
            qHyperCubeDef: {
                // Start with empty dimensions - will be added via native Qlik Sense panel when user clicks "Add"
                // This prevents "Invalid dimension" error on drag and drop
                qDimensions: [],
                // Provide measure object with complete structure for expression evaluation
                // Expression will be synced from props.mainMeasureExpression via onChange
                qMeasures: [
                    {
                        qDef: {
                            qDef: "",
                            qLabel: "",
                            qNumFormat: {
                                qType: "U",
                                qUseThou: 0,
                                qFmt: "",
                                qDec: "",
                                qThou: ""
                            }
                        },
                        qLibraryId: "",
                        qValueExpression: { qv: "" },
                        qSortBy: {
                            qSortByNumeric: 1,
                            qSortByAscii: 1,
                            qSortByLoadOrder: 1
                        }
                    }
                ],
                qInitialDataFetch: [{
                    qWidth: 10,
                    qHeight: 500
                }]
            },
            props: {
                // Bottom section mode: "comparison" (default), "chart", "both", "none"
                bottomSectionMode: "comparison",
                // Default: Chart disabled (synced from bottomSectionMode in onChange)
                enableChart: false,
                // Default: Third KPI disabled
                enableThird: false,
                // Default: No icons
                titleIcon: "",
                leftIconUrl: "",
                rightIconUrl: "",
                thirdIconUrl: "",
                // Default colors
                mainValueColor: "#222222",
                // Format type defaults
                mainFormatType: "U",
                leftFormatType: "U",
                rightFormatType: "U",
                thirdFormatType: "U",
                // Keep default font sizes
                mainTitle: "Main KPI",
                mainTitleFontSize: 14,
                mainValueFontSize: 25,
                leftTitleFontSize: 12,
                rightTitleFontSize: 12,
                thirdTitleFontSize: 12,
                leftTitleFontWeight: "500",
                leftValueFontWeight: "600",
                rightTitleFontWeight: "500",
                rightValueFontWeight: "600",
                thirdTitleFontWeight: "500",
                thirdValueFontWeight: "600",
                // Comparison style defaults (global fallback colors)
                posColor: "#21a46f",
                negColor: "#e04e4e",
                // Per-KPI arrow settings (defaults)
                leftShowArrows: false,
                rightShowArrows: false,
                thirdShowArrows: false,
                leftPosColor: "#21a46f",
                leftNegColor: "#e04e4e",
                rightPosColor: "#21a46f",
                rightNegColor: "#e04e4e",
                thirdPosColor: "#21a46f",
                thirdNegColor: "#e04e4e",
                leftInvertArrowLogic: false,
                rightInvertArrowLogic: false,
                thirdInvertArrowLogic: false,
                leftApplyArrowColorToValue: false,
                rightApplyArrowColorToValue: false,
                thirdApplyArrowColorToValue: false,
                // Trend micro-text defaults
                leftTrendText: "",
                rightTrendText: "",
                thirdTrendText: "",
                leftTrendColor: "#999999",
                rightTrendColor: "#999999",
                thirdTrendColor: "#999999",
                // Prefix & Suffix defaults
                mainValuePrefix: "",
                mainValueSuffix: "",
                leftValuePrefix: "",
                leftValueSuffix: "",
                rightValuePrefix: "",
                rightValueSuffix: "",
                thirdValuePrefix: "",
                thirdValueSuffix: "",
                // Subtitle defaults
                mainSubtitle: "",
                mainSubtitleFontSize: 11,
                mainSubtitleColor: "#888888",
                // Shadow defaults
                shadowDepth: "none",
                shadowColor: "#000000",
                shadowOffsetX: 0,
                shadowOffsetY: 4,
                shadowBlur: 12,
                shadowSpread: 0,
                // Border defaults
                borderRadius: 5,
                // Layout density
                denseMode: false,
                // Animation defaults
                enableCountUp: true,
                countUpDuration: "600",
                // Tooltip defaults
                enableTooltip: false,
                tooltipIcon: "info",
                tooltipIconSize: 20,
                tooltipText: "",
                tooltipDescriptionFontSize: 14,
                tooltipDescriptionColor: "#333333",
                tooltipMode: false,
                flipTrigger: "iconHover",
                flipBackInheritBg: true,
                flipBackTitle: "",
                flipBackTitleFontSize: 13,
                flipBackTitleColor: "#555555",
                flipBackShowDivider: true,
                flipBackDividerColor: "#e0e0e0",
                flipBackTextAlign: "center",
                enableInsightExpression: true,
                tooltipInsightExpression: "",
                tooltipInsightFontSize: 16,
                tooltipInsightColor: "#667eea",
                tooltipInsightAlignment: "center",
                // Insight row 2
                enableInsightRow2: false,
                insightRow2Label: "",
                insightRow2Expression: "",
                insightRow2FontSize: 16,
                insightRow2Color: "#667eea",
                // Insight row 3
                enableInsightRow3: false,
                insightRow3Label: "",
                insightRow3Expression: "",
                insightRow3FontSize: 16,
                insightRow3Color: "#667eea",
                // Padding defaults for vertical divider (top and bottom only)
                paddingTop: 0,
                paddingBottom: 5,
                // Vertical divider height (null = auto, number = custom height in px)
                dividerVHeight: null,
                // Divider widths (default: 1px for both)
                dividerHWidth: 1,
                dividerVWidth: 1,
                // Horizontal divider position (null = auto, number = custom margin-top in px)
                dividerHPosition: null,
                // Alert defaults
                enableAlert: false,
                alertExpression: "",
                alertMessage: "⚠ Below Target",
                alertPosition: "top",
                alertColor: "#e74c3c",
                alertTextColor: "#ffffff",
                alertFontSize: 12,
                enableBrowserNotification: false,
                // Layout options
                invertLayout: false,
                // About section - static text values
                aboutTitle: "Modern KPI Card",
                aboutText1: "Modern KPI Card is a visualization extension that provides enhanced design options and better UI for your KPI objects.",
                aboutText2: "Modern KPI Card offers a clean, modern interface with customizable styling, smooth animations, and responsive layout.",
                aboutAuthor: "Created by Ala Aldin Hija",
                aboutVersion: "Version: 2.1.0"
            }
        },

        // Migration safety: Ensure qMeasures is always an array with proper structure
        // Fix measure structure to prevent "qValueExpression" errors on new objects
        // "Convert to" works because it uses existing object structure - we need to match that
        onChange: function (props) {
            if (!props.qHyperCubeDef) {
                props.qHyperCubeDef = {};
            }
            if (!Array.isArray(props.qHyperCubeDef.qMeasures)) {
                props.qHyperCubeDef.qMeasures = [];
            }
            // ============================================
            // CRITICAL: Prevent "Cannot read properties of null (reading 'qValueExpression')"
            // errors during drag-and-drop operations. Qlik's isLocked() function accesses
            // qValueExpression before beforeUpdate runs, so we must ensure structure exists.
            // ============================================

            // First, ensure qHyperCubeDef exists
            if (!props.qHyperCubeDef) {
                props.qHyperCubeDef = {
                    qDimensions: [],
                    qMeasures: [],
                    qInitialDataFetch: [{ qWidth: 10, qHeight: 1 }],
                    qSuppressZero: false,
                    qSuppressMissing: false
                };
            }

            // Ensure qMeasures array exists
            if (!props.qHyperCubeDef.qMeasures) {
                props.qHyperCubeDef.qMeasures = [];
            }

            // IMMEDIATE CLEANUP of any nulls to prevent isLocked() crashes
            for (var i = 0; i < props.qHyperCubeDef.qMeasures.length; i++) {
                if (!props.qHyperCubeDef.qMeasures[i]) {
                    props.qHyperCubeDef.qMeasures[i] = ensureMeasureStructure(null);
                }
            }

            // Ensure at least one measure exists (for main KPI measure)
            if (props.qHyperCubeDef.qMeasures.length === 0) {
                props.qHyperCubeDef.qMeasures.push(ensureMeasureStructure(null));
            }

            // Ensure measure slots exist for all features that reference specific indices:
            // 0 = main KPI, 1 = chart, 2 = left comparison, 3 = right comparison,
            // 4 = third comparison, 5 = x-axis label measure
            var mode = (props.props && props.props.bottomSectionMode) || "comparison";
            var needsChartSlot = mode === "chart" || mode === "both";
            var needsComparison = mode === "comparison" || mode === "both";

            // Calculate how many measure slots we need
            var requiredSlots = 1; // always need at least index 0 (main KPI)
            if (needsChartSlot) requiredSlots = Math.max(requiredSlots, 2); // index 1 = chart
            if (needsComparison) {
                if (props.props && props.props.enableLeft !== false) requiredSlots = Math.max(requiredSlots, 3); // index 2
                if (props.props && props.props.enableRight !== false) requiredSlots = Math.max(requiredSlots, 4); // index 3
                if (props.props && props.props.enableThird === true) requiredSlots = Math.max(requiredSlots, 5); // index 4
            }
            // X-axis label measure at index 5
            if (needsChartSlot && props.props && props.props.showXAxis === true) {
                requiredSlots = Math.max(requiredSlots, 6); // index 5
            }
            // Second chart series measure at index 6
            if (needsChartSlot && props.props && props.props.enableSecondSeries === true) {
                requiredSlots = Math.max(requiredSlots, 7); // index 6
            }

            while (props.qHyperCubeDef.qMeasures.length < requiredSlots) {
                props.qHyperCubeDef.qMeasures.push(ensureMeasureStructure(null));
            }

            // Normalise every measure in one pass (creates fresh defaults for null entries)
            props.qHyperCubeDef.qMeasures = props.qHyperCubeDef.qMeasures.map(ensureMeasureStructure);

            // Sync enableChart and qHeight from bottomSectionMode
            if (props.props) {
                var needsChart = mode === "chart" || mode === "both";
                props.props.enableChart = needsChart;

                // Adjust data fetch height: chart modes need many rows for dimension values
                if (!props.qHyperCubeDef.qInitialDataFetch || !props.qHyperCubeDef.qInitialDataFetch.length) {
                    props.qHyperCubeDef.qInitialDataFetch = [{ qWidth: 10, qHeight: 1 }];
                }
                props.qHyperCubeDef.qInitialDataFetch[0].qHeight = needsChart ? 500 : 1;
            }
        },

        definition: {
            type: "items",
            component: "accordion",
            items: {
                // ============================================
                // MAIN KPI PANEL
                // ============================================
                mainKPI: {
                    label: "Main KPI",
                    type: "items",
                    items: {
                        title: {
                            ref: "props.mainTitle",
                            label: "Title",
                            type: "string",
                            component: "expression",
                            expression: "optional",
                            defaultValue: "Main KPI"
                        },
                        mainTitleFontSize: {
                            ref: "props.mainTitleFontSize",
                            label: "Title Font Size (px)",
                            type: "number",
                            defaultValue: 14
                        },
                        mainTitleAlignment: {
                            ref: "props.mainTitleAlignment",
                            label: "Title Alignment",
                            type: "string",
                            component: "dropdown",
                            defaultValue: "left",
                            options: [
                                { value: "left", label: "Left" },
                                { value: "center", label: "Center" },
                                { value: "right", label: "Right" }
                            ]
                        },
                        // Main KPI Measure Expression (same pattern as comparison measures)
                        // Directly references qHyperCubeDef.qMeasures.0.qDef.qDef to avoid qValueExpression errors
                        mainKpiMeasure: {
                            ref: "qHyperCubeDef.qMeasures.0.qDef.qDef",
                            label: "Main KPI Measure",
                            type: "string",
                            component: "expression",
                            expression: "optional"
                        },
                        autoFitMainValue: {
                            ref: "props.autoFitMainValue",
                            type: "boolean",
                            label: "Auto-fit Main Value Font",
                            defaultValue: false
                        },
                        mainValueFontSize: {
                            ref: "props.mainValueFontSize",
                            label: "Main Value Font Size (px)",
                            type: "number",
                            defaultValue: 25,
                            expression: "optional",
                            show: function (d) { return d.props.autoFitMainValue !== true; }
                        },
                        mainValueAlignment: {
                            ref: "props.mainValueAlignment",
                            label: "Main Value Alignment",
                            type: "string",
                            component: "dropdown",
                            defaultValue: "center",
                            options: [
                                { value: "left", label: "Left" },
                                { value: "center", label: "Center" },
                                { value: "right", label: "Right" }
                            ]
                        },
                        mainValueColor: {
                            ref: "props.mainValueColor",
                            label: "Main Value Color",
                            type: "string",
                            component: "color-picker",
                            defaultValue: "#222222",
                            dualOutput: true
                        },
                        mainValueFontWeight: {
                            ref: "props.mainValueFontWeight",
                            label: "Main Value Font Weight",
                            type: "string",
                            component: "dropdown",
                            defaultValue: "700",
                            options: [
                                { value: "300", label: "Light" },
                                { value: "400", label: "Regular" },
                                { value: "500", label: "Medium" },
                                { value: "600", label: "Semi-bold" },
                                { value: "700", label: "Bold" }
                            ]
                        },
                        mainTitleFontWeight: {
                            ref: "props.mainTitleFontWeight",
                            label: "Title Font Weight",
                            type: "string",
                            component: "dropdown",
                            defaultValue: "500",
                            options: [
                                { value: "300", label: "Light" },
                                { value: "400", label: "Regular" },
                                { value: "500", label: "Medium" },
                                { value: "600", label: "Semi-bold" },
                                { value: "700", label: "Bold" }
                            ]
                        },
                        mainSubtitle: {
                            ref: "props.mainSubtitle",
                            label: "Subtitle",
                            type: "string",
                            component: "expression",
                            expression: "optional",
                            defaultValue: ""
                        },
                        mainSubtitleFontSize: {
                            ref: "props.mainSubtitleFontSize",
                            label: "Subtitle Font Size (px)",
                            type: "number",
                            defaultValue: 11,
                            show: d => d.props.mainSubtitle && String(d.props.mainSubtitle).trim() !== ""
                        },
                        mainSubtitleColor: {
                            ref: "props.mainSubtitleColor",
                            label: "Subtitle Color",
                            type: "string",
                            component: "color-picker",
                            defaultValue: "#888888",
                            dualOutput: true,
                            show: d => d.props.mainSubtitle && String(d.props.mainSubtitle).trim() !== ""
                        },
                        mainFormatType: {
                            ref: "props.mainFormatType",
                            label: "Format",
                            type: "string",
                            component: "dropdown",
                            defaultValue: "auto",
                            options: [
                                { value: "auto", label: "Auto" },
                                { value: "number", label: "Number" },
                                { value: "currency", label: "Money / Currency" },
                                { value: "percent", label: "Percent %" },
                                { value: "km", label: "K / M / B" },
                                { value: "duration", label: "Duration" },
                                { value: "custom", label: "Custom Format" },
                                { value: "measure", label: "Use Measure Formatting" }
                            ]
                        },
                        mainDurationPattern: {
                            ref: "props.mainDurationPattern",
                            label: "Duration Pattern",
                            type: "string",
                            component: "dropdown",
                            defaultValue: "h:mm:ss",
                            options: [
                                { value: "h:mm:ss", label: "h:mm:ss  (e.g. 2:05:30)" },
                                { value: "hh:mm:ss", label: "hh:mm:ss  (e.g. 02:05:30)" },
                                { value: "h:mm", label: "h:mm  (e.g. 2:05)" },
                                { value: "hh:mm", label: "hh:mm  (e.g. 02:05)" },
                                { value: "mm:ss", label: "mm:ss  (e.g. 125:30)" },
                                { value: "[h]:mm:ss", label: "[h]:mm:ss  (total hours)" },
                                { value: "D hh:mm:ss", label: "D hh:mm:ss  (days)" }
                            ],
                            show: d => d.props.mainFormatType === "duration"
                        },
                        mainCustomMask: {
                            ref: "props.mainCustomMask",
                            label: "Format pattern",
                            type: "string",
                            defaultValue: "#,##0.00",
                            show: d => d.props.mainFormatType === "custom",
                            help: "Qlik format pattern (e.g., #,##0.00, $#,##0.00;-$#,##0.00, h:mm:ss)"
                        },
                        mainCurrencySymbol: {
                            ref: "props.mainCurrencySymbol",
                            label: "Currency Symbol",
                            type: "string",
                            defaultValue: "$",
                            show: d => d.props.mainFormatType === "currency"
                        },
                        mainValuePrefix: {
                            ref: "props.mainValuePrefix",
                            label: "Value Prefix",
                            type: "string",
                            defaultValue: "",
                            expression: "optional",
                            help: "Text shown before the value (e.g. '$', '≈', 'Total: ')"
                        },
                        mainValueSuffix: {
                            ref: "props.mainValueSuffix",
                            label: "Value Suffix",
                            type: "string",
                            defaultValue: "",
                            expression: "optional",
                            help: "Text shown after the value (e.g. ' units', ' / day', '%')"
                        },
                        titleIcon: {
                            ref: "props.titleIcon",
                            label: "Title Icon (URL)",
                            type: "string",
                            defaultValue: ""
                        },
                        mainIconSize: {
                            ref: "props.mainIconSize",
                            label: "Main Icon Size (px)",
                            type: "number",
                            defaultValue: 20
                        },
                        mainIconPosition: {
                            ref: "props.mainIconPosition",
                            label: "Main Icon Position",
                            type: "string",
                            component: "dropdown",
                            defaultValue: "left",
                            options: [
                                { value: "left", label: "Left" },
                                { value: "right", label: "Right" },
                                { value: "top", label: "Top" }
                            ]
                        }
                    }
                },

                // ============================================
                // BOTTOM CONTENT (unified section)
                // ============================================
                bottomContent: {
                    label: "Secondary Metrics & Chart",
                    type: "items",
                    items: {
                        // --- Mode selector ---
                        bottomSectionMode: {
                            ref: "props.bottomSectionMode",
                            label: "Display Mode",
                            type: "string",
                            component: "dropdown",
                            defaultValue: "comparison",
                            options: [
                                { value: "comparison", label: "Comparison KPIs" },
                                { value: "chart", label: "Mini Chart" },
                                { value: "both", label: "Both (Chart + Comparison)" },
                                { value: "none", label: "None" }
                            ]
                        },

                        invertLayout: {
                            ref: "props.invertLayout",
                            label: "Invert Layout (Comparisons on Top)",
                            type: "boolean",
                            defaultValue: false,
                            show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return m === "comparison" || m === "both"; }
                        },

                        // ========== MINI CHART (shown when chart/both) ==========
                        chartDimensions: {
                            uses: "dimensions",
                            min: 0,
                            max: 1,
                            show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return m === "chart" || m === "both"; }
                        },
                        chartMeasure: {
                            ref: "qHyperCubeDef.qMeasures.1.qDef.qDef",
                            label: "Chart Measure",
                            type: "string",
                            component: "expression",
                            expression: "optional",
                            show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return m === "chart" || m === "both"; }
                        },
                        chartType: {
                            ref: "props.chartType",
                            label: "Chart Type",
                            type: "string",
                            component: "dropdown",
                            defaultValue: "bar",
                            options: [
                                { value: "bar", label: "Bar Chart" },
                                { value: "line", label: "Line Chart" },
                                { value: "sparkline", label: "Sparkline" }
                            ],
                            show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return m === "chart" || m === "both"; }
                        },
                        chartColor: {
                            ref: "props.chartColor",
                            label: "Chart Color",
                            type: "string",
                            component: "color-picker",
                            defaultValue: "#6aa7ff",
                            dualOutput: true,
                            show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return m === "chart" || m === "both"; }
                        },
                        enableSecondSeries: {
                            ref: "props.enableSecondSeries",
                            type: "boolean",
                            label: "Overlay Second Series",
                            defaultValue: false,
                            show: function (d) { var m = d.props.bottomSectionMode || "comparison"; var t = d.props.chartType || "bar"; return (m === "chart" || m === "both") && (t === "line" || t === "bar"); }
                        },
                        secondSeriesMeasure: {
                            ref: "qHyperCubeDef.qMeasures.6.qDef.qDef",
                            label: "Second Series Measure",
                            type: "string",
                            component: "expression",
                            expression: "optional",
                            show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "chart" || m === "both") && d.props.enableSecondSeries === true; }
                        },
                        secondSeriesColor: {
                            ref: "props.secondSeriesColor",
                            label: "Second Series Color",
                            type: "string",
                            component: "color-picker",
                            defaultValue: "#ff7043",
                            dualOutput: true,
                            show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "chart" || m === "both") && d.props.enableSecondSeries === true; }
                        },
                        chartBarWidth: {
                            ref: "props.chartBarWidth",
                            label: "Bar Width (%)",
                            type: "number",
                            defaultValue: 60,
                            expression: "optional",
                            show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "chart" || m === "both") && (d.props.chartType || "bar") === "bar"; }
                        },
                        chartLineWidth: {
                            ref: "props.chartLineWidth",
                            label: "Line Width (px)",
                            type: "number",
                            defaultValue: 2,
                            expression: "optional",
                            show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "chart" || m === "both") && d.props.chartType === "line"; }
                        },
                        chartHeight: {
                            ref: "props.chartHeight",
                            label: "Chart Height (px)",
                            type: "number",
                            defaultValue: 0,
                            expression: "optional",
                            help: "0 = auto (50px when both chart + comparison, 70px for chart only)",
                            show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return m === "chart" || m === "both"; }
                        },
                        showChartTooltip: {
                            ref: "props.showTooltip",
                            type: "boolean",
                            label: "Enable Chart Tooltip",
                            defaultValue: true,
                            show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return m === "chart" || m === "both"; }
                        },
                        showValueLabels: {
                            ref: "props.showValueLabels",
                            type: "boolean",
                            label: "Show Value Labels on Chart",
                            defaultValue: false,
                            show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return m === "chart" || m === "both"; }
                        },
                        valueLabelFontSize: {
                            ref: "props.valueLabelFontSize",
                            label: "Value Label Font Size (px)",
                            type: "number",
                            defaultValue: 9,
                            show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "chart" || m === "both") && d.props.showValueLabels === true; }
                        },
                        chartSorting: {
                            label: "Chart Sorting",
                            type: "items",
                            show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return m === "chart" || m === "both"; },
                            items: {
                                enableSort: { ref: "props.enableChartSort", label: "Enable Sorting", type: "boolean", defaultValue: true },
                                sortBy: { ref: "props.chartSortBy", label: "Sort By", type: "string", component: "dropdown", defaultValue: "dimension", options: [{ value: "dimension", label: "Dimension" }, { value: "measure", label: "Chart Measure" }, { value: "expression", label: "Custom Expression" }], show: function (d) { return d.props.enableChartSort; } },
                                sortOrder: { ref: "props.chartSortOrder", label: "Sort Order", type: "string", component: "dropdown", defaultValue: "asc", options: [{ value: "asc", label: "Ascending" }, { value: "desc", label: "Descending" }], show: function (d) { return d.props.enableChartSort; } },
                                sortExpression: { ref: "props.chartSortExpression", label: "Sort Expression", type: "string", component: "expression", defaultValue: "", show: function (d) { return d.props.enableChartSort && d.props.chartSortBy === "expression"; } }
                            }
                        },
                        chartXAxis: {
                            label: "X-Axis",
                            type: "items",
                            show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return m === "chart" || m === "both"; },
                            items: {
                                showXAxis: { ref: "props.showXAxis", type: "boolean", label: "Show X-Axis Labels", defaultValue: false },
                                xAxisExpression: { ref: "props.xAxisExpression", label: "X-Axis Label Expression", type: "string", component: "expression", expression: "optional", defaultValue: "", show: function (d) { return d.props.showXAxis === true; } },
                                xAxisMeasure: { ref: "qHyperCubeDef.qMeasures.5.qDef.qDef", label: "X-Axis Label Measure", type: "string", component: "expression", defaultValue: "", show: function (d) { return d.props.showXAxis === true; } },
                                xAxisFontSize: { ref: "props.xAxisFontSize", label: "X-Axis Font Size (px)", type: "number", defaultValue: 10, show: function (d) { return d.props.showXAxis === true; } }
                            }
                        },

                        // ========== COMPARISON KPIs (shown when comparison/both) ==========
                        enableLeft: {
                            ref: "props.enableLeft",
                            label: "Enable First KPI",
                            type: "boolean",
                            defaultValue: true,
                            show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return m === "comparison" || m === "both"; }
                        },
                        leftTitle: { ref: "props.leftTitle", label: "First KPI Title", type: "string", component: "expression", expression: "optional", defaultValue: "", show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableLeft !== false; } },
                        leftTitleFontSize: { ref: "props.leftTitleFontSize", label: "First Title Font Size (px)", type: "number", defaultValue: 12, show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableLeft !== false; } },
                        leftTitleFontWeight: { ref: "props.leftTitleFontWeight", label: "First Title Font Weight", type: "string", component: "dropdown", defaultValue: "500", options: [{ value: "300", label: "Light" }, { value: "400", label: "Regular" }, { value: "500", label: "Medium" }, { value: "600", label: "Semi-bold" }, { value: "700", label: "Bold" }], show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableLeft !== false; } },
                        leftValueFontWeight: { ref: "props.leftValueFontWeight", label: "First Value Font Weight", type: "string", component: "dropdown", defaultValue: "500", options: [{ value: "300", label: "Light" }, { value: "400", label: "Regular" }, { value: "500", label: "Medium" }, { value: "600", label: "Semi-bold" }, { value: "700", label: "Bold" }], show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableLeft !== false; } },
                        leftMeasure: { ref: "qHyperCubeDef.qMeasures.2.qDef.qDef", label: "First Measure", type: "string", component: "expression", expression: "optional", show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableLeft !== false; } },
                        leftFormatType: { ref: "props.leftFormatType", label: "First KPI Format", type: "string", component: "dropdown", defaultValue: "auto", options: [{ value: "auto", label: "Auto" }, { value: "number", label: "Number" }, { value: "currency", label: "Money / Currency" }, { value: "percent", label: "Percent %" }, { value: "km", label: "K / M / B" }, { value: "duration", label: "Duration" }, { value: "custom", label: "Custom Format" }, { value: "measure", label: "Use Measure Formatting" }], show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableLeft !== false; } },
                        leftDurationPattern: { ref: "props.leftDurationPattern", label: "Duration Pattern", type: "string", component: "dropdown", defaultValue: "h:mm:ss", options: [{ value: "h:mm:ss", label: "h:mm:ss  (e.g. 2:05:30)" }, { value: "hh:mm:ss", label: "hh:mm:ss  (e.g. 02:05:30)" }, { value: "h:mm", label: "h:mm  (e.g. 2:05)" }, { value: "hh:mm", label: "hh:mm  (e.g. 02:05)" }, { value: "mm:ss", label: "mm:ss  (e.g. 125:30)" }, { value: "[h]:mm:ss", label: "[h]:mm:ss  (total hours)" }, { value: "D hh:mm:ss", label: "D hh:mm:ss  (days)" }], show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableLeft !== false && d.props.leftFormatType === "duration"; } },
                        leftCustomMask: { ref: "props.leftCustomMask", label: "Format pattern", type: "string", defaultValue: "#,##0.00", show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableLeft !== false && d.props.leftFormatType === "custom"; } },
                        leftCurrencySymbol: { ref: "props.leftCurrencySymbol", label: "Currency Symbol", type: "string", defaultValue: "$", show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableLeft !== false && d.props.leftFormatType === "currency"; } },
                        leftValuePrefix: { ref: "props.leftValuePrefix", label: "First Value Prefix", type: "string", defaultValue: "", expression: "optional", show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableLeft !== false; } },
                        leftValueSuffix: { ref: "props.leftValueSuffix", label: "First Value Suffix", type: "string", defaultValue: "", expression: "optional", show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableLeft !== false; } },
                        leftIconUrl: { ref: "props.leftIconUrl", label: "First Icon URL", type: "string", defaultValue: "", show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableLeft !== false; } },
                        leftIconSize: { ref: "props.leftIconSize", label: "First Icon Size (px)", type: "number", defaultValue: 16, show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableLeft !== false; } },
                        leftIconPosition: { ref: "props.leftIconPosition", label: "First Icon Position", type: "string", component: "dropdown", defaultValue: "before", options: [{ value: "before", label: "Before value" }, { value: "after", label: "After value" }, { value: "top", label: "Above Title" }], show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableLeft !== false; } },
                        leftValueColorExpr: { ref: "props.leftValueColorExpr", label: "Value Color Expression", type: "string", component: "expression", expression: "optional", defaultValue: "", show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableLeft !== false; } },
                        leftAutoColorBySign: { ref: "props.leftAutoColorBySign", type: "boolean", label: "Auto Color by Sign (+/-)", defaultValue: false, show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableLeft !== false; } },
                        leftShowArrows: { ref: "props.leftShowArrows", type: "boolean", label: "Show Arrows", defaultValue: false, show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableLeft !== false; } },
                        leftArrowExpr: { ref: "props.leftArrowExpr", label: "Custom Arrow Expression", type: "string", component: "expression", expression: "optional", defaultValue: "", show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableLeft !== false && d.props.leftShowArrows === true; }, help: "Override arrow character (e.g. ↑, ↓, ▲, ▼, or expression)" },
                        leftArrowStyle: {
                            label: "Arrow Style", type: "items", show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableLeft !== false && d.props.leftShowArrows === true; }, items: {
                                leftPosColor: { ref: "props.leftPosColor", type: "string", component: "color-picker", label: "Up Arrow Color (↑)", defaultValue: "#21a46f", dualOutput: true },
                                leftNegColor: { ref: "props.leftNegColor", type: "string", component: "color-picker", label: "Down Arrow Color (↓)", defaultValue: "#e04e4e", dualOutput: true },
                                leftInvertArrowLogic: { ref: "props.leftInvertArrowLogic", type: "boolean", label: "Invert Arrow Logic", defaultValue: false },
                                leftApplyArrowColorToValue: { ref: "props.leftApplyArrowColorToValue", type: "boolean", label: "Apply Arrow Color to Value", defaultValue: false }
                            }
                        },
                        leftTrendText: { ref: "props.leftTrendText", label: "First Trend Text", type: "string", component: "expression", expression: "optional", defaultValue: "", show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableLeft !== false; } },
                        leftTrendColor: { ref: "props.leftTrendColor", label: "First Trend Color", type: "string", component: "color-picker", defaultValue: "#999999", dualOutput: true, show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableLeft !== false && d.props.leftTrendText && String(d.props.leftTrendText).trim() !== ""; } },

                        enableRight: { ref: "props.enableRight", label: "Enable Second KPI", type: "boolean", defaultValue: true, show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return m === "comparison" || m === "both"; } },
                        rightTitle: { ref: "props.rightTitle", label: "Second KPI Title", type: "string", component: "expression", expression: "optional", defaultValue: "", show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableRight !== false; } },
                        rightTitleFontSize: { ref: "props.rightTitleFontSize", label: "Second Title Font Size (px)", type: "number", defaultValue: 12, show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableRight !== false; } },
                        rightTitleFontWeight: { ref: "props.rightTitleFontWeight", label: "Second Title Font Weight", type: "string", component: "dropdown", defaultValue: "500", options: [{ value: "300", label: "Light" }, { value: "400", label: "Regular" }, { value: "500", label: "Medium" }, { value: "600", label: "Semi-bold" }, { value: "700", label: "Bold" }], show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableRight !== false; } },
                        rightValueFontWeight: { ref: "props.rightValueFontWeight", label: "Second Value Font Weight", type: "string", component: "dropdown", defaultValue: "500", options: [{ value: "300", label: "Light" }, { value: "400", label: "Regular" }, { value: "500", label: "Medium" }, { value: "600", label: "Semi-bold" }, { value: "700", label: "Bold" }], show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableRight !== false; } },
                        rightMeasure: { ref: "qHyperCubeDef.qMeasures.3.qDef.qDef", label: "Second Measure", type: "string", component: "expression", expression: "optional", show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableRight !== false; } },
                        rightFormatType: { ref: "props.rightFormatType", label: "Second KPI Format", type: "string", component: "dropdown", defaultValue: "auto", options: [{ value: "auto", label: "Auto" }, { value: "number", label: "Number" }, { value: "currency", label: "Money / Currency" }, { value: "percent", label: "Percent %" }, { value: "km", label: "K / M / B" }, { value: "duration", label: "Duration" }, { value: "custom", label: "Custom Format" }, { value: "measure", label: "Use Measure Formatting" }], show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableRight !== false; } },
                        rightDurationPattern: { ref: "props.rightDurationPattern", label: "Duration Pattern", type: "string", component: "dropdown", defaultValue: "h:mm:ss", options: [{ value: "h:mm:ss", label: "h:mm:ss  (e.g. 2:05:30)" }, { value: "hh:mm:ss", label: "hh:mm:ss  (e.g. 02:05:30)" }, { value: "h:mm", label: "h:mm  (e.g. 2:05)" }, { value: "hh:mm", label: "hh:mm  (e.g. 02:05)" }, { value: "mm:ss", label: "mm:ss  (e.g. 125:30)" }, { value: "[h]:mm:ss", label: "[h]:mm:ss  (total hours)" }, { value: "D hh:mm:ss", label: "D hh:mm:ss  (days)" }], show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableRight !== false && d.props.rightFormatType === "duration"; } },
                        rightCustomMask: { ref: "props.rightCustomMask", label: "Format pattern", type: "string", defaultValue: "#,##0.00", show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableRight !== false && d.props.rightFormatType === "custom"; } },
                        rightCurrencySymbol: { ref: "props.rightCurrencySymbol", label: "Currency Symbol", type: "string", defaultValue: "$", show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableRight !== false && d.props.rightFormatType === "currency"; } },
                        rightValuePrefix: { ref: "props.rightValuePrefix", label: "Second Value Prefix", type: "string", defaultValue: "", expression: "optional", show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableRight !== false; } },
                        rightValueSuffix: { ref: "props.rightValueSuffix", label: "Second Value Suffix", type: "string", defaultValue: "", expression: "optional", show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableRight !== false; } },
                        rightIconUrl: { ref: "props.rightIconUrl", label: "Second Icon URL", type: "string", defaultValue: "", show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableRight !== false; } },
                        rightIconSize: { ref: "props.rightIconSize", label: "Second Icon Size (px)", type: "number", defaultValue: 16, show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableRight !== false; } },
                        rightIconPosition: { ref: "props.rightIconPosition", label: "Second Icon Position", type: "string", component: "dropdown", defaultValue: "before", options: [{ value: "before", label: "Before value" }, { value: "after", label: "After value" }, { value: "top", label: "Above Title" }], show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableRight !== false; } },
                        rightValueColorExpr: { ref: "props.rightValueColorExpr", label: "Value Color Expression", type: "string", component: "expression", expression: "optional", defaultValue: "", show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableRight !== false; } },
                        rightAutoColorBySign: { ref: "props.rightAutoColorBySign", type: "boolean", label: "Auto Color by Sign (+/-)", defaultValue: false, show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableRight !== false; } },
                        rightShowArrows: { ref: "props.rightShowArrows", type: "boolean", label: "Show Arrows", defaultValue: false, show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableRight !== false; } },
                        rightArrowExpr: { ref: "props.rightArrowExpr", label: "Custom Arrow Expression", type: "string", component: "expression", expression: "optional", defaultValue: "", show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableRight !== false && d.props.rightShowArrows === true; }, help: "Override arrow character (e.g. ↑, ↓, ▲, ▼, or expression)" },
                        rightArrowStyle: {
                            label: "Arrow Style", type: "items", show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableRight !== false && d.props.rightShowArrows === true; }, items: {
                                rightPosColor: { ref: "props.rightPosColor", type: "string", component: "color-picker", label: "Up Arrow Color (↑)", defaultValue: "#21a46f", dualOutput: true },
                                rightNegColor: { ref: "props.rightNegColor", type: "string", component: "color-picker", label: "Down Arrow Color (↓)", defaultValue: "#e04e4e", dualOutput: true },
                                rightInvertArrowLogic: { ref: "props.rightInvertArrowLogic", type: "boolean", label: "Invert Arrow Logic", defaultValue: false },
                                rightApplyArrowColorToValue: { ref: "props.rightApplyArrowColorToValue", type: "boolean", label: "Apply Arrow Color to Value", defaultValue: false }
                            }
                        },
                        rightTrendText: { ref: "props.rightTrendText", label: "Second Trend Text", type: "string", component: "expression", expression: "optional", defaultValue: "", show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableRight !== false; } },
                        rightTrendColor: { ref: "props.rightTrendColor", label: "Second Trend Color", type: "string", component: "color-picker", defaultValue: "#999999", dualOutput: true, show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableRight !== false && d.props.rightTrendText && String(d.props.rightTrendText).trim() !== ""; } },

                        enableThird: { ref: "props.enableThird", label: "Enable Third KPI", type: "boolean", defaultValue: false, show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return m === "comparison" || m === "both"; } },
                        thirdTitle: { ref: "props.thirdTitle", label: "Third KPI Title", type: "string", component: "expression", expression: "optional", defaultValue: "", show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableThird === true; } },
                        thirdTitleFontSize: { ref: "props.thirdTitleFontSize", label: "Third Title Font Size (px)", type: "number", defaultValue: 12, show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableThird === true; } },
                        thirdTitleFontWeight: { ref: "props.thirdTitleFontWeight", label: "Third Title Font Weight", type: "string", component: "dropdown", defaultValue: "500", options: [{ value: "300", label: "Light" }, { value: "400", label: "Regular" }, { value: "500", label: "Medium" }, { value: "600", label: "Semi-bold" }, { value: "700", label: "Bold" }], show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableThird === true; } },
                        thirdValueFontWeight: { ref: "props.thirdValueFontWeight", label: "Third Value Font Weight", type: "string", component: "dropdown", defaultValue: "600", options: [{ value: "300", label: "Light" }, { value: "400", label: "Regular" }, { value: "500", label: "Medium" }, { value: "600", label: "Semi-bold" }, { value: "700", label: "Bold" }], show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableThird === true; } },
                        thirdMeasure: { ref: "qHyperCubeDef.qMeasures.4.qDef.qDef", label: "Third Measure", type: "string", component: "expression", expression: "optional", show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableThird === true; } },
                        thirdFormatType: { ref: "props.thirdFormatType", label: "Third KPI Format", type: "string", component: "dropdown", defaultValue: "auto", options: [{ value: "auto", label: "Auto" }, { value: "number", label: "Number" }, { value: "currency", label: "Money / Currency" }, { value: "percent", label: "Percent %" }, { value: "km", label: "K / M / B" }, { value: "duration", label: "Duration" }, { value: "custom", label: "Custom Format" }, { value: "measure", label: "Use Measure Formatting" }], show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableThird === true; } },
                        thirdDurationPattern: { ref: "props.thirdDurationPattern", label: "Duration Pattern", type: "string", component: "dropdown", defaultValue: "h:mm:ss", options: [{ value: "h:mm:ss", label: "h:mm:ss  (e.g. 2:05:30)" }, { value: "hh:mm:ss", label: "hh:mm:ss  (e.g. 02:05:30)" }, { value: "h:mm", label: "h:mm  (e.g. 2:05)" }, { value: "hh:mm", label: "hh:mm  (e.g. 02:05)" }, { value: "mm:ss", label: "mm:ss  (e.g. 125:30)" }, { value: "[h]:mm:ss", label: "[h]:mm:ss  (total hours)" }, { value: "D hh:mm:ss", label: "D hh:mm:ss  (days)" }], show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableThird === true && d.props.thirdFormatType === "duration"; } },
                        thirdCustomMask: { ref: "props.thirdCustomMask", label: "Format pattern", type: "string", defaultValue: "#,##0.00", show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableThird === true && d.props.thirdFormatType === "custom"; } },
                        thirdCurrencySymbol: { ref: "props.thirdCurrencySymbol", label: "Currency Symbol", type: "string", defaultValue: "$", show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableThird === true && d.props.thirdFormatType === "currency"; } },
                        thirdValuePrefix: { ref: "props.thirdValuePrefix", label: "Third Value Prefix", type: "string", defaultValue: "", expression: "optional", show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableThird === true; } },
                        thirdValueSuffix: { ref: "props.thirdValueSuffix", label: "Third Value Suffix", type: "string", defaultValue: "", expression: "optional", show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableThird === true; } },
                        thirdIconUrl: { ref: "props.thirdIconUrl", label: "Third Icon URL", type: "string", defaultValue: "", show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableThird === true; } },
                        thirdIconSize: { ref: "props.thirdIconSize", label: "Third Icon Size (px)", type: "number", defaultValue: 16, show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableThird === true; } },
                        thirdIconPosition: { ref: "props.thirdIconPosition", label: "Third Icon Position", type: "string", component: "dropdown", defaultValue: "before", options: [{ value: "before", label: "Before value" }, { value: "after", label: "After value" }, { value: "top", label: "Above Title" }], show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableThird === true; } },
                        thirdValueColorExpr: { ref: "props.thirdValueColorExpr", label: "Value Color Expression", type: "string", component: "expression", expression: "optional", defaultValue: "", show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableThird === true; } },
                        thirdAutoColorBySign: { ref: "props.thirdAutoColorBySign", type: "boolean", label: "Auto Color by Sign (+/-)", defaultValue: false, show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableThird === true; } },
                        thirdShowArrows: { ref: "props.thirdShowArrows", type: "boolean", label: "Show Arrows", defaultValue: false, show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableThird === true; } },
                        thirdArrowExpr: { ref: "props.thirdArrowExpr", label: "Custom Arrow Expression", type: "string", component: "expression", expression: "optional", defaultValue: "", show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableThird === true && d.props.thirdShowArrows === true; }, help: "Override arrow character (e.g. ↑, ↓, ▲, ▼, or expression)" },
                        thirdArrowStyle: {
                            label: "Arrow Style", type: "items", show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableThird === true && d.props.thirdShowArrows === true; }, items: {
                                thirdPosColor: { ref: "props.thirdPosColor", type: "string", component: "color-picker", label: "Up Arrow Color (↑)", defaultValue: "#21a46f", dualOutput: true },
                                thirdNegColor: { ref: "props.thirdNegColor", type: "string", component: "color-picker", label: "Down Arrow Color (↓)", defaultValue: "#e04e4e", dualOutput: true },
                                thirdInvertArrowLogic: { ref: "props.thirdInvertArrowLogic", type: "boolean", label: "Invert Arrow Logic", defaultValue: false },
                                thirdApplyArrowColorToValue: { ref: "props.thirdApplyArrowColorToValue", type: "boolean", label: "Apply Arrow Color to Value", defaultValue: false }
                            }
                        },
                        thirdTrendText: { ref: "props.thirdTrendText", label: "Third Trend Text", type: "string", component: "expression", expression: "optional", defaultValue: "", show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableThird === true; } },
                        thirdTrendColor: { ref: "props.thirdTrendColor", label: "Third Trend Color", type: "string", component: "color-picker", defaultValue: "#999999", dualOutput: true, show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return (m === "comparison" || m === "both") && d.props.enableThird === true && d.props.thirdTrendText && String(d.props.thirdTrendText).trim() !== ""; } },

                        compValueFontSize: { ref: "props.compValueFontSize", label: "Comparison KPI Font Size (px)", type: "number", defaultValue: 18, show: function (d) { var m = d.props.bottomSectionMode || "comparison"; return m === "comparison" || m === "both"; } }
                    }
                },


                // ============================================
                // INTERACTIONS PANEL
                // ============================================
                interactions: {
                    label: "Interactions",
                    type: "items",
                    items: {
                        clickActionType: {
                            ref: "props.clickActionType",
                            label: "On Click Action",
                            type: "string",
                            component: "dropdown",
                            defaultValue: "none",
                            options: [
                                { value: "none", label: "None" },
                                { value: "gotoSheet", label: "Go to Sheet" },
                                { value: "openUrl", label: "Open URL" }
                            ]
                        },
                        clickSheetId: {
                            ref: "props.clickSheetId",
                            label: "Sheet ID",
                            type: "string",
                            expression: "optional",
                            defaultValue: "",
                            show: function (d) { return d.props.clickActionType === "gotoSheet"; },
                            help: "Enter the Sheet ID to navigate to"
                        },
                        clickUrl: {
                            ref: "props.clickUrl",
                            label: "URL",
                            type: "string",
                            expression: "optional",
                            defaultValue: "",
                            show: function (d) { return d.props.clickActionType === "openUrl"; },
                            help: "Enter URL to open (use =expression for dynamic URLs)"
                        },
                        clickUrlNewTab: {
                            ref: "props.clickUrlNewTab",
                            type: "boolean",
                            label: "Open in New Tab",
                            defaultValue: true,
                            show: function (d) { return d.props.clickActionType === "openUrl"; }
                        }
                    }
                },

                // ============================================
                // APPEARANCE PANEL (MOVED TO BOTTOM)
                // ============================================
                appearanceOptions: {
                    label: "Appearance Options",
                    type: "items",
                    items: {
                        // Native Qlik Sense Appearance Settings (merged into Appearance Options)
                        appearance: {
                            uses: "settings"
                        },
                        colorsAndBorder: {
                            type: "items",
                            label: "Colors & Border",
                            items: {
                                bgColor: {
                                    ref: "props.bgColor",
                                    label: "Background Color",
                                    type: "string",
                                    component: "color-picker",
                                    defaultValue: "#ffffff",
                                    dualOutput: true
                                },
                                enableGradient: {
                                    ref: "props.enableGradient",
                                    label: "Use Gradient Background",
                                    type: "boolean",
                                    defaultValue: false
                                },
                                bgColor2: {
                                    ref: "props.bgColor2",
                                    label: "Gradient End Color",
                                    type: "string",
                                    component: "color-picker",
                                    defaultValue: "#667eea",
                                    dualOutput: true,
                                    show: d => d.props.enableGradient === true
                                },
                                gradientDirection: {
                                    ref: "props.gradientDirection",
                                    label: "Gradient Direction",
                                    type: "string",
                                    component: "dropdown",
                                    defaultValue: "to right",
                                    options: [
                                        { value: "to right", label: "Left → Right" },
                                        { value: "to left", label: "Right → Left" },
                                        { value: "to bottom", label: "Top → Bottom" },
                                        { value: "to top", label: "Bottom → Top" },
                                        { value: "to bottom right", label: "Diagonal ↘" },
                                        { value: "to bottom left", label: "Diagonal ↙" },
                                        { value: "to top right", label: "Diagonal ↗" },
                                        { value: "to top left", label: "Diagonal ↖" }
                                    ],
                                    show: d => d.props.enableGradient === true
                                },
                                conditionalBgColor: {
                                    ref: "props.conditionalBgColor",
                                    label: "Conditional Background Color",
                                    type: "string",
                                    component: "expression",
                                    expression: "optional",
                                    defaultValue: "",
                                    help: "Expression returning a color (e.g. =If(Sum(Sales)>1000,'#4CAF50','#F44336')). Overrides background when not empty."
                                },
                                conditionalBgType: {
                                    ref: "props.conditionalBgType",
                                    label: "Conditional Background Style",
                                    type: "string",
                                    component: "dropdown",
                                    defaultValue: "solid",
                                    options: [
                                        { value: "solid", label: "Solid Color" },
                                        { value: "gradient", label: "Gradient Fade" }
                                    ],
                                    show: function (d) {
                                        return d.props && d.props.conditionalBgColor && d.props.conditionalBgColor.toString().trim() !== "";
                                    }
                                },
                                conditionalGradientDirection: {
                                    ref: "props.conditionalGradientDirection",
                                    label: "Gradient Direction",
                                    type: "string",
                                    component: "dropdown",
                                    defaultValue: "to right",
                                    options: [
                                        { value: "to right", label: "Left → Right" },
                                        { value: "to left", label: "Right → Left" },
                                        { value: "to bottom", label: "Top → Bottom" },
                                        { value: "to top", label: "Bottom → Top" },
                                        { value: "to bottom right", label: "Diagonal ↘" },
                                        { value: "to bottom left", label: "Diagonal ↙" },
                                        { value: "to top right", label: "Diagonal ↗" },
                                        { value: "to top left", label: "Diagonal ↖" }
                                    ],
                                    show: function (d) {
                                        return d.props && d.props.conditionalBgColor && d.props.conditionalBgColor.toString().trim() !== ""
                                            && d.props.conditionalBgType === "gradient";
                                    }
                                },
                                conditionalGradientEndColor: {
                                    ref: "props.conditionalGradientEndColor",
                                    label: "Gradient End Color",
                                    type: "string",
                                    component: "color-picker",
                                    defaultValue: "#ffffff",
                                    dualOutput: true,
                                    show: function (d) {
                                        return d.props && d.props.conditionalBgColor && d.props.conditionalBgColor.toString().trim() !== ""
                                            && d.props.conditionalBgType === "gradient";
                                    }
                                },
                                borderColor: {
                                    ref: "props.borderColor",
                                    label: "Border Color",
                                    type: "string",
                                    component: "color-picker",
                                    defaultValue: "#e0e0e0",
                                    dualOutput: true
                                },
                                showBorder: {
                                    ref: "props.showBorder",
                                    label: "Show Border",
                                    type: "boolean",
                                    defaultValue: true
                                },
                                borderRadius: {
                                    ref: "props.borderRadius",
                                    label: "Border Radius (px)",
                                    type: "number",
                                    defaultValue: 8
                                },
                                borderWidth: {
                                    ref: "props.borderWidth",
                                    label: "Border Width (px)",
                                    type: "number",
                                    defaultValue: 1
                                },
                                shadowDepth: {
                                    ref: "props.shadowDepth",
                                    label: "Shadow Depth",
                                    type: "string",
                                    component: "dropdown",
                                    defaultValue: "none",
                                    options: [
                                        { value: "none", label: "None" },
                                        { value: "subtle", label: "Subtle" },
                                        { value: "medium", label: "Medium" },
                                        { value: "strong", label: "Strong" },
                                        { value: "custom", label: "Custom" }
                                    ]
                                },
                                shadowColor: {
                                    ref: "props.shadowColor",
                                    label: "Shadow Color",
                                    type: "string",
                                    component: "color-picker",
                                    defaultValue: "#000000",
                                    dualOutput: true,
                                    show: d => d.props.shadowDepth === "custom"
                                },
                                shadowOffsetX: {
                                    ref: "props.shadowOffsetX",
                                    label: "Shadow X Offset (px)",
                                    type: "number",
                                    defaultValue: 0,
                                    show: d => d.props.shadowDepth === "custom"
                                },
                                shadowOffsetY: {
                                    ref: "props.shadowOffsetY",
                                    label: "Shadow Y Offset (px)",
                                    type: "number",
                                    defaultValue: 4,
                                    show: d => d.props.shadowDepth === "custom"
                                },
                                shadowBlur: {
                                    ref: "props.shadowBlur",
                                    label: "Shadow Blur (px)",
                                    type: "number",
                                    defaultValue: 12,
                                    show: d => d.props.shadowDepth === "custom"
                                },
                                shadowSpread: {
                                    ref: "props.shadowSpread",
                                    label: "Shadow Spread (px)",
                                    type: "number",
                                    defaultValue: 0,
                                    show: d => d.props.shadowDepth === "custom"
                                }
                            }
                        },
                        dividerOptions: {
                            type: "items",
                            label: "Divider Options",
                            items: {
                                showDividerH: {
                                    ref: "props.showDividerH",
                                    label: "Show Horizontal Divider",
                                    type: "boolean",
                                    defaultValue: true
                                },
                                dividerHColor: {
                                    ref: "props.dividerHColor",
                                    label: "Horizontal Divider Color",
                                    type: "string",
                                    component: "color-picker",
                                    defaultValue: "#ececec",
                                    dualOutput: true,
                                    show: d => d.props.showDividerH !== false
                                },
                                dividerHWidth: {
                                    ref: "props.dividerHWidth",
                                    label: "Horizontal Divider Width (px)",
                                    type: "number",
                                    defaultValue: 1,
                                    show: d => d.props.showDividerH !== false
                                },
                                dividerHPosition: {
                                    ref: "props.dividerHPosition",
                                    label: "Horizontal Divider Position (px)",
                                    type: "number",
                                    defaultValue: null,
                                    expression: "optional",
                                    help: "Move divider up (negative) or down (positive). Leave empty for auto positioning.",
                                    show: d => d.props.showDividerH !== false
                                },
                                showDividerV: {
                                    ref: "props.showDividerV",
                                    label: "Show Vertical Divider",
                                    type: "boolean",
                                    defaultValue: true
                                },
                                dividerVColor: {
                                    ref: "props.dividerVColor",
                                    label: "Vertical Divider Color",
                                    type: "string",
                                    component: "color-picker",
                                    defaultValue: "#ebebeb",
                                    dualOutput: true,
                                    show: d => d.props.showDividerV !== false
                                },
                                dividerVHeight: {
                                    ref: "props.dividerVHeight",
                                    label: "Vertical Divider Height (px)",
                                    type: "number",
                                    defaultValue: null,
                                    expression: "optional",
                                    help: "Leave empty for auto (matches comparison blocks height). Set a custom height in pixels.",
                                    show: d => d.props.showDividerV !== false
                                },
                                dividerVWidth: {
                                    ref: "props.dividerVWidth",
                                    label: "Vertical Divider Width (px)",
                                    type: "number",
                                    defaultValue: 1,
                                    show: d => d.props.showDividerV !== false
                                }
                            }
                        },
                        animationGroup: {
                            label: "Animation",
                            type: "items",
                            items: {
                                enableCountUp: {
                                    ref: "props.enableCountUp",
                                    label: "Count-up Animation",
                                    type: "boolean",
                                    defaultValue: true
                                },
                                countUpDuration: {
                                    ref: "props.countUpDuration",
                                    label: "Animation Speed",
                                    type: "string",
                                    component: "dropdown",
                                    defaultValue: "600",
                                    options: [
                                        { value: "400", label: "Fast (0.4s)" },
                                        { value: "600", label: "Normal (0.6s)" },
                                        { value: "900", label: "Slow (0.9s)" },
                                        { value: "1200", label: "Very Slow (1.2s)" }
                                    ],
                                    show: d => d.props.enableCountUp !== false
                                }
                            }
                        },
                        paddingGroup: {
                            label: "Vertical Divider Padding",
                            type: "items",
                            items: {
                                paddingTop: {
                                    ref: "props.paddingTop",
                                    type: "number",
                                    label: "Top padding",
                                    defaultValue: 0
                                },
                                paddingBottom: {
                                    ref: "props.paddingBottom",
                                    type: "number",
                                    label: "Bottom padding",
                                    defaultValue: 5
                                }
                            }
                        },
                        layoutDensity: {
                            label: "Layout Density",
                            type: "items",
                            items: {
                                denseMode: {
                                    ref: "props.denseMode",
                                    label: "Dense / Compact Mode",
                                    type: "boolean",
                                    defaultValue: false,
                                    help: "Strips non-essential whitespace, reduces gaps and padding for grid-heavy dashboards."
                                }
                            }
                        }
                    }
                },

                // ============================================
                // TOOLTIP SECTION
                // ============================================
                tooltipSection: {
                    label: "Tooltip",
                    type: "items",
                    items: {
                        // 1. Enable Tooltip - boolean toggle
                        enableTooltip: {
                            ref: "props.enableTooltip",
                            label: "Enable Tooltip",
                            type: "boolean",
                            defaultValue: true
                        },
                        // 2. Tooltip Icon - dropdown with various Leonardo UI icons
                        tooltipIcon: {
                            ref: "props.tooltipIcon",
                            label: "Tooltip Icon",
                            type: "string",
                            component: "dropdown",
                            defaultValue: "info",
                            options: [
                                { value: "help", label: "Help" },
                                { value: "info", label: "Info" },
                                { value: "warning", label: "Warning" },
                                { value: "warning-triangle", label: "Warning Triangle" },
                                { value: "lightbulb", label: "Lightbulb" },
                                { value: "star", label: "Star" },
                                { value: "bookmark", label: "Bookmark" },
                                { value: "bell", label: "Bell" },
                                { value: "comment", label: "Comment" },
                                { value: "question", label: "Question" },
                                { value: "key", label: "Key" },
                                { value: "cogwheel", label: "Cogwheel" },
                                { value: "settings", label: "Settings" },
                                { value: "calendar", label: "Calendar" },
                                { value: "clock", label: "Clock" },
                                { value: "tag", label: "Tag" },
                                { value: "link", label: "Link" },
                                { value: "share", label: "Share" },
                                { value: "edit", label: "Edit" },
                                { value: "view", label: "View" },
                                { value: "download", label: "Download" },
                                { value: "upload", label: "Upload" },
                                { value: "export", label: "Export" },
                                { value: "import", label: "Import" },
                                { value: "print", label: "Print" },
                                { value: "save", label: "Save" },
                                { value: "close", label: "Close" },
                                { value: "tick", label: "Tick" },
                                { value: "plus", label: "Plus" },
                                { value: "minus", label: "Minus" },
                                { value: "arrow-up", label: "Arrow Up" },
                                { value: "arrow-down", label: "Arrow Down" },
                                { value: "arrow-left", label: "Arrow Left" },
                                { value: "arrow-right", label: "Arrow Right" },
                                { value: "triangle-top", label: "Triangle Top" },
                                { value: "triangle-bottom", label: "Triangle Bottom" },
                                { value: "triangle-left", label: "Triangle Left" },
                                { value: "triangle-right", label: "Triangle Right" },
                                { value: "home", label: "Home" },
                                { value: "person", label: "Person" },
                                { value: "folder", label: "Folder" },
                                { value: "file", label: "File" },
                                { value: "database", label: "Database" },
                                { value: "table", label: "Table" },
                                { value: "chart", label: "Chart" },
                                { value: "kpi", label: "KPI" },
                                { value: "bar-chart", label: "Bar Chart" },
                                { value: "line-chart", label: "Line Chart" },
                                { value: "pie-chart", label: "Pie Chart" },
                                { value: "filter", label: "Filter" },
                                { value: "search", label: "Search" },
                                { value: "lock", label: "Lock" },
                                { value: "unlock", label: "Unlock" },
                                { value: "eye", label: "Eye" },
                                { value: "code", label: "Code" },
                                { value: "expression", label: "Expression" }
                            ],
                            show: d => d.props.enableTooltip === true
                        },
                        // 3. Icon Font Size - number input
                        tooltipIconSize: {
                            ref: "props.tooltipIconSize",
                            label: "Icon Font Size (px)",
                            type: "number",
                            defaultValue: 20,
                            show: d => d.props.enableTooltip === true
                        },
                        // 4. Tooltip Mode - toggle switch (Standard Tooltip vs Flip Card)
                        tooltipMode: {
                            ref: "props.tooltipMode",
                            label: "Insights Flip Card",
                            type: "boolean",
                            defaultValue: false,
                            show: d => d.props.enableTooltip === true
                        },
                        // 4b. Flip Trigger
                        flipTrigger: {
                            ref: "props.flipTrigger",
                            label: "Flip Trigger",
                            type: "string",
                            component: "dropdown",
                            defaultValue: "iconHover",
                            options: [
                                { value: "iconHover", label: "Icon Hover" },
                                { value: "cardHover", label: "Card Hover" },
                                { value: "iconClick", label: "Icon Click (toggle)" }
                            ],
                            show: d => d.props.enableTooltip === true && d.props.tooltipMode === true
                        },
                        // 4c. Inherit card background on back face
                        flipBackInheritBg: {
                            ref: "props.flipBackInheritBg",
                            label: "Back Inherits Card Background",
                            type: "boolean",
                            defaultValue: true,
                            show: d => d.props.enableTooltip === true && d.props.tooltipMode === true
                        },
                        // 4d. Back face title
                        flipBackTitle: {
                            ref: "props.flipBackTitle",
                            label: "Back Title",
                            type: "string",
                            expression: "optional",
                            defaultValue: "",
                            show: d => d.props.enableTooltip === true && d.props.tooltipMode === true
                        },
                        flipBackTitleFontSize: {
                            ref: "props.flipBackTitleFontSize",
                            label: "Back Title Font Size (px)",
                            type: "number",
                            defaultValue: 13,
                            show: d => d.props.enableTooltip === true && d.props.tooltipMode === true && d.props.flipBackTitle && String(d.props.flipBackTitle).trim() !== ""
                        },
                        flipBackTitleColor: {
                            ref: "props.flipBackTitleColor",
                            label: "Back Title Color",
                            type: "string",
                            component: "color-picker",
                            defaultValue: "#555555",
                            dualOutput: true,
                            show: d => d.props.enableTooltip === true && d.props.tooltipMode === true && d.props.flipBackTitle && String(d.props.flipBackTitle).trim() !== ""
                        },
                        // 4e. Back face divider
                        flipBackShowDivider: {
                            ref: "props.flipBackShowDivider",
                            label: "Show Back Divider",
                            type: "boolean",
                            defaultValue: true,
                            show: d => d.props.enableTooltip === true && d.props.tooltipMode === true
                        },
                        flipBackDividerColor: {
                            ref: "props.flipBackDividerColor",
                            label: "Back Divider Color",
                            type: "string",
                            component: "color-picker",
                            defaultValue: "#e0e0e0",
                            dualOutput: true,
                            show: d => d.props.enableTooltip === true && d.props.tooltipMode === true && d.props.flipBackShowDivider !== false
                        },
                        // 4f. Back face text alignment
                        flipBackTextAlign: {
                            ref: "props.flipBackTextAlign",
                            label: "Back Text Alignment",
                            type: "string",
                            component: "dropdown",
                            defaultValue: "center",
                            options: [
                                { value: "left", label: "Left" },
                                { value: "center", label: "Center" },
                                { value: "right", label: "Right" }
                            ],
                            show: d => d.props.enableTooltip === true && d.props.tooltipMode === true
                        },
                        // 5. Tooltip Description
                        tooltipText: {
                            ref: "props.tooltipText",
                            label: "Tooltip Description",
                            type: "string",
                            component: "textarea",
                            expression: "optional",
                            defaultValue: "",
                            show: d => d.props.enableTooltip === true
                        },
                        tooltipDescriptionFontSize: {
                            ref: "props.tooltipDescriptionFontSize",
                            label: "Description Font Size (px)",
                            type: "number",
                            defaultValue: 14,
                            show: d => d.props.enableTooltip === true && d.props.tooltipMode === true
                        },
                        tooltipDescriptionColor: {
                            ref: "props.tooltipDescriptionColor",
                            label: "Description Color",
                            type: "string",
                            component: "color-picker",
                            defaultValue: "#333333",
                            dualOutput: true,
                            show: d => d.props.enableTooltip === true && d.props.tooltipMode === true
                        },
                        // --- INSIGHT ROW 1 ---
                        enableInsightExpression: {
                            ref: "props.enableInsightExpression",
                            label: "Enable Insight Row 1",
                            type: "boolean",
                            defaultValue: true,
                            show: d => d.props.enableTooltip === true && d.props.tooltipMode === true
                        },
                        tooltipInsightExpression: {
                            ref: "props.tooltipInsightExpression",
                            label: "Row 1 Expression",
                            type: "string",
                            expression: "optional",
                            defaultValue: "",
                            show: d => d.props.enableTooltip === true && d.props.tooltipMode === true && d.props.enableInsightExpression !== false
                        },
                        tooltipInsightFontSize: {
                            ref: "props.tooltipInsightFontSize",
                            label: "Row 1 Font Size (px)",
                            type: "number",
                            defaultValue: 16,
                            show: d => d.props.enableTooltip === true && d.props.tooltipMode === true && d.props.enableInsightExpression !== false
                        },
                        tooltipInsightColor: {
                            ref: "props.tooltipInsightColor",
                            label: "Row 1 Color",
                            type: "string",
                            component: "color-picker",
                            defaultValue: "#667eea",
                            dualOutput: true,
                            show: d => d.props.enableTooltip === true && d.props.tooltipMode === true && d.props.enableInsightExpression !== false
                        },
                        // --- INSIGHT ROW 2 ---
                        enableInsightRow2: {
                            ref: "props.enableInsightRow2",
                            label: "Enable Insight Row 2",
                            type: "boolean",
                            defaultValue: false,
                            show: d => d.props.enableTooltip === true && d.props.tooltipMode === true
                        },
                        insightRow2Label: {
                            ref: "props.insightRow2Label",
                            label: "Row 2 Label",
                            type: "string",
                            expression: "optional",
                            defaultValue: "",
                            show: d => d.props.enableTooltip === true && d.props.tooltipMode === true && d.props.enableInsightRow2 === true
                        },
                        insightRow2Expression: {
                            ref: "props.insightRow2Expression",
                            label: "Row 2 Expression",
                            type: "string",
                            expression: "optional",
                            defaultValue: "",
                            show: d => d.props.enableTooltip === true && d.props.tooltipMode === true && d.props.enableInsightRow2 === true
                        },
                        insightRow2FontSize: {
                            ref: "props.insightRow2FontSize",
                            label: "Row 2 Font Size (px)",
                            type: "number",
                            defaultValue: 16,
                            show: d => d.props.enableTooltip === true && d.props.tooltipMode === true && d.props.enableInsightRow2 === true
                        },
                        insightRow2Color: {
                            ref: "props.insightRow2Color",
                            label: "Row 2 Color",
                            type: "string",
                            component: "color-picker",
                            defaultValue: "#667eea",
                            dualOutput: true,
                            show: d => d.props.enableTooltip === true && d.props.tooltipMode === true && d.props.enableInsightRow2 === true
                        },
                        // --- INSIGHT ROW 3 ---
                        enableInsightRow3: {
                            ref: "props.enableInsightRow3",
                            label: "Enable Insight Row 3",
                            type: "boolean",
                            defaultValue: false,
                            show: d => d.props.enableTooltip === true && d.props.tooltipMode === true
                        },
                        insightRow3Label: {
                            ref: "props.insightRow3Label",
                            label: "Row 3 Label",
                            type: "string",
                            expression: "optional",
                            defaultValue: "",
                            show: d => d.props.enableTooltip === true && d.props.tooltipMode === true && d.props.enableInsightRow3 === true
                        },
                        insightRow3Expression: {
                            ref: "props.insightRow3Expression",
                            label: "Row 3 Expression",
                            type: "string",
                            expression: "optional",
                            defaultValue: "",
                            show: d => d.props.enableTooltip === true && d.props.tooltipMode === true && d.props.enableInsightRow3 === true
                        },
                        insightRow3FontSize: {
                            ref: "props.insightRow3FontSize",
                            label: "Row 3 Font Size (px)",
                            type: "number",
                            defaultValue: 16,
                            show: d => d.props.enableTooltip === true && d.props.tooltipMode === true && d.props.enableInsightRow3 === true
                        },
                        insightRow3Color: {
                            ref: "props.insightRow3Color",
                            label: "Row 3 Color",
                            type: "string",
                            component: "color-picker",
                            defaultValue: "#667eea",
                            dualOutput: true,
                            show: d => d.props.enableTooltip === true && d.props.tooltipMode === true && d.props.enableInsightRow3 === true
                        }
                    }
                },

                // ============================================
                // ALERTS SECTION
                // ============================================
                alertSection: {
                    label: "Alerts",
                    type: "items",
                    show: false,
                    items: {
                        enableAlert: {
                            ref: "props.enableAlert",
                            label: "Enable Alert",
                            type: "boolean",
                            defaultValue: false
                        },
                        alertHelpText: {
                            label: "Write an expression that returns 1 to trigger the alert, or 0 to hide it. Example: =If(Sum(Sales)/Sum(Target) < 0.5, 1, 0)",
                            component: "text",
                            show: function (d) { return d.props.enableAlert === true; }
                        },
                        alertExpression: {
                            ref: "props.alertExpression",
                            label: "Alert Condition Expression",
                            type: "string",
                            component: "expression",
                            expression: "optional",
                            defaultValue: "",
                            show: function (d) { return d.props.enableAlert === true; },
                            help: "Expression returning 1 (alert ON) or 0 (alert OFF). E.g.: =If(Sum(Sales)<1000, 1, 0)"
                        },
                        alertMessage: {
                            ref: "props.alertMessage",
                            label: "Alert Message",
                            type: "string",
                            expression: "optional",
                            defaultValue: "⚠ Below Target",
                            show: function (d) { return d.props.enableAlert === true; },
                            help: "Supports expressions. E.g.: ='⚠ Sales at ' & Round(Sum(Sales)/Sum(Target)*100) & '%'"
                        },
                        alertPosition: {
                            ref: "props.alertPosition",
                            label: "Alert Position",
                            type: "string",
                            component: "dropdown",
                            defaultValue: "top",
                            options: [
                                { value: "top", label: "Top of Card" },
                                { value: "bottom", label: "Bottom of Card" },
                                { value: "badge", label: "Corner Badge" }
                            ],
                            show: function (d) { return d.props.enableAlert === true; }
                        },
                        alertColor: {
                            ref: "props.alertColor",
                            label: "Alert Background Color",
                            type: "string",
                            component: "color-picker",
                            defaultValue: "#e74c3c",
                            dualOutput: true,
                            show: function (d) { return d.props.enableAlert === true; }
                        },
                        alertTextColor: {
                            ref: "props.alertTextColor",
                            label: "Alert Text Color",
                            type: "string",
                            component: "color-picker",
                            defaultValue: "#ffffff",
                            dualOutput: true,
                            show: function (d) { return d.props.enableAlert === true; }
                        },
                        alertFontSize: {
                            ref: "props.alertFontSize",
                            label: "Alert Font Size (px)",
                            type: "number",
                            defaultValue: 12,
                            show: function (d) { return d.props.enableAlert === true; }
                        },
                        enableBrowserNotification: {
                            ref: "props.enableBrowserNotification",
                            label: "Browser Desktop Notification",
                            type: "boolean",
                            defaultValue: false,
                            show: function (d) { return d.props.enableAlert === true; },
                            help: "Shows a browser notification when the alert triggers. User must grant permission on first use."
                        }
                    }
                },

                // ============================================
                // ABOUT SECTION
                // ============================================
                about: {
                    component: "items",
                    label: "About",
                    items: {
                        header: {
                            label: "Modern KPI Card",
                            style: "header",
                            component: "text"
                        },
                        paragraph1: {
                            label: "Modern KPI Card is a visualization extension that provides enhanced design options and better UI for your KPI objects.",
                            component: "text"
                        },
                        paragraph2: {
                            label: "Modern KPI Card offers a clean, modern interface with customizable styling, smooth animations, and responsive layout.",
                            component: "text"
                        },
                        paragraph3: {
                            label: "Created by Ala Aldin Hija",
                            component: "text"
                        },
                        paragraph4: {
                            label: "Version: 2.1.0",
                            component: "text"
                        }
                    }
                }
            }
        },

        // ============================================
        // PAINT FUNCTION - MAIN RENDER
        // ============================================
        // Store backendApi when extension is initialized
        // This is called by Qlik Sense when the extension is created
        // Note: backendApi is provided by Qlik Sense, not defined by us

        paint: async function ($element, layout) {
            // CRITICAL: Ensure root $element fills 100% width and height
            // This is the root div that Qlik Sense passes to the extension
            $element.css({
                'width': '100%',
                'height': '100%',
                'margin': '0',
                'padding': '0',
                'box-sizing': 'border-box',
                'min-width': '0',
                'min-height': '0',
                'max-width': 'none',
                'max-height': 'none',
                'display': 'block',
                'position': 'relative'
            });

            // Pre-render: evaluate expression-based properties so resolved values
            // are available when building the HTML template.
            // Uses the same proven createGenericObject + await pattern.
            {
                var _bg  = layout.props.conditionalBgColor || "";
                var _sub = layout.props.mainSubtitle || "";
                var _ttl = layout.props.mainTitle || "";
                var _lt  = layout.props.leftTitle || "";
                var _rt  = layout.props.rightTitle || "";
                var _tt  = layout.props.thirdTitle || "";
                var _alertExpr = layout.props.alertExpression || "";
                var _alertMsg  = layout.props.alertMessage || "";
                var _needBg  = typeof _bg  === "string" && _bg.trim().charAt(0)  === "=";
                var _needSub = typeof _sub === "string" && _sub.trim().charAt(0) === "=";
                var _needTtl = typeof _ttl === "string" && _ttl.trim().charAt(0) === "=";
                var _needLt  = typeof _lt  === "string" && _lt.trim().charAt(0)  === "=";
                var _needRt  = typeof _rt  === "string" && _rt.trim().charAt(0)  === "=";
                var _needTt  = typeof _tt  === "string" && _tt.trim().charAt(0)  === "=";
                var _needAlertExpr = layout.props.enableAlert === true && typeof _alertExpr === "string" && _alertExpr.trim().charAt(0) === "=";
                var _needAlertMsg  = layout.props.enableAlert === true && typeof _alertMsg  === "string" && _alertMsg.trim().charAt(0)  === "=";

                if (_needBg || _needSub || _needTtl || _needLt || _needRt || _needTt || _needAlertExpr || _needAlertMsg) {
                    try {
                        var _app = qlik.currApp(this) || qlik.currApp($element);
                        if (_app && _app.createGenericObject) {
                            var _def = {};
                            if (_needBg)  _def.bg  = { qStringExpression: _bg.replace(/\/\/.*$/gm, '') };
                            if (_needSub) _def.sub = { qStringExpression: _sub.replace(/\/\/.*$/gm, '') };
                            if (_needTtl) _def.ttl = { qStringExpression: _ttl.replace(/\/\/.*$/gm, '') };
                            if (_needLt)  _def.lt  = { qStringExpression: _lt.replace(/\/\/.*$/gm, '') };
                            if (_needRt)  _def.rt  = { qStringExpression: _rt.replace(/\/\/.*$/gm, '') };
                            if (_needTt)  _def.tt  = { qStringExpression: _tt.replace(/\/\/.*$/gm, '') };
                            if (_needAlertExpr) _def.alertExpr = { qStringExpression: _alertExpr.replace(/\/\/.*$/gm, '') };
                            if (_needAlertMsg)  _def.alertMsg  = { qStringExpression: _alertMsg.replace(/\/\/.*$/gm, '') };
                            var _sObj = null;
                            try {
                                _sObj = await _app.createGenericObject(_def);
                                var _lo = await _sObj.getLayout();
                                if (_needBg && _lo.bg != null) {
                                    var bgVal = String(_lo.bg).trim();
                                    if (bgVal && bgVal !== "NaN" && bgVal !== "undefined") {
                                        if (/^\d+$/.test(bgVal)) {
                                            var argb = parseInt(bgVal, 10);
                                            bgVal = "#" + ((1 << 24) | (((argb >> 16) & 0xFF) << 16) | (((argb >> 8) & 0xFF) << 8) | (argb & 0xFF)).toString(16).slice(1);
                                        }
                                        layout.props.conditionalBgColor = bgVal;
                                    } else { layout.props.conditionalBgColor = null; }
                                }
                                if (_needSub && _lo.sub != null && String(_lo.sub).trim() !== "")
                                    layout.props.mainSubtitle = String(_lo.sub).trim();
                                if (_needTtl && _lo.ttl != null && String(_lo.ttl).trim() !== "")
                                    layout.props.mainTitle = String(_lo.ttl).trim();
                                if (_needLt && _lo.lt != null && String(_lo.lt).trim() !== "")
                                    layout.props.leftTitle = String(_lo.lt).trim();
                                if (_needRt && _lo.rt != null && String(_lo.rt).trim() !== "")
                                    layout.props.rightTitle = String(_lo.rt).trim();
                                if (_needTt && _lo.tt != null && String(_lo.tt).trim() !== "")
                                    layout.props.thirdTitle = String(_lo.tt).trim();
                                if (_needAlertExpr && _lo.alertExpr != null)
                                    layout.props._alertExprResolved = String(_lo.alertExpr).trim();
                                if (_needAlertMsg && _lo.alertMsg != null && String(_lo.alertMsg).trim() !== "")
                                    layout.props.alertMessage = String(_lo.alertMsg).trim();
                            } finally {
                                if (_sObj && _app.destroySessionObject) {
                                    try { _app.destroySessionObject(_sObj.id); } catch (_) {}
                                }
                            }
                        }
                    } catch (e) {
                        console.warn("ModernKPI: Expression evaluation failed", e);
                        if (_needBg) layout.props.conditionalBgColor = null;
                    }
                }
            }

            try {
                // Store backendApi reference if available (Qlik Sense provides this)
                if (this.backendApi && !$element.data("backendApi")) {
                    $element.data("backendApi", this.backendApi);
                }

                // Handle native Qlik Sense General settings (Show hover menu, Show titles, Show details)
                // Check if hover menu should be hidden
                // Qlik Sense stores this in layout.qMeta.showHoverMenu (boolean)
                // Default is true (show menu), so we hide only when explicitly false
                const showHoverMenu = layout.qMeta?.showHoverMenu !== false;
                if (layout.qMeta?.showHoverMenu === false) {
                    // Add class to hide hover menu when explicitly disabled
                    $element.addClass('kpi-hide-hover-menu');
                    // Also add to parent Qlik containers for CSS targeting
                    $element.parents('.qv-object, .qv-object-wrapper, .qv-object-content, .qv-object-content-wrapper').addClass('kpi-hide-hover-menu');
                } else {
                    // Remove class if menu should be shown (default behavior)
                    $element.removeClass('kpi-hide-hover-menu');
                    $element.parents('.qv-object, .qv-object-wrapper, .qv-object-content, .qv-object-content-wrapper').removeClass('kpi-hide-hover-menu');
                }
                // Clear previous tooltip (scoped to this card only)
                $element.find(".kpi-tooltip").remove();


                // Check if measures are defined - if not, show empty state
                const cube = layout.qHyperCube;
                const hasMeasures = cube && cube.qMeasureInfo && cube.qMeasureInfo.length > 0;
                const hasDimensions = cube && cube.qDimensionInfo && cube.qDimensionInfo.length > 0;

                // If no measures defined, show empty state
                if (!hasMeasures) {
                    // Remove any Qlik wrapper styling and ensure white background
                    $element.closest('.qv-object, .qv-object-wrapper, .qv-object-content, .qv-object-content-wrapper').css({
                        'background': 'transparent',
                        'border': 'none',
                        'padding': '0',
                        'margin': '0',
                        'box-shadow': 'none',
                        'width': '100%',
                        'height': '100%',
                        'box-sizing': 'border-box'
                    });

                    $element.html(`
                    <div style="padding:40px;text-align:center;color:#999;display:flex;flex-direction:column;justify-content:center;align-items:center;width:100%;height:100%;background:white;border:none;box-shadow:none;box-sizing:border-box;">
                        <div style="font-size:48px;margin-bottom:16px;opacity:0.3;font-weight:bold;color:#999;">#1</div>
                        <div style="font-size:14px;color:#666;">Choose measures to display</div>
                    </div>
                `);
                    return qlik.Promise.resolve();
                }

                // Check if we have data pages - if not, show loading skeleton
                if (!cube.qDataPages || cube.qDataPages.length === 0 ||
                    !cube.qDataPages[0] || !cube.qDataPages[0].qMatrix) {
                    // Show a shimmer skeleton that mirrors the real card layout
                    var skelBg = fixColor(layout.props.bgColor, "#ffffff");
                    var skelBg2 = layout.props.enableGradient ? fixColor(layout.props.bgColor2, "#667eea") : skelBg;
                    var skelDir = layout.props.gradientDirection || "to right";
                    var skelBackground = layout.props.enableGradient
                        ? 'linear-gradient(' + skelDir + ', ' + skelBg + ', ' + skelBg2 + ')'
                        : skelBg;
                    var skelRadius = layout.props.borderRadius || 5;
                    var skelMode = layout.props.bottomSectionMode || "comparison";
                    var skelShowComps = (skelMode === "comparison" || skelMode === "both") && (layout.props.enableLeft !== false || layout.props.enableRight !== false);
                    var skelShowChart = skelMode === "chart" || skelMode === "both";
                    var skelHasComps = skelShowComps;
                    $element.html(
                        '<div class="kpi-size-wrapper">' +
                        '<div class="kpi-container kpi-skeleton" style="border-radius:' + skelRadius + 'px;background:' + skelBackground + ';">' +
                        '<div>' +
                        '<div class="kpi-skeleton-bar kpi-skeleton-title"></div>' +
                        '<div class="kpi-skeleton-bar kpi-skeleton-value"></div>' +
                        '</div>' +
                        (skelShowChart ?
                            '<div class="kpi-skeleton-bar kpi-skeleton-chart"></div>'
                            : '') +
                        (skelHasComps ?
                            '<div>' +
                            '<div class="kpi-skeleton-bar kpi-skeleton-divider"></div>' +
                            '<div class="kpi-skeleton-comps">' +
                            '<div class="kpi-skeleton-comp"><div class="kpi-skeleton-bar kpi-skeleton-comp-title"></div><div class="kpi-skeleton-bar kpi-skeleton-comp-value"></div></div>' +
                            '<div class="kpi-skeleton-comp"><div class="kpi-skeleton-bar kpi-skeleton-comp-title"></div><div class="kpi-skeleton-bar kpi-skeleton-comp-value"></div></div>' +
                            '</div>' +
                            '</div>'
                            : '') +
                        '</div>' +
                        '</div>'
                    );
                    return qlik.Promise.resolve();
                }

                const page = cube.qDataPages[0];

                let matrix = page.qMatrix || [];
                // Check if dimension exists in hypercube (user adds it via Qlik's dimension panel)
                const hasDim = cube.qDimensionInfo && cube.qDimensionInfo.length > 0;

                // ============================================
                // DATA PAGINATION: Fetch more rows if needed for mini chart
                // When a dimension is present, the engine may return fewer rows than available.
                // Request up to 500 rows so the chart renders all dimension values.
                // ============================================
                const earlyMode = layout.props.bottomSectionMode || "comparison";
                const needsMoreData = (earlyMode === "chart" || earlyMode === "both") && hasDim;
                const totalRows = cube.qSize ? cube.qSize.qcy : 0;
                const maxFetchRows = 500;

                if (needsMoreData && matrix.length < Math.min(totalRows, maxFetchRows) && this.backendApi) {
                    var self = this;
                    var requestPage = [{
                        qTop: 0,
                        qLeft: 0,
                        qWidth: cube.qSize.qcx,
                        qHeight: Math.min(totalRows, maxFetchRows)
                    }];
                    return this.backendApi.getData(requestPage).then(function (dataPages) {
                        if (dataPages && dataPages.length > 0 && dataPages[0].qMatrix) {
                            layout.qHyperCube.qDataPages = dataPages;
                        }
                        return self.paint($element, layout);
                    });
                }

                // Column index mapping
                // If dimension is in props but not yet in hypercube, we'll handle it differently
                const colDim = (cube.qDimensionInfo && cube.qDimensionInfo.length > 0) ? 0 : null;
                const colMain = hasDim ? 1 : 0;
                const colChart = hasDim ? 2 : 1;
                const colLeft = hasDim ? 3 : 2;
                const colRight = hasDim ? 4 : 3;
                const colThird = hasDim ? 5 : 4;
                // X-axis measure column (if enabled and measure is defined)
                const hasXAxisMeasure = layout.props.showXAxis && layout.props.xAxisMeasure;
                const colXAxis = hasDim ? (hasXAxisMeasure ? 6 : null) : (hasXAxisMeasure ? 5 : null);
                // Second series column (qMeasures index 6)
                const hasSecondSeries = layout.props.enableSecondSeries === true;
                const colSecondSeries = hasSecondSeries ? (hasDim ? 7 : 6) : null;

                // ============================================
                // SORTING
                // ============================================
                if (layout.props.enableChartSort && matrix.length > 1) {
                    const sortBy = layout.props.chartSortBy || "dimension";
                    const orderFactor = layout.props.chartSortOrder === "desc" ? -1 : 1;

                    matrix = matrix.slice().sort((rowA, rowB) => {
                        let vA, vB;

                        if (sortBy === "dimension" && hasDim) {
                            const cA = rowA[0], cB = rowB[0];
                            vA = !isNaN(cA?.qNum) ? cA.qNum : (cA?.qText || "");
                            vB = !isNaN(cB?.qNum) ? cB.qNum : (cB?.qText || "");
                        } else if (sortBy === "measure") {
                            vA = rowA[colChart]?.qNum;
                            vB = rowB[colChart]?.qNum;
                        } else if (sortBy === "expression") {
                            const expr = (layout.props.chartSortExpression || "").trim().toLowerCase();
                            if (expr === "0" || expr === "dim") {
                                const cA = rowA[0], cB = rowB[0];
                                vA = cA?.qNum ?? cA?.qText ?? "";
                                vB = cB?.qNum ?? cB?.qText ?? "";
                            } else if (expr === "1" || expr === "chart") {
                                vA = rowA[colChart]?.qNum;
                                vB = rowB[colChart]?.qNum;
                            } else {
                                return 0;
                            }
                        } else {
                            return 0;
                        }

                        if (vA == null && vB == null) return 0;
                        if (vA == null) return -1 * orderFactor;
                        if (vB == null) return 1 * orderFactor;

                        if (!isNaN(+vA) && !isNaN(+vB)) return (+vA - +vB) * orderFactor;

                        const dA = new Date(vA), dB = new Date(vB);
                        if (!isNaN(dA.getTime()) && !isNaN(dB.getTime())) {
                            return (dA - dB) * orderFactor;
                        }

                        return String(vA).localeCompare(String(vB)) * orderFactor;
                    });
                }

                // ============================================
                // EXTRACT VALUES
                // ============================================
                /**
                 * Parse formatted number string (e.g., "0.0%", "1,234.56", "-5.2%")
                 * Returns numeric value or null if parsing fails
                 * Handles Qlik Sense formatted values including percentages
                 */
                function parseFormattedNumber(str) {
                    if (!str) return null;

                    // Convert to string if not already
                    const originalStr = String(str).trim();
                    if (originalStr === "" || originalStr === "-" || originalStr === "—" || originalStr === "null" || originalStr === "undefined") {
                        return null;
                    }

                    // Check if it's a percentage
                    const isPercent = originalStr.includes('%');

                    // Remove common formatting characters (commas, spaces, currency symbols, percent sign)
                    // But preserve the minus sign and decimal point
                    let cleaned = originalStr
                        .replace(/,/g, '')  // Remove thousand separators
                        .replace(/\s/g, '')  // Remove spaces
                        .replace(/%/g, '')  // Remove percent sign
                        .replace(/[^\d.\-+]/g, ''); // Keep only digits, dots, minus, plus

                    // Handle empty string after cleaning
                    if (cleaned === "" || cleaned === "-" || cleaned === "+") {
                        return null;
                    }

                    // Try to parse as float
                    const num = parseFloat(cleaned);
                    if (isNaN(num)) {
                        return null;
                    }

                    // Handle percentage values
                    // When NUM() formats a value with '%', it displays as percentage string
                    // Example: value 0.05 displays as "5.0%", value -0.1 displays as "-10.0%"
                    // But the actual stored value in qNum should be the decimal (0.05, -0.1)
                    // If we're parsing from qText, we need to convert back
                    if (isPercent) {
                        // If absolute value is > 1, it's in percentage form (5% = 5), convert to decimal
                        // If absolute value is <= 1, it might already be in decimal form, but since NUM() 
                        // with '%' format typically shows percentages > 1, we'll convert if > 1
                        if (Math.abs(num) > 1 || Math.abs(num) === 1) {
                            return num / 100;
                        }
                        // For values between -1 and 1 (excluding -1 and 1), keep as decimal
                        // This handles cases like "0.5%" which should be 0.005
                        return num / 100;
                    }

                    return num;
                }

                function getTotal(idx, col) {
                    // Try grand total first (more efficient)
                    if (cube.qGrandTotalRow && cube.qGrandTotalRow[idx] !== undefined) {
                        const cell = cube.qGrandTotalRow[idx];

                        if (!cell) {
                            // Fall through to matrix check
                        } else {
                            // Check for error state
                            if (cell.qIsError !== undefined && cell.qIsError === true) {
                                console.error(`[KPI] getTotal: Cell at index ${idx} has error. qError: ${cell.qError || 'Unknown error'}`);
                                return 0;
                            }

                            // First try qNum (numeric value)
                            if (cell.qNum !== undefined && cell.qNum !== null && typeof cell.qNum === "number" && !isNaN(cell.qNum)) {
                                return cell.qNum;
                            }

                            // If qNum is not available or invalid, try qText (formatted string)
                            if (cell.qText !== undefined && cell.qText !== null && cell.qText !== "") {
                                const parsed = parseFormattedNumber(String(cell.qText));
                                if (parsed !== null) {
                                    return parsed;
                                }
                                // silently ignore
                            } else {
                                // silently ignore
                            }
                        }
                    }

                    // Fallback to matrix rows
                    // For KPI measures, we typically want the single value, not a sum
                    // But if there are multiple rows, we'll sum them
                    if (matrix && matrix.length > 0 && col !== null && col !== undefined) {
                        // For single row, just return that value (common for KPIs)
                        if (matrix.length === 1 && matrix[0] && matrix[0][col]) {
                            const cell = matrix[0][col];

                            // Check for error state
                            if (cell.qIsError !== undefined && cell.qIsError === true) {
                                console.error(`[KPI] getTotal: Cell at column ${col} has error. qError: ${cell.qError || 'Unknown error'}`);
                                return 0;
                            }

                            // First try qNum (numeric value)
                            if (cell.qNum !== undefined && cell.qNum !== null && typeof cell.qNum === "number" && !isNaN(cell.qNum)) {
                                return cell.qNum;
                            }

                            // If qNum is not available or invalid, try qText (formatted string)
                            if (cell.qText !== undefined && cell.qText !== null && cell.qText !== "") {
                                const parsed = parseFormattedNumber(String(cell.qText));
                                if (parsed !== null) {
                                    return parsed;
                                }
                                // silently ignore
                            } else {
                                // silently ignore
                            }
                        } else {
                            // Multiple rows - sum them
                            let hasValidData = false;
                            const result = matrix.reduce((acc, row) => {
                                if (row && row[col]) {
                                    const cell = row[col];

                                    // Check for error state
                                    if (cell.qIsError !== undefined && cell.qIsError === true) {
                                        console.error(`[KPI] getTotal: Cell at column ${col} has error. qError: ${cell.qError || 'Unknown error'}`);
                                        return acc;
                                    }

                                    // First try qNum (numeric value)
                                    if (cell.qNum !== undefined && cell.qNum !== null && typeof cell.qNum === "number" && !isNaN(cell.qNum)) {
                                        hasValidData = true;
                                        return acc + cell.qNum;
                                    }

                                    // If qNum is not available or invalid, try qText (formatted string)
                                    if (cell.qText !== undefined && cell.qText !== null && cell.qText !== "") {
                                        const parsed = parseFormattedNumber(String(cell.qText));
                                        if (parsed !== null) {
                                            hasValidData = true;
                                            return acc + parsed;
                                        }
                                    }
                                }
                                return acc;
                            }, 0);

                            if (hasValidData) {
                                return result;
                            } else {
                                // silently ignore
                            }
                        }
                    } else {
                        // silently ignore
                    }

                    // Return 0 if no data available
                    return 0;
                }

                // Get numeric values for arrows/comparisons (still need qNum for logic)
                const mainVal = getTotal(0, colMain);
                const leftVal = layout.props.enableLeft !== false ? getTotal(2, colLeft) : null;
                const rightVal = layout.props.enableRight !== false ? getTotal(3, colRight) : null;
                const thirdVal = layout.props.enableThird === true ? getTotal(4, colThird) : null;

                // ============================================
                // FORMAT VALUES
                // ============================================
                // Helper function to get formatted value - use qText if "measure" format, otherwise use formatNumber
                function getFormattedValueForDisplay(val, formatType, currencySymbol, customMask, cell, measureInfo, durationPattern) {
                    // "measure" — always use Qlik's native formatting
                    if (formatType === "measure" && cell) {
                        if (cell.qText !== undefined && cell.qText !== null && cell.qText !== "") {
                            return cell.qText;
                        }
                    }

                    // "duration" — explicit duration format chosen by user
                    if (formatType === "duration") {
                        var pattern = durationPattern || "h:mm:ss";
                        return formatAsDuration(typeof val === "number" ? val : parseFloat(val), pattern);
                    }

                    // "auto" / "U" — try Qlik's native formatting first.
                    if (!formatType || formatType === "auto" || formatType === "U") {
                        // Check if the measure has a specific format type set natively
                        if (measureInfo && measureInfo.qNumFormat) {
                            const qType = measureInfo.qNumFormat.qType;
                            const qFmt = measureInfo.qNumFormat.qFmt || "";

                            // If Qlik has a specific format type (not "U" undefined), use qText
                            // Types: R=real, F=fixed, M=money, D=date, T=time, TS=timestamp, IV=interval/duration
                            if (qType && qType !== "U" && cell && cell.qText) {
                                return cell.qText;
                            }

                            // If the format pattern is a time/duration pattern, format it ourselves
                            if (qFmt && isTimePattern(qFmt)) {
                                return formatAsDuration(val, qFmt);
                            }
                        }

                        // Check if qText looks like a formatted value (not just a plain number)
                        if (cell && cell.qText !== undefined && cell.qText !== null && cell.qText !== "") {
                            const txt = String(cell.qText).trim();
                            const rawStr = String(val);
                            if (txt !== rawStr && (txt.includes(':') || /[a-zA-Z]/.test(txt) || txt !== parseFloat(txt).toString())) {
                                return txt;
                            }
                        }
                    }

                    // Explicit format types (number, currency, percent, km, custom)
                    return formatNumber(val, formatType, currencySymbol, customMask);
                }

                // Get cells for measure formatting
                const mainCell = (cube.qGrandTotalRow && cube.qGrandTotalRow[0]) || (matrix.length > 0 && matrix[0] && matrix[0][colMain] ? matrix[0][colMain] : null);
                const leftCell = layout.props.enableLeft !== false ? ((cube.qGrandTotalRow && cube.qGrandTotalRow[2]) || (matrix.length > 0 && matrix[0] && matrix[0][colLeft] ? matrix[0][colLeft] : null)) : null;
                const rightCell = layout.props.enableRight !== false ? ((cube.qGrandTotalRow && cube.qGrandTotalRow[3]) || (matrix.length > 0 && matrix[0] && matrix[0][colRight] ? matrix[0][colRight] : null)) : null;
                const thirdCell = layout.props.enableThird === true ? ((cube.qGrandTotalRow && cube.qGrandTotalRow[4]) || (matrix.length > 0 && matrix[0] && matrix[0][colThird] ? matrix[0][colThird] : null)) : null;

                // Get measure info for native formatting (Duration, Date, Time, etc.)
                const measureInfoArr = cube.qMeasureInfo || [];
                const mainMeasureInfo = measureInfoArr[0] || null;
                const leftMeasureInfo = measureInfoArr[2] || null;
                const rightMeasureInfo = measureInfoArr[3] || null;
                const thirdMeasureInfo = measureInfoArr[4] || null;

                const mainFormatted = getFormattedValueForDisplay(mainVal, layout.props.mainFormatType, layout.props.mainCurrencySymbol, layout.props.mainCustomMask, mainCell, mainMeasureInfo, layout.props.mainDurationPattern);
                const leftFormatted = leftVal !== null ? getFormattedValueForDisplay(leftVal, layout.props.leftFormatType, layout.props.leftCurrencySymbol, layout.props.leftCustomMask, leftCell, leftMeasureInfo, layout.props.leftDurationPattern) : "";
                const rightFormatted = rightVal !== null ? getFormattedValueForDisplay(rightVal, layout.props.rightFormatType, layout.props.rightCurrencySymbol, layout.props.rightCustomMask, rightCell, rightMeasureInfo, layout.props.rightDurationPattern) : "";
                const thirdFormatted = thirdVal !== null ? getFormattedValueForDisplay(thirdVal, layout.props.thirdFormatType, layout.props.thirdCurrencySymbol, layout.props.thirdCustomMask, thirdCell, thirdMeasureInfo, layout.props.thirdDurationPattern) : "";

                // ============================================
                // BOTTOM SECTION MODE
                // ============================================
                const bottomMode = layout.props.bottomSectionMode || "comparison";
                const showChart = bottomMode === "chart" || bottomMode === "both";
                const showComparison = bottomMode === "comparison" || bottomMode === "both";

                // ============================================
                // BUILD MINI CHART (only when chart mode is active)
                // ============================================
                const chartContainerWidth = $element.width() - 40; // subtract card padding
                const miniChartSvg = showChart ? buildMiniChart(layout, matrix, colChart, colDim, colXAxis, chartContainerWidth, colSecondSeries) : "";

                // ============================================
                // EXTRACT COLORS
                // ============================================
                // Conditional background color overrides static bgColor
                // (expression is already evaluated in the pre-render block above)
                const conditionalBg = layout.props.conditionalBgColor ? fixColor(layout.props.conditionalBgColor, null) : null;
                const conditionalBgType = layout.props.conditionalBgType || "solid";
                const bgColor = conditionalBg || fixColor(layout.props.bgColor, "#ffffff");
                const textColor = fixColor(layout.props.textColor, "#222222");

                // Resolve main value color: explicit pick → auto-contrast → textColor fallback
                const mainValueColor = getValueColor(layout.props.mainValueColor, textColor, layout.props.autoContrast, bgColor);

                const borderColor = fixColor(layout.props.borderColor, "#e0e0e0");
                const dividerHColor = fixColor(layout.props.dividerHColor, "#ececec");
                const dividerVColor = fixColor(layout.props.dividerVColor, "#ebebeb");

                // ============================================
                // BUILD STYLES
                // ============================================
                // Build background (solid, gradient, or conditional gradient)
                const isGradient = layout.props.enableGradient === true;
                var cardBackground;

                if (conditionalBg && conditionalBgType === "gradient") {
                    const condGradDir = layout.props.conditionalGradientDirection || "to right";
                    const condGradEnd = fixColor(layout.props.conditionalGradientEndColor, "#ffffff");
                    cardBackground = `linear-gradient(${condGradDir}, ${conditionalBg}, ${condGradEnd})`;
                } else if (isGradient) {
                    const bgColor2 = fixColor(layout.props.bgColor2, "#667eea");
                    const gradientDir = layout.props.gradientDirection || "to right";
                    cardBackground = `linear-gradient(${gradientDir}, ${bgColor}, ${bgColor2})`;
                } else {
                    cardBackground = bgColor;
                }

                // Build box-shadow from shadow depth
                const shadowDepth = layout.props.shadowDepth || "none";
                var cardShadow = "none";
                if (shadowDepth === "subtle") {
                    cardShadow = "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)";
                } else if (shadowDepth === "medium") {
                    cardShadow = "0 4px 12px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.06)";
                } else if (shadowDepth === "strong") {
                    cardShadow = "0 10px 30px rgba(0,0,0,0.15), 0 4px 8px rgba(0,0,0,0.08)";
                } else if (shadowDepth === "custom") {
                    var shCol = fixColor(layout.props.shadowColor, "#000000");
                    var shX = (layout.props.shadowOffsetX != null ? layout.props.shadowOffsetX : 0);
                    var shY = (layout.props.shadowOffsetY != null ? layout.props.shadowOffsetY : 4);
                    var shBlur = (layout.props.shadowBlur != null ? layout.props.shadowBlur : 12);
                    var shSpread = (layout.props.shadowSpread != null ? layout.props.shadowSpread : 0);
                    // Convert hex to rgba with 0.15 opacity
                    var hexToRgba = function (hex, alpha) {
                        hex = hex.replace("#", "");
                        if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
                        var r = parseInt(hex.substring(0, 2), 16);
                        var g = parseInt(hex.substring(2, 4), 16);
                        var b = parseInt(hex.substring(4, 6), 16);
                        return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
                    };
                    cardShadow = shX + "px " + shY + "px " + shBlur + "px " + shSpread + "px " + hexToRgba(shCol, 0.25);
                }

                const cardStyle = `
                background: ${cardBackground};
                color: ${textColor};
                border: ${layout.props.showBorder !== false ? `${layout.props.borderWidth || 1}px solid ${borderColor}` : "none"};
                border-radius: ${layout.props.borderRadius || 5}px;
                box-shadow: ${cardShadow};
    `;

                // Set CSS variables
                $element[0].style.setProperty("--kpi-bg-color", bgColor);
                $element[0].style.setProperty("--kpi-text-color", textColor);
                $element[0].style.setProperty("--kpi-main-value-color", mainValueColor);
                $element[0].style.setProperty("--kpi-border-color", borderColor);
                $element[0].style.setProperty("--kpi-divider-h-color", dividerHColor);
                $element[0].style.setProperty("--kpi-divider-v-color", dividerVColor);

                // Set hover shadow (slightly amplified version of base shadow)
                var hoverShadow = "0 6px 20px rgba(0,0,0,0.12)";
                if (shadowDepth === "subtle") {
                    hoverShadow = "0 4px 10px rgba(0,0,0,0.12), 0 2px 4px rgba(0,0,0,0.08)";
                } else if (shadowDepth === "medium") {
                    hoverShadow = "0 8px 24px rgba(0,0,0,0.16), 0 4px 8px rgba(0,0,0,0.10)";
                } else if (shadowDepth === "strong") {
                    hoverShadow = "0 16px 40px rgba(0,0,0,0.22), 0 6px 12px rgba(0,0,0,0.12)";
                } else if (shadowDepth === "custom") {
                    // Amplify custom shadow for hover
                    var hY = Math.round((layout.props.shadowOffsetY || 4) * 1.5);
                    var hBlur = Math.round((layout.props.shadowBlur || 12) * 1.8);
                    hoverShadow = cardShadow.replace(
                        /(\d+)px\s+(\d+)px\s+(\d+)px/,
                        function (m, x, y, b) { return x + "px " + hY + "px " + hBlur + "px"; }
                    );
                }
                $element[0].style.setProperty("--kpi-hover-shadow", hoverShadow);

                // ============================================
                // RESPONSIVE FONT SIZE & WIDTH DETECTION
                // Measured BEFORE building HTML so scaled values
                // can be embedded directly in the template.
                // ============================================
                const cardWidth = $element.width() || 300;
                const cardHeight = $element.height() || 200;

                // Deferred re-measure: on first paint the Qlik container may not
                // have its final dimensions yet, producing wrong font sizes.
                // Schedule a one-time check; if size changed, invalidate and repaint.
                if (!$element.data("kpiInitSized")) {
                    $element.data("kpiInitSized", true);
                    var _initW = cardWidth, _initH = cardHeight;
                    setTimeout(function () {
                        var newW = $element.width(), newH = $element.height();
                        if (newW && newH && (Math.abs(newW - _initW) > 2 || Math.abs(newH - _initH) > 2)) {
                            $element.removeData("kpiStructKey");
                            if ($scope && $scope.backendApi) {
                                $scope.backendApi.getProperties().then(function (p) {
                                    $scope.backendApi.setProperties(p);
                                });
                            }
                        }
                    }, 150);
                }

                // Count visible comparison KPIs for vertical space budget
                const visibleCompCount = [
                    layout.props.enableLeft !== false,
                    layout.props.enableRight !== false,
                    layout.props.enableThird === true
                ].filter(Boolean).length;

                // --- Scale MAIN VALUE font size ---
                const autoFitMainValue = layout.props.autoFitMainValue === true;
                const userMainFontSize = autoFitMainValue ? 200 : (layout.props.mainValueFontSize || 25);
                const mainTextLen = String(mainFormatted).replace(/<[^>]*>/g, '').trim().length || 1;

                // Text-width cap — value must fit horizontally
                const pad = cardWidth <= 160 ? 16 : cardWidth <= 220 ? 20 : 36;
                const fitWidth = Math.max(40, cardWidth - pad);
                const textCap = fitWidth / (mainTextLen * 0.58);

                let scaledMainFont;
                if (autoFitMainValue) {
                    // Auto-fit: compute best size from card dimensions
                    const heightDiv = visibleCompCount > 0 ? 5.5 : 2.5;
                    const heightCap = cardHeight / heightDiv;
                    const widthCap = cardWidth * 0.45;
                    scaledMainFont = Math.round(Math.max(10, Math.min(200, heightCap, textCap, widthCap)));
                } else {
                    // Manual: use the user's value, only cap to prevent horizontal overflow
                    scaledMainFont = Math.round(Math.max(10, Math.min(userMainFontSize, textCap)));
                }

                // --- Scale TITLE font size (auto-fit: shrink to fit container width based on text length) ---
                const userTitleFont = layout.props.mainTitleFontSize || 14;
                const titleTextLen = String(layout.props.mainTitle || "").replace(/<[^>]*>/g, '').trim().length || 1;
                const titleFitWidth = Math.max(40, cardWidth - (layout.props.titleIcon ? (layout.props.mainIconSize || 20) + 12 : 0) - 24);
                const titleTextCap = titleFitWidth / (titleTextLen * 0.55);
                const scaledTitleFont = Math.round(Math.max(8, Math.min(userTitleFont, cardHeight / 7, titleTextCap)));

                // --- Scale COMPARISON VALUE font size (auto-fit: shrink to fit available width) ---
                let compFontSize = layout.props.compValueFontSize || 18;
                const compColCount = [layout.props.enableLeft !== false, layout.props.enableRight !== false, layout.props.enableThird === true].filter(Boolean).length || 1;
                const dividerVGap = compColCount > 1 ? ((layout.props.dividerVWidth || 1) + 12) * (compColCount - 1) : 0;
                const compPad = cardWidth <= 160 ? 12 : cardWidth <= 220 ? 16 : 20;
                const compAvailWidth = Math.max(30, (cardWidth - compPad - dividerVGap) / compColCount - 6);
                const compHCap = cardHeight / 9;
                const longestCompVal = Math.max(
                    leftFormatted ? String(leftFormatted).length : 0,
                    rightFormatted ? String(rightFormatted).length : 0,
                    thirdFormatted ? String(thirdFormatted).length : 0
                ) || 1;
                const compCharW = 0.58;
                const compTextCap = compAvailWidth / (longestCompVal * compCharW);
                compFontSize = Math.round(Math.max(9, Math.min(compFontSize, compHCap, compTextCap)));

                // --- Scale COMPARISON TITLE font size (auto-fit: shrink to fit available width) ---
                const userCompTitleFont = layout.props.leftTitleFontSize || 12;
                const longestCompTitle = Math.max(
                    String(layout.props.leftTitle || "").length,
                    String(layout.props.rightTitle || "").length,
                    String(layout.props.thirdTitle || "").length
                ) || 1;
                const compTitleTextCap = compAvailWidth / (longestCompTitle * 0.52);
                const scaledCompTitleFont = Math.round(Math.max(8, Math.min(userCompTitleFont, cardHeight / 12, compTitleTextCap)));

                // --- Inverted layout: main value becomes secondary, scale it down ---
                if (layout.props.invertLayout) {
                    scaledMainFont = Math.round(scaledMainFont * 0.65);
                }

                // --- Scale ARROW size ---
                const scaledArrowFont = Math.round(Math.max(8, Math.min(14, cardHeight / 11, cardWidth * 0.08)));

                // Width class for CSS fallback
                const sizeClass = cardWidth <= 120 ? 'kpi-micro' : cardWidth <= 160 ? 'kpi-tiny' : cardWidth <= 220 ? 'kpi-compact' : '';
                const heightClass = cardHeight <= 80 ? 'kpi-ultra-short' : cardHeight <= 120 ? 'kpi-short' : cardHeight <= 150 ? 'kpi-medium-short' : '';
                const isDense = layout.props.denseMode === true;

                // ============================================
                // BUILD MAIN HEADER
                // ============================================
                const mainIconUrl = layout.props.titleIcon;
                const mainIconSize = layout.props.mainIconSize || 20;
                const mainIconPos = layout.props.mainIconPosition || "left";
                const mainTitleAlignment = layout.props.mainTitleAlignment || "left";
                // Parse main title (handles string literals, expressions, plain text)
                const mainTitleParsed = parseTitleExpression(layout.props.mainTitle || "");
                let mainTitleRaw = mainTitleParsed.displayText;
                const needsEvaluation = mainTitleParsed.needsEval;
                const titleExpression = mainTitleParsed.expression;

                // Check if title is empty - if so, hide the header
                const hasTitle = mainTitleRaw && String(mainTitleRaw).trim() !== "";
                const mainTitle = hasTitle ? escapeHtml(mainTitleRaw) : "";
                const mainTitleFontSize = scaledTitleFont; // Already scaled based on card dimensions
                const mainTitleFontWeight = layout.props.mainTitleFontWeight || "500";
                const mainValueFontWeight = layout.props.mainValueFontWeight || "700";

                // --- Subtitle ---
                const subtitleParsed = parseTitleExpression(layout.props.mainSubtitle || "");
                let subtitleDisplay = subtitleParsed.displayText;
                const hasSubtitle = subtitleDisplay && String(subtitleDisplay).trim() !== "";
                const subtitleText = hasSubtitle ? escapeHtml(subtitleDisplay) : "";
                const subtitleFontSize = Math.round(Math.max(7, Math.min(layout.props.mainSubtitleFontSize || 11, cardHeight / 16, cardWidth * 0.055)));
                const subtitleColor = fixColor(layout.props.mainSubtitleColor, "#888888");

                const scaledIconSize = Math.round(Math.max(14, Math.min(mainIconSize, cardHeight / 6, cardWidth * 0.12)));
                const mainIconHtml = mainIconUrl
                    ? `<img class="title-icon" src="${mainIconUrl}" style="width:${scaledIconSize}px;height:${scaledIconSize}px;" alt="">`
                    : "";

                // Only build header content if title exists
                let headerContent = "";
                const subtitleHtml = hasSubtitle
                    ? `<span class="kpi-subtitle" style="font-size:${subtitleFontSize}px;color:${subtitleColor};">${subtitleText}</span>`
                    : "";
                if (hasTitle) {
                    const titleStyle = `font-size:${mainTitleFontSize}px;font-weight:${mainTitleFontWeight};`;
                    // Wrap title + subtitle in a vertical group so subtitle appears below the title
                    // Alignment fix: set align-items and text-align on the inner group
                    const alignSelf = mainTitleAlignment === "center" ? "center" : mainTitleAlignment === "right" ? "flex-end" : "flex-start";
                    const titleGroup = `<div class="kpi-title-group" style="align-items:${alignSelf};text-align:${mainTitleAlignment};"><span class="kpi-title" style="${titleStyle}">${mainTitle}</span>${subtitleHtml}</div>`;
                    if (mainIconPos === "top") {
                        headerContent = `${mainIconHtml}${titleGroup}`;
                    } else if (mainIconPos === "right") {
                        headerContent = `${titleGroup}${mainIconHtml}`;
                    } else {
                        headerContent = `${mainIconHtml}${titleGroup}`;
                    }
                } else if (hasSubtitle) {
                    // Subtitle only, no title
                    headerContent = `<div class="kpi-title-group">${subtitleHtml}</div>`;
                } else if (mainIconUrl && mainIconPos === "top") {
                    // If no title but icon is at top, still show icon
                    headerContent = mainIconHtml;
                }

                const headerAlignment = mainTitleAlignment === "center" ? "center" : mainTitleAlignment === "right" ? "flex-end" : "flex-start";
                const iconOffset = mainIconUrl && mainIconPos !== "top" ? (scaledIconSize + 6) : 0;
                const iconOffsetStyle = iconOffset > 0 ? `--kpi-icon-offset:${iconOffset}px;` : "";

                // ============================================
                // BUILD COMPARISON BLOCKS (only when comparison mode is active)
                // ============================================
                const comparisonBlocks = [];
                let enabledComparisons = [];
                const evaluatedTitles = {};
                const comparisonSides = ["left", "right", "third"];
                const originalTitles = {};

                if (showComparison) {
                    // Parse comparison titles using the shared helper
                    comparisonSides.forEach(function (side) {
                        const parsed = parseTitleExpression(layout.props[`${side}Title`] || "");
                        evaluatedTitles[side] = {
                            raw: parsed.displayText,
                            expr: parsed.expression,
                            needsEval: parsed.needsEval,
                            isStringLiteral: !parsed.needsEval && parsed.expression === null && parsed.displayText !== ""
                        };
                    });

                    enabledComparisons = [
                        layout.props.enableLeft !== false ? "left" : null,
                        layout.props.enableRight !== false ? "right" : null,
                        layout.props.enableThird === true ? "third" : null
                    ].filter(Boolean);

                    // Temporarily update layout.props with evaluated titles (or original if not expression)
                    comparisonSides.forEach(function (side) {
                        originalTitles[side] = layout.props[`${side}Title`];
                        if (evaluatedTitles[side] && evaluatedTitles[side].isStringLiteral) {
                            layout.props[`${side}Title`] = evaluatedTitles[side].raw;
                        } else if (evaluatedTitles[side] && !evaluatedTitles[side].needsEval) {
                            layout.props[`${side}Title`] = evaluatedTitles[side].raw;
                        } else if (evaluatedTitles[side] && evaluatedTitles[side].needsEval) {
                            layout.props[`${side}Title`] = "";
                        }
                    });

                    if (enabledComparisons.includes("left")) {
                        comparisonBlocks.push(buildComparisonBlock("left", leftVal, leftFormatted, layout, compFontSize, layout.props.autoContrast, bgColor));
                    }
                    if (enabledComparisons.includes("right")) {
                        comparisonBlocks.push(buildComparisonBlock("right", rightVal, rightFormatted, layout, compFontSize, layout.props.autoContrast, bgColor));
                    }
                    if (enabledComparisons.includes("third")) {
                        comparisonBlocks.push(buildComparisonBlock("third", thirdVal, thirdFormatted, layout, compFontSize, layout.props.autoContrast, bgColor));
                    }

                    // Restore original titles
                    comparisonSides.forEach(function (side) {
                        layout.props[`${side}Title`] = originalTitles[side];
                    });
                }

                const comparisonCount = comparisonBlocks.length;
                const comparisonClass = comparisonCount === 1 ? "one-block" : comparisonCount === 2 ? "two-blocks" : "three-blocks";

                // Check if chart is active - use bottom section mode
                const hasChartSvg = miniChartSvg && miniChartSvg.trim() !== "";
                const isChartDisabled = !showChart || !hasChartSvg;

                // Build divider HTML with conditional margin when chart is disabled
                // Only show dividers when comparison KPIs are visible
                let dividerH = "";
                let dividerV = "";
                if (showComparison && comparisonCount > 0) {
                    let dividerMarginTop;
                    if (layout.props.dividerHPosition !== null && layout.props.dividerHPosition !== undefined && layout.props.dividerHPosition !== "") {
                        dividerMarginTop = `${layout.props.dividerHPosition}px`;
                    } else {
                        const dividerGap = isChartDisabled
                            ? Math.round(Math.max(0, Math.min(4, cardHeight / 40)))
                            : Math.round(Math.max(2, Math.min(10, cardHeight / 16)));
                        dividerMarginTop = `${dividerGap}px`;
                    }
                    const dividerMarginBottom = "0px";
                    const dividerHWidth = layout.props.dividerHWidth !== undefined ? layout.props.dividerHWidth : 1;

                    dividerH = layout.props.showDividerH !== false
                        ? `<div class="divider-h" style="background:${dividerHColor};margin-top:${dividerMarginTop};margin-bottom:${dividerMarginBottom};height:${dividerHWidth}px;"></div>`
                        : "";

                    const paddingTop = layout.props.paddingTop !== undefined ? layout.props.paddingTop : 0;
                    const paddingBottom = layout.props.paddingBottom !== undefined ? layout.props.paddingBottom : 5;
                    const hasCustomHeight = layout.props.dividerVHeight !== null && layout.props.dividerVHeight !== undefined;
                    const dividerVHeight = hasCustomHeight ? `${layout.props.dividerVHeight}px` : "auto";
                    const dividerVAlignSelf = hasCustomHeight ? "center" : "stretch";
                    const dividerVWidth = layout.props.dividerVWidth !== undefined ? layout.props.dividerVWidth : 1;

                    dividerV = layout.props.showDividerV !== false && comparisonCount > 1
                        ? `<div class="divider-v" style="background:${dividerVColor};padding-top:${paddingTop}px;padding-bottom:${paddingBottom}px;height:${dividerVHeight};align-self:${dividerVAlignSelf};width:${dividerVWidth}px;"></div>`
                        : "";
                }

                // Build comparison HTML with dividers
                let comparisonHtml = "";
                if (showComparison && comparisonBlocks.length > 0) {
                    const comparisonStyle = isChartDisabled ? "margin-top:0;padding-top:0;" : "";
                    comparisonHtml = `<div class="comparison-blocks ${comparisonClass}" style="${comparisonStyle}">`;
                    comparisonBlocks.forEach((block, idx) => {
                        comparisonHtml += block;
                        if (idx < comparisonBlocks.length - 1 && dividerV) {
                            comparisonHtml += dividerV;
                        }
                    });
                    comparisonHtml += `</div>`;
                }

                // ============================================
                // ALERT SYSTEM
                // ============================================
                let alertHtml = "";
                let alertTriggered = false;
                let alertSignature = "off";
                if (layout.props.enableAlert === true) {
                    var alertExprRaw = layout.props.alertExpression || "";
                    var alertExprResolved = layout.props._alertExprResolved || alertExprRaw;

                    // Determine if alert should fire:
                    // - Expression returns 1, "1", "true", "yes" → alert ON
                    // - Plain number without expression → treat as threshold (mainVal < threshold)
                    // - Empty → no alert
                    if (alertExprResolved && String(alertExprResolved).trim() !== "") {
                        var exprVal = String(alertExprResolved).trim().toLowerCase();
                        var exprNum = parseFloat(exprVal);
                        if (exprVal === "1" || exprVal === "true" || exprVal === "yes") {
                            alertTriggered = true;
                        } else if (!isNaN(exprNum) && exprNum === 1) {
                            alertTriggered = true;
                        } else if (exprVal === "0" || exprVal === "false" || exprVal === "no") {
                            alertTriggered = false;
                        } else if (!isNaN(exprNum) && exprNum !== 0) {
                            alertTriggered = true;
                        }
                    }

                    var alertMsg = layout.props.alertMessage || "⚠ Alert";
                    var alertPos = layout.props.alertPosition || "top";
                    var alertBgColor = fixColor(layout.props.alertColor, "#e74c3c");
                    var alertTxtColor = fixColor(layout.props.alertTextColor, "#ffffff");
                    var alertFs = layout.props.alertFontSize || 12;

                    alertSignature = [
                        alertTriggered ? 1 : 0,
                        alertPos,
                        alertBgColor,
                        alertTxtColor,
                        alertFs,
                        alertMsg
                    ].join("|");

                    if (alertTriggered) {
                        if (alertPos === "badge") {
                            alertHtml = '<div class="kpi-alert-badge" style="background:' + alertBgColor + ';color:' + alertTxtColor + ';font-size:' + alertFs + 'px;">' + escapeHtml(alertMsg) + '</div>';
                        } else {
                            alertHtml = '<div class="kpi-alert-banner kpi-alert-' + alertPos + '" style="background:' + alertBgColor + ';color:' + alertTxtColor + ';font-size:' + alertFs + 'px;">' + escapeHtml(alertMsg) + '</div>';
                        }

                        // Browser notification (fire once per alert trigger, reset when alert clears)
                        if (layout.props.enableBrowserNotification === true) {
                            var alertNotifKey = "kpiAlertNotif_" + (layout.qInfo ? layout.qInfo.qId : "unknown");
                            if (!$element.data(alertNotifKey)) {
                                $element.data(alertNotifKey, true);
                                try {
                                    if (typeof Notification !== "undefined") {
                                        if (Notification.permission === "granted") {
                                            new Notification("KPI Alert: " + (layout.props.mainTitle || "KPI"), { body: alertMsg });
                                        } else if (Notification.permission === "default") {
                                            Notification.requestPermission().then(function (perm) {
                                                if (perm === "granted") {
                                                    new Notification("KPI Alert: " + (layout.props.mainTitle || "KPI"), { body: alertMsg });
                                                }
                                            });
                                        }
                                    }
                                } catch (notifErr) {
                                    console.warn("[ModernKPI] Browser notification failed:", notifErr);
                                }
                            }
                        }
                    } else {
                        var alertNotifKey2 = "kpiAlertNotif_" + (layout.qInfo ? layout.qInfo.qId : "unknown");
                        $element.removeData(alertNotifKey2);
                    }

                    // Clean up resolved expression to avoid stale data on next paint
                    delete layout.props._alertExprResolved;
                }

                // ============================================
                // INVERTED LAYOUT
                // ============================================
                const invertLayout = !!(layout.props.invertLayout);

                // ============================================
                // BUILD FINAL HTML
                // ============================================
                // Use the isChartDisabled variable already declared above
                const noChartClass = isChartDisabled ? "no-chart" : "";
                // When there's no secondary content at all (no chart AND no comparison), center the main content vertically
                const hasSecondaryContent = (showChart && hasChartSvg) || (showComparison && comparisonBlocks.length > 0);
                const centerContentClass = (!hasSecondaryContent && !invertLayout) ? "kpi-center-content" : "";
                // When both chart + comparison are shown, use compact layout
                const bothModeClass = (showChart && hasChartSvg && showComparison && comparisonBlocks.length > 0) ? "kpi-both-mode" : "";
                const mainValueAlignment = layout.props.mainValueAlignment || "center";
                const mainValueAlignClass = `main-value-align-${mainValueAlignment}`;
                // ============================================
                // READ TOOLTIP PROPERTIES FROM LAYOUT
                // ============================================
                const enableTooltip = layout.props.enableTooltip === true;
                const tooltipIcon = layout.props.tooltipIcon || "info";
                const tooltipIconSize = layout.props.tooltipIconSize || 20;
                const tooltipText = layout.props.tooltipText || "";
                const tooltipDescriptionFontSize = layout.props.tooltipDescriptionFontSize || 14;
                const tooltipDescriptionColor = fixColor(layout.props.tooltipDescriptionColor, "#333333");
                const tooltipInsightExpression = layout.props.tooltipInsightExpression || "";
                const tooltipInsightFontSize = layout.props.tooltipInsightFontSize || 16;
                const tooltipInsightColor = fixColor(layout.props.tooltipInsightColor, "#667eea");
                const tooltipMode = layout.props.tooltipMode || false;
                const enableInsightExpression = layout.props.enableInsightExpression !== false;
                const flipTrigger = layout.props.flipTrigger || "iconHover";
                const flipBackInheritBg = layout.props.flipBackInheritBg !== false;
                const flipBackTextAlign = layout.props.flipBackTextAlign || "center";

                const isFlipCardMode = enableTooltip && tooltipMode === true;

                let tooltipIconHtml = "";
                let flipCardBackContent = "";

                // Helper: format an insight value for display
                function formatInsightVal(raw) {
                    if (raw === "" || raw === null || raw === undefined) return "—";
                    if (typeof raw === "number") {
                        return Number.isInteger(raw)
                            ? raw.toLocaleString()
                            : raw.toLocaleString(undefined, { maximumFractionDigits: 2 });
                    }
                    return escapeHtml(String(raw));
                }

                if (enableTooltip && tooltipIcon) {
                    if (isFlipCardMode) {
                        // Flip Card Mode
                        const escapedTooltipText = escapeHtml(tooltipText || "").replace(/\n/g, '<br>');

                        // Back face background
                        const flipBg = flipBackInheritBg ? cardBackground : "#ffffff";
                        const flipBgStyle = `background:${flipBg};`;

                        // Back face title
                        const backTitleRaw = layout.props.flipBackTitle || "";
                        const backTitleFontSize = layout.props.flipBackTitleFontSize || 13;
                        const backTitleColor = fixColor(layout.props.flipBackTitleColor, "#555555");
                        const backTitleHtml = backTitleRaw.trim()
                            ? `<div class="flip-back-title" style="font-size:${backTitleFontSize}px;color:${backTitleColor};text-align:${flipBackTextAlign};">${escapeHtml(backTitleRaw)}</div>`
                            : "";

                        // Back divider
                        const backDividerColor = fixColor(layout.props.flipBackDividerColor, "#e0e0e0");
                        const backDividerHtml = layout.props.flipBackShowDivider !== false
                            ? `<div class="flip-back-divider" style="background:${backDividerColor};"></div>`
                            : "";

                        // Insight row builder
                        function buildInsightRow(val, fontSize, color) {
                            var formatted = formatInsightVal(val);
                            return `<div class="kpi-expression-value" style="font-size:${fontSize}px;color:${fixColor(color, '#667eea')};text-align:${flipBackTextAlign};">${formatted}</div>`;
                        }

                        // Build insight rows
                        let insightRowsHtml = "";
                        if (enableInsightExpression && (tooltipInsightExpression || tooltipInsightExpression === 0)) {
                            insightRowsHtml += buildInsightRow(tooltipInsightExpression, tooltipInsightFontSize, tooltipInsightColor);
                        }
                        // Row 2
                        if (layout.props.enableInsightRow2 === true) {
                            var r2Label = layout.props.insightRow2Label || "";
                            var r2Val = layout.props.insightRow2Expression || "";
                            var r2Fs = layout.props.insightRow2FontSize || 16;
                            var r2Col = layout.props.insightRow2Color || "#667eea";
                            if (r2Label.trim()) {
                                insightRowsHtml += `<div class="flip-back-row-label" style="text-align:${flipBackTextAlign};">${escapeHtml(r2Label)}</div>`;
                            }
                            insightRowsHtml += buildInsightRow(r2Val, r2Fs, r2Col);
                        }
                        // Row 3
                        if (layout.props.enableInsightRow3 === true) {
                            var r3Label = layout.props.insightRow3Label || "";
                            var r3Val = layout.props.insightRow3Expression || "";
                            var r3Fs = layout.props.insightRow3FontSize || 16;
                            var r3Col = layout.props.insightRow3Color || "#667eea";
                            if (r3Label.trim()) {
                                insightRowsHtml += `<div class="flip-back-row-label" style="text-align:${flipBackTextAlign};">${escapeHtml(r3Label)}</div>`;
                            }
                            insightRowsHtml += buildInsightRow(r3Val, r3Fs, r3Col);
                        }

                        // Has any content below the description?
                        const hasInsightContent = insightRowsHtml.trim() !== "";
                        // Show divider only if there is description AND insight content
                        const showDivider = escapedTooltipText.trim() !== "" && hasInsightContent;

                        flipCardBackContent = `
                        <div class="flip-card-back-content" style="text-align:${flipBackTextAlign};">
                            ${backTitleHtml}
                            ${escapedTooltipText ? `<div class="kpi-description" style="font-size:${tooltipDescriptionFontSize}px;color:${tooltipDescriptionColor};">${escapedTooltipText}</div>` : ""}
                            ${showDivider ? backDividerHtml : ""}
                            ${insightRowsHtml}
                        </div>
                    `;

                        // Icon trigger — add data attribute for JS trigger logic
                        tooltipIconHtml = `
                        <div class="tooltip-icon-trigger" data-flip-trigger="${flipTrigger}">
                            <span class="lui-icon lui-icon--${tooltipIcon} kpi-tooltip-icon" 
                                  style="font-size:${tooltipIconSize}px;" 
                                  aria-label="Information">
                            </span>
                        </div>
                    `;
                    } else {
                        // Standard Tooltip Mode
                        const escapedTooltipText = escapeHtml(tooltipText || "").replace(/\n/g, '<br>');
                        tooltipIconHtml = `
                        <div class="kpi-tooltip-icon-wrapper">
                            <span class="lui-icon lui-icon--${tooltipIcon} kpi-tooltip-icon" 
                                  style="font-size:${tooltipIconSize}px;" 
                                  aria-label="Information">
                            </span>
                            <div class="kpi-tooltip-popup">${escapedTooltipText}</div>
                        </div>
                    `;
                    }
                }

                // ============================================
                // RESPONSIVE MAIN VALUE BOTTOM MARGIN
                // ============================================
                const mainValueMarginBottom = isChartDisabled
                    ? Math.round(Math.max(2, Math.min(12, cardHeight / 14)))
                    : Math.round(Math.max(2, Math.min(6, cardHeight / 30)));

                // ============================================
                // BUILD MAIN VALUE DISPLAY (prefix + icon + value + suffix)
                // ============================================
                const mainPrefix = layout.props.mainValuePrefix || "";
                const mainSuffix = layout.props.mainValueSuffix || "";
                const mainPrefixHtml = mainPrefix ? `<span class="val-prefix">${escapeHtml(mainPrefix)}</span>` : "";
                const mainSuffixHtml = mainSuffix ? `<span class="val-suffix">${escapeHtml(mainSuffix)}</span>` : "";

                const mainValueInner = mainPrefixHtml
                    + `<span class="main-val-num">${mainFormatted}</span>`
                    + mainSuffixHtml;

                // Build the card structure - always use size wrapper to prevent collapse
                // In flip card mode, wrap in flip card structure
                let html = '';

                // Build reusable content blocks
                const headerHtml = headerContent ? `<div class="kpi-header ${mainIconPos === "top" ? "icon-top" : ""}" data-align="${mainTitleAlignment}" data-icon-pos="${mainIconPos}" style="${iconOffsetStyle}justify-content:${headerAlignment} !important; width: 100%; display: flex;">
                                        ${headerContent}
                                    </div>` : "";
                const mainValueHtml = `<div class="main-value ${mainValueAlignClass}" style="
                                        font-size: ${scaledMainFont}px !important;
                                        font-weight: ${mainValueFontWeight} !important;
                                        text-align: ${mainValueAlignment} !important;
                                        color: ${mainValueColor} !important;
                                        margin-bottom: ${mainValueMarginBottom}px;
                                    ">
                                        ${mainValueInner}
                                    </div>`;
                const chartHtml = miniChartSvg ? `<div class="chart-container">${miniChartSvg}</div>` : "";
                const alertTopHtml = (alertTriggered && layout.props.alertPosition === "top") ? alertHtml : "";
                const alertBottomHtml = (alertTriggered && layout.props.alertPosition === "bottom") ? alertHtml : "";
                const alertBadgeHtml = (alertTriggered && layout.props.alertPosition === "badge") ? alertHtml : "";
                const invertClass = invertLayout ? " kpi-inverted" : "";

                // DOM order is always: alert-top → header → value → chart → divider → comparisons → alert-bottom
                // CSS `order` property handles visual reordering when invertLayout is enabled
                const cardInnerContent = `${alertTopHtml}${headerHtml}${mainValueHtml}${chartHtml}${dividerH}${comparisonHtml}${alertBottomHtml}`;

                if (isFlipCardMode) {
                    html = `
                    <div class="kpi-size-wrapper">
                        <div class="kpi-flip-card-wrapper">
                            <div class="kpi-container ${noChartClass} ${centerContentClass} ${bothModeClass}${invertClass} kpi-flip-card" style="${cardStyle}">
                                ${tooltipIconHtml}
                                ${alertBadgeHtml}
                                <div class="flip-card-front-content">
                                    ${cardInnerContent}
                                </div>
                                <div class="flip-card-back" style="background:${flipBackInheritBg ? cardBackground : '#ffffff'};">${flipCardBackContent}</div>
                            </div>
                        </div>
                    </div>
                `;
                } else {
                    html = `
                    <div class="kpi-size-wrapper">
                        <div class="kpi-container ${noChartClass} ${centerContentClass} ${bothModeClass}${invertClass}" style="${cardStyle}">
                            ${tooltipIconHtml}
                            ${alertBadgeHtml}
                            ${cardInnerContent}
                        </div>
                    </div>
                `;
                }

                // ============================================
                // SMART DOM UPDATE: only rebuild when structure changes.
                // On value-only changes, patch in-place (no flash, no DOM thrash).
                // ============================================
                const structureKey = [
                    isFlipCardMode ? 1 : 0,
                    noChartClass,
                    centerContentClass,
                    bothModeClass,
                    comparisonBlocks.length,
                    hasTitle ? 1 : 0,
                    mainIconPos,
                    !!mainIconUrl ? 1 : 0,
                    enableTooltip ? 1 : 0,
                    mainValueAlignment,
                    mainTitleAlignment,
                    !!miniChartSvg ? 1 : 0,
                    invertLayout ? 1 : 0,
                    alertSignature
                ].join("|");

                const prevKey = $element.data("kpiStructKey");
                const needsFullRebuild = prevKey !== structureKey;

                if (needsFullRebuild) {
                    $element.html(html);
                    $element.data("kpiStructKey", structureKey);

                    // Parent setup only on first paint / structural change
                    $element.parents('.qv-object, .qv-object-wrapper, .qv-object-content, .qv-object-content-wrapper').addClass('kpi-extension-wrapper');
                    $element.parents('.qv-object, .qv-object-wrapper, .qv-object-content, .qv-object-content-wrapper').css({
                        'width': '100%',
                        'height': '100%',
                        'padding': '0',
                        'margin': '0',
                        'box-sizing': 'border-box',
                        'min-width': '0',
                        'min-height': '0',
                        'max-width': 'none',
                        'max-height': 'none'
                    });
                } else {
                    // --- In-place patch: update values, colors, styles without rebuilding DOM ---
                    const $container = $element.find('.kpi-container');
                    if ($container.length) $container[0].setAttribute("style", cardStyle);

                    // Patch main value text
                    const $mainValNum = $element.find('.main-val-num');
                    if ($mainValNum.length) $mainValNum.html(mainFormatted);

                    // Patch header title
                    const $titleEl = $element.find('.kpi-title');
                    if ($titleEl.length && hasTitle) $titleEl.html(mainTitle);

                    // Patch subtitle
                    const $subtitleEl = $element.find('.kpi-subtitle');
                    if (hasSubtitle) {
                        if ($subtitleEl.length) {
                            $subtitleEl.html(subtitleText).css({ 'font-size': subtitleFontSize + 'px', 'color': subtitleColor });
                        } else {
                            var $tg = $element.find('.kpi-title-group');
                            if ($tg.length) $tg.append('<span class="kpi-subtitle" style="font-size:' + subtitleFontSize + 'px;color:' + subtitleColor + ';">' + subtitleText + '</span>');
                        }
                    } else if ($subtitleEl.length) {
                        $subtitleEl.remove();
                    }

                    // Patch comparison blocks (full rebuild of each block to update arrows, colors, values)
                    const $compBlocks = $element.find('.comp-block');
                    if ($compBlocks.length && showComparison) {
                        // Temporarily set evaluated titles (same as full-rebuild path)
                        comparisonSides.forEach(function (side) {
                            originalTitles[side] = layout.props[side + "Title"];
                            if (evaluatedTitles[side] && !evaluatedTitles[side].needsEval) {
                                layout.props[side + "Title"] = evaluatedTitles[side].raw;
                            } else if (evaluatedTitles[side] && evaluatedTitles[side].needsEval) {
                                layout.props[side + "Title"] = "";
                            }
                        });
                        let compIdx = 0;
                        var patchSides = [];
                        if (enabledComparisons.includes("left"))  patchSides.push({ side: "left",  val: leftVal,  fmt: leftFormatted });
                        if (enabledComparisons.includes("right")) patchSides.push({ side: "right", val: rightVal, fmt: rightFormatted });
                        if (enabledComparisons.includes("third")) patchSides.push({ side: "third", val: thirdVal, fmt: thirdFormatted });
                        patchSides.forEach(function (entry) {
                            if ($compBlocks.length > compIdx) {
                                var newBlockHtml = buildComparisonBlock(entry.side, entry.val, entry.fmt, layout, compFontSize, layout.props.autoContrast, bgColor);
                                $($compBlocks[compIdx]).replaceWith(newBlockHtml);
                            }
                            compIdx++;
                        });
                        // Restore original titles
                        comparisonSides.forEach(function (side) {
                            layout.props[side + "Title"] = originalTitles[side];
                        });
                    }

                    // Patch chart SVG if present
                    if (miniChartSvg) {
                        const $chartContainer = $element.find('.chart-container');
                        if ($chartContainer.length) $chartContainer.html(miniChartSvg);
                    }

                    // Patch flip card back content so expression/tooltip changes reflect immediately
                    if (isFlipCardMode && flipCardBackContent) {
                        const $flipBack = $element.find('.flip-card-back');
                        if ($flipBack.length) {
                            $flipBack.html(flipCardBackContent);
                            $flipBack[0].style.background = flipBackInheritBg ? cardBackground : '#ffffff';
                        }
                    }
                }

                // ============================================
                // POST-RENDER: Cache selectors & apply styles
                // ============================================
                var $c = {
                    sizeWrapper: $element.find('.kpi-size-wrapper'),
                    mainValue:   $element.find('.main-value'),
                    mainValNum:  $element.find('.main-val-num'),
                    kpiTitle:    $element.find('.kpi-title'),
                    compValues:  $element.find('.comp-value'),
                    compTitles:  $element.find('.comp-title'),
                    compArrows:  $element.find('.comp-arrow'),
                    container:   $element.find('.kpi-container'),
                    miniChart:   $element.find('.miniChart')
                };

                // Apply responsive size classes (CSS fallback for @container)
                $c.sizeWrapper.removeClass('kpi-micro kpi-tiny kpi-compact kpi-ultra-short kpi-short kpi-medium-short kpi-dense');
                if (sizeClass) $c.sizeWrapper.addClass(sizeClass);
                if (heightClass) $c.sizeWrapper.addClass(heightClass);
                if (isDense) $c.sizeWrapper.addClass('kpi-dense');

                // Confirm main value styles
                if ($c.mainValue.length > 0) {
                    const mainValueEl = $c.mainValue[0];
                    if (mainValueEl) {
                        mainValueEl.style.setProperty('font-size', scaledMainFont + 'px', 'important');
                        mainValueEl.style.setProperty('font-weight', mainValueFontWeight, 'important');
                        mainValueEl.style.setProperty('color', mainValueColor, 'important');
                        mainValueEl.style.setProperty('margin-bottom', mainValueMarginBottom + 'px');
                        $c.mainValue.attr('data-color', mainValueColor);
                    }
                }

                // Apply scaled comparison value font sizes
                $c.compValues.each(function () {
                    this.style.setProperty('font-size', compFontSize + 'px', 'important');
                });

                // Apply scaled comparison title font sizes
                $c.compTitles.each(function () {
                    this.style.setProperty('font-size', scaledCompTitleFont + 'px', 'important');
                });

                // Apply scaled arrow sizes
                $c.compArrows.each(function () {
                    this.style.setProperty('font-size', scaledArrowFont + 'px', 'important');
                });

                // Apply scaled title font
                if ($c.kpiTitle.length > 0) {
                    $c.kpiTitle[0].style.setProperty('font-size', scaledTitleFont + 'px', 'important');
                }

                // Patch divider colors and sizes (always, so color changes apply immediately)
                var $divH = $element.find('.divider-h');
                if ($divH.length) {
                    $divH[0].style.background = dividerHColor;
                    $divH[0].style.height = (layout.props.dividerHWidth !== undefined ? layout.props.dividerHWidth : 1) + 'px';
                }
                $element.find('.divider-v').each(function () {
                    this.style.background = dividerVColor;
                    this.style.width = (layout.props.dividerVWidth !== undefined ? layout.props.dividerVWidth : 1) + 'px';
                });

                // Toggle helper class for alert+tooltip coexistence (fallback for browsers without :has())
                var $kpiC = $element.find('.kpi-container');
                if ($kpiC.length) {
                    $kpiC.toggleClass('has-tooltip', enableTooltip);
                    $kpiC.toggleClass('has-alert-top', alertTriggered && layout.props.alertPosition === "top");
                    $kpiC.toggleClass('has-alert-badge', alertTriggered && layout.props.alertPosition === "badge");
                }

                // ============================================
                // COUNT-UP ANIMATION (only on full rebuild to avoid repeated flicker)
                // ============================================
                if (needsFullRebuild && layout.props.enableCountUp !== false) {
                    var animDuration = parseInt(layout.props.countUpDuration, 10) || 600;

                    // Main value — animate the inner .main-val-num span so prefix/suffix/icon stay stable
                    var $mainValNum = $c.mainValNum;
                    if ($mainValNum.length > 0 && mainVal !== null && !isNaN(mainVal)) {
                        (function () {
                            var fmtType = layout.props.mainFormatType;
                            var curSym = layout.props.mainCurrencySymbol;
                            var mask = layout.props.mainCustomMask;
                            var durPat = layout.props.mainDurationPattern;
                            var mInfo = mainMeasureInfo;
                            animateCountUp($mainValNum[0], mainVal, animDuration, function (v) {
                                return getFormattedValueForDisplay(v, fmtType, curSym, mask, null, mInfo, durPat);
                            }, mainFormatted);
                        })();
                    }

                    // Comparison values — build parallel arrays of raw values, format fns, and final text
                    var compRawVals = [], compFmtFuncs = [], compFinalTexts = [];
                    if (enabledComparisons.includes("left") && leftVal !== null && !isNaN(leftVal)) {
                        compRawVals.push(leftVal);
                        compFinalTexts.push(leftFormatted);
                        (function () {
                            var ft = layout.props.leftFormatType, cs = layout.props.leftCurrencySymbol;
                            var cm = layout.props.leftCustomMask, dp = layout.props.leftDurationPattern;
                            var mi = leftMeasureInfo;
                            compFmtFuncs.push(function (v) { return getFormattedValueForDisplay(v, ft, cs, cm, null, mi, dp); });
                        })();
                    }
                    if (enabledComparisons.includes("right") && rightVal !== null && !isNaN(rightVal)) {
                        compRawVals.push(rightVal);
                        compFinalTexts.push(rightFormatted);
                        (function () {
                            var ft = layout.props.rightFormatType, cs = layout.props.rightCurrencySymbol;
                            var cm = layout.props.rightCustomMask, dp = layout.props.rightDurationPattern;
                            var mi = rightMeasureInfo;
                            compFmtFuncs.push(function (v) { return getFormattedValueForDisplay(v, ft, cs, cm, null, mi, dp); });
                        })();
                    }
                    if (enabledComparisons.includes("third") && thirdVal !== null && !isNaN(thirdVal)) {
                        compRawVals.push(thirdVal);
                        compFinalTexts.push(thirdFormatted);
                        (function () {
                            var ft = layout.props.thirdFormatType, cs = layout.props.thirdCurrencySymbol;
                            var cm = layout.props.thirdCustomMask, dp = layout.props.thirdDurationPattern;
                            var mi = thirdMeasureInfo;
                            compFmtFuncs.push(function (v) { return getFormattedValueForDisplay(v, ft, cs, cm, null, mi, dp); });
                        })();
                    }

                    $c.compValues.each(function (idx) {
                        if (idx < compRawVals.length) {
                            // Isolate the numeric text from arrows/icons/prefix/suffix
                            var $this = $(this);
                            var $numSpan = $this.find('.comp-num');
                            if ($numSpan.length === 0) {
                                // Preserve arrows, icons, prefix, suffix — wrap only the bare text node
                                var arrowEl = $this.find('.comp-arrow');
                                var iconEl = $this.find('.comp-icon');
                                var prefixEl = $this.find('.val-prefix');
                                var suffixEl = $this.find('.val-suffix');
                                var aw = arrowEl.length ? arrowEl[0].outerHTML : '';
                                var iw = iconEl.length ? iconEl[0].outerHTML : '';
                                var pw = prefixEl.length ? prefixEl[0].outerHTML : '';
                                var sw = suffixEl.length ? suffixEl[0].outerHTML : '';
                                $this.html(aw + iw + pw + '<span class="comp-num">' + escapeHtml(compFinalTexts[idx]) + '</span>' + sw);
                                $numSpan = $this.find('.comp-num');
                            }
                            if ($numSpan.length > 0) {
                                animateCountUp($numSpan[0], compRawVals[idx], animDuration, compFmtFuncs[idx], compFinalTexts[idx]);
                            }
                        }
                    });
                }

                // ============================================
                // MINI CHART TOOLTIP (cleanup old tooltip, attach on rebuild or chart update)
                // ============================================
                if ($element.data("kpiChartTooltip")) {
                    $element.data("kpiChartTooltip").remove();
                    $element.removeData("kpiChartTooltip");
                }
                if (miniChartSvg && layout.props.showTooltip !== false) {
                    const tooltip = $("<div class='kpi-tooltip'></div>").appendTo("body");
                    $element.data("kpiChartTooltip", tooltip);
                    const svg = $c.miniChart;

                    if (svg.length && matrix.length > 0) {
                        svg.off("mousemove.kpiChart mouseleave.kpiChart");
                        const hoverLine = svg.find(".miniChart-hover-line");

                        svg.on("mousemove.kpiChart", function (evt) {
                            const offset = svg.offset();
                            const svgWidth = svg.width();
                            if (!svgWidth) return;

                            const relX = evt.pageX - offset.left;
                            const n = matrix.length;
                            const index = Math.max(0, Math.min(n - 1, Math.floor((relX / svgWidth) * n)));

                            const row = matrix[index];
                            if (!row) return;

                            const dim = hasDim ? (row[colDim]?.qText || "") : "";
                            const val = row[colChart]?.qNum;
                            const formatted = typeof val === "number" ? val.toLocaleString() : val;

                            tooltip.css({
                                left: evt.pageX + 12,
                                top: evt.pageY - 18,
                                opacity: 1
                            }).html(dim ? `<b>${dim}</b><br>${formatted}` : formatted);

                            const percentX = n > 1 ? (index / (n - 1)) * 100 : 50;
                            hoverLine.css("opacity", 1)
                                .attr("x1", percentX + "%")
                                .attr("x2", percentX + "%");
                        });

                        svg.on("mouseleave.kpiChart", function () {
                            tooltip.css("opacity", 0);
                            hoverLine.css("opacity", 0);
                        });
                    }
                }

                // ============================================
                // INSIGHT EXPRESSION HANDLING
                // ============================================
                // NOTE: When using expression: "optional" in the property panel,
                // Qlik Sense automatically evaluates the expression BEFORE passing it to paint()
                // - User enters "=Sum(Sales)" → layout.props.tooltipInsightExpression = "12345" (evaluated)
                // - User enters "My Text" → layout.props.tooltipInsightExpression = "My Text" (as-is)
                // - No manual evaluation needed - the value is already processed by Qlik
                //
                // The insight expression value is already set in flipCardBackContent above,
                // so no additional processing is needed here.

                // Add event listener for flip card trigger (only on rebuild to avoid stacking handlers)
                if (needsFullRebuild && isFlipCardMode) {
                    const $iconTrigger = $element.find(".tooltip-icon-trigger");
                    const $flipCard = $element.find(".kpi-flip-card");
                    const $wrapper = $element.find(".kpi-flip-card-wrapper");

                    if ($flipCard.length) {
                        if (flipTrigger === "iconClick") {
                            $iconTrigger.off("click.kpiFlip").on("click.kpiFlip", function (e) {
                                e.stopPropagation();
                                var isFlipped = $flipCard.attr("data-flipped") === "1";
                                $flipCard.css("transform", isFlipped ? "rotateY(0deg)" : "rotateY(180deg)");
                                $flipCard.attr("data-flipped", isFlipped ? "0" : "1");
                            });
                            $element.find(".flip-card-back").off("click.kpiFlip").on("click.kpiFlip", function (e) {
                                e.stopPropagation();
                                $flipCard.css("transform", "rotateY(0deg)");
                                $flipCard.attr("data-flipped", "0");
                            });
                        } else if (flipTrigger === "cardHover") {
                            $wrapper.off("mouseenter.kpiFlip mouseleave.kpiFlip");
                            $wrapper.on("mouseenter.kpiFlip", function () {
                                $flipCard.css("transform", "rotateY(180deg)");
                            });
                            $wrapper.on("mouseleave.kpiFlip", function () {
                                $flipCard.css("transform", "rotateY(0deg)");
                            });
                        } else {
                            if ($iconTrigger.length) {
                                $iconTrigger.off("mouseenter.kpiFlip").on("mouseenter.kpiFlip", function () {
                                    $flipCard.css("transform", "rotateY(180deg)");
                                });
                                $wrapper.off("mouseleave.kpiFlip").on("mouseleave.kpiFlip", function () {
                                    $flipCard.css("transform", "rotateY(0deg)");
                                });
                            }
                        }
                    }
                }

                // Expression properties (title, subtitle, comparison titles, condBg)
                // are all resolved in the pre-render await block above, so no
                // post-render batch evaluation is needed.

                // ============================================
                // CLICK ACTION / NAVIGATION
                // ============================================
                var clickActionType = layout.props.clickActionType || "none";
                if (clickActionType !== "none") {
                    $c.container.addClass('kpi-clickable');
                    $c.container.off('click.kpiNav').on('click.kpiNav', function (e) {
                        // Don't navigate when clicking flip card triggers or other interactive elements
                        if ($(e.target).closest('.tooltip-icon-trigger, .flip-card-back').length) return;

                        if (clickActionType === "gotoSheet") {
                            var sheetId = layout.props.clickSheetId;
                            if (sheetId && sheetId.trim() !== "") {
                                try {
                                    qlik.navigation.gotoSheet(sheetId.trim());
                                } catch (navErr) {
                                    console.warn("[ModernKPI] Navigation error:", navErr);
                                }
                            }
                        } else if (clickActionType === "openUrl") {
                            var url = layout.props.clickUrl;
                            if (url && url.trim() !== "") {
                                var newTab = layout.props.clickUrlNewTab !== false;
                                if (newTab) {
                                    window.open(url.trim(), '_blank');
                                } else {
                                    window.location.href = url.trim();
                                }
                            }
                        }
                    });
                }

            } catch (paintError) {
                // ============================================
                // ERROR BOUNDARY — render clean error state
                // ============================================
                console.error("[ModernKPI] paint error:", paintError);
                var errBg = (layout && layout.props && layout.props.bgColor) ? fixColor(layout.props.bgColor, "#ffffff") : "#ffffff";
                var errRadius = (layout && layout.props && layout.props.borderRadius != null) ? layout.props.borderRadius : 5;
                $element.html(
                    '<div class="kpi-size-wrapper">' +
                    '<div class="kpi-container kpi-error-state" style="' +
                    'background:' + errBg + ';' +
                    'border-radius:' + errRadius + 'px;' +
                    'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
                    'height:100%;padding:16px;box-sizing:border-box;' +
                    '">' +
                    '<span class="kpi-error-icon">⚠️</span>' +
                    '<span class="kpi-error-msg">Unable to render KPI</span>' +
                    '<span class="kpi-error-detail">' + escapeHtml(String(paintError.message || paintError).substring(0, 120)) + '</span>' +
                    '</div>' +
                    '</div>'
                );
            }

            return qlik.Promise.resolve();
        }
    };
});
