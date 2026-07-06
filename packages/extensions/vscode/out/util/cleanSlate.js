"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanSlate = cleanSlate;
/**
 * Clear all Continue-related artifacts to simulate a brand new user
 */
function cleanSlate(context) {
    // Commented just to be safe
    // // Remove ~/.continue
    // const continuePath = getContinueGlobalPath();
    // if (fs.existsSync(continuePath)) {
    //   fs.rmSync(continuePath, { recursive: true, force: true });
    // }
    // // Clear extension's globalState
    // context.globalState.keys().forEach((key) => {
    //   context.globalState.update(key, undefined);
    // });
}
//# sourceMappingURL=cleanSlate.js.map