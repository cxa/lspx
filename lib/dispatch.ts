import { all, type Operation } from "effection";
import type {
  LSPAgent,
  LSPXMiddleware,
  RequestParams,
  XClientNotification,
  XClientRequest,
} from "./types.ts";
import deepmerge from "deepmerge";
import { get, optic } from "optics-ts";
import { method2capability } from "./capabilities.ts";
import { responseError } from "./json-rpc-connection.ts";
import {
  type CompletionParams,
  ErrorCodes,
} from "vscode-languageserver-protocol";
import { createLSPXMiddleware } from "./middleware.ts";

export function defaultHandler(): LSPXMiddleware {
  return createLSPXMiddleware({
    client2server: {
      request: defaultRequest,
      notify: defaultNotify,
    },
  });
}

/**
 * Dispatch an incoming request from the client to a set of matching
 * agents, and then merge the responses from each one into a single
 * response
 */
export function* defaultRequest(options: XClientRequest): Operation<unknown> {
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

  let merge = handler.merge ?? defaultMerge;

  return merge(responses);
}

/**
 * Dispatch an incoming notification from the client to a set of
 * matching agents.
 */
export function* defaultNotify(options: XClientNotification): Operation<void> {
  let [method] = options.params;
  let handler = defaultMatch(options.agents, method);
  if (handler.agents.length === 0) {
    console.error(
      `no matching agents found for notification '${
        options.params[0]
      }. candidates are`,
      options.agents.map((a) => ({
        name: a.name,
        capabilities: a.capabilities,
      })),
    );
  }

  yield* all(
    handler.agents.map((agent) => agent.notify(options.params)),
  );
}

export function match(agents: LSPAgent[], params: RequestParams): Match {
  let method = params[0] as keyof typeof method2capability;
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
function completion(options: XClientRequest): Match {
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
    method2capability[method as keyof typeof method2capability];
  if (capabilityPath === "*") {
    return { agents: canddidates };
  }
  if (!capabilityPath) {
    console.error(`nothing matches ${method}`);
    return { agents: canddidates };
  }
  let path = optic().path(capabilityPath);
  let agents = canddidates.filter((agent) => {
    return !!get(path)(agent.capabilities);
  });
  return { agents };
}

function defaultMerge(responses: unknown[]): unknown {
  return responses.reduce((sum, response) => {
    if (response === null) {
      return sum;
    } else {
      return deepmerge(sum as Partial<unknown>, response as Partial<unknown>);
    }
  });
}
