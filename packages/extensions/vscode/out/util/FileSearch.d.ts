import { IDE } from "core";
type FileMiniSearchResult = {
    relativePath: string;
    id: string;
};
export declare class FileSearch {
    private readonly ide;
    constructor(ide: IDE);
    private miniSearch;
    private initializeFileSearchState;
    search(query: string): FileMiniSearchResult[];
}
export {};
