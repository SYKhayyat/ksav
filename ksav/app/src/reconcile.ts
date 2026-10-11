// Small, framework-free keyed DOM reconciliation.
//
// The editor owns its DOM, so bringing in a view framework for the one operation
// it needs would be a larger change than the bug. This reconciler deliberately
// knows only how to keep keyed nodes in order: callers decide what a key means,
// how a node is made, and how a changed model is written into an existing node.

export interface KeyedReconcileOptions<T, K, N extends ChildNode> {
  key(model: T, index: number): K;
  equal(previous: T, next: T): boolean;
  create(model: T, index: number, parent: HTMLElement): N;
  update(node: N, next: T, previous: T, index: number): void;
  remove?(node: N, previous: T): void;
}

interface Entry<T, K, N extends Node> {
  key: K;
  model: T;
  node: N;
}

export interface KeyedReconciler<T, N extends ChildNode> {
  /** Reconcile and return nodes in the same order as `models`. */
  reconcile(parent: HTMLElement, models: readonly T[]): N[];
  /** Forget all retained models and nodes after an external replacement. */
  reset(): void;
}

/**
 * Create a stateful keyed reconciler.
 *
 * Nodes are moved with `insertBefore`, never replaced as a consequence of order.
 * That is what preserves a focused control and its browser-owned selection. The
 * host's scroll offsets are restored around the mutation as well; moving children
 * should not make a long panel jump while it is being refreshed.
 */
export function keyedReconciler<T, K, N extends ChildNode>(
  options: KeyedReconcileOptions<T, K, N>,
): KeyedReconciler<T, N> {
  let entries = new Map<K, Entry<T, K, N>>();

  return {
    reconcile(parent, models) {
      const scrollTop = parent.scrollTop;
      const scrollLeft = parent.scrollLeft;
      const next: Entry<T, K, N>[] = [];
      const seen = new Set<K>();

      for (let index = 0; index < models.length; index++) {
        const model = models[index];
        const key = options.key(model, index);
        if (seen.has(key)) throw new Error(`duplicate keyed model: ${String(key)}`);
        seen.add(key);

        const previous = entries.get(key);
        const node = previous?.node ?? options.create(model, index, parent);
        if (!previous || !options.equal(previous.model, model)) {
          options.update(node, model, previous?.model ?? model, index);
        }
        next.push({ key, model, node });
      }

      for (const [key, previous] of entries) {
        if (seen.has(key)) continue;
        options.remove?.(previous.node, previous.model);
        previous.node.remove();
      }

      // Work backwards so every node is inserted immediately before the node
      // that should follow it. Unmanaged nodes before this list remain in place;
      // callers that own a footer remove it before reconciling and append it after.
      for (let index = next.length - 1; index >= 0; index--) {
        const node = next[index].node;
        const after = next[index + 1]?.node ?? null;
        if (node.nextSibling !== after) parent.insertBefore(node, after);
      }

      entries = new Map(next.map((entry) => [entry.key, entry]));
      parent.scrollTop = scrollTop;
      parent.scrollLeft = scrollLeft;
      return next.map((entry) => entry.node);
    },

    reset() {
      entries = new Map();
    },
  };
}
