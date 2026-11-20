// The lint pass the TypeScript tree did not have (#224).
//
// The engine has run `clippy -D warnings` since its first commit; the app ran
// `tsc --noEmit` and nothing else. `tsc` is a type checker — it cannot see a
// promise nobody awaits, a cast that re-declares a type it was supposed to read,
// or an assignment out of `any`. Those are the three bug classes this repository
// has hand-built fences for, which is the slowest way to buy a trivial guarantee.
//
// The rule set is deliberately small: the rules that map to a class this tree
// has actually produced a bug in, and not the kitchen sink. Every rule below has
// a reason in one line; a rule that cannot answer "which bug does this prevent"
// does not belong here.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // Not this program's writing: the wasm glue `wasm-bindgen` emits, the build
    // output, and the fixtures the suite generates at run start.
    ignores: ["dist/**", "node_modules/**", "wasmpkg/**", ".tmp-test/**", "test/.fixtures/**"],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        // Typed rules need the program, not just the file — `no-floating-promises`
        // is a question about the type of the expression, not its shape.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // A promise nobody awaits: the bug reaches the writer as "the save did not
      // happen and nothing said so". `void promise` is the deliberate opt-out and
      // stays legal — 22 of them in the tree, each one a decision.
      "@typescript-eslint/no-floating-promises": "error",

      // A promise where a boolean was expected: `if (asyncFn)` is always true,
      // and a handler returning a promise into an `onclick` never reports.
      "@typescript-eslint/no-misused-promises": "error",

      // A cast that asserts what the type says already, or re-declares a wire
      // shape the client was supposed to read (#221).
      "@typescript-eslint/no-unnecessary-type-assertion": "error",

      // An assignment out of `any` — how a `JSON.parse` result becomes a shape
      // nobody checked. `no-unsafe-type-assertion` is not in this version's rule
      // set, so `as unknown as` is fenced by `test/typecasts.test.mjs` instead.
      "@typescript-eslint/no-unsafe-assignment": "error",

      // A binding read by nothing (#223). tsc's `noUnusedLocals` covers locals;
      // this covers what it cannot, and can be told to ignore a leading `_`.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],

      // The base rule cannot see TypeScript's own syntax (`import type`, enums)
      // and reports false positives on it.
      "no-unused-vars": "off",
      "no-undef": "off",
    },
  },

  {
    // The editor's own browser globals. `no-undef` is off above because the type
    // checker already answers that question; this block exists so a stray
    // `console.log` in a debug session is not a lint failure.
    files: ["src/**/*.ts"],
    rules: { "no-console": "off" },
  },
);
