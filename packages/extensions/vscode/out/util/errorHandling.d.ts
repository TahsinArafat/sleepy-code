/**
 * @param error Handles common LLM errors. Currently handles Ollama and Lemonade-related errors.
 * @returns true if error is handled, false otherwise
 */
export declare function handleLLMError(error: unknown): Promise<boolean>;
