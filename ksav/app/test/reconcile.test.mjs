import { check, ok } from "./harness.mjs";
import { keyedReconciler } from "../.tmp-test/reconcile.mjs";

class Item {
  constructor(model) {
    this.id = model.id;
    this.parent = null;
    this.text = "";
    this.writes = 0;
    this.selected = false;
  }
  get nextSibling() {
    if (!this.parent) return null;
    return this.parent.children[this.parent.children.indexOf(this) + 1] ?? null;
  }
  remove() {
    const i = this.parent?.children.indexOf(this) ?? -1;
    if (i >= 0) this.parent.children.splice(i, 1);
    this.parent = null;
  }
}

class List {
  constructor() {
    this.children = [];
    this.scrollTop = 0;
    this.scrollLeft = 0;
  }
  insertBefore(node, before) {
    if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1);
    const at = before ? this.children.indexOf(before) : this.children.length;
    node.parent = this;
    this.children.splice(at < 0 ? this.children.length : at, 0, node);
    return node;
  }
}

const models = (...ids) => ids.map((id) => ({ id, label: id.toUpperCase() }));

export async function run() {
  const list = new List();
  let creates = 0;
  const reconciler = keyedReconciler({
    key: (model) => model.id,
    equal: (previous, next) => previous.id === next.id && previous.label === next.label,
    create: (model) => {
      creates++;
      return new Item(model);
    },
    update: (node, model) => {
      node.text = model.label;
      node.writes++;
    },
  });

  const first = reconciler.reconcile(list, models("a", "b", "c"));
  first[1].selected = true;
  list.activeElement = first[1];
  list.scrollTop = 240;
  list.scrollLeft = 18;
  const writes = first.map((node) => node.writes);

  const same = reconciler.reconcile(list, models("a", "b", "c"));
  check("unchanged models keep every node", same.map((node) => node.id), ["a", "b", "c"]);
  ok("unchanged first node is identical", same[0] === first[0]);
  ok("unchanged middle node is identical", same[1] === first[1]);
  ok("unchanged last node is identical", same[2] === first[2]);
  check("unchanged models do not call update", same.map((node) => node.writes), writes);
  check("reconciliation keeps vertical scroll", list.scrollTop, 240);
  check("reconciliation keeps horizontal scroll", list.scrollLeft, 18);
  ok("selection remains on the same node", same[1].selected);
  ok("focus remains on the same node", list.activeElement === same[1]);

  const changed = reconciler.reconcile(list, [
    { id: "a", label: "A" },
    { id: "b", label: "B!" },
    { id: "c", label: "C" },
  ]);
  ok("a changed model updates in place", changed[1] === first[1]);
  check("the changed model is written once", changed[1].writes, writes[1] + 1);
  check("unchanged neighbors are still untouched", [changed[0].writes, changed[2].writes], [writes[0], writes[2]]);

  const moved = reconciler.reconcile(list, models("c", "a", "b"));
  ok("moving a keyed model moves its node", moved[0] === first[2] && moved[1] === first[0] && moved[2] === first[1]);
  check("the list order follows the models", list.children.map((node) => node.id), ["c", "a", "b"]);

  const beforeRemove = moved[1];
  const removed = reconciler.reconcile(list, models("c", "b"));
  check("removing a model removes its node", removed.map((node) => node.id), ["c", "b"]);
  ok("the removed node is detached", beforeRemove.parent === null);
  check("only new nodes were created for the first render", creates, 3);
}
