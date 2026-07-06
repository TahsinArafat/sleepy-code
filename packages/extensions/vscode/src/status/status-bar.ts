import * as vscode from "vscode";
import { SleepyAuth } from "../auth/sleepy-auth";

export class SleepyStatusBar {
  private _item: vscode.StatusBarItem;

  constructor(private _auth: SleepyAuth) {
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
    } else {
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
