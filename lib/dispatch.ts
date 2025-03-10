import { all, type Operation } from "effection";
import type { LSPAgent, NotificationParams, RequestParams } from "./types.ts";
import deepmerge from "deepmerge";
import { request2capability } from "./capabilities.ts";
import {
  type CompletionParams,
  ErrorCodes,
} from "vscode-languageserver-protocol";
import { responseError } from "./json-rpc-connection.ts";
import * as O from "optics-ts";

/**
 * An incomping request that should be delegated to some group of server
 */
export interface RequestOptions {
  agents: LSPAgent[];
  params: RequestParams;
}

/**
 * Dispatch an incoming request from the client to a set of matching
 * agents, and then merge the responses from each one into a single
 * response
 */
export function* request(options: RequestOptions): Operation<unknown> {
  let { agents, params } = options;
  let handler = match(agents, params);

  if (handler.agents.length === 0) {
    yield* responseError(
      ErrorCodes.InternalError,
      `no servers matched to handle request`,
    );
  }

  let responses = yield* all(
    handler.agents.map((agent) => agent.request(params)),
  );

  let merge = handler.merge ??
    ((responses) =>
      responses.reduce((sum, response) => deepmerge(sum, response)));

  return merge(responses);
}

export interface NotificationOptions {
  agents: LSPAgent[];
  params: NotificationParams;
}

/**
 * Dispatch an incoming notification from the client to a set of
 * matching agents.
 */
export function* notification(options: NotificationOptions): Operation<void> {
  let [method] = options.params;
  let handler = defaultMatch(options.agents, method);

  yield* all(
    handler.agents.map((agent) => agent.notify(options.params)),
  );
}

export function match(agents: LSPAgent[], params: RequestParams): Match {
  let method = params[0] as keyof typeof request2capability;
  switch (method) {
    case "textDocument/completion":
      return completion({ agents, params });
    default:
      return defaultMatch(agents, method);
  }
}

/**
 * Handle dispatching and merging textDocument/completion
 * If the completion trigger is not specified as one of the triggers
 * that an agent is providing, then it will not be sent the request.
 */
function completion(options: RequestOptions): Match {
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

/**
 * Represents a set of matching agents. Optionally, a merge function
 * can be provided to determine how the responses of the matching
 * agents should be spliced together.
 */
interface Match {
  agents: LSPAgent[];
  merge?: <T>(responses: T[]) => T;
}

/**
 * Match a request against the servers that present the capability for it.
 * There is no custom merge function, so
 */
function defaultMatch(canddidates: LSPAgent[], method: string): Match {
  let capabilityPath =
    request2capability[method as keyof typeof request2capability];
  let optic = O.optic().path(capabilityPath);
  let agents = canddidates.filter((agent) => {
    return !!O.get(optic)(agent.capabilities);
  });
  return { agents };
}
