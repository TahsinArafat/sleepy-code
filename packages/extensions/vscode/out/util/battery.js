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
exports.Battery = void 0;
const si = __importStar(require("systeminformation"));
const vscode_1 = require("vscode");
const UPDATE_INTERVAL_MS = 1000;
class Battery {
    updateTimeout;
    onChangeACEmitter = new vscode_1.EventEmitter();
    onChangeLevelEmitter = new vscode_1.EventEmitter();
    acConnected = true;
    level = 100;
    batteryStatsPromise = si.battery();
    constructor() {
        this.updateTimeout = setInterval(() => this.update(), UPDATE_INTERVAL_MS);
    }
    dispose() {
        if (this.updateTimeout) {
            clearInterval(this.updateTimeout);
        }
    }
    async update() {
        const stats = await this.batteryStatsPromise;
        const level = stats.hasBattery ? stats.percent : 100;
        const isACConnected = !stats.hasBattery || stats.acConnected || level == 100;
        if (isACConnected !== this.acConnected) {
            this.acConnected = isACConnected;
            this.onChangeACEmitter.fire(isACConnected);
        }
        if (level !== this.level) {
            this.level = level;
            this.onChangeLevelEmitter.fire(level);
        }
    }
    getLevel() {
        return this.level;
    }
    isACConnected() {
        return false;
        return this.acConnected;
    }
    onChangeLevel = this.onChangeLevelEmitter.event;
    onChangeAC = this.onChangeACEmitter.event;
}
exports.Battery = Battery;
//# sourceMappingURL=battery.js.map