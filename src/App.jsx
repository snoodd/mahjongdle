import { useState, useEffect, useCallback } from "react";
import { Share2, Check, HelpCircle, X, Flame } from "lucide-react";

/* ---------------------------------------------------------
   Tile helpers — rendered with real Unicode Mahjong glyphs
   (U+1F000–U+1F02B) instead of images.
--------------------------------------------------------- */
const NUM_BASE = { m: 0x1f007, b: 0x1f010, d: 0x1f019 };
const WIND_CODE = { E: 0x1f000, S: 0x1f001, W: 0x1f002, N: 0x1f003 };
const DRAGON_CODE = { red: 0x1f004, green: 0x1f005, white: 0x1f006 };
const TILE_BACK = String.fromCodePoint(0x1f02b);
const DRAWS = 36;
const EPOCH = new Date("2026-01-01T00:00:00");
const MOBILE_BREAKPOINT = 640;

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT
  );
  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return isMobile;
}

function tileGlyph(t) {
  const VS_TEXT = "\uFE0E"; // force plain text glyph, not a native color emoji graphic
  if (t.suit === "m" || t.suit === "b" || t.suit === "d") {
    return String.fromCodePoint(NUM_BASE[t.suit] + (t.value - 1)) + VS_TEXT;
  }
  if (t.suit === "wind") return String.fromCodePoint(WIND_CODE[t.value]) + VS_TEXT;
  return String.fromCodePoint(DRAGON_CODE[t.value]) + VS_TEXT;
}

function tileKey(t) {
  if (t.suit === "wind") return `wind-${t.value}`;
  if (t.suit === "dragon") return `dragon-${t.value}`;
  return `${t.suit}${t.value}`;
}

function tileLabel(t) {
  if (t.suit === "wind") {
    const names = { E: "East", S: "South", W: "West", N: "North" };
    return `${names[t.value]} Wind`;
  }
  if (t.suit === "dragon") {
    const names = { red: "Red", green: "Green", white: "White" };
    return `${names[t.value]} Dragon`;
  }
  const names = { m: "Characters", b: "Bamboo", d: "Circles" };
  return `${t.value} of ${names[t.suit]}`;
}

function sortRank(t) {
  if (t.suit === "m") return t.value;
  if (t.suit === "b") return 100 + t.value;
  if (t.suit === "d") return 200 + t.value;
  if (t.suit === "wind") return 300 + ["E", "S", "W", "N"].indexOf(t.value);
  return 400 + ["red", "green", "white"].indexOf(t.value);
}
function sortTiles(tiles) {
  return [...tiles].sort((a, b) => sortRank(a) - sortRank(b));
}

/* ---------------------------------------------------------
   Deterministic daily deck
--------------------------------------------------------- */
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildDeck() {
  const deck = [];
  let id = 0;
  for (const suit of ["m", "b", "d"]) {
    for (let v = 1; v <= 9; v++) {
      for (let c = 0; c < 4; c++) deck.push({ id: id++, suit, value: v });
    }
  }
  for (const v of ["E", "S", "W", "N"]) {
    for (let c = 0; c < 4; c++) deck.push({ id: id++, suit: "wind", value: v });
  }
  for (const v of ["red", "green", "white"]) {
    for (let c = 0; c < 4; c++) deck.push({ id: id++, suit: "dragon", value: v });
  }
  return deck;
}

function buildGame(dateStr) {
  const seedGen = xmur3("mahjong-solitaire:" + dateStr);
  const rng = mulberry32(seedGen());
  const deck = shuffle(buildDeck(), rng);
  return { hand: deck.slice(0, 13), drawQueue: deck.slice(13, 13 + DRAWS) };
}

