define(["qlik", "jquery", "text!./style.css"], function (qlik, $, cssContent) {


    /**
     * @file ModernKPI.js
     * @description A modern, customizable KPI card extension for Qlik Sense.
     * @author Ala Aldin Hija
     * @version 2.0.0
     * @license MIT
     */

    // ============================================
    // CSS INJECTION
    // ============================================
    $("<style>").html(cssContent).appendTo("head");

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================

    /**
     * Universal color handler - works across all Qlik versions
     * Supports: string hex, rgb/rgba, color names, Qlik color objects
     */
    function fixColor(val, fallback = "#cccccc") {
        if (val === null || val === undefined) {
            return fallback;
        }

        // Handle string colors (hex, rgb, rgba, color names)
        if (typeof val === "string") {
            const trimmed = val.trim();
            if (trimmed !== "") {
                return trimmed;
            }
        }

        // Handle Qlik color objects (dualOutput: true format)
        if (typeof val === "object") {
            // Try color property first (most common)
            if (val.color !== undefined) {
                if (typeof val.color === "string" && val.color.trim() !== "") {
                    return val.color.trim();
                }
            }
            // Try hex property
            if (val.hex !== undefined) {
                if (typeof val.hex === "string" && val.hex.trim() !== "") {
                    return val.hex.trim();
                }
            }
            // Try qString property (some Qlik versions)
            if (val.qString !== undefined) {
                if (typeof val.qString === "string" && val.qString.trim() !== "") {
                    return val.qString.trim();
                }
            }
            // Try value property
            if (val.value !== undefined) {
                if (typeof val.value === "string" && val.value.trim() !== "") {
                    return val.value.trim();
                }
            }

            // Try JSON stringify/parse for nested objects
            try {
                const jsonStr = JSON.stringify(val);
                if (jsonStr.includes('"color"') || jsonStr.includes('"hex"')) {
                    const parsed = JSON.parse(jsonStr);
                    if (parsed.color) return parsed.color.trim();
                    if (parsed.hex) return parsed.hex.trim();
                }
            } catch (e) {
                // Ignore JSON errors
            }
        }

        return fallback;
    }

    /**
     * Calculate luminance for auto-contrast
     * Returns true if background is dark (use light text), false if light (use dark text)
     */
    function getContrastColor(bgColor) {
        if (!bgColor) return "#222222";

        // Remove # if present
        const hex = bgColor.replace("#", "");
        if (hex.length !== 6) return "#222222";

        // Convert to RGB
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);

        // Calculate relative luminance
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

        // Return white for dark backgrounds, black for light
        return luminance < 0.5 ? "#ffffff" : "#222222";
    }

    /**
     * Format a Qlik day-fraction value as a duration / time string.
     * Qlik stores time as a fraction of a day (e.g., 0.5 = 12 hours).
     * Supports patterns: h, hh, m, mm, s, ss, and combinations like h:mm:ss, [h]:mm:ss, D hh:mm:ss
     */
    function formatAsDuration(num, pattern) {
        const isNeg = num < 0;
        const absVal = Math.abs(num);

        // Convert day-fraction to total seconds
        const totalSeconds = Math.round(absVal * 86400); // 24 * 60 * 60

        // Check if pattern uses [h] (total hours, no day overflow) or D (days)
        const hasBracketH = /\[h+\]/i.test(pattern);
        const hasDays = /D/i.test(pattern);

        let days = 0, hours = 0, minutes = 0, seconds = 0;

        if (hasBracketH) {
            // [h] = total hours (can exceed 24)
            hours = Math.floor(totalSeconds / 3600);
            minutes = Math.floor((totalSeconds % 3600) / 60);
            seconds = totalSeconds % 60;
        } else if (hasDays) {
            days = Math.floor(totalSeconds / 86400);
            hours = Math.floor((totalSeconds % 86400) / 3600);
            minutes = Math.floor((totalSeconds % 3600) / 60);
            seconds = totalSeconds % 60;
        } else {
            // Default: total hours (can exceed 24), like native Qlik h:mm:ss
            hours = Math.floor(totalSeconds / 3600);
            minutes = Math.floor((totalSeconds % 3600) / 60);
            seconds = totalSeconds % 60;
        }

        // Build output by replacing tokens in the pattern
        let result = pattern;

        // Replace [h] or [hh] tokens
        result = result.replace(/\[hh\]/gi, String(hours).padStart(2, '0'));
        result = result.replace(/\[h\]/gi, String(hours));

        // Replace D/DD tokens
        result = result.replace(/DD/g, String(days).padStart(2, '0'));
        result = result.replace(/D/g, String(days));

        // Replace hh/h tokens (only if not already handled by [h])
        if (!hasBracketH) {
            result = result.replace(/hh/gi, String(hours).padStart(2, '0'));
            result = result.replace(/\bh\b/gi, String(hours));
        }

        // Replace mm/m tokens (minutes)
        result = result.replace(/mm/g, String(minutes).padStart(2, '0'));
        result = result.replace(/\bm\b/g, String(minutes));

        // Replace ss/s tokens (seconds)
        result = result.replace(/ss/g, String(seconds).padStart(2, '0'));
        result = result.replace(/\bs\b/g, String(seconds));

        return (isNeg ? "-" : "") + result;
    }

    /**
     * Check if a format pattern is a time/duration pattern
     */
    function isTimePattern(pattern) {
        if (!pattern) return false;
        const p = pattern.trim().toLowerCase();
        // Contains h, m, s tokens typical of time patterns
        return /\bh\b|hh|\[h|:mm|:ss|:m\b|:s\b/i.test(p) && !/#|0/.test(p);
    }

    /**
     * Format number using Qlik format pattern (e.g., #,##0.00, $#,##0.00;-$#,##0.00, h:mm:ss)
     */
    function formatWithQlikPattern(num, pattern) {
        if (!pattern || pattern.trim() === "") {
            return num.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
        }

        const cleanPattern = pattern.trim();

        // Detect time/duration patterns and handle them specially
        if (isTimePattern(cleanPattern)) {
            return formatAsDuration(num, cleanPattern);
        }

        // Handle positive/negative patterns (e.g., $#,##0.00;-$#,##0.00)
        const parts = cleanPattern.split(';');
        const positivePattern = parts[0] || cleanPattern;
        const negativePattern = parts[1] || positivePattern;
        const usePattern = num < 0 ? negativePattern : positivePattern;

        // Extract decimal places from pattern (count of 0 after decimal point)
        const decimalMatch = usePattern.match(/\.(0+)/);
        const decimalPlaces = decimalMatch ? decimalMatch[1].length : 0;

        // Check if pattern uses thousands separator (comma in pattern like #,##0)
        const hasThousands = usePattern.includes(',');

        // Format the absolute number
        let formatted = Math.abs(num).toFixed(decimalPlaces);

        // Apply thousands separator if pattern has comma
        if (hasThousands) {
            const numParts = formatted.split('.');
            numParts[0] = numParts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
            formatted = numParts.join('.');
        }

        // Extract prefix (everything before first # or 0)
        const prefixMatch = usePattern.match(/^([^#0]*)/);
        const prefix = prefixMatch ? prefixMatch[1] : '';

        // Extract suffix (everything after the numeric pattern)
        // Find where the numeric pattern ends (last digit or decimal point)
        const numericEndMatch = usePattern.match(/([#0.,]+)([^#0.,]*)$/);
        const suffix = numericEndMatch && numericEndMatch[2] ? numericEndMatch[2] : '';

        // Build result: prefix + formatted number + suffix
        return prefix + formatted + suffix;
    }

    /**
     * Format number based on type
     */
    function formatNumber(val, type, symbol, customMask) {
        if (val === null || val === undefined || isNaN(val)) return "-";

        const num = typeof val === "number" ? val : parseFloat(val);
        if (isNaN(num)) return "-";

        switch (type) {
            case "k": return (num / 1000).toFixed(2) + "K";
            case "m": return (num / 1e6).toFixed(2) + "M";
            case "b": return (num / 1e9).toFixed(2) + "B";
            case "km":
                // Auto-detect K, M, or B based on value
                if (Math.abs(num) >= 1e9) return (num / 1e9).toFixed(2) + "B";
                if (Math.abs(num) >= 1e6) return (num / 1e6).toFixed(2) + "M";
                if (Math.abs(num) >= 1000) return (num / 1000).toFixed(2) + "K";
                return num.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
            case "currency": return (symbol || "$") + num.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
            case "percent": return (num * 100).toFixed(1) + "%";
            case "custom":
                if (customMask && customMask.trim() !== "") {
                    // Handle Qlik format patterns (e.g., #,##0.00, $#,##0.00;-$#,##0.00)
                    return formatWithQlikPattern(num, customMask);
                }
                return num.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
            default: return num.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
        }
    }

    /**
     * Resolve a value color through a priority chain:
     *   1. Explicit color (expression string, Qlik color object, or hex string)
     *   2. Auto-contrast against background
     *   3. Fallback color
     */
    function getValueColor(colorInput, fallbackColor, autoContrast, bgColor) {
        // Try to extract a real color from the input (handles strings, objects, etc.)
        var resolved = fixColor(colorInput, null);
        if (resolved) return resolved;
        // Auto-contrast: derive from background luminance
        if (autoContrast && bgColor) return getContrastColor(bgColor);
        // Final fallback
        return fixColor(fallbackColor, "#222222");
    }

    /**
     * Build dynamic arrow HTML
     * @param {string} arrowExpr - Expression-driven arrow (e.g., "↑", "↓", or custom text)
     * @param {string} colorExpr - Color expression for arrow
     * @param {number} fallbackValue - Numeric value to determine arrow direction if no expression
     * @param {object} layout - Layout object
     * @param {boolean} showArrows - Whether to show arrows for this KPI
     * @param {string} posColor - Color for positive/up arrow
     * @param {string} negColor - Color for negative/down arrow
     * @param {boolean} invertLogic - If true, invert arrow colors (down = good, up = bad)
     */
    function buildArrow(arrowExpr, colorExpr, fallbackValue, layout, showArrows, posColor, negColor, invertLogic) {
        // Expression-driven arrow (highest priority)
        if (arrowExpr && arrowExpr.trim() !== "") {
            const col = colorExpr && colorExpr.trim() !== ""
                ? colorExpr.trim()
                : fixColor(layout.props.textColor, "#222222");
            return `<span class="comp-arrow" style="color:${col}">${arrowExpr.trim()}</span>`;
        }

        // Standard KPI arrows (only if enabled for this KPI)
        if (!showArrows) return "";

        // Determine arrow direction and color based on value
        if (fallbackValue > 0) {
            // Positive value: show up arrow
            // If invertLogic is true, positive is bad (use negColor), otherwise positive is good (use posColor)
            const arrowColor = invertLogic ? fixColor(negColor, "#e04e4e") : fixColor(posColor, "#21a46f");
            return `<span class="comp-arrow" style="color:${arrowColor}">↑</span>`;
        }
        if (fallbackValue < 0) {
            // Negative value: show down arrow
            // If invertLogic is true, negative is good (use posColor), otherwise negative is bad (use negColor)
            const arrowColor = invertLogic ? fixColor(posColor, "#21a46f") : fixColor(negColor, "#e04e4e");
            return `<span class="comp-arrow" style="color:${arrowColor}">↓</span>`;
        }

        return "";
    }

    /**
     * Build mini chart SVG with improved line chart and X-axis support
     */
    function buildMiniChart(layout, matrix, chartColIndex, dimIndex, xAxisColIndex, containerWidth /* unused, kept for API compat */, secondSeriesColIndex) {
        if (!matrix || !matrix.length) return "";

        const values = matrix.map(row => row[chartColIndex]?.qNum).filter(v => typeof v === "number" && !isNaN(v));
        if (!values.length) return "";

        // Second series values (may be empty / null)
        const hasSecondSeries = layout.props.enableSecondSeries === true && secondSeriesColIndex !== null;
        const values2 = hasSecondSeries ? matrix.map(row => (row[secondSeriesColIndex] ? row[secondSeriesColIndex].qNum : NaN)).filter(v => typeof v === "number" && !isNaN(v)) : [];
        const secondSeriesColor = hasSecondSeries ? fixColor(layout.props.secondSeriesColor, "#ff7043") : "#ff7043";

        const max = Math.max(...values, ...(values2.length ? values2 : [0]));
        if (max === 0) return "";

        // Fix color extraction - handle both string and object formats
        let chartColor = "#6aa7ff";
        if (layout.props.chartColor) {
            chartColor = fixColor(layout.props.chartColor, "#6aa7ff");
        }

        const count = values.length;
        const chartType = layout.props.chartType || "bar";
        const isLine = chartType === "line";
        const isSparkline = chartType === "sparkline";
        const lineWidth = Math.max(0.5, Math.min(10, layout.props.chartLineWidth || 2));
        const showXAxis = layout.props.showXAxis === true && !isSparkline; // Sparkline never shows axis
        const xAxisFontSize = layout.props.xAxisFontSize || 10;
        const hasDim = dimIndex !== null;
        const hasXAxisMeasure = xAxisColIndex !== null && layout.props.xAxisMeasure;

        // Smart auto-height: smaller when both chart + comparison are shown, larger for chart-only
        const mode = layout.props.bottomSectionMode || "comparison";
        const isBothMode = mode === "both";
        const userHeight = layout.props.chartHeight;
        const svgHeight = (userHeight && userHeight > 0) ? userHeight : (isBothMode ? 50 : 70);

        let svg;

        if (isSparkline) {
            // ── SPARKLINE ─────────────────────────────────────────────────
            // Minimal thin line, no axis, no labels, no fill, no dots
            const chartHeight = 40;
            const sparkH = (userHeight && userHeight > 0) ? userHeight : (isBothMode ? 24 : 30);
            const sparkLineW = Math.max(0.5, Math.min(4, lineWidth));
            const padding = 2; // padding top/bottom so line doesn't clip

            svg = `<svg class="miniChart miniChart-sparkline" viewBox="0 0 100 ${chartHeight}" preserveAspectRatio="none" style="height:${sparkH}px;" xmlns="http://www.w3.org/2000/svg">`;

            const minVal = Math.min(...values);
            const range = max - minVal || 1;
            const pts = values.map((v, i) => {
                const x = count > 1 ? (i / (count - 1)) * 100 : 50;
                const y = padding + (chartHeight - 2 * padding) - ((v - minVal) / range * (chartHeight - 2 * padding));
                return { x, y };
            });

            const sparkPath = pts.map((p, i) => (i === 0 ? "M" : "L") + ` ${p.x} ${p.y}`).join(" ");
            svg += `<path d="${sparkPath}" stroke="${chartColor}" stroke-width="${sparkLineW}" fill="none" vector-effect="non-scaling-stroke" style="stroke-linecap:round;stroke-linejoin:round;"/>`;

            // End dot (last data point)
            const lastPt = pts[pts.length - 1];
            svg += `<circle cx="${lastPt.x}" cy="${lastPt.y}" r="2" fill="${chartColor}" stroke="none" vector-effect="non-scaling-stroke"/>`;

            svg += `</svg>`;
            return svg; // Sparkline has no X-axis labels
        } else if (isLine) {
            // ── LINE CHART ──────────────────────────────────────────────
            // Stretched viewBox (same as bars) so line fills full card width.
            // vector-effect="non-scaling-stroke" keeps the line a uniform 2px.
            // Gradient area fill for depth. No dots (they distort with non-uniform scaling).
            const chartHeight = 100;

            svg = `<svg class="miniChart" viewBox="0 0 100 ${chartHeight}" preserveAspectRatio="none" style="height:${svgHeight}px;" xmlns="http://www.w3.org/2000/svg">`;
            svg += `<line class="miniChart-hover-line" x1="0" y1="0" x2="0" y2="${chartHeight}" stroke="#666666" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;

            const points = values.map((v, i) => {
                const x = count > 1 ? (i / (count - 1)) * 100 : 50;
                const y = chartHeight - (v / max * chartHeight);
                return { x, y };
            });

            // Straight linear path
            const linePath = points.map((p, i) => (i === 0 ? "M" : "L") + ` ${p.x} ${p.y}`).join(" ");

            // Gradient area fill under the line
            const gradId = "lineGrad_" + Math.random().toString(36).substr(2, 6);
            svg += `<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">`;
            svg += `<stop offset="0%" stop-color="${chartColor}" stop-opacity="0.2"/>`;
            svg += `<stop offset="100%" stop-color="${chartColor}" stop-opacity="0.02"/>`;
            svg += `</linearGradient></defs>`;

            const areaPath = linePath + ` L ${points[points.length - 1].x} ${chartHeight} L ${points[0].x} ${chartHeight} Z`;
            svg += `<path d="${areaPath}" fill="url(#${gradId})" stroke="none"/>`;

            // Main line
            svg += `<path class="miniChart-line" d="${linePath}" stroke="${chartColor}" stroke-width="${lineWidth}" fill="none" vector-effect="non-scaling-stroke" style="stroke:${chartColor};stroke-linecap:round;stroke-linejoin:round;"/>`;

            // Small filled data points (same color as line, no border — like Qlik native)
            points.forEach((p) => {
                svg += `<circle cx="${p.x}" cy="${p.y}" r="1.8" fill="${chartColor}" stroke="none" vector-effect="non-scaling-stroke"/>`;
            });

            // Second series overlay (line chart)
            if (hasSecondSeries && values2.length > 1) {
                const points2 = values2.map((v, i) => {
                    const x = values2.length > 1 ? (i / (values2.length - 1)) * 100 : 50;
                    const y = chartHeight - (v / max * chartHeight);
                    return { x, y };
                });
                const linePath2 = points2.map((p, i) => (i === 0 ? "M" : "L") + ` ${p.x} ${p.y}`).join(" ");
                svg += `<path d="${linePath2}" stroke="${secondSeriesColor}" stroke-width="${lineWidth}" fill="none" vector-effect="non-scaling-stroke" style="stroke-linecap:round;stroke-linejoin:round;opacity:0.85;"/>`;
                points2.forEach((p) => {
                    svg += `<circle cx="${p.x}" cy="${p.y}" r="1.8" fill="${secondSeriesColor}" stroke="none" vector-effect="non-scaling-stroke"/>`;
                });
            }
        } else {
            // ── BAR CHART ───────────────────────────────────────────────
            // Stretched viewBox is fine for rectangles
            const chartHeight = 100;
            svg = `<svg class="miniChart" viewBox="0 0 100 ${chartHeight}" preserveAspectRatio="none" style="height:${svgHeight}px;" xmlns="http://www.w3.org/2000/svg">`;
            svg += `<line class="miniChart-hover-line" x1="0" y1="0" x2="0" y2="${chartHeight}" stroke="#666666" stroke-width="1.5"/>`;

            const barWidthPct = Math.max(10, Math.min(100, layout.props.chartBarWidth || 60)) / 100;
            const showSecondBars = hasSecondSeries && values2.length === count;
            const groupCount = showSecondBars ? 2 : 1;
            const barWidth = count > 0 ? (100 / count) * barWidthPct / groupCount : 5;
            const spacing = count > 0 ? (100 / count) * (1 - barWidthPct) : 0;

            values.forEach((v, i) => {
                const height = (v / max) * chartHeight;
                const x = i * (100 / count) + spacing / 2;
                const y = chartHeight - height;
                svg += `<rect x="${x}" y="${y}" width="${barWidth}" height="${height}" rx="2" fill="${chartColor}" style="fill:${chartColor}"/>`;
                if (showSecondBars) {
                    const h2 = (values2[i] / max) * chartHeight;
                    const x2 = x + barWidth;
                    const y2 = chartHeight - h2;
                    svg += `<rect x="${x2}" y="${y2}" width="${barWidth}" height="${h2}" rx="2" fill="${secondSeriesColor}" style="fill:${secondSeriesColor};opacity:0.85;"/>`;
                }
            });
        }

        svg += `</svg>`;

        // Build X-axis labels as HTML (outside SVG to avoid preserveAspectRatio distortion)
        let xAxisHtml = "";
        if (showXAxis && (hasDim || hasXAxisMeasure) && matrix.length > 0) {
            const xAxisExpr = layout.props.xAxisExpression;
            let labels = [];
            matrix.forEach((row, i) => {
                let label = "";

                // Prefer measure over dimension if available
                if (hasXAxisMeasure && row[xAxisColIndex]) {
                    label = row[xAxisColIndex]?.qText || "";
                } else if (hasDim) {
                    const dimValue = row[dimIndex]?.qText || "";
                    label = dimValue;

                    // Apply custom expression/pattern if provided
                    if (xAxisExpr && xAxisExpr.trim() !== "" && !hasXAxisMeasure) {
                        const expr = xAxisExpr.trim().toLowerCase();
                        // Handle common patterns - extract part after dash (e.g., "2025-jul" -> "jul")
                        if (dimValue.includes("-")) {
                            const parts = dimValue.split("-");
                            if (parts.length > 1) {
                                label = parts[parts.length - 1]; // Take last part
                            }
                        }
                        // Handle substring patterns
                        if (expr.includes("substring") && dimValue.length > 3) {
                            label = dimValue.substring(dimValue.length - 3);
                        }
                    }
                }

                labels.push(escapeHtml(label));
            });

            xAxisHtml = '<div class="mini-chart-xaxis" style="font-size:' + xAxisFontSize + 'px;">';
            labels.forEach(function (lbl) {
                xAxisHtml += '<span class="mini-chart-xaxis-label">' + lbl + '</span>';
            });
            xAxisHtml += '</div>';
        }

        // Value labels row (HTML, above X-axis)
        let valueLabelsHtml = "";
        if (layout.props.showValueLabels === true && !isSparkline) {
            const vlFontSize = layout.props.valueLabelFontSize || 9;
            const vlColor = fixColor(layout.props.textColor, "#666666");
            valueLabelsHtml = '<div class="mini-chart-value-labels" style="font-size:' + vlFontSize + 'px;color:' + vlColor + ';">';
            values.forEach(function (v) {
                // Compact number formatting for labels
                let label;
                if (Math.abs(v) >= 1e9) label = (v / 1e9).toFixed(1) + "B";
                else if (Math.abs(v) >= 1e6) label = (v / 1e6).toFixed(1) + "M";
                else if (Math.abs(v) >= 1e3) label = (v / 1e3).toFixed(1) + "K";
                else if (Number.isInteger(v)) label = String(v);
                else label = v.toFixed(1);
                valueLabelsHtml += '<span class="mini-chart-value-label">' + escapeHtml(label) + '</span>';
            });
            valueLabelsHtml += '</div>';
        }

        return svg + valueLabelsHtml + xAxisHtml;
    }

    /**
     * Build comparison block HTML
     */
    function buildComparisonBlock(side, value, formatted, layout, compFontSize, autoContrast, bgColor) {
        const titleRaw = layout.props[`${side}Title`] || "";
        // Escape HTML to prevent XSS attacks
        const title = escapeHtml(titleRaw);
        const titleFontSize = layout.props[`${side}TitleFontSize`] || 12;
        const titleFontWeight = layout.props[`${side}TitleFontWeight`] || "500";
        const valueFontWeight = layout.props[`${side}ValueFontWeight`] || "600";
        const iconUrl = layout.props[`${side}IconUrl`];
        const iconSize = layout.props[`${side}IconSize`] || 16;
        const iconPos = layout.props[`${side}IconPosition`] || "before";
        const valueColorExpr = layout.props[`${side}ValueColorExpr`];
        const textColor = layout.props.textColor;
        const valueColor = getValueColor(valueColorExpr, textColor, autoContrast, bgColor);

        // Prefix & Suffix
        const prefix = layout.props[`${side}ValuePrefix`] || "";
        const suffix = layout.props[`${side}ValueSuffix`] || "";
        const prefixHtml = prefix ? `<span class="val-prefix">${escapeHtml(prefix)}</span>` : "";
        const suffixHtml = suffix ? `<span class="val-suffix">${escapeHtml(suffix)}</span>` : "";

        // Trend micro-text
        const trendRaw = layout.props[`${side}TrendText`] || "";
        const trendColor = fixColor(layout.props[`${side}TrendColor`], "#999999");
        const trendHtml = trendRaw.trim()
            ? `<div class="comp-trend" style="color:${trendColor};">${escapeHtml(trendRaw)}</div>`
            : "";

        const iconHtml = iconUrl
            ? `<img class="comp-icon" src="${iconUrl}" style="width:${iconSize}px;height:${iconSize}px;" alt="">`
            : "";

        // Get per-KPI arrow settings
        const showArrows = layout.props[`${side}ShowArrows`] === true; // Only show if explicitly enabled
        const posColor = layout.props[`${side}PosColor`] || layout.props.posColor || "#21a46f";
        const negColor = layout.props[`${side}NegColor`] || layout.props.negColor || "#e04e4e";
        const invertLogic = layout.props[`${side}InvertArrowLogic`] === true; // Default to false
        const applyArrowColorToValue = layout.props[`${side}ApplyArrowColorToValue`] === true; // Default to false

        // Use value color expression for both arrow and value (unified approach)
        const arrow = buildArrow(
            layout.props[`${side}ArrowExpr`],
            valueColorExpr, // Use value color expression for arrow color too
            value,
            layout,
            showArrows,
            posColor,
            negColor,
            invertLogic
        );

        // Determine final value color
        // Auto-color by sign: green for positive, red for negative (independent of arrows)
        const autoColorBySign = layout.props[`${side}AutoColorBySign`] === true;
        let finalValueColor = valueColor;
        if (autoColorBySign && value !== null && value !== undefined) {
            if (value > 0) {
                finalValueColor = fixColor(posColor, "#21a46f");
            } else if (value < 0) {
                finalValueColor = fixColor(negColor, "#e04e4e");
            }
        } else if (applyArrowColorToValue && showArrows && value !== null && value !== undefined) {
            // Apply arrow color to value based on value sign and invert logic
            if (value > 0) {
                finalValueColor = invertLogic ? fixColor(negColor, "#e04e4e") : fixColor(posColor, "#21a46f");
            } else if (value < 0) {
                finalValueColor = invertLogic ? fixColor(posColor, "#21a46f") : fixColor(negColor, "#e04e4e");
            }
            // If value is 0, keep original color
        }

        if (iconPos === "top") {
            return `
                <div class="comp-block">
                    <div class="comp-icon-top">${iconHtml}</div>
                    <div class="comp-title" style="font-size:${titleFontSize}px;font-weight:${titleFontWeight};">${title}</div>
                    <div class="comp-value" style="font-size:${compFontSize}px;font-weight:${valueFontWeight};color:${finalValueColor}">
                        ${arrow}${prefixHtml}${formatted}${suffixHtml}
                    </div>
                    ${trendHtml}
                </div>
            `;
        }

        return `
            <div class="comp-block">
                <div class="comp-title" style="font-size:${titleFontSize}px;font-weight:${titleFontWeight};">${title}</div>
                <div class="comp-value" style="font-size:${compFontSize}px;font-weight:${valueFontWeight};color:${finalValueColor}">
                    ${iconPos === "before" ? iconHtml : ""}
                    ${arrow}${prefixHtml}${formatted}${suffixHtml}
                    ${iconPos === "after" ? iconHtml : ""}
                </div>
                ${trendHtml}
            </div>
        `;
    }

    // ============================================
    // MEASURE STRUCTURE HELPER
    // ============================================
    /**
     * Ensures a measure has the complete structure that Qlik Sense expects.
     * - If the measure is null/undefined, returns a fresh default measure object.
     * - If it exists, fills in any missing sub-properties with defaults.
     * - Always sets measure.qValueExpression = { qv: "" } (required by Qlik's isLocked()).
     * @param {Object|null|undefined} measure
     * @returns {Object} A fully-structured measure object
     */
    function ensureMeasureStructure(measure) {
        var defaultNumFormat = {
            qType: "U",
            qUseThou: 0,
            qFmt: "",
            qDec: "",
            qThou: ""
        };
        var defaultSortBy = {
            qSortByNumeric: 1,
            qSortByAscii: 1,
            qSortByLoadOrder: 1
        };

        if (!measure) {
            return {
                qDef: {
                    qDef: "",
                    qLabel: "",
                    qNumFormat: defaultNumFormat
                },
                qLibraryId: "",
                qValueExpression: { qv: "" },
                qSortBy: defaultSortBy
            };
        }

        // Ensure qDef exists and has proper structure
        if (!measure.qDef) {
            measure.qDef = {
                qDef: "",
                qLabel: "",
                qNumFormat: defaultNumFormat
            };
        } else {
            if (typeof measure.qDef.qDef === 'undefined') {
                measure.qDef.qDef = "";
            }
            if (typeof measure.qDef.qLabel === 'undefined') {
                measure.qDef.qLabel = "";
            }
            // Remove qValueExpression from qDef if it exists (not a standard property)
            if (measure.qDef.hasOwnProperty('qValueExpression')) {
                delete measure.qDef.qValueExpression;
            }
            // Ensure qNumFormat exists for native formatting
            if (!measure.qDef.qNumFormat || typeof measure.qDef.qNumFormat !== 'object') {
                measure.qDef.qNumFormat = defaultNumFormat;
            }
        }

        // Ensure qLibraryId exists
        if (typeof measure.qLibraryId === 'undefined') {
            measure.qLibraryId = "";
        }
        // Ensure qSortBy exists
        if (!measure.qSortBy) {
            measure.qSortBy = defaultSortBy;
        }
        // Fix qAttributeExpressions/qAttributeDimensions if they exist but aren't arrays
        if (measure.hasOwnProperty('qAttributeExpressions') && !Array.isArray(measure.qAttributeExpressions)) {
            measure.qAttributeExpressions = [];
        }
        if (measure.hasOwnProperty('qAttributeDimensions') && !Array.isArray(measure.qAttributeDimensions)) {
            measure.qAttributeDimensions = [];
        }
        // CRITICAL: qValueExpression at root level is accessed by Qlik Sense's isLocked() function
        // Must ALWAYS exist as object (not null) to prevent "Cannot read properties of null" errors
        measure.qValueExpression = { qv: "" };

        return measure;
    }

    // ============================================
    // COUNT-UP ANIMATION
    // ============================================

    /**
     * Ease-out cubic — fast start, smooth deceleration.
     */
    function easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    /**
     * Animate a numeric value from a previous value to `endVal`
     * inside a DOM element, formatting each frame via `formatFn`.
     *
     * @param {HTMLElement} el         Target element (textContent will be overwritten)
     * @param {number}      endVal     Final numeric value
     * @param {number}      duration   Animation duration in ms (default 600)
     * @param {function}    formatFn   (num) => string — formats the interpolated number
     * @param {string}      finalText  Exact text to display on the last frame (ensures fidelity)
     */
    function animateCountUp(el, endVal, duration, formatFn, finalText) {
        if (!el || isNaN(endVal)) return;

        var prevVal = parseFloat(el.getAttribute('data-anim-prev')) || 0;

        // If value hasn't changed, just set final text and skip animation
        if (prevVal === endVal) {
            if (finalText) el.textContent = finalText;
            return;
        }

        // Store the new target so subsequent paints can detect changes
        el.setAttribute('data-anim-prev', endVal);

        var startTime = null;
        var dur = duration || 600;
        var exact = finalText || formatFn(endVal);

        function step(timestamp) {
            if (!startTime) startTime = timestamp;
            var elapsed = timestamp - startTime;
            var progress = Math.min(elapsed / dur, 1);
            var easedProgress = easeOutCubic(progress);

            if (progress < 1) {
                var current = prevVal + (endVal - prevVal) * easedProgress;
                el.textContent = formatFn(current);
                requestAnimationFrame(step);
            } else {
                // Final frame: use the exact pre-formatted text for fidelity
                el.textContent = exact;
            }
        }

        requestAnimationFrame(step);
    }

    // ============================================
    // EXPRESSION & TITLE HELPERS
    // ============================================

    /**
     * Escape HTML special characters to prevent XSS
     */
    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Extract a plain string from a Qlik expression-style value.
     * Handles: 'text', "text", ='text', ="text"
     * Returns the unquoted string, or null if not a simple literal.
     */
    function extractStringLiteral(expr) {
        if (!expr || typeof expr !== "string") return null;
        var trimmed = expr.trim();
        var withoutEquals = trimmed.startsWith("=") ? trimmed.substring(1).trim() : trimmed;
        if ((withoutEquals.startsWith("'") && withoutEquals.endsWith("'")) ||
            (withoutEquals.startsWith('"') && withoutEquals.endsWith('"'))) {
            return withoutEquals.substring(1, withoutEquals.length - 1);
        }
        return null;
    }

    /** Regex matching common Qlik expression function calls */
    var QLIK_EXPR_RE = /Date\(|AddMonths\(|Today\(|Sum\(|Count\(|Avg\(|Max\(|Min\(|If\(|Match\(|SubString\(/i;

    /**
     * Parse a raw title value and determine whether it needs server-side evaluation.
     * @returns {{ displayText: string, expression: string|null, needsEval: boolean }}
     */
    function parseTitleExpression(titleRaw) {
        var result = { displayText: titleRaw || "", expression: null, needsEval: false };
        if (typeof titleRaw !== "string" || titleRaw.trim() === "") return result;

        var trimmed = titleRaw.trim();

        // Simple quoted literal — use directly
        var literal = extractStringLiteral(trimmed);
        if (literal !== null) {
            result.displayText = literal;
            return result;
        }

        // Starts with = — explicit expression
        if (trimmed.startsWith("=")) {
            var inner = trimmed.substring(1).trim();
            var nestedLiteral = extractStringLiteral(inner);
            if (nestedLiteral !== null) {
                result.displayText = nestedLiteral;
                return result;
            }
            result.displayText = ""; // placeholder until evaluated
            result.expression = inner;
            result.needsEval = true;
            return result;
        }

        // Contains Qlik function calls
        if (QLIK_EXPR_RE.test(trimmed)) {
            result.displayText = "";
            result.expression = trimmed;
            result.needsEval = true;
            return result;
        }

        // Contains operators and is not trivially short
        if (/[&|]/.test(trimmed) && trimmed.length > 3) {
            result.displayText = "";
            result.expression = trimmed;
            result.needsEval = true;
            return result;
        }

        // Plain text — use as-is
        return result;
    }

    /**
     * Try every available Qlik API path to evaluate an expression.
     * Returns a thenable (promise) or null if no API is available.
     */
    function resolveExpression(expr, backendApiRef, $element, layout) {
        var promise = null;

        // 1) backendApi (most reliable)
        if (backendApiRef) {
            if (typeof backendApiRef.evaluateExpression === "function") {
                promise = backendApiRef.evaluateExpression(expr);
            } else if (backendApiRef.model && typeof backendApiRef.model.evaluateExpression === "function") {
                promise = backendApiRef.model.evaluateExpression(expr);
            } else if (backendApiRef.model && backendApiRef.model.qHyperCube &&
                backendApiRef.model.qHyperCube.qApp &&
                typeof backendApiRef.model.qHyperCube.qApp.evaluateExpression === "function") {
                promise = backendApiRef.model.qHyperCube.qApp.evaluateExpression(expr);
            }
        }

        // 2) qlik.currApp()
        if (!promise && typeof qlik !== "undefined") {
            try {
                var app = null;
                try { app = qlik.currApp(); } catch (_) { /* ignore */ }

                if (app) {
                    if (typeof app.evaluateExpression === "function") {
                        promise = app.evaluateExpression(expr);
                    } else if (typeof app.evaluate === "function") {
                        promise = app.evaluate(expr);
                    } else if (app.model && typeof app.model.evaluateExpression === "function") {
                        promise = app.model.evaluateExpression(expr);
                    }
                }

                // 3) qlik.getObject()
                if (!promise && layout.qInfo && layout.qInfo.qId && typeof qlik.getObject === "function") {
                    try {
                        var obj = qlik.getObject(layout.qInfo.qId);
                        if (obj && obj.model && typeof obj.model.evaluateExpression === "function") {
                            promise = obj.model.evaluateExpression(expr);
                        }
                    } catch (_) { /* ignore */ }
                }

                // 4) qlik.evaluateExpression (last resort)
                if (!promise && typeof qlik.evaluateExpression === "function") {
                    promise = qlik.evaluateExpression(expr);
                }
            } catch (_) { /* ignore */ }
        }

        return promise;
    }

    /**
     * Normalise the result of evaluateExpression into a plain string.
     */
    function extractEvalResult(result, fallback) {
        if (!result) return fallback;
        if (result.qText !== undefined && result.qText !== null) return result.qText;
        if (result.qNum !== undefined && result.qNum !== null) return String(result.qNum);
        if (typeof result === "string") return result;
        if (typeof result === "number") return String(result);
        return String(result);
    }

    /**
     * Obtain a reference to the backendApi, caching it on `self` and `$element`.
     */
    function getBackendApi(self, $element, layout) {
        var ref = self.backendApi || $element.data("backendApi");
        if (!ref && typeof qlik !== "undefined" && layout.qInfo && layout.qInfo.qId) {
            try {
                if (typeof qlik.getObject === "function") {
                    var obj = qlik.getObject(layout.qInfo.qId);
                    if (obj && obj.backendApi) {
                        ref = obj.backendApi;
                    }
                }
            } catch (_) { /* ignore */ }
        }
        if (ref) {
            self.backendApi = ref;
            $element.data("backendApi", ref);
        }
        return ref;
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

        // Controller to auto-repair corrupted measures on load
        controller: ["$scope", function ($scope) {
            // Check for broken measures (null entries or missing structure) and fix them
            if ($scope.backendApi && $scope.backendApi.getProperties) {
                $scope.backendApi.getProperties().then(function (props) {
                    var changed = false;
                    if (props.qHyperCubeDef && props.qHyperCubeDef.qMeasures) {
                        var measures = props.qHyperCubeDef.qMeasures;
                        for (var i = 0; i < measures.length; i++) {
                            // If measure is null or missing critical structure
                            if (!measures[i] || !measures[i].qDef || !measures[i].qValueExpression) {
                                // Repair it using our safe structure generator
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
                // About section - static text values
                aboutTitle: "Modern KPI Card",
                aboutText1: "Modern KPI Card is a visualization extension that provides enhanced design options and better UI for your KPI objects.",
                aboutText2: "Modern KPI Card offers a clean, modern interface with customizable styling, smooth animations, and responsive layout.",
                aboutAuthor: "Created by Ala Aldin Hija",
                aboutVersion: "Version: 1.0.0"
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
                            label: "Version: 2.0.0",
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

        paint: function ($element, layout) {
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
                // Clear previous tooltip
                $(".kpi-tooltip").remove();


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
                const conditionalBg = layout.props.conditionalBgColor ? fixColor(layout.props.conditionalBgColor, null) : null;
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
                // Build background (solid or gradient)
                const isGradient = layout.props.enableGradient === true;
                const bgColor2 = isGradient ? fixColor(layout.props.bgColor2, "#667eea") : bgColor;
                const gradientDir = layout.props.gradientDirection || "to right";
                const cardBackground = isGradient
                    ? `linear-gradient(${gradientDir}, ${bgColor}, ${bgColor2})`
                    : bgColor;

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

                // Constraint 1: Height cap — value gets 1/heightDiv of card height
                // More comparisons = less room for the value
                const heightDiv = visibleCompCount > 0 ? (autoFitMainValue ? 5 : 7.5) : (autoFitMainValue ? 2.2 : 3.5);
                const heightCap = cardHeight / heightDiv;

                // Constraint 2: Text-width cap — value must fit horizontally
                const pad = cardWidth <= 160 ? 16 : cardWidth <= 220 ? 20 : 36;
                const fitWidth = Math.max(40, cardWidth - pad);
                const textCap = fitWidth / (mainTextLen * 0.58);

                // Constraint 3: Width-proportional cap (relaxed in auto-fit mode)
                const widthCap = autoFitMainValue ? cardWidth * 0.45 : cardWidth * 0.13;

                // Pick the tightest constraint, floor at 10px
                const scaledMainFont = Math.round(Math.max(10, Math.min(userMainFontSize, heightCap, textCap, widthCap)));

                // --- Scale TITLE font size ---
                const userTitleFont = layout.props.mainTitleFontSize || 14;
                const scaledTitleFont = Math.round(Math.max(8, Math.min(userTitleFont, cardHeight / 12, cardWidth * 0.08)));

                // --- Scale COMPARISON VALUE font size ---
                let compFontSize = layout.props.compValueFontSize || 18;
                const compHCap = cardHeight / 9;
                const compWCap = cardWidth * 0.1;
                compFontSize = Math.round(Math.max(9, Math.min(compFontSize, compHCap, compWCap)));

                // --- Scale COMPARISON TITLE font size ---
                const userCompTitleFont = layout.props.leftTitleFontSize || 12;
                const scaledCompTitleFont = Math.round(Math.max(7, Math.min(userCompTitleFont, cardHeight / 14, cardWidth * 0.07)));

                // --- Scale ARROW size ---
                const scaledArrowFont = Math.round(Math.max(8, Math.min(14, cardHeight / 11, cardWidth * 0.08)));

                // Width class for CSS fallback
                const sizeClass = cardWidth <= 120 ? 'kpi-micro' : cardWidth <= 160 ? 'kpi-tiny' : cardWidth <= 220 ? 'kpi-compact' : '';
                const heightClass = cardHeight <= 120 ? 'kpi-short' : '';

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

                const mainIconHtml = mainIconUrl
                    ? `<img class="title-icon" src="${mainIconUrl}" style="width:${mainIconSize}px;height:${mainIconSize}px;" alt="">`
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
                        dividerMarginTop = isChartDisabled ? "-8px" : "16px";
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
                // BUILD FINAL HTML
                // ============================================
                // Use the isChartDisabled variable already declared above
                const noChartClass = isChartDisabled ? "no-chart" : "";
                // When there's no bottom content at all (no chart AND no comparison), center the main content vertically
                const hasBottomContent = (showChart && hasChartSvg) || (showComparison && comparisonBlocks.length > 0);
                const centerContentClass = !hasBottomContent ? "kpi-center-content" : "";
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

                const isFlipCardMode = tooltipMode === true;

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

                if (isFlipCardMode) {
                    // Flip card mode - use full flip structure
                    html = `
                    <div class="kpi-size-wrapper">
                        <div class="kpi-flip-card-wrapper">
                            <div class="kpi-container ${noChartClass} ${centerContentClass} ${bothModeClass} kpi-flip-card" style="${cardStyle}">
                                <div class="flip-card-front-content">
                                    ${tooltipIconHtml}
                                    ${headerContent ? `<div class="kpi-header ${mainIconPos === "top" ? "icon-top" : ""}" data-align="${mainTitleAlignment}" style="justify-content:${headerAlignment} !important; width: 100%; display: flex;">
                                        ${headerContent}
                                    </div>` : ""}
                                    <div class="main-value ${mainValueAlignClass}" style="
                                        font-size: ${scaledMainFont}px !important;
                                        font-weight: ${mainValueFontWeight} !important;
                                        text-align: ${mainValueAlignment} !important;
                                        color: ${mainValueColor} !important;
                                        margin-bottom: ${isChartDisabled ? '12px' : '4px'};
                                    ">
                                        ${mainValueInner}
                                    </div>
                                    ${miniChartSvg ? `<div class="chart-container">${miniChartSvg}</div>` : ""}
                                    ${dividerH}
                                    ${comparisonHtml}
                                </div>
                                <div class="flip-card-back" style="background:${flipBackInheritBg ? cardBackground : '#ffffff'};">${flipCardBackContent}</div>
                            </div>
                        </div>
                    </div>
                `;
                } else {
                    // Standard mode - simple structure without flip wrapper
                    html = `
                    <div class="kpi-size-wrapper">
                        <div class="kpi-container ${noChartClass} ${centerContentClass} ${bothModeClass}" style="${cardStyle}">
                            ${tooltipIconHtml}
                            ${headerContent ? `<div class="kpi-header ${mainIconPos === "top" ? "icon-top" : ""}" data-align="${mainTitleAlignment}" style="justify-content:${headerAlignment} !important; width: 100%; display: flex;">
                                ${headerContent}
                            </div>` : ""}
                            <div class="main-value ${mainValueAlignClass}" style="
                                font-size: ${scaledMainFont}px !important;
                                font-weight: ${mainValueFontWeight} !important;
                                text-align: ${mainValueAlignment} !important;
                                color: ${mainValueColor} !important;
                                margin-bottom: ${isChartDisabled ? '12px' : '4px'};
                            ">
                                ${mainValueInner}
                            </div>
                            ${miniChartSvg ? `<div class="chart-container">${miniChartSvg}</div>` : ""}
                            ${dividerH}
                            ${comparisonHtml}
                        </div>
                    </div>
                `;
                }

                $element.html(html);

                // Add class to parent Qlik containers for scoped CSS targeting
                $element.parents('.qv-object, .qv-object-wrapper, .qv-object-content, .qv-object-content-wrapper').addClass('kpi-extension-wrapper');

                // CRITICAL: Force parent Qlik containers to fill 100%
                // Apply styles directly to ensure they take effect
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

                // ============================================
                // POST-RENDER: Apply CSS classes & confirm sizes
                // Font sizes were already calculated BEFORE HTML
                // was built and are embedded in the template.
                // This section adds responsive CSS classes and
                // re-confirms dynamic values on the DOM elements.
                // ============================================
                const $sizeWrapper = $element.find('.kpi-size-wrapper');

                // Apply responsive size classes (CSS fallback for @container)
                if (sizeClass) $sizeWrapper.addClass(sizeClass);
                if (heightClass) $sizeWrapper.addClass(heightClass);

                // Re-confirm main value color (inline style + JS backup)
                const $mainValue = $element.find('.main-value');
                if ($mainValue.length > 0) {
                    const mainValueEl = $mainValue[0];
                    if (mainValueEl) {
                        mainValueEl.style.setProperty('font-size', scaledMainFont + 'px', 'important');
                        mainValueEl.style.setProperty('font-weight', mainValueFontWeight, 'important');
                        mainValueEl.style.setProperty('color', mainValueColor, 'important');
                        $mainValue.attr('data-color', mainValueColor);
                    }
                }

                // Apply scaled comparison value font sizes
                const $compValues = $element.find('.comp-value');
                $compValues.each(function () {
                    this.style.setProperty('font-size', compFontSize + 'px', 'important');
                });

                // Apply scaled comparison title font sizes
                const $compTitles = $element.find('.comp-title');
                $compTitles.each(function () {
                    this.style.setProperty('font-size', scaledCompTitleFont + 'px', 'important');
                });

                // Apply scaled arrow sizes
                const $compArrows = $element.find('.comp-arrow');
                $compArrows.each(function () {
                    this.style.setProperty('font-size', scaledArrowFont + 'px', 'important');
                });

                // Apply scaled title font
                const $kpiTitle = $element.find('.kpi-title');
                if ($kpiTitle.length > 0) {
                    $kpiTitle[0].style.setProperty('font-size', scaledTitleFont + 'px', 'important');
                }

                // ============================================
                // COUNT-UP ANIMATION
                // ============================================
                if (layout.props.enableCountUp !== false) {
                    var animDuration = parseInt(layout.props.countUpDuration, 10) || 600;

                    // Main value — animate the inner .main-val-num span so prefix/suffix/icon stay stable
                    var $mainValNum = $element.find('.main-val-num');
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

                    $compValues.each(function (idx) {
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
                // MINI CHART TOOLTIP
                // ============================================
                if (miniChartSvg && layout.props.showTooltip !== false) {
                    const tooltip = $("<div class='kpi-tooltip'></div>").appendTo("body");
                    const svg = $element.find(".miniChart");

                    if (svg.length && matrix.length > 0) {
                        const hoverLine = svg.find(".miniChart-hover-line");

                        svg.on("mousemove", function (evt) {
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

                        svg.on("mouseleave", function () {
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

                // Add event listener for flip card trigger
                if (isFlipCardMode) {
                    const $iconTrigger = $element.find(".tooltip-icon-trigger");
                    const $flipCard = $element.find(".kpi-flip-card");
                    const $wrapper = $element.find(".kpi-flip-card-wrapper");

                    if ($flipCard.length) {
                        if (flipTrigger === "iconClick") {
                            // Click-to-toggle mode — stays flipped until clicked again
                            $iconTrigger.on("click", function (e) {
                                e.stopPropagation();
                                var isFlipped = $flipCard.attr("data-flipped") === "1";
                                $flipCard.css("transform", isFlipped ? "rotateY(0deg)" : "rotateY(180deg)");
                                $flipCard.attr("data-flipped", isFlipped ? "0" : "1");
                            });
                            // Also allow clicking anywhere on the back to unflip
                            $element.find(".flip-card-back").on("click", function (e) {
                                e.stopPropagation();
                                $flipCard.css("transform", "rotateY(0deg)");
                                $flipCard.attr("data-flipped", "0");
                            });
                        } else if (flipTrigger === "cardHover") {
                            // Flip when hovering anywhere on the card
                            $wrapper.on("mouseenter", function () {
                                $flipCard.css("transform", "rotateY(180deg)");
                            });
                            $wrapper.on("mouseleave", function () {
                                $flipCard.css("transform", "rotateY(0deg)");
                            });
                        } else {
                            // Default: iconHover — flip on icon hover, unflip on card leave
                            if ($iconTrigger.length) {
                                $iconTrigger.on("mouseenter", function () {
                                    $flipCard.css("transform", "rotateY(180deg)");
                                });
                                $wrapper.on("mouseleave", function () {
                                    $flipCard.css("transform", "rotateY(0deg)");
                                });
                            }
                        }
                    }
                }

                // ============================================
                // EVALUATE TITLE EXPRESSIONS IF NEEDED
                // ============================================
                var backendApiRef = getBackendApi(this, $element, layout);
                var selfRef = this;

                // Main title
                if (needsEvaluation && titleExpression && titleExpression.trim() !== "") {
                    try {
                        var mainEvalPromise = resolveExpression(titleExpression, backendApiRef, $element, layout);
                        if (mainEvalPromise) {
                            mainEvalPromise.then(function (result) {
                                var evaluatedTitle = extractEvalResult(result, titleExpression);
                                var escaped = escapeHtml(evaluatedTitle);
                                var $titleEl = $element.find('.kpi-title');
                                var $headerEl = $element.find('.kpi-header');
                                if ($titleEl.length > 0) {
                                    $titleEl.html(escaped);
                                    if ($headerEl.length > 0) $headerEl.show();
                                } else if (evaluatedTitle && String(evaluatedTitle).trim() !== "") {
                                    // Create header dynamically
                                    var fs = layout.props.mainTitleFontSize || 14;
                                    var fw = layout.props.mainTitleFontWeight || "500";
                                    var align = layout.props.mainTitleAlignment || "left";
                                    var ha = align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";
                                    var iPos = layout.props.mainIconPosition || "left";
                                    var iUrl = layout.props.titleIcon;
                                    var iSize = layout.props.mainIconSize || 20;
                                    var iHtml = iUrl ? '<img class="title-icon" src="' + iUrl + '" style="width:' + iSize + 'px;height:' + iSize + 'px;" alt="">' : "";
                                    var titleSpan = '<div class="kpi-title-group"><span class="kpi-title" style="font-size:' + fs + 'px;font-weight:' + fw + ';">' + escaped + '</span></div>';
                                    var hc = iPos === "right"
                                        ? titleSpan + iHtml
                                        : iHtml + titleSpan;
                                    var $mv = $element.find('.main-value');
                                    if ($mv.length > 0) {
                                        $mv.before('<div class="kpi-header ' + (iPos === "top" ? "icon-top" : "") + '" data-align="' + align + '" style="justify-content:' + ha + ';">' + hc + '</div>');
                                    }
                                }
                            }).catch(function () { /* ignore */ });
                        } else if (titleExpression.trim() !== "") {
                            // No API available — show cleaned-up expression text
                            var $titleEl = $element.find('.kpi-title');
                            if ($titleEl.length > 0) {
                                $titleEl.html(escapeHtml(titleExpression));
                            }
                        }
                    } catch (_) { /* ignore */ }
                }

                // Subtitle expression evaluation
                if (subtitleParsed.needsEval && subtitleParsed.expression && subtitleParsed.expression.trim() !== "") {
                    try {
                        var subEvalPromise = resolveExpression(subtitleParsed.expression, backendApiRef, $element, layout);
                        if (subEvalPromise) {
                            subEvalPromise.then(function (result) {
                                var evaluatedSub = extractEvalResult(result, subtitleParsed.expression);
                                var escaped = escapeHtml(evaluatedSub);
                                var $subEl = $element.find('.kpi-subtitle');
                                if ($subEl.length > 0) {
                                    $subEl.html(escaped);
                                } else if (evaluatedSub && String(evaluatedSub).trim() !== "") {
                                    // Create subtitle element dynamically inside title-group
                                    var $titleGroup = $element.find('.kpi-title-group');
                                    if ($titleGroup.length > 0) {
                                        $titleGroup.append('<span class="kpi-subtitle" style="font-size:' + subtitleFontSize + 'px;color:' + subtitleColor + ';">' + escaped + '</span>');
                                    }
                                }
                            }).catch(function () { /* ignore */ });
                        }
                    } catch (_) { /* ignore */ }
                }

                // Comparison titles
                comparisonSides.forEach(function (side) {
                    if (!evaluatedTitles[side] || !evaluatedTitles[side].needsEval || !evaluatedTitles[side].expr) return;
                    var titleExpr = evaluatedTitles[side].expr;
                    try {
                        var promise = resolveExpression(titleExpr, backendApiRef, $element, layout);
                        if (promise) {
                            promise.then(function (result) {
                                var evaluated = extractEvalResult(result, titleExpr);
                                var escaped = escapeHtml(evaluated);
                                var enabledOrder = [];
                                if (layout.props.enableLeft !== false) enabledOrder.push("left");
                                if (layout.props.enableRight !== false) enabledOrder.push("right");
                                if (layout.props.enableThird === true) enabledOrder.push("third");
                                var idx = enabledOrder.indexOf(side);
                                if (idx >= 0) {
                                    var $blocks = $element.find('.comp-block');
                                    if ($blocks.length > idx) {
                                        $($blocks[idx]).find('.comp-title').html(escaped);
                                    }
                                }
                            }).catch(function () { /* ignore */ });
                        }
                    } catch (_) { /* ignore */ }
                });

                // Conditional Background Color
                var condBgExpr = layout.props.conditionalBgColor;
                if (condBgExpr && typeof condBgExpr === "string" && condBgExpr.trim().substring(0, 1) === "=") {
                    var bgExpr = condBgExpr.trim().substring(1);
                    try {
                        var bgPromise = resolveExpression(bgExpr, backendApiRef, $element, layout);
                        if (bgPromise) {
                            bgPromise.then(function (result) {
                                var evaluatedColor = extractEvalResult(result, null);
                                if (evaluatedColor && evaluatedColor !== "NaN" && evaluatedColor !== "undefined") {
                                    var finalBg = fixColor(evaluatedColor, null);
                                    if (finalBg) {
                                        $element[0].style.setProperty("--kpi-bg-color", finalBg, "important");
                                        var $container = $element.find('.kpi-container');
                                        // Override background with !important to defeat inline styles
                                        $container.css("background", finalBg + " !important");
                                    }
                                }
                            }).catch(function () { /* ignore */ });
                        }
                    } catch (_) { /* ignore */ }
                }

                // ============================================
                // CLICK ACTION / NAVIGATION
                // ============================================
                var clickActionType = layout.props.clickActionType || "none";
                if (clickActionType !== "none") {
                    var $container = $element.find('.kpi-container');
                    $container.addClass('kpi-clickable');
                    $container.off('click.kpiNav').on('click.kpiNav', function (e) {
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
