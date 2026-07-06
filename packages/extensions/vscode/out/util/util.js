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
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertSingleToDoubleQuoteJSON = convertSingleToDoubleQuoteJSON;
exports.debounced = debounced;
exports.getPlatform = getPlatform;
exports.getArchitecture = getArchitecture;
exports.isUnsupportedPlatform = isUnsupportedPlatform;
exports.getAltOrOption = getAltOrOption;
exports.getMetaKeyLabel = getMetaKeyLabel;
exports.getMetaKeyName = getMetaKeyName;
exports.getExtensionVersion = getExtensionVersion;
exports.getvsCodeUriScheme = getvsCodeUriScheme;
exports.isExtensionPrerelease = isExtensionPrerelease;
const os = __importStar(require("node:os"));
const vscode = __importStar(require("vscode"));
function charIsEscapedAtIndex(index, str) {
    if (index === 0) {
        return false;
    }
    if (str[index - 1] !== "\\") {
        return false;
    }
    return !charIsEscapedAtIndex(index - 1, str);
}
function convertSingleToDoubleQuoteJSON(json) {
    const singleQuote = "'";
    const doubleQuote = '"';
    const isQuote = (char) => char === doubleQuote || char === singleQuote;
    let newJson = "";
    let insideString = false;
    let enclosingQuoteType = doubleQuote;
    for (let i = 0; i < json.length; i++) {
        if (insideString) {
            if (json[i] === enclosingQuoteType && !charIsEscapedAtIndex(i, json)) {
                // Close string with a double quote
                insideString = false;
                newJson += doubleQuote;
            }
            else if (json[i] === singleQuote) {
                if (charIsEscapedAtIndex(i, json)) {
                    // Unescape single quote
                    newJson = newJson.slice(0, -1);
                }
                newJson += singleQuote;
            }
            else if (json[i] === doubleQuote) {
                if (!charIsEscapedAtIndex(i, json)) {
                    // Escape double quote
                    newJson += "\\";
                }
                newJson += doubleQuote;
            }
            else {
                newJson += json[i];
            }
        }
        else {
            if (isQuote(json[i])) {
                insideString = true;
                enclosingQuoteType = json[i];
                newJson += doubleQuote;
            }
            else {
                newJson += json[i];
            }
        }
    }
    return newJson;
}
function debounced(delay, fn) {
    let timerId;
    return (...args) => {
        if (timerId) {
            clearTimeout(timerId);
        }
        timerId = setTimeout(() => {
            fn(...args);
            timerId = null;
        }, delay);
    };
}
function getPlatform() {
    const platform = os.platform();
    if (platform === "darwin") {
        return "mac";
    }
    else if (platform === "linux") {
        return "linux";
    }
    else if (platform === "win32") {
        return "windows";
    }
    else {
        return "unknown";
    }
}
function getArchitecture() {
    const arch = os.arch();
    if (arch === "x64" || arch === "ia32") {
        return "x64";
    }
    else if (arch === "arm64" || arch === "arm") {
        return "arm64";
    }
    else {
        return "unknown";
    }
}
function isUnsupportedPlatform() {
    const platform = getPlatform();
    const arch = getArchitecture();
    if (platform === "windows" && arch === "arm64") {
        return {
            isUnsupported: true,
            reason: "Windows ARM64 is not currently supported due to missing native dependencies (sqlite3, onnxruntime). Please use the extension on Windows x64, macOS, or Linux instead.",
        };
    }
    // if (platform === "unknown" || arch === "unknown") {
    //   return {
    //     isUnsupported: true,
    //     reason: `Unsupported platform combination: ${os.platform()}-${os.arch()}. Continue extension supports Windows x64, macOS (Intel/Apple Silicon), and Linux (x64/ARM64).`,
    //   };
    // }
    return { isUnsupported: false };
}
function getAltOrOption() {
    if (getPlatform() === "mac") {
        return "⌥";
    }
    else {
        return "Alt";
    }
}
function getMetaKeyLabel() {
    const platform = getPlatform();
    switch (platform) {
        case "mac":
            return "⌘";
        case "linux":
        case "windows":
            return "Ctrl";
        default:
            return "Ctrl";
    }
}
function getMetaKeyName() {
    const platform = getPlatform();
    switch (platform) {
        case "mac":
            return "Cmd";
        case "linux":
        case "windows":
            return "Ctrl";
        default:
            return "Ctrl";
    }
}
function getExtensionVersion() {
    const extension = vscode.extensions.getExtension("continue.continue");
    return extension?.packageJSON.version || "0.1.0";
}
function getvsCodeUriScheme() {
    return vscode.env.uriScheme;
}
function isExtensionPrerelease() {
    const extensionVersion = getExtensionVersion();
    const versionParts = extensionVersion.split(".");
    if (versionParts.length >= 2) {
        const minorVersion = parseInt(versionParts[1], 10);
        if (!isNaN(minorVersion)) {
            return minorVersion % 2 !== 0;
        }
    }
    return false;
}
//# sourceMappingURL=util.js.map