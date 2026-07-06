import { Disposable } from "vscode";
export declare class Battery implements Disposable {
    private updateTimeout;
    private readonly onChangeACEmitter;
    private readonly onChangeLevelEmitter;
    private acConnected;
    private level;
    private readonly batteryStatsPromise;
    constructor();
    dispose(): void;
    private update;
    getLevel(): number;
    isACConnected(): boolean;
    readonly onChangeLevel: import("vscode").Event<number>;
    readonly onChangeAC: import("vscode").Event<boolean>;
}
