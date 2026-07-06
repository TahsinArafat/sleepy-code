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
exports.FileSearch = void 0;
const walkDir_1 = require("core/indexing/walkDir");
const util_1 = require("core/util");
// @ts-ignore
const minisearch_1 = __importDefault(require("minisearch"));
const vscode = __importStar(require("vscode"));
/*
  id = file URI
*/
class FileSearch {
    ide;
    constructor(ide) {
        this.ide = ide;
        this.initializeFileSearchState();
    }
    miniSearch = new minisearch_1.default({
        fields: ["relativePath", "id"],
        storeFields: ["relativePath", "id"],
        tokenize: (text) => (0, util_1.deduplicateArray)(minisearch_1.default.getDefault("tokenize")(text).concat((0, util_1.splitCamelCaseAndNonAlphaNumeric)(text)), (a, b) => a === b),
        searchOptions: {
            prefix: true,
            fuzzy: 2,
            fields: ["relativePath"],
        },
    });
    async initializeFileSearchState() {
        const results = await (0, walkDir_1.walkDirs)(this.ide, {
            source: "file search initialization",
        });
        this.miniSearch.addAll(results.flat().map((uri) => ({
            id: uri,
            relativePath: vscode.workspace.asRelativePath(uri),
        })));
    }
    search(query) {
        return this.miniSearch.search(query);
    }
}
exports.FileSearch = FileSearch;
//# sourceMappingURL=FileSearch.js.map