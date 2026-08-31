/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as availability from "../availability.js";
import type * as catalog from "../catalog.js";
import type * as invites from "../invites.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_collect from "../lib/collect.js";
import type * as lib_joined from "../lib/joined.js";
import type * as lib_names from "../lib/names.js";
import type * as lib_sessions from "../lib/sessions.js";
import type * as lib_slots from "../lib/slots.js";
import type * as lib_tokens from "../lib/tokens.js";
import type * as partySessions from "../partySessions.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  availability: typeof availability;
  catalog: typeof catalog;
  invites: typeof invites;
  "lib/auth": typeof lib_auth;
  "lib/collect": typeof lib_collect;
  "lib/joined": typeof lib_joined;
  "lib/names": typeof lib_names;
  "lib/sessions": typeof lib_sessions;
  "lib/slots": typeof lib_slots;
  "lib/tokens": typeof lib_tokens;
  partySessions: typeof partySessions;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
