import type { stages as source } from '../uk/stages';
import type { Dictionary } from '../types';

export const stages = {
  nameFailed: "The name was not saved",
  stageFailed: "The stage was not saved",
  addFailed: "The stage was not added",
  editTitle: "Edit stage",
  newTitle: "New stage",
  add: "Add stage",
  name: "Name",
  namePlaceholder: "For example, Approval",
  color: "Colour",
  colorGroup: "Stage colour",
  colorOption: "Colour {{color}}",
  otherColor: "Other colour",
  deleteTitle: "Delete stage «{{name}}»?",
  deleteMove: "The stage has {{records}}. Choose where to move them.",
  deleteEmpty: "There are no {{none}} in this stage.",
  deleteFailed: "The stage was not deleted",
  moveAndDelete: "Move and delete",
  moveTo: "Move {{records}} to stage",
  chooseStage: "Choose a stage",
  up: "Move up: {{name}}",
  down: "Move down: {{name}}",
  edit: "Edit stage {{name}}",
  delete: "Delete stage {{name}}",
} satisfies Dictionary<typeof source>;