/* ---------------------------------------------------------
   Hand scoring — simplified Hong Kong faan subset
--------------------------------------------------------- */
function buildCounts(tiles) {
  const counts = {};
  tiles.forEach((t) => {
    const k = tileKey(t);
    counts[k] = (counts[k] || 0) + 1;
  });
  return counts;
}
function firstNonZero(counts) {
  for (const s of ["m", "b", "d"]) {
    for (let v = 1; v <= 9; v++) {
      const k = s + v;
      if ((counts[k] || 0) > 0) return k;
    }
  }
  for (const v of ["E", "S", "W", "N"]) {
    const k = "wind-" + v;
    if ((counts[k] || 0) > 0) return k;
  }
  for (const v of ["red", "green", "white"]) {
    const k = "dragon-" + v;
    if ((counts[k] || 0) > 0) return k;
  }
  return null;
}
function isHonorKey(k) {
  return k.startsWith("wind-") || k.startsWith("dragon-");
}
function parseKey(k) {
  if (isHonorKey(k)) return { type: "honor" };
  return { type: "number", suit: k[0], value: parseInt(k.slice(1), 10) };
}
function decompose(counts, melds) {
  const k = firstNonZero(counts);
  if (!k) return melds;
  const info = parseKey(k);
  if ((counts[k] || 0) >= 3) {
    counts[k] -= 3;
    const res = decompose(counts, [...melds, { type: "pung", key: k }]);
    if (res) return res;
    counts[k] += 3;
  }
  if (info.type === "number" && info.value <= 7) {
    const k2 = info.suit + (info.value + 1);
    const k3 = info.suit + (info.value + 2);
    if ((counts[k2] || 0) > 0 && (counts[k3] || 0) > 0) {
      counts[k] -= 1;
      counts[k2] -= 1;
      counts[k3] -= 1;
      const res = decompose(counts, [
        ...melds,
        { type: "chow", key: k, suit: info.suit, start: info.value },
      ]);
      if (res) return res;
      counts[k] += 1;
      counts[k2] += 1;
      counts[k3] += 1;
    }
  }
  return null;
}
function findStandardHand(tiles) {
  const base = buildCounts(tiles);
  for (const pairKey of Object.keys(base)) {
    if (base[pairKey] >= 2) {
      const counts = { ...base };
      counts[pairKey] -= 2;
      const melds = decompose(counts, []);
      if (melds && melds.length === 4) return { pair: pairKey, melds };
    }
  }
  return null;
}
function findSevenPairs(tiles) {
  const counts = buildCounts(tiles);
  const keys = Object.keys(counts).filter((k) => counts[k] > 0);
  if (keys.length === 7 && keys.every((k) => counts[k] === 2)) return keys;
  return null;
}

const ORPHAN_KEYS = [
  "m1", "m9", "b1", "b9", "d1", "d9",
  "wind-E", "wind-S", "wind-W", "wind-N",
  "dragon-red", "dragon-green", "dragon-white",
];
function findThirteenOrphans(tiles) {
  if (tiles.length !== 14) return false;
  const counts = buildCounts(tiles);
  const keys = Object.keys(counts);
  if (keys.some((k) => !ORPHAN_KEYS.includes(k))) return false;
  return ORPHAN_KEYS.every((k) => (counts[k] || 0) >= 1);
}

const GREEN_BAMBOO_VALUES = [2, 3, 4, 6, 8];
function isAllGreenTile(k) {
  if (k === "dragon-green") return true;
  if (k[0] === "b") return GREEN_BAMBOO_VALUES.includes(parseInt(k.slice(1), 10));
  return false;
}
function isAllGreenHand(tiles) {
  return tiles.every((t) => isAllGreenTile(tileKey(t)));
}

function findNineGates(tiles) {
  if (tiles.length !== 14) return false;
  const suit = tiles[0].suit;
  if (suit !== "m" && suit !== "b" && suit !== "d") return false;
  if (!tiles.every((t) => t.suit === suit)) return false;
  const counts = new Array(10).fill(0); // index 1-9 used
  tiles.forEach((t) => counts[t.value]++);
  const base = [0, 3, 1, 1, 1, 1, 1, 1, 1, 3];
  let extra = 0;
  for (let v = 1; v <= 9; v++) {
    const diff = counts[v] - base[v];
    if (diff < 0) return false;
    extra += diff;
  }
  return extra === 1;
}

