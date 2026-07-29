import { cinderDialogue } from "./cinder";
import { paleDialogue } from "./pale";
import type { DialogueCatalog } from "./types";
import { verdantDialogue } from "./verdant";

export const dialogueByNpcId: DialogueCatalog = {
  ...verdantDialogue,
  ...cinderDialogue,
  ...paleDialogue
};

export { cinderDialogue, paleDialogue, verdantDialogue };
export type { DialogueCatalog };
