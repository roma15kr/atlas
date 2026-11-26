import { describe, expect, it } from "vitest";
import { matchStaff, sameName } from "./bpiManagers";

/** Today's BPI staff (2026-11-26), as `user-id/2…11` returns them. */
const STAFF = ["Денисюк Наталія", "Майструк Андрій", "Семенець Максим", "Ковальчук Роман", "Тимошенко Богдан", "Трубило Андрій",
  "Бабенко Станіслав", "Жеревко Віталій", "Вербицький Андрій", "Пархоменко Богдан"].map((name, index) => ({ id: index + 2, name, user_type: index < 2 ? "admin" : "manager" }));

describe("BPI staff matching", () => {
  it("matches names in any order, case and Ukrainian or Russian spelling", () => {
    expect(matchStaff("Наталья Денисюк", STAFF)?.id).toBe(2);
    expect(matchStaff("Станислав Бабенко", STAFF)?.id).toBe(8);
    expect(matchStaff("СЕМЕНЕЦЬ МАКСИМ", STAFF)?.id).toBe(4);
    expect(matchStaff("Виталий Жеревко", STAFF)?.id).toBe(9);
    expect(matchStaff("Андрей Трубило", STAFF)?.id).toBe(7);
  });

  it("doesn't match a different person or a surname alone", () => {
    expect(matchStaff("Андрій Ковальчук", STAFF)).toBeNull();
    expect(matchStaff("Денисюк", STAFF)).toBeNull();
    expect(sameName("Олена Морозова", "Морозов Олег")).toBe(false);
  });
});
