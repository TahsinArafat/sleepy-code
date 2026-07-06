export declare function convertSingleToDoubleQuoteJSON(json: string): string;
export declare function debounced(delay: number, fn: (...args: any[]) => void): (...args: any[]) => void;
type Platform = "mac" | "linux" | "windows" | "unknown";
type Architecture = "x64" | "arm64" | "unknown";
export declare function getPlatform(): Platform;
export declare function getArchitecture(): Architecture;
export declare function isUnsupportedPlatform(): {
    isUnsupported: boolean;
    reason?: string;
};
export declare function getAltOrOption(): "⌥" | "Alt";
export declare function getMetaKeyLabel(): "⌘" | "Ctrl";
export declare function getMetaKeyName(): "Ctrl" | "Cmd";
export declare function getExtensionVersion(): string;
export declare function getvsCodeUriScheme(): string;
export declare function isExtensionPrerelease(): boolean;
export {};
