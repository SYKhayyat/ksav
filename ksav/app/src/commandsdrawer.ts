// The commands drawer: the one place all the operations can be reached.
//
// Owns: the drawer's search half and its render. Defers: what a command is
// (commands.ts's registry), what a row does (rowlists.ts's drawRow), what the
// keys drawer's door is keysdrawer.ts's (the view stays with the shortcut
// registries it is a pure function of). Refuses: a second
// grouping of the registry — the groups are the registry's own categories,
// read again per keystroke.

import { el } from "./dom";
import { t, getLang } from "./i18n";
import * as panelrows from "./panelrows";
import { drawRow, LOOKS } from "./rowlists";
import { keybindings } from "./keyhint";
import * as keymodes from "./keymodes";
import * as commands from "./commands";
import * as runtime from "./runtime";
import { closeMenus, openPanel, panelHead } from "./panels";
// ---------------------------------------------------------------- the commands drawer
//
// The 122 commands, grouped by the registry's own categories, searchable, with
// nothing left out and nothing capped. The inventory's reader could not reach
// them from any of the four surfaces that advertise them and asked for this
// instead; `panelrows.commandGroups` carries the argument for why it is not the
// palette again.

export function openCommands() {
  closeMenus();
  openPanel("commands-drawer");
}

export function renderCommands(query: string) {
  const box = document.getElementById("commands-body");
  if (!box) return;
  const { groups, empty } = panelrows.commandGroups(
    commands.available(runtime.commandsReg),
    keybindings(),
    query,
    getLang(),
    keymodes.activeMode(),
  );
  if (empty) {
    box.replaceChildren(el("div", { class: "outline-empty" }, [t(empty)]));
    return;
  }
  box.replaceChildren(
    ...groups.map((g) =>
      el("section", { class: "help-section" }, [
        el("h3", {}, [t(g.title)]),
        ...g.rows.map((r) => drawRow(r, LOOKS.commands, false, [])),
      ]),
    ),
  );
}

export function buildCommandsDrawer(): HTMLElement {
  const input = el("input", {
    id: "commands-search",
    type: "search",
    placeholder: t("commandsSearch"),
    "data-i18n-placeholder": "commandsSearch",
    class: "help-search",
  }) as HTMLInputElement;
  input.addEventListener("input", () => renderCommands(input.value));
  return el(
    "aside",
    {
      id: "commands-drawer",
      class: "drawer drawer-help",
      "aria-label": t("commandsTitle"),
      "data-i18n-label": "commandsTitle",
    },
    [
      panelHead("commands-drawer", "commandsTitle"),
      el("p", { class: "help-lede", "data-i18n": "commandsLede" }, [t("commandsLede")]),
      input,
      el("div", { id: "commands-body" }),
    ],
  );
}
