import { all, type Operation } from "effection";
import type { LSPAgent, RequestParams } from "./types.ts";
import deepmerge from "deepmerge";
import type { request2capability } from "./capabilities.ts";
import { ErrorCodes, type CompletionParams } from "vscode-languageserver-protocol";
import { responseError } from "./json-rpc-connection.ts";

export interface RequestOptions {
  agents: LSPAgent[];
  params: RequestParams;
}

export function* request(options: RequestOptions): Operation<unknown> {
  let { agents, params } = options;
  let handler = match(agents, params);

  if (handler.agents.length === 0) {
    yield* responseError(ErrorCodes.InternalError, `no servers matched to handle request`);
  }
  
  let responses = yield* all(
    handler.agents.map((agent) => agent.request(params)),
  );

  let merge = handler.merge ??
    ((responses) =>
      responses.reduce((sum, response) => deepmerge(sum, response)));

  return merge(responses);
}

export function match(agents: LSPAgent[], params: RequestParams): Demuxer {
  let method = params[0] as keyof typeof request2capability;
  switch (method) {
    case "textDocument/completion":
      return completion({ agents, params });
    default:
      return { agents };
  }
}

/**
 * Handle dispatching and merging textDocument/completion
 * If the completion trigger is not specified as one of the triggers
 * that an agent is providing, then it will not be sent the request.
 */
function completion(options: RequestOptions): Demuxer {
  let { context } = options.params[1] as CompletionParams;
  let agents = options.agents.filter((agent) => {
    let capability = agent.capabilities.completionProvider;
    if (!capability) {
      return false;
    } else if (
      context && context.triggerCharacter && capability.triggerCharacters &&
      !capability.triggerCharacters.includes(context.triggerCharacter)
    ) {
      return false;
    }
    return true;
  });  
  return { agents };
}

interface Demuxer {
  agents: LSPAgent[];
  merge?: <T>(responses: T[]) => T;
}
