import { describe, expect, it } from "vitest";
import { waveCaption, waveSeeds } from "./wave";

describe("настройки волны", () => {
  it("без настроек — только станция", () => {
    expect(waveSeeds({ diversity: "", mood: "", language: "" })).toEqual(["user:onyourwave"]);
  });

  it("сиды настроек добавляются к станции", () => {
    expect(waveSeeds({ diversity: "discover", mood: "calm", language: "without-words" })).toEqual([
      "user:onyourwave",
      "settingDiversity:discover",
      "settingMoodEnergy:calm",
      "settingLanguage:without-words",
    ]);
  });

  it("подпись для лейбла", () => {
    expect(waveCaption({ diversity: "", mood: "active", language: "russian" })).toBe("Бодрое · Русский");
    expect(waveCaption({ diversity: "", mood: "", language: "" })).toBe("");
  });
});
