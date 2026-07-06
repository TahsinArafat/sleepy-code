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
const vitest_1 = require("vitest");
vitest_1.vi.mock("node:os", () => ({
    platform: vitest_1.vi.fn(),
    arch: vitest_1.vi.fn(),
}));
vitest_1.vi.mock("vscode", () => ({
    extensions: {
        getExtension: vitest_1.vi.fn(),
    },
}));
(0, vitest_1.describe)("isUnsupportedPlatform", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.resetModules();
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.resetAllMocks();
    });
    (0, vitest_1.it)("should be true when os is winarm64", async () => {
        const { platform, arch } = await Promise.resolve().then(() => __importStar(require("node:os")));
        vitest_1.vi.mocked(platform).mockReturnValue("win32");
        vitest_1.vi.mocked(arch).mockReturnValue("arm64");
        const { isUnsupportedPlatform } = await Promise.resolve().then(() => __importStar(require("./util")));
        const platformCheck = isUnsupportedPlatform();
        (0, vitest_1.expect)(platformCheck.isUnsupported).toBe(true);
        (0, vitest_1.expect)(platformCheck.reason).toMatch(/windows/gi);
        (0, vitest_1.expect)(platformCheck.reason).toMatch(/arm64/gi);
    });
    (0, vitest_1.it)("should not be true when os is supported", async () => {
        const { platform, arch } = await Promise.resolve().then(() => __importStar(require("node:os")));
        vitest_1.vi.mocked(platform).mockReturnValue("linux");
        vitest_1.vi.mocked(arch).mockReturnValue("arm64");
        const { isUnsupportedPlatform } = await Promise.resolve().then(() => __importStar(require("./util")));
        const platformCheck = isUnsupportedPlatform();
        (0, vitest_1.expect)(platformCheck.isUnsupported).toBe(false);
    });
});
(0, vitest_1.describe)("isExtensionPrerelease", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.resetModules();
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.resetAllMocks();
    });
    (0, vitest_1.it)("detects prerelease versions correctly", async () => {
        const vscode = await Promise.resolve().then(() => __importStar(require("vscode")));
        const getExtensionMock = vitest_1.vi.mocked(vscode.extensions.getExtension);
        // 1.0.0 is not prerelease (even minor version)
        getExtensionMock.mockReturnValue({
            packageJSON: { version: "1.0.0" },
        });
        const { isExtensionPrerelease } = await Promise.resolve().then(() => __importStar(require("./util")));
        (0, vitest_1.expect)(isExtensionPrerelease()).toBe(false);
        // 1.1.0 is prerelease (odd minor version)
        getExtensionMock.mockReturnValue({
            packageJSON: { version: "1.1.0" },
        });
        (0, vitest_1.expect)(isExtensionPrerelease()).toBe(true);
    });
});
//# sourceMappingURL=util.vitest.js.map