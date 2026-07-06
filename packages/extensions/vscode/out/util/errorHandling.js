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
exports.handleLLMError = handleLLMError;
const llm_1 = require("core/llm");
const vscode = __importStar(require("vscode"));
/**
 * @param error Handles common LLM errors. Currently handles Ollama and Lemonade-related errors.
 * @returns true if error is handled, false otherwise
 */
async function handleLLMError(error) {
    if (!error || !(error instanceof Error) || !error.message) {
        return false;
    }
    // Handle Lemonade errors
    if (error.message.toLowerCase().includes("lemonade")) {
        let message = error.message;
        let options;
        // For Windows, offer to start Lemonade if it's installed but not running
        if (process.platform === "win32" &&
            message.includes("Lemonade server may not be running")) {
            options = ["Start Lemonade", "Setup Instructions"];
        }
        else {
            // For all other cases (Linux, not installed, etc.), direct to setup instructions
            options = ["Setup Instructions"];
        }
        vscode.window.showErrorMessage(message, ...options).then((val) => {
            if (val === "Setup Instructions") {
                vscode.env.openExternal(vscode.Uri.parse("https://lemonade-server.ai"));
            }
            else if (val === "Start Lemonade") {
                vscode.commands.executeCommand("continue.startLocalLemonade");
            }
        });
        return true;
    }
    // Handle Ollama errors
    if (!error.message.toLowerCase().includes("ollama")) {
        return false;
    }
    let message = error.message;
    let options;
    let modelName = undefined;
    if (message.includes("Ollama may not be installed")) {
        options = ["Download Ollama"];
    }
    else if (message.includes("Ollama may not be running")) {
        options = ["Start Ollama"]; // We want "Start" to be the only choice
    }
    else if (message.includes("ollama run") && "llm" in error) {
        //extract model name from error message matching the pattern "ollama run <model-name>"
        modelName = message.match(/`ollama run (.*)`/)?.[1];
        const llm = error.llm;
        if ((0, llm_1.isModelInstaller)(llm) && (await llm.isInstallingModel(modelName))) {
            console.log(`${llm.providerName} already installing ${modelName}`);
            return false;
        }
        message = `Model "${modelName}" is not found in Ollama. You need to install it.`;
        options = [`Install Model`];
    }
    if (options === undefined) {
        console.log("Found an unhandled Ollama error: ", message);
        return false;
    }
    vscode.window.showErrorMessage(message, ...options).then((val) => {
        if (val === "Download Ollama") {
            vscode.env.openExternal(vscode.Uri.parse("https://ollama.ai/download"));
        }
        else if (val === "Start Ollama") {
            vscode.commands.executeCommand("continue.startLocalOllama");
        }
        else if (val === "Install Model" && "llm" in error) {
            //Eventually, we might be able to support installing models for other LLM providers than Ollama
            vscode.commands.executeCommand("continue.installModel", modelName, error.llm);
        }
    });
    return true;
}
//# sourceMappingURL=errorHandling.js.map