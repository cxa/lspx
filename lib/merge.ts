import type { InitializeResult } from "vscode-languageserver-protocol";
import type { LSPAgent } from "./types.ts";
import deepmerge from "deepmerge";

export function capabilities(agents: LSPAgent[]): InitializeResult {
  let result: InitializeResult = {
    serverInfo: {
      name: "lspx",
      version: "0.1.0",
    },
    capabilities: deepmerge.all(agents.map((agent) => agent.capabilities)),
  };
  return result;
}
