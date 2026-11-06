/**
 * Разбор голосовых команд (docs/PROJECT.md, 4.13). Чистые функции — покрыты тестами.
 * Vosk отдаёт текст строчными буквами без пунктуации, но разбор терпит и то и другое.
 */

export type PlayScope = "any" | "album" | "playlist" | "artist" | "track";

export type VoiceCommand =
  | { kind: "play"; query: string; scope: PlayScope }
  | { kind: "wave" }
  | { kind: "chart" }
  | { kind: "likes" }
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "stop" }
  | { kind: "next" }
  | { kind: "prev" }
  | { kind: "flip" }
  | { kind: "louder" }
  | { kind: "quieter" }
  | { kind: "like" }
  | { kind: "dislike" }
  | { kind: "unknown"; text: string };

/** Нормализация: нижний регистр, ё→е, без пунктуации и лишних пробелов. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Слово-обращение в начале фразы — его можно говорить, можно нет. */
const WAKE = /^(?:(?:эй|слушай|ну)\s+)?(?:винил|виниловый|винилл|ветер|винни)\s+/;
/** Вежливые слова вокруг команды. */
const POLITE = /(?<!\p{L})(?:пожалуйста|плиз|давай|можешь|мне|ка)(?!\p{L})/gu;

const ONLY: [RegExp, VoiceCommand["kind"]][] = [
  [/^(?:поставь\s+на\s+)?пауз[ау]$|^(?:подними\s+иглу)$|^(?:тихо|замолчи|хватит)$/, "pause"],
  [/^(?:стоп|останови(?:сь)?|выключи(?:\s+музыку)?)$/, "stop"],
  [/^(?:продолж(?:и|ай)|играй|дальше\s+играй|сними\s+с\s+паузы|опусти\s+иглу|включи$|пуск)$/, "resume"],
  [/^(?:дальше|следующ(?:ий|ая|ую)(?:\s+(?:трек|песн[яю]))?|пропусти|скип|переключи)$/, "next"],
  [/^(?:назад|предыдущ(?:ий|ая|ую)(?:\s+(?:трек|песн[яю]))?|верни(?:сь)?)$/, "prev"],
  [/^(?:переверни(?:\s+пластинку)?|другая\s+сторона|на\s+другую\s+сторону|сторона\s+б)$/, "flip"],
  [/^(?:громче|сделай\s+громче|прибавь(?:\s+звук)?)$/, "louder"],
  [/^(?:тише|сделай\s+тише|убавь(?:\s+звук)?)$/, "quieter"],
  [/^(?:лайк|нравится|это\s+нравится|в\s+избранное|сердечко|запомни\s+трек)$/, "like"],
  [/^(?:не\s+нравится|дизлайк|убери(?:\s+этот\s+трек)?|не\s+то)$/, "dislike"],
];

const PLAY = /^(?:включи(?:ть|те)?|включай|поставь(?:те)?|запусти(?:ть)?|найди|играй|сыграй|хочу\s+послушать|послушаем)\s+(.+)$/;

export function parseCommand(raw: string): VoiceCommand {
  let text = normalize(raw).replace(WAKE, "");
  text = text.replace(POLITE, " ").replace(/\s+/g, " ").trim();
  if (!text) return { kind: "unknown", text: raw };
  const first = parseClean(text, raw);
  if (first.kind !== "unknown") return first;
  // Неверно услышанное обращение («велик включи …») — пробуем без первого слова.
  const rest = text.split(" ").slice(1).join(" ");
  return rest ? parseClean(rest, raw) : first;
}

function parseClean(text: string, raw: string): VoiceCommand {
  for (const [re, kind] of ONLY) {
    if (re.test(text)) return { kind } as VoiceCommand;
  }

  const m = PLAY.exec(text);
  if (!m) return { kind: "unknown", text: raw };
  let q = m[1].trim();

  if (/^(?:мою\s+)?волн[ауы]$|^мою\s+волну$/.test(q)) return { kind: "wave" };
  if (/^(?:чарт|топ|популярное)$/.test(q)) return { kind: "chart" };
  if (/^(?:что\s+)?(?:нравится|любимое|мои\s+лайки|лайки|избранное)$/.test(q)) return { kind: "likes" };

  let scope: PlayScope = "any";
  const scoped: [RegExp, PlayScope][] = [
    [/^(?:альбом|пластинку|диск)\s+/, "album"],
    [/^(?:плейлист|подборку)\s+/, "playlist"],
    [/^(?:исполнителя|группу|артиста|певца|певицу)\s+/, "artist"],
    [/^(?:трек|песню|композицию)\s+/, "track"],
  ];
  for (const [re, sc] of scoped) {
    if (re.test(q)) {
      scope = sc;
      q = q.replace(re, "");
      break;
    }
  }
  // «что-нибудь из …» / «песни …» → по исполнителю
  q = q.replace(/^(?:что-?нибудь|что-?то)\s+(?:из|у|от)\s+/, "").replace(/^(?:песни|музыку)\s+/, "");
  if (!q) return { kind: "unknown", text: raw };
  return { kind: "play", query: q, scope };
}

/** Фразы для распознавателя с ограниченным словарём: короткие команды он слышит точнее. */
export const COMMAND_PHRASES = [
  "включи мою волну", "поставь мою волну", "включи волну",
  "включи чарт", "поставь чарт", "включи мне нравится",
  "пауза", "стоп", "продолжи", "играй",
  "дальше", "следующий", "следующий трек", "пропусти",
  "назад", "предыдущий", "предыдущий трек",
  "переверни", "переверни пластинку",
  "громче", "сделай громче", "тише", "сделай тише",
  "лайк", "нравится", "не нравится", "дизлайк",
];

/** Порог уверенности словаря: ниже — верим свободному распознаванию. */
const GRAMMAR_MIN_CONF = 0.9;

export type GrammarResult = { text: string; words: { word: string; conf: number }[] };

/**
 * Итоговая команда из двух распознаваний.
 * Словарь побеждает, только если выдал ровно одну известную фразу и уверен
 * в каждом слове (иначе «включи группу кино» превратилось бы в «включи волну»).
 */
export function decide(freeText: string, grammar: GrammarResult | null): VoiceCommand {
  const g = grammar && normalize(grammar.text.replace(/\[unk\]/g, ""));
  const wake = new RegExp(WAKE.source);
  const gNoWake = g ? g.replace(wake, "") : "";
  if (
    grammar &&
    gNoWake &&
    COMMAND_PHRASES.includes(gNoWake) &&
    grammar.words.length > 0 &&
    grammar.words.every((w) => w.word === "[unk]" || w.conf >= GRAMMAR_MIN_CONF) &&
    !grammar.words.some((w) => w.word === "[unk]")
  ) {
    return parseCommand(gNoWake);
  }
  return parseCommand(freeText);
}
