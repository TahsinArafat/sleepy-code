export type ConnectDialog = "login" | "providers"

export function connectDialog(loggedIn: boolean): ConnectDialog {
  return loggedIn ? "providers" : "login"
}
