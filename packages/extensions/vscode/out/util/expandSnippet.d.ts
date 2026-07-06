import { Chunk, IDE } from "core";
export declare function expandSnippet(fileUri: string, startLine: number, endLine: number, ide: IDE): Promise<Chunk[]>;
