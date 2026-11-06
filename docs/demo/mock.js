const COV = (k) => `demo.covers/${k}.jpg?%%`;
const A = (id, title, year, artist, cover, n) => ({ id, title, year, coverUri: COV(cover), trackCount: n, artists: [{ id: id + 500, name: artist }] });
const ALBUMS = [
  A(1, "Ночной трамвай", 1979, "Северный ветер", "tram", 9),
  A(2, "Медленный закат", 1968, "Квартет «Янтарь»", "sunset", 8),
  A(3, "Орбита", 1975, "Космонавты", "orbit", 10),
  A(4, "Тёплый ламповый", 1983, "Оркестр мансарды", "amber", 11),
  A(5, "Бархатные часы", 1971, "Ночные совы", "velvet", 7),
  A(6, "Город спит", 1986, "Радиола", "city", 9),
  A(7, "Солнечный берег", 1964, "Трио «Босса»", "bossa", 8),
  A(8, "Полароид", 1990, "Плёнка", "polaroid", 10),
];
const TRAM = [
  ["Последний вагон", 4.6], ["Огни депо", 5.2], ["Пассажир", 3.9], ["Кольцевая", 6.1],
  ["Стекло и дождь", 4.4], ["Пересадка", 5.0], ["Утренний рейс", 4.8], ["Конечная", 6.4], ["Тишина", 3.3],
];
const T = (id, title, min, artist, alb) => ({ id, title, durationMs: Math.round(min * 60000), artists: [{ id: 501, name: artist || "Северный ветер" }], albums: [{ id: alb || 1 }] });
let n = 0;
const listeners = {};
window.__demoEmit = (event, payload) => (listeners[event] || []).forEach((h) => window["_" + h] && window["_" + h]({ event, payload, id: 1 }));
window.__TAURI_INTERNALS__ = {
  transformCallback: (cb) => { const id = Math.floor(Math.random() * 1e9); window["_" + id] = cb; return id; },
  invoke: async (cmd, args) => {
    if (cmd === "has_token") return true;
    if (cmd === "plugin:event|listen") { (listeners[args.event] = listeners[args.event] || []).push(args.handler); return 1; }
    if (cmd.startsWith("plugin:")) return null;
    if (cmd === "discord_available") return true;
    if (cmd === "track_bytes") return (await fetch("/tone.wav")).arrayBuffer();
    if (cmd === "cover_bytes") return (await fetch(args.url)).arrayBuffer();
    if (cmd === "ym_post" && args.path === "/albums") return [A(9, "Новая волна", 2026, "Неон", "fire", 9), A(10, "Шоссе", 2026, "Дальний свет", "road", 8)];
    if (cmd === "ym_post") return "ok";
    if (cmd === "ym_post_json") {
      if (args.path.endsWith("/feedback")) return "ok";
      const b = []; for (let i = 0; i < 4; i++) { n++; b.push({ track: T(100 + n, "Волна " + n, 4, "Артист " + n, 6) }); }
      return { radioSessionId: "s1", batchId: "b" + n, sequence: b };
    }
    if (cmd === "ym_get") {
      const p = args.path;
      if (p === "/account/status") return { account: { uid: 1, displayName: "Михаил" }, plus: { hasPlus: true } };
      if (p.endsWith("/playlists/list")) return [
        { kind: 1001, title: "Вечер у камина", trackCount: 42, cover: { uri: COV("fire") } },
        { kind: 1002, title: "В дорогу", trackCount: 87, cover: { uri: COV("road") } },
        { kind: 1003, title: "Фокус", trackCount: 23, cover: { uri: COV("focus") } },
      ];
      if (p.endsWith("/likes/albums")) return ALBUMS.map((album) => ({ album }));
      if (p.endsWith("/likes/tracks")) return { library: { tracks: [{ id: "2", albumId: "1" }] } };
      if (p === "/landing3/new-releases") return { newReleases: [9, 10] };
      if (p.startsWith("/landing3/chart")) return { chart: { tracks: [] } };
      if (p.startsWith("/albums/")) return { volumes: [TRAM.map(([t, m], i) => T(i + 1, t, m))] };
    }
    return null;
  },
};
