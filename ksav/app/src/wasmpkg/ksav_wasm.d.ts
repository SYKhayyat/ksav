/* tslint:disable */
/* eslint-disable */

export function init(): void;

/**
 * The command registry as JSON (same as the server's `/commands`).
 */
export function ksav_commands(): string;

/**
 * Compile a document. Input/output JSON match the server's `/compile`.
 */
export function ksav_compile(input_json: string): string;

/**
 * A click on the page, as a place in the source (same as the server's `/jump`).
 */
export function ksav_jump(input_json: string): string;

/**
 * The cursor, as a place on the page (same as the server's `/reveal`).
 */
export function ksav_reveal(input_json: string): string;

/**
 * Spell-check text (same as the server's `/spell`).
 */
export function ksav_spell(input_json: string): string;

/**
 * Suggestions for one word (same as the server's `/suggest`).
 */
export function ksav_suggest(input_json: string): string;

/**
 * The template registry as JSON (same as the server's `/templates`).
 */
export function ksav_templates(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly init: () => void;
    readonly ksav_commands: () => [number, number];
    readonly ksav_compile: (a: number, b: number) => [number, number];
    readonly ksav_jump: (a: number, b: number) => [number, number];
    readonly ksav_reveal: (a: number, b: number) => [number, number];
    readonly ksav_spell: (a: number, b: number) => [number, number];
    readonly ksav_suggest: (a: number, b: number) => [number, number];
    readonly ksav_templates: () => [number, number];
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
