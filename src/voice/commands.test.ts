import { describe, expect, it } from "vitest";
import { decide, normalize, parseCommand } from "./commands";

describe("разбор голосовых команд", () => {
  it("нормализует текст", () => {
    expect(normalize("  Включи, ПОЖАЛУЙСТА, «Кино»!  ")).toBe("включи пожалуйста кино");
    expect(normalize("Ёлка")).toBe("елка");
  });

  it("слово «винил» в начале необязательно", () => {
    expect(parseCommand("винил пауза")).toEqual({ kind: "pause" });
    expect(parseCommand("пауза")).toEqual({ kind: "pause" });
    expect(parseCommand("Винил, дальше")).toEqual({ kind: "next" });
  });

  it("включи … — поиск", () => {
    expect(parseCommand("винил включи кино")).toEqual({ kind: "play", query: "кино", scope: "any" });
    expect(parseCommand("поставь пожалуйста группу кино")).toEqual({ kind: "play", query: "кино", scope: "artist" });
    expect(parseCommand("включи альбом группа крови")).toEqual({ kind: "play", query: "группа крови", scope: "album" });
    expect(parseCommand("включи песню звезда по имени солнце")).toEqual({
      kind: "play",
      query: "звезда по имени солнце",
      scope: "track",
    });
    expect(parseCommand("включи плейлист в дорогу")).toEqual({ kind: "play", query: "в дорогу", scope: "playlist" });
    expect(parseCommand("включи что-нибудь из битлз")).toEqual({ kind: "play", query: "битлз", scope: "any" });
  });

  it("подборки", () => {
    expect(parseCommand("включи мою волну")).toEqual({ kind: "wave" });
    expect(parseCommand("винил поставь волну")).toEqual({ kind: "wave" });
    expect(parseCommand("включи чарт")).toEqual({ kind: "chart" });
    expect(parseCommand("включи мне нравится")).toEqual({ kind: "likes" });
  });

  it("управление", () => {
    expect(parseCommand("продолжи")).toEqual({ kind: "resume" });
    expect(parseCommand("стоп")).toEqual({ kind: "stop" });
    expect(parseCommand("следующий трек")).toEqual({ kind: "next" });
    expect(parseCommand("предыдущая песня")).toEqual({ kind: "prev" });
    expect(parseCommand("переверни пластинку")).toEqual({ kind: "flip" });
    expect(parseCommand("сделай громче")).toEqual({ kind: "louder" });
    expect(parseCommand("тише")).toEqual({ kind: "quieter" });
    expect(parseCommand("лайк")).toEqual({ kind: "like" });
    expect(parseCommand("не нравится")).toEqual({ kind: "dislike" });
  });

  it("терпит ошибки распознавания", () => {
    expect(parseCommand("велик включить чарт")).toEqual({ kind: "chart" });
    expect(parseCommand("винила пауза")).toEqual({ kind: "pause" });
    expect(parseCommand("включите альбом кино")).toEqual({ kind: "play", query: "кино", scope: "album" });
  });

  it("непонятное не превращается в действие", () => {
    expect(parseCommand("какая сегодня погода").kind).toBe("unknown");
    expect(parseCommand("").kind).toBe("unknown");
    expect(parseCommand("включи").kind).toBe("resume");
  });
});

describe("выбор между словарём и свободным распознаванием", () => {
  const sure = (text: string) => ({ text, words: text.split(" ").map((word) => ({ word, conf: 1 })) });

  it("уверенный словарь побеждает для коротких команд", () => {
    expect(decide("включи боги манил", sure("включи мою волну"))).toEqual({ kind: "wave" });
    expect(decide("с ним ее хитом", sure("следующий трек"))).toEqual({ kind: "next" });
  });

  it("неуверенный или неполный словарь — свободный текст", () => {
    expect(decide("включи группу кино", { text: "включи волну", words: [{ word: "включи", conf: 1 }, { word: "волну", conf: 0.64 }] })).toEqual({
      kind: "play",
      query: "кино",
      scope: "artist",
    });
    expect(decide("поставь альбом группа крови", sure("поставь громче"))).toEqual({
      kind: "play",
      query: "группа крови",
      scope: "album",
    });
    expect(decide("включи земфиру", sure("включи"))).toEqual({ kind: "play", query: "земфиру", scope: "any" });
  });
});
