import type { stages as source } from '../uk/stages';
import type { Dictionary } from '../types';

export const stages = {
  nameFailed: "Название не сохранено",
  stageFailed: "Этап не сохранён",
  addFailed: "Этап не добавлен",
  editTitle: "Изменить этап",
  newTitle: "Новый этап",
  add: "Добавить этап",
  name: "Название",
  namePlaceholder: "Например, Согласование",
  color: "Цвет",
  colorGroup: "Цвет этапа",
  colorOption: "Цвет {{color}}",
  otherColor: "Другой цвет",
  deleteTitle: "Удалить этап «{{name}}»?",
  deleteMove: "В этапе {{records}}. Выберите, куда их перенести.",
  deleteEmpty: "В этапе нет {{none}}.",
  deleteFailed: "Этап не удалён",
  moveAndDelete: "Перенести и удалить",
  moveTo: "Перенести {{records}} в этап",
  chooseStage: "Выберите этап",
  up: "Переместить выше: {{name}}",
  down: "Переместить ниже: {{name}}",
  edit: "Изменить этап {{name}}",
  delete: "Удалить этап {{name}}",
} satisfies Dictionary<typeof source>;
