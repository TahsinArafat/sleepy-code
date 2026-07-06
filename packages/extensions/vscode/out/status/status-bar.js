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
exports.SleepyStatusBar = void 0;
const vscode = __importStar(require("vscode"));
class SleepyStatusBar {
    _auth;
    _item;
    constructor(_auth) {
        this._auth = _auth;
        this._item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this._item.command = "sleepy.chat";
        this._item.tooltip = "Sleepy Code — click to open chat";
        this._item.show();
        this._auth.onAuthChange(() => this.update());
    }
    update() {
        if (!this._auth.isAuthenticated) {
            this._item.text = "$(sleepy-icon) Not logged in";
            this._item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
            this._item.tooltip = "Sleepy — click to login";
            this._item.command = "sleepy.login";
        }
        else {
            const model = this._auth.models[0];
            this._item.text = model
                ? `$(sleepy-icon) ${model.name.slice(0, 24)}`
                : "$(sleepy-icon) Sleepy";
            this._item.backgroundColor = undefined;
            this._item.tooltip = `Sleepy Code — ${this._auth.gateway?.email || "connected"}`;
            this._item.command = "sleepy.chat";
        }
    }
    dispose() { this._item.dispose(); }
}
exports.SleepyStatusBar = SleepyStatusBar;
//# sourceMappingURL=status-bar.js.map