function isAllTerminalsHand(tiles) {
  return tiles.every((t) => (t.suit === "m" || t.suit === "b" || t.suit === "d") && (t.value === 1 || t.value === 9));
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function pungIsSimple(k) {
  if (isHonorKey(k)) return false;
  const v = parseInt(k.slice(1), 10);
  return v >= 2 && v <= 8;
}

function scoreHand(tiles) {
  if (findThirteenOrphans(tiles)) {
    return { valid: true, faan: 10, breakdown: ["Thirteen Orphans (+10)"], label: "Thirteen Orphans" };
  }
  if (findNineGates(tiles)) {
    return { valid: true, faan: 10, breakdown: ["Nine Gates (+10)"], label: "Nine Gates" };
  }
  const seven = findSevenPairs(tiles);
  if (seven) {
    const breakdown = ["Seven Pairs (+4)"];
    let faan = 4;
    if (isAllGreenHand(tiles)) {
      faan += 10;
      breakdown.push("All Green (+10)");
    }
    return { valid: true, faan, breakdown, label: isAllGreenHand(tiles) ? "All Green" : "Seven Pairs" };
  }
  const std = findStandardHand(tiles);
  if (!std) return { valid: false, faan: 0, breakdown: [], label: "No Valid Hand" };

  const { pair, melds } = std;
  const breakdown = [];
  let faan = 0;

  const allPung = melds.every((m) => m.type === "pung");
  const allChow = melds.every((m) => m.type === "chow");
  const honorInvolved =
    isHonorKey(pair) || melds.some((m) => m.type === "pung" && isHonorKey(m.key));

  const suitsUsed = new Set();
  melds.forEach((m) => {
    if (m.type === "chow") suitsUsed.add(m.suit);
    if (m.type === "pung" && !isHonorKey(m.key)) suitsUsed.add(m.key[0]);
  });
  if (!isHonorKey(pair)) suitsUsed.add(pair[0]);

  if (allPung) {
    faan += 3;
    breakdown.push("All Triplets (+3)");
  }
  if (allChow && !isHonorKey(pair)) {
    faan += 1;
    breakdown.push("All Chows (+1)");
  }

  if (suitsUsed.size === 1 && !honorInvolved) {
    faan += 6;
    breakdown.push("Full Flush (+6)");
  } else if (suitsUsed.size === 1 && honorInvolved) {
    faan += 3;
    breakdown.push("Mixed One Suit (+3)");
  } else if (suitsUsed.size === 0 && honorInvolved) {
    faan += 10;
    breakdown.push("All Honors (+10)");
  }

  if (isAllTerminalsHand(tiles)) {
    faan += 10;
    breakdown.push("All Terminals (+10)");
  }

  if (isAllGreenHand(tiles)) {
    faan += 10;
    breakdown.push("All Green (+10)");
  }

  const dragonPungs = melds.filter((m) => m.type === "pung" && m.key.startsWith("dragon-"));
  dragonPungs.forEach((m) => {
    faan += 1;
    breakdown.push(`Dragon Pung: ${capitalize(m.key.slice(7))} (+1)`);
  });
  if (dragonPungs.length === 3) {
    faan += 6;
    breakdown.push("Big Three Dragons (+6)");
  } else if (dragonPungs.length === 2 && pair.startsWith("dragon-")) {
    faan += 3;
    breakdown.push("Small Three Dragons (+3)");
  }

  const windPungs = melds.filter((m) => m.type === "pung" && m.key.startsWith("wind-"));
  if (windPungs.length === 4) {
    faan += 8;
    breakdown.push("Big Four Winds (+8)");
  } else if (windPungs.length === 3 && pair.startsWith("wind-")) {
    faan += 5;
    breakdown.push("Small Four Winds (+5)");
  }

  const pairSimple = !isHonorKey(pair) && (() => {
    const v = parseInt(pair.slice(1), 10);
    return v >= 2 && v <= 8;
  })();
  const allSimples =
    pairSimple &&
    melds.every((m) =>
      m.type === "chow" ? m.start >= 2 && m.start <= 6 : pungIsSimple(m.key)
    );
  if (allSimples) {
    faan += 1;
    breakdown.push("All Simples (+1)");
  }

  if (faan === 0) {
    faan = 1;
    breakdown.push("Basic Winning Hand (+1)");
  }

  const priority = [
    "Big Four Winds", "Big Three Dragons", "All Terminals", "All Green",
    "Small Four Winds", "Small Three Dragons", "Full Flush", "All Honors",
    "All Triplets", "Mixed One Suit",
  ];
  let label = breakdown[0].split(" (")[0];
  for (const p of priority) {
    if (breakdown.some((b) => b.startsWith(p))) {
      label = p;
      break;
    }
  }
  return { valid: true, faan, breakdown, label };
}


/* ---------------------------------------------------------
   Date / puzzle number helpers
--------------------------------------------------------- */
function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function puzzleNumber(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return Math.max(1, Math.floor((d - EPOCH) / 86400000) + 1);
}
function yesterdayStr(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/* ---------------------------------------------------------
   Tile component
--------------------------------------------------------- */
function tileColor(tile) {
  if (tile.suit === "m") return "#B23A2F"; // characters — red ink
  if (tile.suit === "b") return "#3C6E47"; // bamboo — green ink
  if (tile.suit === "d") return "#2F5D8A"; // circles — blue ink
  if (tile.suit === "wind") return "#2B2620"; // winds — black ink
  if (tile.suit === "dragon") {
    if (tile.value === "red") return "#B23A2F";
    if (tile.value === "green") return "#3C6E47";
    return "#2F5D8A"; // white dragon — blue frame
  }
  return "#2B2620";
}

function tileCornerLabel(tile) {
  if (tile.suit === "m" || tile.suit === "b" || tile.suit === "d") return String(tile.value);
  if (tile.suit === "wind") return tile.value; // already E / S / W / N
  if (tile.value === "red") return "R";
  if (tile.value === "green") return "G";
  return "W"; // white dragon
}

function Tile({ tile, faceDown, highlight, onClick, small }) {
  const isMobile = useIsMobile();
  const size = small
    ? isMobile
      ? { w: 42, h: 58, font: "2.1rem", label: "0.55rem" }
      : { w: 52, h: 72, font: "2.6rem", label: "0.65rem" }
    : isMobile
    ? { w: 50, h: 70, font: "2.6rem", label: "0.6rem" }
    : { w: 72, h: 100, font: "3.4rem", label: "0.8rem" };
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      title={tile ? tileLabel(tile) : ""}
      style={{
        position: "relative",
        width: size.w,
        height: size.h,
        background: "#F3ECDA",
        border: highlight ? "2px solid #C9A24B" : "1px solid #C9BFA0",
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size.font,
        fontFamily: "'Noto Sans Symbols 2', 'Segoe UI Symbol', system-ui, sans-serif",
        color: faceDown ? "#4F7942" : tileColor(tile),
        boxShadow: highlight
          ? "0 6px 14px rgba(0,0,0,0.35), 0 0 0 3px rgba(201,162,75,0.25)"
          : "0 2px 4px rgba(0,0,0,0.25)",
        transform: highlight ? "translateY(-6px)" : "none",
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
        cursor: onClick ? "pointer" : "default",
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      {!faceDown && (
        <span
          style={{
            position: "absolute",
            top: 4,
            left: 6,
            fontSize: size.label,
            fontFamily: "'IBM Plex Mono', monospace",
            fontWeight: 600,
            color: tileColor(tile),
            lineHeight: 1,
          }}
        >
          {tileCornerLabel(tile)}
        </span>
      )}
      {faceDown ? TILE_BACK : tileGlyph(tile)}
    </button>
  );
}

function ExampleRow({ tiles, valid, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
      <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
        {tiles.map((t, i) => (
          <Tile key={i} tile={t} small />
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", color: "#D8CBA8" }}>
        {valid ? <Check size={16} color="#4F7942" style={{ flexShrink: 0 }} /> : <X size={16} color="#A63D31" style={{ flexShrink: 0 }} />}
        <span>{label}</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   Main game component
--------------------------------------------------------- */
export default function MahjongSolitaire() {
  const isMobile = useIsMobile();
  const [dateStr] = useState(todayStr());
  const [game] = useState(() => buildGame(dateStr));
  const [hand, setHand] = useState(game.hand);
  const [turnIndex, setTurnIndex] = useState(0);
  const [drawnTile, setDrawnTile] = useState(null);
  const [gameOver, setGameOver] = useState(false);
  const [result, setResult] = useState(null);
  const [finalHand, setFinalHand] = useState(null);
  const [officialResult, setOfficialResult] = useState(null);
  const [officialFinalHand, setOfficialFinalHand] = useState(null);
  const [isPractice, setIsPractice] = useState(false);
  const [loading, setLoading] = useState(true);
  const [streak, setStreak] = useState(1);
  const [copied, setCopied] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareText, setShareText] = useState("");

  const pNum = puzzleNumber(dateStr);

  useEffect(() => {
    (async () => {
      try {
        const saved = await window.storage.get(`progress:${dateStr}`);
        if (saved && saved.value) {
          const parsed = JSON.parse(saved.value);
          if (parsed.completed) {
            setResult(parsed.result);
            setFinalHand(parsed.finalHand);
            setOfficialResult(parsed.result);
            setOfficialFinalHand(parsed.finalHand);
            setGameOver(true);
          }
        }
      } catch (e) {
        /* no saved progress yet */
      }
      try {
        const s = await window.storage.get("streak");
        if (s && s.value) {
          const parsed = JSON.parse(s.value);
          setStreak(parsed.count || 1);
        }
      } catch (e) {
        /* no streak yet */
      }
      setLoading(false);
    })();
  }, [dateStr]);

  const finalize = useCallback(
    async (hand14) => {
      let scored = scoreHand(hand14);
      if (scored.valid && turnIndex === 0) {
        scored = {
          ...scored,
          faan: scored.faan + 10,
          breakdown: [...scored.breakdown, "Heavenly Hand (+10)"],
          label: "Heavenly Hand",
        };
      }
      setResult(scored);
      setFinalHand(hand14);
      setGameOver(true);
      if (isPractice) return; // don't overwrite the day's saved score
      setOfficialResult(scored);
      setOfficialFinalHand(hand14);
      try {
        await window.storage.set(
          `progress:${dateStr}`,
          JSON.stringify({ completed: true, result: scored, finalHand: hand14 })
        );
        const s = await window.storage.get("streak").catch(() => null);
        let count = 1;
        if (s && s.value) {
          const parsed = JSON.parse(s.value);
          count = parsed.lastDate === yesterdayStr(dateStr) ? (parsed.count || 1) + 1 : 1;
        }
        await window.storage.set("streak", JSON.stringify({ count, lastDate: dateStr }));
        setStreak(count);
      } catch (e) {
        /* storage unavailable, game still playable this session */
      }
    },
    [dateStr, isPractice, turnIndex]
  );

  function handleTryAgain() {
    setIsPractice(true);
    setHand(game.hand);
    setTurnIndex(0);
    setDrawnTile(null);
    setResult(null);
    setFinalHand(null);
    setGameOver(false);
  }

  function handleBackToSavedResult() {
    setIsPractice(false);
    setResult(officialResult);
    setFinalHand(officialFinalHand);
    setGameOver(true);
  }

  function drawNext(turn, currentHand) {
    const tile = game.drawQueue[turn];
    setTurnIndex(turn);
    setDrawnTile(tile);
    if (turn === DRAWS - 1) {
      setTimeout(() => finalize(sortTiles([...currentHand, tile])), 1000);
    }
  }

  function handleDeclare() {
    if (!drawnTile || turnIndex === DRAWS - 1) return;
    finalize(sortTiles([...hand, drawnTile]));
  }

  function handleStart() {
    if (drawnTile) return;
    drawNext(0, hand);
  }

  function keepDrawnTile(discardedHandTile) {
    if (!drawnTile || turnIndex === DRAWS - 1) return;
    const newHand = hand.filter((t) => t.id !== discardedHandTile.id);
    newHand.push(drawnTile);
    setHand(newHand);
    drawNext(turnIndex + 1, newHand);
  }

  function discardDrawnTile() {
    if (!drawnTile || turnIndex === DRAWS - 1) return;
    drawNext(turnIndex + 1, hand);
  }

  function buildShareText() {
    return `Mahjong Solitaire #${pNum}\n${
      result.valid ? `${result.faan} faan — ${result.label}` : "No valid hand"
    }\n${sortTiles(finalHand || [])
      .map((t) => tileGlyph(t))
      .join("")}`;
  }

  async function attemptCopy(text) {
    let success = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        success = true;
      }
    } catch (e) {
      success = false;
    }
    if (!success) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.top = "-1000px";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        success = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch (e) {
        success = false;
      }
    }
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
    return success;
  }

  function handleShare() {
    const text = buildShareText();
    setShareText(text);
    setShowShareModal(true);
    attemptCopy(text);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(ellipse at top, #1E4437 0%, #16302A 60%, #0F211C 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        fontFamily: "'Inter', sans-serif",
        color: "#F0E6CF",
        padding: "24px 16px 48px",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Zilla+Slab:wght@500;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap');
      `}</style>

      {/* Header */}
      <div style={{ width: "100%", maxWidth: 1100, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1
            style={{
              fontFamily: "'Zilla Slab', serif",
              fontWeight: 700,
              fontSize: "1.6rem",
              margin: 0,
              letterSpacing: "0.02em",
            }}
          >
            Mahjong Solitaire
          </h1>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.8rem", color: "#9FBBA8", marginTop: 2 }}>
            Puzzle #{pNum} &middot; {dateStr}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, color: "#C9A24B", fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.85rem" }}>
            <Flame size={16} />
            {streak}
          </div>
          <button
            onClick={() => setShowRules(true)}
            style={{ background: "none", border: "none", color: "#9FBBA8", cursor: "pointer" }}
            aria-label="How to play"
          >
            <HelpCircle size={20} />
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ marginTop: 80, color: "#9FBBA8" }}>Shuffling today's wall…</div>
      ) : gameOver ? (
        /* ---------------- RESULT SCREEN ---------------- */
        <div style={{ width: "100%", maxWidth: 1100, marginTop: 32 }}>
          <div
            style={{
              background: "rgba(0,0,0,0.2)",
              border: isPractice ? "1px dashed rgba(240,230,207,0.3)" : "1px solid rgba(240,230,207,0.15)",
              borderRadius: 16,
              padding: 24,
              textAlign: "center",
            }}
          >
            {isPractice && (
              <div
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: "0.75rem",
                  color: "#C9A24B",
                  letterSpacing: "0.05em",
                  marginBottom: 12,
                  textTransform: "uppercase",
                }}
              >
                Practice run — not saved
              </div>
            )}
            <div style={{ fontFamily: "'Zilla Slab', serif", fontSize: "3rem", fontWeight: 700, color: result.valid ? "#C9A24B" : "#A63D31" }}>
              {result.faan}
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.8rem", color: "#9FBBA8", marginTop: -6 }}>
              FAAN
            </div>
            <div style={{ marginTop: 12, fontSize: "1.1rem", fontWeight: 600 }}>{result.label}</div>

            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 4, margin: "20px 0" }}>
              {sortTiles(finalHand).map((t) => (
                <Tile key={t.id} tile={t} small />
              ))}
            </div>

            {result.breakdown.length > 0 && (
              <div style={{ textAlign: "left", fontSize: "0.9rem", color: "#D8CBA8", marginBottom: 16 }}>
                {result.breakdown.map((b, i) => (
                  <div key={i} style={{ padding: "3px 0", borderTop: i > 0 ? "1px solid rgba(240,230,207,0.1)" : "none" }}>
                    {b}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
              {!isPractice && (
                <button
                  onClick={handleShare}
                  style={{
                    background: "#4F7942",
                    border: "none",
                    color: "#F0E6CF",
                    padding: "10px 20px",
                    borderRadius: 10,
                    fontSize: "0.95rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {copied ? <Check size={16} /> : <Share2 size={16} />}
                  {copied ? "Copied!" : "Share result"}
                </button>
              )}

              <button
                onClick={handleTryAgain}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(240,230,207,0.4)",
                  color: "#F0E6CF",
                  padding: "10px 20px",
                  borderRadius: 10,
                  fontSize: "0.95rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Try again
              </button>

              {isPractice && (
                <button
                  onClick={handleBackToSavedResult}
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(240,230,207,0.4)",
                    color: "#9FBBA8",
                    padding: "10px 20px",
                    borderRadius: 10,
                    fontSize: "0.95rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Back to today's result
                </button>
              )}
            </div>

            <div style={{ marginTop: 16, fontSize: "0.8rem", color: "#9FBBA8" }}>
              {isPractice
                ? "This replay doesn't affect your saved score or streak."
                : "New puzzle tomorrow. Come back and keep the streak going."}
            </div>
          </div>
        </div>
      ) : (
        /* ---------------- GAME BOARD ---------------- */
        <div style={{ width: "100%", maxWidth: 1100, marginTop: 24 }}>
          {/* turn tracker */}
          <div
            style={{
              width: "100%",
              height: 6,
              borderRadius: 3,
              background: "rgba(240,230,207,0.15)",
              overflow: "hidden",
              marginBottom: 10,
            }}
          >
            <div
              style={{
                width: `${(turnIndex / DRAWS) * 100}%`,
                height: "100%",
                background: "linear-gradient(90deg, #4F7942, #C9A24B)",
                transition: "width 0.3s ease",
              }}
            />
          </div>
          <div style={{ textAlign: "center", fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.85rem", color: "#9FBBA8", marginBottom: 20 }}>
            Draw {turnIndex + 1} of {DRAWS}
            {turnIndex === DRAWS - 1 ? " — final tile" : ""}
          </div>

          {/* draw area */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 28, minHeight: 110 }}>
            {!drawnTile ? (
              <button
                onClick={handleStart}
                style={{
                  background: "#4F7942",
                  border: "none",
                  color: "#F0E6CF",
                  padding: "12px 28px",
                  borderRadius: 10,
                  fontSize: "1rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Start
              </button>
            ) : (
              <>
                <Tile
                  tile={drawnTile}
                  highlight
                  onClick={turnIndex < DRAWS - 1 ? discardDrawnTile : undefined}
                />
                <div style={{ fontSize: "0.85rem", color: "#9FBBA8", marginTop: 10, textAlign: "center", maxWidth: 320 }}>
                  {turnIndex === DRAWS - 1
                    ? "Final tile! Locking in your hand…"
                    : `Drew ${tileLabel(drawnTile)} — tap a tile in your hand to keep this and discard it, or tap this tile to throw it back`}
                </div>

                {turnIndex < DRAWS - 1 && (
                  <button
                    onClick={handleDeclare}
                    style={{
                      marginTop: 16,
                      background: "#C9A24B",
                      border: "none",
                      color: "#1E2A1F",
                      padding: "10px 24px",
                      borderRadius: 8,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontSize: "0.9rem",
                    }}
                  >
                    Declare Mahjong
                  </button>
                )}
              </>
            )}
          </div>

          {/* hand */}
          <div style={{ fontSize: "0.75rem", color: "#9FBBA8", textAlign: "center", marginBottom: 8 }}>Your hand</div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: isMobile ? 6 : 8,
              padding: "0 4px 6px",
            }}
          >
            {sortTiles(hand).map((t) => {
              const clickable = drawnTile && turnIndex < DRAWS - 1;
              return (
                <Tile
                  key={t.id}
                  tile={t}
                  onClick={clickable ? () => keepDrawnTile(t) : undefined}
                />
              );
            })}
          </div>

        </div>
      )}

      {/* share modal */}
      {showShareModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 50,
          }}
          onClick={() => setShowShareModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#1E4437",
              border: "1px solid rgba(240,230,207,0.2)",
              borderRadius: 16,
              padding: 24,
              maxWidth: 380,
              width: "100%",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontFamily: "'Zilla Slab', serif", fontWeight: 700, fontSize: "1.2rem" }}>Share result</div>
              <button onClick={() => setShowShareModal(false)} style={{ background: "none", border: "none", color: "#9FBBA8", cursor: "pointer" }}>
                <X size={20} />
              </button>
            </div>
            <p style={{ fontSize: "0.85rem", color: "#D8CBA8", marginBottom: 10 }}>
              {copied ? "Copied to your clipboard — paste it anywhere." : "Select the text below and copy it manually."}
            </p>
            <textarea
              readOnly
              value={shareText}
              onFocus={(e) => e.target.select()}
              style={{
                width: "100%",
                minHeight: 90,
                background: "#16302A",
                border: "1px solid rgba(240,230,207,0.2)",
                borderRadius: 8,
                color: "#F0E6CF",
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: "0.9rem",
                padding: 10,
                resize: "none",
                boxSizing: "border-box",
              }}
            />
            <button
              onClick={() => attemptCopy(shareText)}
              style={{
                marginTop: 12,
                background: "#4F7942",
                border: "none",
                color: "#F0E6CF",
                padding: "10px 20px",
                borderRadius: 10,
                fontSize: "0.9rem",
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {copied ? <Check size={16} /> : <Share2 size={16} />}
              {copied ? "Copied!" : "Copy text"}
            </button>
          </div>
        </div>
      )}

      {/* rules modal */}
      {showRules && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 50,
          }}
          onClick={() => setShowRules(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#1E4437",
              border: "1px solid rgba(240,230,207,0.2)",
              borderRadius: 16,
              padding: 24,
              maxWidth: 460,
              width: "100%",
              maxHeight: "80vh",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontFamily: "'Zilla Slab', serif", fontWeight: 700, fontSize: "1.2rem" }}>How to play</div>
              <button onClick={() => setShowRules(false)} style={{ background: "none", border: "none", color: "#9FBBA8", cursor: "pointer" }}>
                <X size={20} />
              </button>
            </div>
            <p style={{ fontSize: "0.9rem", lineHeight: 1.5, color: "#D8CBA8" }}>
              You start with 13 tiles. Draw {DRAWS} tiles, one at a time, from today's shared wall — everyone
              gets the same tiles in the same order. After each draw (except the last), discard one tile to
              stay at 13. Your final draw locks in automatically as your 14th tile — no more discards.
            </p>
            <p style={{ fontSize: "0.9rem", lineHeight: 1.5, color: "#D8CBA8" }}>
              At any point after a draw, you can tap <strong>Declare Mahjong</strong> to end the game with your
              current hand plus the tile you just drew. The game won't tell you in advance whether your hand
              is valid — if it doesn't form four sets of three plus a pair (or seven pairs), you score zero.
              If you never declare, your final draw is checked the same way.
            </p>

            <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "#F0E6CF", marginTop: 18, marginBottom: 10 }}>
              Triplets &amp; sequences
            </div>
            <p style={{ fontSize: "0.85rem", lineHeight: 1.5, color: "#D8CBA8", marginBottom: 12 }}>
              A set of three must either be three <em>identical</em> tiles, or three tiles in a row within the
              same suit. The suit has to match — same number in different suits doesn't count as either one.
            </p>
            <ExampleRow
              tiles={[{ suit: "d", value: 3 }, { suit: "d", value: 3 }, { suit: "d", value: 3 }]}
              valid
              label="Triplet — three identical tiles"
            />
            <ExampleRow
              tiles={[{ suit: "d", value: 3 }, { suit: "b", value: 3 }, { suit: "m", value: 3 }]}
              valid={false}
              label="Not a triplet — same number, different suits"
            />
            <ExampleRow
              tiles={[{ suit: "d", value: 3 }, { suit: "d", value: 4 }, { suit: "d", value: 5 }]}
              valid
              label="Sequence — three in a row, same suit"
            />
            <ExampleRow
              tiles={[{ suit: "d", value: 3 }, { suit: "b", value: 4 }, { suit: "m", value: 5 }]}
              valid={false}
              label="Not a sequence — must all be the same suit"
            />
            <p style={{ fontSize: "0.85rem", lineHeight: 1.5, color: "#D8CBA8", marginTop: 4, marginBottom: 16 }}>
              Winds and dragons can only form triplets (or the pair) — they never form sequences.
            </p>

            <p style={{ fontSize: "0.9rem", lineHeight: 1.5, color: "#D8CBA8" }}>
              A valid hand is scored in faan (multiple patterns can stack if a hand qualifies for more than one):
            </p>
            <ul style={{ fontSize: "0.85rem", lineHeight: 1.7, color: "#D8CBA8", paddingLeft: 18 }}>
              <li>All Triplets (every set a triplet) — 3</li>
              <li>All Chows (every set a run) — 1</li>
              <li>Mixed One Suit (one suit + honors) — 3</li>
              <li>Small Three Dragons (two dragon triplets + pair of the third) — 3</li>
              <li>Full Flush (one suit only) — 6</li>
              <li>Big Three Dragons (all three dragon triplets) — 6</li>
              <li>Small Four Winds (three wind triplets + pair of the fourth) — 5</li>
              <li>Big Four Winds (all four wind triplets) — 8</li>
              <li>All Honors (winds/dragons only) — 10</li>
              <li>All Terminals (only 1s and 9s) — 10</li>
              <li>All Green — 10</li>
              <li>Seven Pairs — 4</li>
              <li>Thirteen Orphans — 10</li>
              <li>Nine Gates — 10</li>
              <li>Heavenly Hand (declared on your very first draw) — +10</li>
              <li>Dragon Pung (each) — 1</li>
              <li>All Simples (no 1s, 9s, or honors) — 1</li>
              <li>Any other valid hand — 1</li>
            </ul>
            <p style={{ fontSize: "0.8rem", lineHeight: 1.5, color: "#9FBBA8", marginTop: 8 }}>
              (Flower and season tiles aren't part of this game, so there's no bonus for collecting them.)
            </p>

            <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "#F0E6CF", marginTop: 18, marginBottom: 10 }}>
              A closer look at a few rare hands
            </div>

            <p style={{ fontSize: "0.85rem", lineHeight: 1.5, color: "#D8CBA8", marginBottom: 8 }}>
              <strong style={{ color: "#F0E6CF" }}>All Green</strong> — every tile must be the Green Dragon or a
              Bamboo tile printed green: 2, 3, 4, 6, or 8. Bamboo 1, 5, 7, and 9 aren't green, so they break the hand.
            </p>
            <ExampleRow
              tiles={[
                { suit: "b", value: 2 },
                { suit: "b", value: 3 },
                { suit: "b", value: 4 },
                { suit: "b", value: 6 },
                { suit: "b", value: 8 },
                { suit: "dragon", value: "green" },
              ]}
              valid
              label="Only these six tiles are allowed"
            />
            <ExampleRow
              tiles={[
                { suit: "b", value: 1 },
                { suit: "b", value: 5 },
                { suit: "b", value: 7 },
                { suit: "b", value: 9 },
              ]}
              valid={false}
              label="These Bamboo tiles aren't green — any of them breaks the hand"
            />

            <p style={{ fontSize: "0.85rem", lineHeight: 1.5, color: "#D8CBA8", margin: "16px 0 8px" }}>
              <strong style={{ color: "#F0E6CF" }}>Thirteen Orphans</strong> — collect one of every terminal
              (the 1 and 9 of each suit), one of every wind, and one of every dragon: 13 unique tiles in total.
              Your 14th tile just duplicates any one of them to form the pair.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 12 }}>
              {[
                { suit: "m", value: 1 },
                { suit: "m", value: 9 },
                { suit: "b", value: 1 },
                { suit: "b", value: 9 },
                { suit: "d", value: 1 },
                { suit: "d", value: 9 },
                { suit: "wind", value: "E" },
                { suit: "wind", value: "S" },
                { suit: "wind", value: "W" },
                { suit: "wind", value: "N" },
                { suit: "dragon", value: "red" },
                { suit: "dragon", value: "green" },
                { suit: "dragon", value: "white" },
              ].map((t, i) => (
                <Tile key={i} tile={t} small />
              ))}
            </div>

            <p style={{ fontSize: "0.85rem", lineHeight: 1.5, color: "#D8CBA8", margin: "0 0 8px" }}>
              <strong style={{ color: "#F0E6CF" }}>Nine Gates</strong> — one suit only, shaped exactly like this:
              three of the 1, one each of 2 through 8, three of the 9 — then any 14th tile from that same suit
              completes it, no matter which one.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 12 }}>
              {[1, 1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 9].map((v, i) => (
                <Tile key={i} tile={{ suit: "d", value: v }} small />
              ))}
            </div>

            <p style={{ fontSize: "0.85rem", lineHeight: 1.5, color: "#D8CBA8", marginBottom: 8 }}>
              <strong style={{ color: "#F0E6CF" }}>Small / Big Three Dragons</strong> and{" "}
              <strong style={{ color: "#F0E6CF" }}>Small / Big Four Winds</strong> — build triplets of two, three,
              or all of the dragons or winds. Getting the pair to match the one you're missing (e.g. a pair of
              White when you have Red and Green triplets) still counts as the "small" version.
            </p>
            <p style={{ fontSize: "0.85rem", lineHeight: 1.5, color: "#D8CBA8", marginBottom: 4 }}>
              <strong style={{ color: "#F0E6CF" }}>Heavenly Hand</strong> — declare Mahjong on the very first tile
              you draw. Real mahjong distinguishes a dealer's opening hand from a non-dealer's first draw; since
              this is solitaire, both are treated the same way here.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
