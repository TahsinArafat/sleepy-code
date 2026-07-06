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
exports.expandSnippet = expandSnippet;
const AutocompleteLanguageInfo_1 = require("core/autocomplete/constants/AutocompleteLanguageInfo");
const ignore_1 = require("core/indexing/ignore");
const util_1 = require("core/util");
const treeSitter_1 = require("core/util/treeSitter");
const vscode = __importStar(require("vscode"));
const lsp_1 = require("../autocomplete/lsp");
async function expandSnippet(fileUri, startLine, endLine, ide) {
    const parser = await (0, treeSitter_1.getParserForFile)(fileUri);
    if (!parser) {
        return [];
    }
    const fullFileContents = await ide.readFile(fileUri);
    const root = parser.parse(fullFileContents).rootNode;
    // Find all nodes contained in the range
    const containedInRange = [];
    const toExplore = [root];
    while (toExplore.length > 0) {
        const node = toExplore.pop();
        for (const child of node.namedChildren) {
            if (child.startPosition.row >= startLine &&
                child.endPosition.row <= endLine) {
                // Fully contained in range
                containedInRange.push(child);
                toExplore.push(child);
            }
            else if (child.startPosition.row >= startLine ||
                child.endPosition.row <= endLine) {
                // Overlaps, children may be contained in range
                toExplore.push(child);
            }
        }
    }
    // Find all call expressions
    const callExpressions = containedInRange.filter((node) => node.type === "call_expression");
    let callExpressionDefinitions = (await Promise.all(callExpressions.map(async (node) => {
        return (0, lsp_1.getDefinitionsForNode)(vscode.Uri.parse(fileUri), node, ide, (0, AutocompleteLanguageInfo_1.languageForFilepath)(fileUri));
    }))).flat();
    // De-duplicate the definitions
    callExpressionDefinitions = (0, util_1.deduplicateArray)(callExpressionDefinitions, (a, b) => {
        return (a.filepath === b.filepath &&
            a.range.start.line === b.range.start.line &&
            a.range.end.line === b.range.end.line &&
            a.range.start.character === b.range.start.character &&
            a.range.end.character === b.range.end.character);
    });
    // Filter out definitions already in selected range
    callExpressionDefinitions = callExpressionDefinitions.filter((def) => {
        return !(def.filepath === fileUri &&
            def.range.start.line >= startLine &&
            def.range.end.line <= endLine);
    });
    // Filter out defintions not under workspace directories
    const workspaceDirectories = await ide.getWorkspaceDirs();
    callExpressionDefinitions = callExpressionDefinitions.filter((def) => {
        return (workspaceDirectories.some((dir) => def.filepath.startsWith(dir)) &&
            !ignore_1.DEFAULT_IGNORE_DIRS.some((dir) => def.filepath.includes(`/${dir}/`) ||
                def.filepath.includes(`\\${dir}\\`)));
    });
    const chunks = await Promise.all(callExpressionDefinitions.map(async (def) => {
        return {
            filepath: def.filepath,
            startLine: def.range.start.line,
            endLine: def.range.end.line,
            digest: "",
            index: 0,
            content: await ide.readRangeInFile(def.filepath, def.range),
        };
    }));
    return chunks;
}
//# sourceMappingURL=expandSnippet.js.map