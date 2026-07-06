"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getThemeString = getThemeString;
exports.getTheme = getTheme;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const merge_1 = __importDefault(require("core/util/merge"));
const cjs_1 = require("monaco-vscode-textmate-theme-converter/lib/cjs");
const vscode = __importStar(require("vscode"));
/**
 * Strip comments from theme
 */
function stripInLineComment(line) {
    let inString = false;
    let pCh = "";
    for (let i = 0; i < line.length - 1; i++) {
        const ch = line[i];
        const nCh = line[i + 1];
        // If we're not in a string and we see '//' this is a comment.
        if (!inString && ch === "/" && nCh === "/") {
            // Stop processing this line from here.
            return line.substring(0, i);
        }
        // Toggle inString state if we see a double quote not escaped by a backslash.
        if (ch === '"' && pCh !== "\\") {
            inString = !inString;
        }
        pCh = ch;
    }
    return line;
}
function parseThemeString(themeString) {
    themeString = themeString
        ?.split("\n")
        .filter((line) => {
        return !line.trim().startsWith("//");
    })
        .map(stripInLineComment)
        .join("\n");
    return JSON.parse(themeString ?? "{}");
}
function getThemeString() {
    const workbenchConfig = vscode.workspace.getConfiguration();
    const themeString = workbenchConfig.get("workbench.colorTheme") ??
        "Default Dark Modern";
    return themeString;
}
function getTheme() {
    let currentTheme = undefined;
    // Get color theme from settings
    // use user settings if available
    // otherwise use default
    let colorTheme = undefined;
    // Get color theme from settings
    const workbenchConfig = vscode.workspace.getConfiguration();
    const autoDetectColorScheme = workbenchConfig.get("window.autoDetectColorScheme");
    const autoDetectHighContrast = workbenchConfig.get("window.autoDetectHighContrast");
    const activeColorTheme = vscode.window.activeColorTheme.kind;
    // prettier-ignore
    switch (true) {
        case autoDetectColorScheme && vscode.ColorThemeKind.Dark === activeColorTheme:
            colorTheme = workbenchConfig.get("workbench.preferredDarkColorTheme");
            break;
        case autoDetectColorScheme && vscode.ColorThemeKind.Light === activeColorTheme:
            colorTheme = workbenchConfig.get("workbench.preferredLightColorTheme");
            break;
        case autoDetectHighContrast && vscode.ColorThemeKind.HighContrast === activeColorTheme:
            colorTheme = workbenchConfig.get("workbench.preferredHighContrastColorTheme");
            break;
        case autoDetectHighContrast && vscode.ColorThemeKind.HighContrastLight === activeColorTheme:
            colorTheme = workbenchConfig.get("workbench.preferredHighContrastLightColorTheme");
            break;
        default:
            colorTheme =
                workbenchConfig.get("workbench.colorTheme") ??
                    "Default Dark Modern";
            break;
    }
    let parsed;
    try {
        // Pass color theme to webview for syntax highlighting
        for (let i = vscode.extensions.all.length - 1; i >= 0; i--) {
            const extension = vscode.extensions.all[i];
            if (extension.packageJSON?.contributes?.themes?.length > 0) {
                if (currentTheme) {
                    break;
                }
                for (const theme of extension.packageJSON.contributes.themes) {
                    if (theme.id === colorTheme || theme.label === colorTheme) {
                        const themePath = path.join(extension.extensionPath, theme.path);
                        currentTheme = fs.readFileSync(themePath).toString();
                        parsed = parseThemeString(currentTheme);
                        // Handle nested includes
                        let currentParsedTheme = parsed;
                        let currentThemePath = themePath;
                        let mergedTheme = currentParsedTheme;
                        while (currentParsedTheme.include) {
                            const themeDir = path.dirname(currentThemePath);
                            const includeThemePath = path.join(themeDir, currentParsedTheme.include);
                            if (fs.existsSync(includeThemePath)) {
                                const includeThemeString = fs
                                    .readFileSync(includeThemePath)
                                    .toString();
                                const includeTheme = parseThemeString(includeThemeString);
                                // Merge with base theme taking precedence, then overlay current customizations
                                mergedTheme = (0, merge_1.default)((0, merge_1.default)({}, includeTheme), // Start with base
                                mergedTheme);
                                // Update for next iteration - only update path and parsed theme for include checking
                                currentThemePath = includeThemePath;
                                currentParsedTheme = includeTheme;
                            }
                            else {
                                console.log(`include theme not found for ${currentTheme} looked for ${currentParsedTheme.include} in ${themeDir}`, includeThemePath);
                                break;
                            }
                        }
                        parsed = mergedTheme;
                        break;
                    }
                }
            }
        }
        if (!currentTheme) {
            console.warn(`did not find any theme files for theme ${colorTheme}`);
            return undefined;
        }
        let convertedTheme = (0, cjs_1.convertTheme)(parsed);
        convertedTheme.base = (["vs", "hc-black"].includes(convertedTheme.base)
            ? convertedTheme.base
            : activeColorTheme === vscode.ColorThemeKind.Light ||
                activeColorTheme === vscode.ColorThemeKind.HighContrastLight
                ? "vs"
                : "vs-dark");
        return convertedTheme;
    }
    catch (e) {
        console.log("Error loading color theme: ", e);
    }
    return undefined;
}
//# sourceMappingURL=getTheme.js.map