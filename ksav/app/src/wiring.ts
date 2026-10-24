// The registration container every module that borrows from the shell shares.
//
// Eleven files carried the same four lines by hand — a module-level `let`, a
// `wireX` setter, a getter that throws when boot has not run yet — and the
// audit counted the copies. This is the count spent: `makeWiring` returns the
// same pair under the same names, so call sites do not change, and the guard
// message is written once.
//
// What a wiring is *for* is a decision each module still states in its own
// header: it names a seam where a direct import would cycle (or would point
// into main.ts, which nothing imports). A wiring whose member could be a
// direct import is indirection, and the audit's #145 lists the ones that were.

/**
 * The pair boot registers and the module reads.
 *
 * `name` is the wire function's name, for the guard: "wireX was never called"
 * is the error a missing boot line should produce, with the missing line named.
 */
export function makeWiring<T>(name: string): {
  wire: (wiring: T) => void;
  get: () => T;
} {
  let instance: T | undefined;
  return {
    wire: (wiring: T) => {
      instance = wiring;
    },
    get: (): T => {
      if (!instance) throw new Error(`${name} was never called before its module needed the shell`);
      return instance;
    },
  };
}
