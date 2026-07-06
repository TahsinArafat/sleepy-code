import { SleepyAuth } from "../auth/sleepy-auth";
export declare class SleepyStatusBar {
    private _auth;
    private _item;
    constructor(_auth: SleepyAuth);
    update(): void;
    dispose(): void;
}
