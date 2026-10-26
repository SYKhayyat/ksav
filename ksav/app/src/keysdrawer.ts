// ---------------------------------------------------------------- keys drawer
//
// The keys drawer's door. The drawer is currently three pieces in three files,
// and this is the one that was hardest to find: the view is panelviews.ts's
// `keysPanel` (drawn by main's `renderKeysPanel`, whose rows are the shell's
// registries), the capture is settingsdrawer.ts's shortcut table, and the door
// — the thing a reader looking for "how does the keys drawer open" wants — is
// here. If the drawer ever grows a fourth piece, this file is its home.

import { closeMenus, openPanel } from "./panels";

export function openKeys() {
  closeMenus();
  openPanel("keys-drawer");
}
