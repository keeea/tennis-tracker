const db = new Dexie("tennisTrackerDb");
db.version(1).stores({
  matches: "id, status, createdAt, updatedAt",
});

const SERVE_OPTIONS = [
  { value: "first_in", label: "1st Serve In" },
  { value: "second_in", label: "2nd Serve In" },
  { value: "ace", label: "Ace" },
  { value: "double_fault", label: "Double Fault" },
];
const OUTCOME_OPTIONS = [
  { value: "winner", label: "Winner" },
  { value: "unforced_error", label: "Unforced Error" },
  { value: "forced_error", label: "Forced Error" },
  { value: "uncertain", label: "Uncertain" },
];
const SHOT_OPTIONS = ["forehand", "backhand", "volley", "overhead", "drop_shot"];
const TABS = ["live", "history", "stats", "matches"];
const STORAGE_KEY = "tennisTracker.activeMatchId";

const state = {
  matches: [],
  currentMatchId: localStorage.getItem(STORAGE_KEY) || "",
  currentTab: "live",
  setup: {
    playerA: "",
    playerB: "",
    initialServer: 0,
  },
  draft: createEmptyDraft(),
  history: {
    setIndex: 0,
    gameIndex: 0,
  },
  editor: {
    pointId: "",
    draft: createEmptyDraft(),
  },
  exportMessage: "",
  notice: "",
  noticeType: "success",
  error: "",
  shareSupported: Boolean(navigator.share),
  loading: true,
};

let noticeTimeoutId = 0;

function createEmptyDraft() {
  return {
    serveResult: "",
    outcome: "",
    shotType: "",
    winner: "",
    netApproachStates: createEmptyFlagStates(),
    returnWinnerStates: createEmptyFlagStates(),
  };
}

function createEmptyFlagStates() {
  return { 0: "", 1: "" };
}

function createStatsBucket() {
  return {
    servicePoints: 0,
    returnPoints: 0,
    firstServeAttempts: 0,
    firstServeIn: 0,
    secondServeAttempts: 0,
    secondServeIn: 0,
    firstServePointsWon: 0,
    secondServePointsWon: 0,
    aces: 0,
    doubleFaults: 0,
    winners: {
      forehand: 0,
      backhand: 0,
      volley: 0,
      overhead: 0,
      drop_shot: 0,
    },
    unforcedErrors: {
      forehand: 0,
      backhand: 0,
      volley: 0,
      overhead: 0,
      drop_shot: 0,
    },
    forcedErrors: 0,
    netPointsPlayed: 0,
    netPointsWon: 0,
    returnWinners: 0,
    breakPointsOpportunities: 0,
    breakPointsConverted: 0,
    breakPointsFaced: 0,
    breakPointsSaved: 0,
    totalPointsWon: 0,
  };
}

function createMatchRecord({ playerA, playerB, initialServer }) {
  const timestamp = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    date: timestamp,
    status: "in_progress",
    format: "best_of_3",
    playerA: playerA.trim(),
    playerB: playerB.trim(),
    initialServer,
    points: [],
  };
}

function setNotice(message, type = "success") {
  state.notice = message;
  state.noticeType = type;
  if (noticeTimeoutId) {
    window.clearTimeout(noticeTimeoutId);
  }
  noticeTimeoutId = window.setTimeout(() => {
    state.notice = "";
    noticeTimeoutId = 0;
    render();
  }, 3000);
}

function clearNotice() {
  state.notice = "";
  if (noticeTimeoutId) {
    window.clearTimeout(noticeTimeoutId);
    noticeTimeoutId = 0;
  }
}

function playerName(match, index) {
  return index === 0 ? match.playerA : match.playerB;
}

function flattenPoints(computed) {
  return computed.sets.flatMap((set) => set.games.flatMap((game) => game.points));
}

function shotLabel(shot) {
  return shot.replace("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function outcomeLabel(outcome) {
  return outcome.replace("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function serveLabel(serveResult) {
  return SERVE_OPTIONS.find((option) => option.value === serveResult)?.label || serveResult;
}

function formatPercent(numerator, denominator) {
  if (!denominator) {
    return "-";
  }
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function formatFraction(numerator, denominator) {
  return `${numerator}/${denominator}`;
}

function formatDate(isoString) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(isoString));
}

function getTiebreakServer(startServer, pointIndex) {
  if (pointIndex === 0) {
    return startServer;
  }
  const block = Math.floor((pointIndex - 1) / 2);
  return block % 2 === 0 ? 1 - startServer : startServer;
}

function isBreakPoint(gamePoints, server) {
  const receiver = 1 - server;
  const serverPoints = gamePoints[server];
  const receiverPoints = gamePoints[receiver];

  if (receiverPoints < 3) {
    return false;
  }
  if (receiverPoints === 3 && serverPoints <= 2) {
    return true;
  }
  if (receiverPoints >= 4 && receiverPoints === serverPoints + 1) {
    return true;
  }
  return false;
}

function isGameWon(pointsA, pointsB) {
  return (pointsA >= 4 || pointsB >= 4) && Math.abs(pointsA - pointsB) >= 2;
}

function getGameScoreLabel(pointsA, pointsB) {
  const labels = ["0", "15", "30", "40"];
  if (pointsA >= 3 && pointsB >= 3) {
    if (pointsA === pointsB) {
      return ["Deuce", "Deuce"];
    }
    return pointsA > pointsB ? ["Ad", "40"] : ["40", "Ad"];
  }
  return [labels[pointsA] || "40", labels[pointsB] || "40"];
}

function isTiebreakWon(pointsA, pointsB) {
  return (pointsA >= 7 || pointsB >= 7) && Math.abs(pointsA - pointsB) >= 2;
}

function sanitizePlayerIndexes(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map((entry) => Number(entry)).filter((entry) => entry === 0 || entry === 1))];
}

function sanitizeFlagStates(value) {
  const next = createEmptyFlagStates();
  if (!value || typeof value !== "object") {
    return next;
  }
  ["0", "1"].forEach((playerIndex) => {
    if (value[playerIndex] === "yes" || value[playerIndex] === "no") {
      next[playerIndex] = value[playerIndex];
    }
  });
  return next;
}

function flagStatesToPlayers(flagStates) {
  const sanitized = sanitizeFlagStates(flagStates);
  return Object.entries(sanitized)
    .filter(([, stateValue]) => stateValue === "yes")
    .map(([playerIndex]) => Number(playerIndex));
}

function playersToFlagStates(players) {
  const next = createEmptyFlagStates();
  sanitizePlayerIndexes(players).forEach((playerIndex) => {
    next[playerIndex] = "yes";
  });
  return next;
}

function normalizeWinner(value) {
  return value === 0 || value === 1 ? value : null;
}

function normalizeShotType(value) {
  return SHOT_OPTIONS.includes(value) ? value : "";
}

function resolveNetApproachPlayers(rawPoint, winner, loser, server, receiver) {
  const explicit = sanitizePlayerIndexes(rawPoint.netApproachPlayers);
  if (explicit.length) {
    return explicit;
  }
  if (!rawPoint.netApproach) {
    return [];
  }
  if (rawPoint.netPlayerMode === "loser") {
    return [loser];
  }
  if (rawPoint.netPlayerMode === "server") {
    return [server];
  }
  if (rawPoint.netPlayerMode === "receiver") {
    return [receiver];
  }
  return [winner];
}

function resolveReturnWinnerPlayers(rawPoint, receiver) {
  const explicit = sanitizePlayerIndexes(rawPoint.returnWinnerPlayers);
  if (explicit.length) {
    return explicit;
  }
  return rawPoint.returnWinner && rawPoint.outcome === "winner" ? [receiver] : [];
}

function formatPlayerList(match, playerIndexes) {
  return sanitizePlayerIndexes(playerIndexes)
    .map((index) => playerName(match, index))
    .join(", ");
}

function ensureSetBucket(statsBySet, setIndex) {
  if (!statsBySet[setIndex]) {
    statsBySet[setIndex] = [createStatsBucket(), createStatsBucket()];
  }
  return statsBySet[setIndex];
}

function computeMatch(match) {
  const sets = [];
  const statsOverall = [createStatsBucket(), createStatsBucket()];
  const statsBySet = [];
  const rawPoints = Array.isArray(match.points) ? match.points : [];
  let setsWon = [0, 0];
  let currentSet = createSetContainer(0);
  let currentGame = null;
  let nextGameServer = Number.isInteger(match.initialServer) ? match.initialServer : 0;
  let matchWinner = null;

  function startGame() {
    currentGame = {
      index: currentSet.games.length,
      setIndex: currentSet.index,
      server: nextGameServer,
      isTiebreak: currentSet.gamesWon[0] === 6 && currentSet.gamesWon[1] === 6,
      pointsWon: [0, 0],
      points: [],
      scoreBefore: [...currentSet.gamesWon],
      winner: null,
    };
    currentSet.games.push(currentGame);
  }

  function finalizeGame() {
    const winner = currentGame.pointsWon[0] > currentGame.pointsWon[1] ? 0 : 1;
    currentGame.winner = winner;
    currentSet.gamesWon[winner] += 1;
    currentGame.scoreAfter = [...currentSet.gamesWon];

    const [gamesA, gamesB] = currentSet.gamesWon;
    const tiebreakWon = currentGame.isTiebreak && isTiebreakWon(currentGame.pointsWon[0], currentGame.pointsWon[1]);
    const standardSetWon =
      (gamesA >= 6 || gamesB >= 6) &&
      Math.abs(gamesA - gamesB) >= 2 &&
      !currentGame.isTiebreak;
    const setWon = tiebreakWon || standardSetWon;

    if (currentGame.isTiebreak) {
      nextGameServer = 1 - currentGame.server;
      currentSet.tiebreakScore = [...currentGame.pointsWon];
    } else {
      nextGameServer = 1 - currentGame.server;
    }

    if (setWon) {
      currentSet.winner = winner;
      currentSet.score = [...currentSet.gamesWon];
      setsWon[winner] += 1;
      sets.push(currentSet);
      currentGame = null;

      if (setsWon[winner] === 2) {
        matchWinner = winner;
      } else {
        currentSet = createSetContainer(currentSet.index + 1);
      }
    } else {
      currentGame = null;
    }
  }

  rawPoints.forEach((rawPoint, pointListIndex) => {
    if (matchWinner !== null) {
      return;
    }
    if (!currentGame) {
      startGame();
    }

    const pointInGame = currentGame.points.length;
    const server = currentGame.isTiebreak
      ? getTiebreakServer(currentGame.server, pointInGame)
      : currentGame.server;
    const receiver = 1 - server;
    const winner = normalizeWinner(Number(rawPoint.winner));
    if (winner === null) {
      return;
    }
    const loser = 1 - winner;
    const isBreakChance = !currentGame.isTiebreak && isBreakPoint(currentGame.pointsWon, server);
    const scoreBeforeGamePoint = currentGame.isTiebreak
      ? [...currentGame.pointsWon]
      : getGameScoreLabel(currentGame.pointsWon[0], currentGame.pointsWon[1]);
    const netApproachPlayers = resolveNetApproachPlayers(rawPoint, winner, loser, server, receiver);
    const returnWinnerPlayers = resolveReturnWinnerPlayers(rawPoint, receiver);
    const shotType = normalizeShotType(rawPoint.shotType);
    const setBuckets = ensureSetBucket(statsBySet, currentSet.index);

    [statsOverall, setBuckets].forEach((bucketGroup) => {
      bucketGroup[winner].totalPointsWon += 1;
      bucketGroup[server].servicePoints += 1;
      bucketGroup[receiver].returnPoints += 1;
      bucketGroup[server].firstServeAttempts += 1;

      if (rawPoint.serveResult === "first_in" || rawPoint.serveResult === "ace") {
        bucketGroup[server].firstServeIn += 1;
        if (winner === server) {
          bucketGroup[server].firstServePointsWon += 1;
        }
      }

      if (rawPoint.serveResult === "second_in" || rawPoint.serveResult === "double_fault") {
        bucketGroup[server].secondServeAttempts += 1;
      }

      if (rawPoint.serveResult === "second_in") {
        bucketGroup[server].secondServeIn += 1;
        if (winner === server) {
          bucketGroup[server].secondServePointsWon += 1;
        }
      }

      if (rawPoint.serveResult === "ace") {
        bucketGroup[server].aces += 1;
      }

      if (rawPoint.serveResult === "double_fault") {
        bucketGroup[server].doubleFaults += 1;
      }

      if (rawPoint.outcome === "winner" && shotType && bucketGroup[winner].winners[shotType] !== undefined) {
        bucketGroup[winner].winners[shotType] += 1;
      }

      if (rawPoint.outcome === "unforced_error" && shotType && bucketGroup[loser].unforcedErrors[shotType] !== undefined) {
        bucketGroup[loser].unforcedErrors[shotType] += 1;
      }

      if (rawPoint.outcome === "forced_error") {
        bucketGroup[loser].forcedErrors += 1;
      }

      netApproachPlayers.forEach((playerIndex) => {
        bucketGroup[playerIndex].netPointsPlayed += 1;
        if (winner === playerIndex) {
          bucketGroup[playerIndex].netPointsWon += 1;
        }
      });

      returnWinnerPlayers.forEach((playerIndex) => {
        bucketGroup[playerIndex].returnWinners += 1;
      });

      if (isBreakChance) {
        bucketGroup[receiver].breakPointsOpportunities += 1;
        bucketGroup[server].breakPointsFaced += 1;
      }
    });

    currentGame.pointsWon[winner] += 1;
    const wonGame = currentGame.isTiebreak
      ? isTiebreakWon(currentGame.pointsWon[0], currentGame.pointsWon[1])
      : isGameWon(currentGame.pointsWon[0], currentGame.pointsWon[1]);
    const scoreAfterGamePoint = currentGame.isTiebreak
      ? [...currentGame.pointsWon]
      : getGameScoreLabel(currentGame.pointsWon[0], currentGame.pointsWon[1]);

    if (isBreakChance) {
      [statsOverall, setBuckets].forEach((bucketGroup) => {
        if (winner === receiver && wonGame) {
          bucketGroup[receiver].breakPointsConverted += 1;
        }
        if (winner === server) {
          bucketGroup[server].breakPointsSaved += 1;
        }
      });
    }

    currentGame.points.push({
      id: rawPoint.id,
      rawIndex: pointListIndex,
      setIndex: currentSet.index,
      gameIndex: currentGame.index,
      pointNumber: pointInGame + 1,
      server,
      receiver,
      winner,
      loser,
      scoreBefore: scoreBeforeGamePoint,
      scoreAfter: scoreAfterGamePoint,
      isBreakPoint: isBreakChance,
      netApproachPlayers,
      returnWinnerPlayers,
      ...rawPoint,
    });

    if (wonGame) {
      finalizeGame();
    }
  });

  if (currentSet.games.length && !sets.find((set) => set.index === currentSet.index)) {
    currentSet.score = [...currentSet.gamesWon];
    sets.push(currentSet);
  }

  const isComplete = matchWinner !== null;
  return {
    sets,
    setsWon,
    statsOverall,
    statsBySet,
    matchWinner,
    isComplete,
    liveSetIndex: currentSet.index,
    liveServer: currentGame
      ? currentGame.isTiebreak
        ? getTiebreakServer(currentGame.server, currentGame.points.length)
        : currentGame.server
      : nextGameServer,
    liveSetGames: currentSet.gamesWon,
    liveGamePoints: currentGame ? currentGame.pointsWon : [0, 0],
    liveGameIsTiebreak: Boolean(currentGame?.isTiebreak),
    liveScoreDisplay: currentGame
      ? currentGame.isTiebreak
        ? currentGame.pointsWon.map(String)
        : getGameScoreLabel(currentGame.pointsWon[0], currentGame.pointsWon[1])
      : currentSet.gamesWon[0] === 6 && currentSet.gamesWon[1] === 6
        ? ["0", "0"]
        : ["0", "0"],
    totalPoints: rawPoints.length,
  };
}

function createSetContainer(index) {
  return {
    index,
    games: [],
    gamesWon: [0, 0],
    score: [0, 0],
    winner: null,
    tiebreakScore: null,
  };
}

function currentMatch() {
  return state.matches.find((match) => match.id === state.currentMatchId) || null;
}

function derivedCurrentMatch() {
  const match = currentMatch();
  if (!match) {
    return null;
  }
  return {
    match,
    computed: computeMatch(match),
  };
}

async function refreshMatches() {
  state.matches = await db.matches.orderBy("updatedAt").reverse().toArray();
  if (!state.currentMatchId && state.matches[0]) {
    state.currentMatchId = state.matches[0].id;
  }
  if (state.currentMatchId && !state.matches.some((match) => match.id === state.currentMatchId)) {
    state.currentMatchId = state.matches[0]?.id || "";
  }
  if (state.currentMatchId) {
    localStorage.setItem(STORAGE_KEY, state.currentMatchId);
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

async function saveMatch(match) {
  match.updatedAt = new Date().toISOString();
  const computed = computeMatch(match);
  match.status = computed.isComplete ? "complete" : "in_progress";
  await db.matches.put(match);
  await refreshMatches();
}

async function deleteMatch(matchId) {
  await db.matches.delete(matchId);
  if (state.currentMatchId === matchId) {
    state.currentMatchId = "";
  }
  await refreshMatches();
  render();
}

function resetDrafts() {
  state.draft = createEmptyDraft();
  state.editor = {
    pointId: "",
    draft: createEmptyDraft(),
  };
}

async function bootstrap() {
  try {
    await refreshMatches();
  } catch (error) {
    console.error(error);
    state.error = "Unable to open local database.";
  } finally {
    state.loading = false;
    render();
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch((error) => console.error("SW registration failed", error));
  }
}

function encodeDataForExport(match) {
  const computed = computeMatch(match);
  return {
    match: {
      id: match.id,
      playerA: match.playerA,
      playerB: match.playerB,
      status: match.status,
      date: match.date,
      initialServer: playerName(match, match.initialServer),
      format: match.format,
    },
    summary: {
      setsWon: computed.setsWon,
      totalPoints: computed.totalPoints,
      winner: computed.matchWinner === null ? null : playerName(match, computed.matchWinner),
    },
    sets: computed.sets.map((set) => ({
      index: set.index + 1,
      score: set.score,
      winner: set.winner === null ? null : playerName(match, set.winner),
      tiebreakScore: set.tiebreakScore,
      games: set.games.map((game) => ({
        index: game.index + 1,
        server: playerName(match, game.server),
        isTiebreak: game.isTiebreak,
        scoreBefore: game.scoreBefore,
        scoreAfter: game.scoreAfter,
        winner: playerName(match, game.winner),
        points: game.points.map((point) => ({
          pointNumber: point.pointNumber,
          server: playerName(match, point.server),
          receiver: playerName(match, point.receiver),
          winner: playerName(match, point.winner),
          scoreBefore: point.scoreBefore,
          scoreAfter: point.scoreAfter,
          serveResult: point.serveResult,
          outcome: point.outcome,
          shotType: normalizeShotType(point.shotType),
          netApproach: point.netApproach,
          netApproachPlayers: point.netApproachPlayers.map((index) => playerName(match, index)),
          returnWinner: point.returnWinner,
          returnWinnerPlayers: point.returnWinnerPlayers.map((index) => playerName(match, index)),
          isBreakPoint: point.isBreakPoint,
        })),
      })),
    })),
    statsOverall: computed.statsOverall,
    statsBySet: computed.statsBySet,
  };
}

function makeCsv(match) {
  const computed = computeMatch(match);
  const rows = [
    [
      "set",
      "game",
      "point",
      "tiebreak",
      "server",
      "receiver",
      "winner",
      "serve_result",
      "outcome",
      "shot_type",
      "score_before",
      "score_after",
      "break_point",
      "net_approach",
      "net_players",
      "return_winner",
      "return_winner_players",
    ],
  ];

  computed.sets.forEach((set) => {
    set.games.forEach((game) => {
      game.points.forEach((point) => {
        rows.push([
          set.index + 1,
          game.index + 1,
          point.pointNumber,
          game.isTiebreak ? "yes" : "no",
          playerName(match, point.server),
          playerName(match, point.receiver),
          playerName(match, point.winner),
          point.serveResult,
          point.outcome,
          normalizeShotType(point.shotType),
          Array.isArray(point.scoreBefore) ? point.scoreBefore.join("-") : point.scoreBefore,
          Array.isArray(point.scoreAfter) ? point.scoreAfter.join("-") : point.scoreAfter,
          point.isBreakPoint ? "yes" : "no",
          point.netApproachPlayers.length ? "yes" : "no",
          formatPlayerList(match, point.netApproachPlayers),
          point.returnWinnerPlayers.length ? "yes" : "no",
          formatPlayerList(match, point.returnWinnerPlayers),
        ]);
      });
    });
  });

  return rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`)
        .join(",")
    )
    .join("\n");
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function validateImportedPoint(point) {
  if (!point || typeof point !== "object") {
    throw new Error("Invalid point record.");
  }
  if (typeof point.id !== "string" || !point.id) {
    throw new Error("Imported point is missing an id.");
  }
  if (!SERVE_OPTIONS.some((option) => option.value === point.serveResult)) {
    throw new Error("Imported point has an invalid serve result.");
  }
  const winner = Number(point.winner);
  if (winner !== 0 && winner !== 1) {
    throw new Error("Imported point has an invalid winner.");
  }
  if (point.outcome !== "" && !OUTCOME_OPTIONS.some((option) => option.value === point.outcome)) {
    throw new Error("Imported point has an invalid outcome.");
  }
  if (point.shotType !== "" && point.shotType !== undefined && !SHOT_OPTIONS.includes(point.shotType)) {
    throw new Error("Imported point has an invalid shot type.");
  }
  return {
    id: crypto.randomUUID(),
    serveResult: point.serveResult,
    outcome: point.outcome || "",
    shotType: normalizeShotType(point.shotType),
    winner,
    netApproach: Boolean(point.netApproach),
    netApproachPlayers: sanitizePlayerIndexes(point.netApproachPlayers),
    returnWinner: Boolean(point.returnWinner),
    returnWinnerPlayers: sanitizePlayerIndexes(point.returnWinnerPlayers),
    timestamp: typeof point.timestamp === "string" && point.timestamp ? point.timestamp : new Date().toISOString(),
  };
}

function createImportedMatch({ playerA, playerB, initialServer, points }) {
  const timestamp = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    importedAt: timestamp,
    date: timestamp,
    status: "in_progress",
    format: "best_of_3",
    playerA: playerA.trim(),
    playerB: playerB.trim(),
    initialServer,
    points,
  };
}

function validateImportedMatchShape(match) {
  if (!match || typeof match !== "object") {
    throw new Error("Invalid match payload.");
  }
  if (typeof match.id !== "string" || !match.id) {
    throw new Error("Imported match is missing an id.");
  }
  if (typeof match.playerA !== "string" || !match.playerA.trim() || typeof match.playerB !== "string" || !match.playerB.trim()) {
    throw new Error("Imported match must include both player names.");
  }
  if (!Array.isArray(match.points)) {
    throw new Error("Imported match is missing a points array.");
  }
}

function parsePlayerList(value, nameToIndex) {
  if (!value.trim()) {
    return [];
  }
  return [...new Set(
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((name) => {
        if (!nameToIndex.has(name)) {
          throw new Error(`Unknown player "${name}" in CSV import.`);
        }
        return nameToIndex.get(name);
      })
  )];
}

function parseCsv(text) {
  const rows = [];
  let cell = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((entry) => entry.some((value) => value !== ""));
}

function importMatchFromJson(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON file.");
  }

  if (!payload || typeof payload !== "object" || !payload.match || !Array.isArray(payload.sets)) {
    throw new Error("JSON does not match the exported match format.");
  }
  if (typeof payload.match.id !== "string" || !payload.match.id) {
    throw new Error("JSON export is missing the original match id.");
  }

  const playerA = String(payload.match.playerA || "").trim();
  const playerB = String(payload.match.playerB || "").trim();
  if (!playerA || !playerB) {
    throw new Error("JSON export is missing player names.");
  }

  const playerLookup = new Map([
    [playerA, 0],
    [playerB, 1],
  ]);
  const initialServerName = payload.match.initialServer;
  if (!playerLookup.has(initialServerName)) {
    throw new Error("JSON export has an invalid initial server.");
  }

  const points = [];
  payload.sets.forEach((set, setIndex) => {
    if (!set || typeof set !== "object" || !Array.isArray(set.games)) {
      throw new Error(`JSON export is missing games for set ${setIndex + 1}.`);
    }
    set.games.forEach((game, gameIndex) => {
      if (!game || typeof game !== "object" || !Array.isArray(game.points)) {
        throw new Error(`JSON export is missing points for set ${setIndex + 1}, game ${gameIndex + 1}.`);
      }
      game.points.forEach((point) => {
        if (!playerLookup.has(point.winner)) {
          throw new Error("JSON export contains an unknown point winner.");
        }
        points.push(validateImportedPoint({
          id: point.id || crypto.randomUUID(),
          serveResult: point.serveResult,
          outcome: point.outcome || "",
          shotType: point.shotType || "",
          winner: playerLookup.get(point.winner),
          netApproach: point.netApproach,
          netApproachPlayers: Array.isArray(point.netApproachPlayers)
            ? point.netApproachPlayers.map((name) => {
              if (!playerLookup.has(name)) {
                throw new Error(`Unknown net approach player "${name}" in JSON import.`);
              }
              return playerLookup.get(name);
            })
            : [],
          returnWinner: point.returnWinner,
          returnWinnerPlayers: Array.isArray(point.returnWinnerPlayers)
            ? point.returnWinnerPlayers.map((name) => {
              if (!playerLookup.has(name)) {
                throw new Error(`Unknown return winner player "${name}" in JSON import.`);
              }
              return playerLookup.get(name);
            })
            : [],
        }));
      });
    });
  });

  const importedMatch = createImportedMatch({
    playerA,
    playerB,
    initialServer: playerLookup.get(initialServerName),
    points,
  });
  validateImportedMatchShape(importedMatch);
  return importedMatch;
}

function importMatchFromCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) {
    throw new Error("CSV file is empty.");
  }

  const headers = rows[0];
  const expectedHeaders = [
    "set",
    "game",
    "point",
    "tiebreak",
    "server",
    "receiver",
    "winner",
    "serve_result",
    "outcome",
    "shot_type",
    "score_before",
    "score_after",
    "break_point",
    "net_approach",
    "net_players",
    "return_winner",
    "return_winner_players",
  ];
  if (headers.length !== expectedHeaders.length || headers.some((header, index) => header !== expectedHeaders[index])) {
    throw new Error("CSV does not match the exported match format.");
  }
  if (rows.length < 2) {
    throw new Error("CSV export has no point rows to import.");
  }

  const records = rows.slice(1).map((row) => {
    if (row.length !== headers.length) {
      throw new Error("CSV row has an unexpected number of columns.");
    }
    return Object.fromEntries(headers.map((header, index) => [header, row[index]]));
  });

  const firstRecord = records[0];
  const playerA = firstRecord.server?.trim();
  const playerB = firstRecord.receiver?.trim();
  if (!playerA || !playerB || playerA === playerB) {
    throw new Error("CSV export does not contain valid player names.");
  }

  const playerLookup = new Map([
    [playerA, 0],
    [playerB, 1],
  ]);
  records.forEach((record) => {
    ["server", "receiver", "winner"].forEach((field) => {
      const name = record[field]?.trim();
      if (!playerLookup.has(name)) {
        throw new Error(`Unknown player "${name}" in CSV import.`);
      }
    });
  });

  const points = records
    .sort((a, b) =>
      Number(a.set) - Number(b.set) ||
      Number(a.game) - Number(b.game) ||
      Number(a.point) - Number(b.point)
    )
    .map((record) => validateImportedPoint({
      id: crypto.randomUUID(),
      serveResult: record.serve_result,
      outcome: record.outcome,
      shotType: record.shot_type,
      winner: playerLookup.get(record.winner.trim()),
      netApproach: record.net_approach === "yes",
      netApproachPlayers: parsePlayerList(record.net_players, playerLookup),
      returnWinner: record.return_winner === "yes",
      returnWinnerPlayers: parsePlayerList(record.return_winner_players, playerLookup),
    }));

  const importedMatch = createImportedMatch({
    playerA,
    playerB,
    initialServer: playerLookup.get(firstRecord.server.trim()),
    points,
  });
  validateImportedMatchShape(importedMatch);
  return importedMatch;
}

async function finalizeImportedMatch(match) {
  await saveMatch(match);
  state.currentMatchId = match.id;
  localStorage.setItem(STORAGE_KEY, match.id);
  state.currentTab = "live";
  state.error = "";
  state.exportMessage = "";
  resetDrafts();
  setNotice("Match imported successfully", "success");
  render();
}

function openImportPicker() {
  const input = document.querySelector("#match-import-input");
  if (!input) {
    return;
  }
  input.value = "";
  input.click();
}

async function importMatchFile(file) {
  if (!file) {
    return;
  }
  const name = file.name.toLowerCase();
  const text = await file.text();
  const importedMatch = name.endsWith(".json")
    ? importMatchFromJson(text)
    : name.endsWith(".csv")
      ? importMatchFromCsv(text)
      : null;

  if (!importedMatch) {
    throw new Error("Choose a JSON or CSV export file.");
  }

  await finalizeImportedMatch(importedMatch);
}

async function exportMatch(kind) {
  const view = derivedCurrentMatch();
  if (!view) {
    return;
  }
  const slug = `${view.match.playerA}-vs-${view.match.playerB}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  if (kind === "json") {
    downloadFile(`${slug || "match"}.json`, JSON.stringify(encodeDataForExport(view.match), null, 2), "application/json");
    state.exportMessage = "JSON exported.";
  }
  if (kind === "csv") {
    downloadFile(`${slug || "match"}.csv`, makeCsv(view.match), "text/csv;charset=utf-8");
    state.exportMessage = "CSV exported.";
  }
  if (kind === "share") {
    const payload = {
      title: `${view.match.playerA} vs ${view.match.playerB}`,
      text: `${view.match.playerA} vs ${view.match.playerB} tennis match export`,
      files: [
        new File([JSON.stringify(encodeDataForExport(view.match), null, 2)], `${slug || "match"}.json`, {
          type: "application/json",
        }),
      ],
    };
    if (navigator.canShare && navigator.canShare({ files: payload.files })) {
      try {
        await navigator.share(payload);
        state.exportMessage = "Match shared.";
      } catch (error) {
        if (error.name !== "AbortError") {
          state.exportMessage = "Share failed.";
        }
      }
    } else if (navigator.share) {
      try {
        await navigator.share({
          title: payload.title,
          text: payload.text,
        });
        state.exportMessage = "Share sheet opened.";
      } catch (error) {
        if (error.name !== "AbortError") {
          state.exportMessage = "Share failed.";
        }
      }
    } else {
      state.exportMessage = "Web Share is not available on this device.";
    }
  }
  render();
}

function validatePointDraft(draft, computed) {
  if (!draft.serveResult) {
    return "Select a serve result.";
  }
  const server = computed.liveServer;
  const receiver = 1 - server;
  if (draft.serveResult === "ace") {
    draft.winner = String(server);
    draft.outcome = "";
    draft.shotType = "";
    draft.netApproachStates = createEmptyFlagStates();
    draft.returnWinnerStates = createEmptyFlagStates();
  }
  if (draft.serveResult === "double_fault") {
    draft.winner = String(receiver);
    draft.outcome = "";
    draft.shotType = "";
    draft.netApproachStates = createEmptyFlagStates();
    draft.returnWinnerStates = createEmptyFlagStates();
  }
  if (draft.serveResult !== "ace" && draft.serveResult !== "double_fault") {
    if (!draft.outcome) {
      return "Select the point outcome.";
    }
    if (draft.winner === "") {
      return "Select who won the point.";
    }
  }
  if (flagStatesToPlayers(draft.returnWinnerStates).length && draft.outcome !== "winner") {
    return "Return winner only applies to winner outcomes.";
  }
  return "";
}

async function createMatchFromSetup() {
  const playerA = state.setup.playerA.trim();
  const playerB = state.setup.playerB.trim();
  if (!playerA || !playerB) {
    state.error = "Enter both player names.";
    render();
    return;
  }
  const match = createMatchRecord({
    playerA,
    playerB,
    initialServer: Number(state.setup.initialServer),
  });
  await saveMatch(match);
  state.currentMatchId = match.id;
  localStorage.setItem(STORAGE_KEY, match.id);
  state.currentTab = "live";
  resetDrafts();
  state.error = "";
  render();
}

async function addPoint() {
  const view = derivedCurrentMatch();
  if (!view) {
    state.error = "Start a match first.";
    render();
    return;
  }
  const draft = structuredClone(state.draft);
  const error = validatePointDraft(draft, view.computed);
  if (error) {
    state.error = error;
    render();
    return;
  }
  view.match.points.push({
    id: crypto.randomUUID(),
    serveResult: draft.serveResult,
    outcome: draft.outcome,
    shotType: normalizeShotType(draft.shotType),
    winner: Number(draft.winner),
    netApproach: flagStatesToPlayers(draft.netApproachStates).length > 0,
    netApproachPlayers: flagStatesToPlayers(draft.netApproachStates),
    returnWinner: flagStatesToPlayers(draft.returnWinnerStates).length > 0,
    returnWinnerPlayers: flagStatesToPlayers(draft.returnWinnerStates),
    timestamp: new Date().toISOString(),
  });
  await saveMatch(view.match);
  state.error = "";
  state.exportMessage = "";
  state.history = {
    setIndex: 0,
    gameIndex: 0,
  };
  state.draft = createEmptyDraft();
  render();
}

function findPointById(match, pointId) {
  return match.points.find((point) => point.id === pointId) || null;
}

async function savePointEdit() {
  const view = derivedCurrentMatch();
  if (!view || !state.editor.pointId) {
    return;
  }
  const pointIndex = view.match.points.findIndex((point) => point.id === state.editor.pointId);
  if (pointIndex < 0) {
    return;
  }
  const draft = structuredClone(state.editor.draft);
  const original = view.match.points[pointIndex];
  const derivedPoint = flattenPoints(view.computed).find((point) => point.id === original.id);
  const server = derivedPoint?.server;
  const receiver = server === undefined ? null : 1 - server;

  if (!draft.serveResult) {
    state.error = "Select a serve result.";
    render();
    return;
  }
  if (draft.serveResult === "ace") {
    draft.winner = String(server);
    draft.outcome = "";
    draft.shotType = "";
    draft.netApproachStates = createEmptyFlagStates();
    draft.returnWinnerStates = createEmptyFlagStates();
  } else if (draft.serveResult === "double_fault") {
    draft.winner = String(receiver);
    draft.outcome = "";
    draft.shotType = "";
    draft.netApproachStates = createEmptyFlagStates();
    draft.returnWinnerStates = createEmptyFlagStates();
  } else {
    if (!draft.outcome || draft.winner === "") {
      state.error = "Complete all required point fields.";
      render();
      return;
    }
  }
  if (flagStatesToPlayers(draft.returnWinnerStates).length && draft.outcome !== "winner") {
    state.error = "Return winner only applies to winner outcomes.";
    render();
    return;
  }

  view.match.points[pointIndex] = {
    ...original,
    serveResult: draft.serveResult,
    outcome: draft.outcome,
    shotType: normalizeShotType(draft.shotType),
    winner: Number(draft.winner),
    netApproach: flagStatesToPlayers(draft.netApproachStates).length > 0,
    netApproachPlayers: flagStatesToPlayers(draft.netApproachStates),
    returnWinner: flagStatesToPlayers(draft.returnWinnerStates).length > 0,
    returnWinnerPlayers: flagStatesToPlayers(draft.returnWinnerStates),
  };
  await saveMatch(view.match);
  resetDrafts();
  state.error = "";
  render();
}

async function deletePoint(pointId) {
  const view = derivedCurrentMatch();
  if (!view) {
    return;
  }
  const target = view.match.points.findIndex((point) => point.id === pointId);
  if (target < 0) {
    return;
  }
  if (!window.confirm("Delete this point?")) {
    return;
  }
  view.match.points.splice(target, 1);
  await saveMatch(view.match);
  resetDrafts();
  render();
}

function openEditor(pointId) {
  const view = derivedCurrentMatch();
  const point = view?.match ? findPointById(view.match, pointId) : null;
  const derivedPoint = view ? flattenPoints(view.computed).find((entry) => entry.id === pointId) : null;
  if (!point || !derivedPoint) {
    return;
  }
  state.editor.pointId = pointId;
  state.editor.draft = {
    serveResult: point.serveResult,
    outcome: point.outcome,
    shotType: point.shotType === "serve" ? "" : normalizeShotType(point.shotType),
    winner: String(point.winner),
    netApproachStates: playersToFlagStates(derivedPoint.netApproachPlayers),
    returnWinnerStates: playersToFlagStates(derivedPoint.returnWinnerPlayers),
  };
  render();
}

function closeEditor() {
  resetDrafts();
  render();
}

function setActiveMatch(matchId) {
  state.currentMatchId = matchId;
  localStorage.setItem(STORAGE_KEY, matchId);
  state.currentTab = "live";
  state.exportMessage = "";
  resetDrafts();
  render();
}

function setHistoryFocus(setIndex, gameIndex) {
  state.history = { setIndex, gameIndex };
  render();
}

function setDraftValue(target, key, value) {
  state[target][key] = value;
  if (key === "serveResult") {
    if (value === "ace" || value === "double_fault") {
      state[target].outcome = "";
      state[target].shotType = "";
      state[target].netApproachStates = createEmptyFlagStates();
      state[target].returnWinnerStates = createEmptyFlagStates();
    }
  }
  render();
}

function updateEditorDraft(key, value) {
  state.editor.draft[key] = value;
  if (key === "serveResult" && (value === "ace" || value === "double_fault")) {
    state.editor.draft.outcome = "";
    state.editor.draft.shotType = "";
    state.editor.draft.netApproachStates = createEmptyFlagStates();
    state.editor.draft.returnWinnerStates = createEmptyFlagStates();
  }
  render();
}

function updateFlagState(flagStates, playerIndex, value) {
  const next = sanitizeFlagStates(flagStates);
  const key = String(playerIndex);
  next[key] = next[key] === value ? "" : value;
  return next;
}

function renderMetric(title, value, detail = "") {
  return `
    <div class="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p class="text-xs uppercase tracking-[0.24em] text-court-300/70">${title}</p>
      <p class="mt-2 font-mono text-2xl text-white">${value}</p>
      ${detail ? `<p class="mt-1 text-sm text-court-200/60">${detail}</p>` : ""}
    </div>
  `;
}

function renderPointComposer(match, computed, draft, prefix, context = null) {
  const serverIndex = context?.server ?? computed.liveServer;
  const receiverIndex = context?.receiver ?? 1 - serverIndex;
  const serverName = playerName(match, serverIndex);
  const receiverName = playerName(match, receiverIndex);
  const aceOrDf = draft.serveResult === "ace" || draft.serveResult === "double_fault";
  const submitLabel = prefix === "edit" ? "Save Point Changes" : "Submit Point";
  return `
    <section class="rounded-[2rem] border border-white/10 bg-court-900/80 p-4 shadow-panel backdrop-blur">
      <div>
        <div>
          <p class="text-xs uppercase tracking-[0.3em] text-court-300/70">Point Entry</p>
          <p class="mt-2 text-sm text-court-200/70">Server: <span class="font-semibold text-white">${serverName}</span> · Returner: <span class="font-semibold text-white">${receiverName}</span></p>
        </div>
      </div>
      <div class="mt-5 space-y-5">
        ${renderChoiceGrid("Serve Result", SERVE_OPTIONS, draft.serveResult, `${prefix}-serve`, "grid-cols-2")}
        ${!aceOrDf ? renderChoiceGrid("Who Won The Point", [{ value: "0", label: match.playerA }, { value: "1", label: match.playerB }], draft.winner, `${prefix}-winner`, "grid-cols-2") : ""}
        ${!aceOrDf ? renderChoiceGrid("Point Outcome", OUTCOME_OPTIONS, draft.outcome, `${prefix}-outcome`, "grid-cols-2") : ""}
        ${!aceOrDf ? renderChoiceGrid("Shot Type (Optional)", [{ value: "", label: "None" }, ...SHOT_OPTIONS.map((value) => ({ value, label: shotLabel(value) }))], draft.shotType, `${prefix}-shot`, "grid-cols-2") : ""}
        <div>
          <p class="mb-3 text-xs uppercase tracking-[0.3em] text-court-300/70">Optional Flags</p>
          <p class="mb-3 text-sm text-court-200/60">Leave both buttons unselected if the point should not record this flag.</p>
          <div class="space-y-4">
            ${renderPlayerToggleSection(prefix, "netApproachStates", "Net Approach", match, draft.netApproachStates)}
            ${renderPlayerToggleSection(prefix, "returnWinnerStates", "Return Winner", match, draft.returnWinnerStates)}
          </div>
        </div>
        <button data-action="${prefix}-save" class="w-full rounded-2xl bg-emerald-500 px-5 py-5 text-base font-semibold text-emerald-950 transition hover:bg-emerald-400">
          ${submitLabel}
        </button>
      </div>
    </section>
  `;
}

function renderChoiceGrid(label, options, selected, action, gridClass) {
  return `
    <div>
      <p class="mb-3 text-xs uppercase tracking-[0.3em] text-court-300/70">${label}</p>
      <div class="grid gap-3 ${gridClass}">
        ${options
          .map((option) => {
            const active = String(selected) === String(option.value);
            return `
              <button
                data-action="${action}"
                data-value="${option.value}"
                class="min-h-14 rounded-2xl border px-4 py-4 text-sm font-medium transition ${
                  active
                    ? "border-court-300 bg-court-300 text-court-950"
                    : "border-white/10 bg-white/5 text-court-100 hover:border-court-400/70"
                }"
              >
                ${option.label}
              </button>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function renderPlayerToggleSection(prefix, key, label, match, flagStates) {
  const states = sanitizeFlagStates(flagStates);
  return `
    <div class="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
      <p class="text-sm font-semibold text-white">${label}</p>
      <div class="mt-4 space-y-3">
        ${[0, 1]
          .map((playerIndex) => {
            const selectedState = states[playerIndex] || "";
            return `
              <div class="flex items-center justify-between gap-3">
                <p class="text-sm text-court-100">${escapeHtml(playerName(match, playerIndex))}</p>
                <div class="grid grid-cols-2 gap-2">
                  <button
                    data-action="${prefix}-player-flag"
                    data-key="${key}"
                    data-player="${playerIndex}"
                    data-value="yes"
                    class="min-w-20 rounded-xl border px-4 py-2 text-sm font-medium transition ${
                      selectedState === "yes"
                        ? "border-emerald-400 bg-emerald-500/15 text-emerald-300"
                        : "border-white/10 bg-court-950/40 text-court-100"
                    }"
                  >
                    Yes
                  </button>
                  <button
                    data-action="${prefix}-player-flag"
                    data-key="${key}"
                    data-player="${playerIndex}"
                    data-value="no"
                    class="min-w-20 rounded-xl border px-4 py-2 text-sm font-medium transition ${
                      selectedState === "no"
                        ? "border-red-400/40 bg-red-500/10 text-red-200"
                        : "border-white/10 bg-court-950/40 text-court-100"
                    }"
                  >
                    No
                  </button>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function renderSetup() {
  const recent = state.matches.slice(0, 4);
  return `
    <main class="px-4 py-6 sm:px-6">
      <section class="rounded-[2rem] border border-white/10 bg-court-900/80 p-6 shadow-panel backdrop-blur">
        <p class="text-xs uppercase tracking-[0.35em] text-court-300/70">Tennis Tracker</p>
        <h1 class="mt-3 text-3xl font-bold text-white">Start a match and log every point courtside.</h1>
        <p class="mt-3 max-w-2xl text-sm text-court-200/70">Offline-first scoring, full point history, per-set stats, and one-tap exports.</p>
        <div class="mt-6 grid gap-4 sm:grid-cols-2">
          <label class="rounded-2xl border border-white/10 bg-white/5 p-4">
            <span class="text-xs uppercase tracking-[0.3em] text-court-300/70">Player One</span>
            <input data-action="setup-input" data-key="playerA" value="${escapeHtml(state.setup.playerA)}" class="mt-3 w-full bg-transparent text-lg text-white outline-none placeholder:text-court-200/35" placeholder="Player A" />
          </label>
          <label class="rounded-2xl border border-white/10 bg-white/5 p-4">
            <span class="text-xs uppercase tracking-[0.3em] text-court-300/70">Player Two</span>
            <input data-action="setup-input" data-key="playerB" value="${escapeHtml(state.setup.playerB)}" class="mt-3 w-full bg-transparent text-lg text-white outline-none placeholder:text-court-200/35" placeholder="Player B" />
          </label>
        </div>
        <div class="mt-5">
          ${renderChoiceGrid(
            "First Server",
            [
              { value: "0", label: state.setup.playerA || "Player A" },
              { value: "1", label: state.setup.playerB || "Player B" },
            ],
            String(state.setup.initialServer),
            "setup-server",
            "grid-cols-2"
          )}
        </div>
        <button data-action="start-match" class="mt-6 w-full rounded-2xl bg-court-300 px-5 py-5 text-base font-semibold text-court-950 transition hover:bg-court-200">
          Start Match
        </button>
      </section>
      ${
        recent.length
          ? `<section class="mt-6 rounded-[2rem] border border-white/10 bg-court-900/70 p-6">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-xs uppercase tracking-[0.3em] text-court-300/70">Recent Matches</p>
                  <p class="mt-2 text-sm text-court-200/70">Pick up where you left off.</p>
                </div>
                <button data-action="tab" data-tab="matches" class="rounded-xl border border-white/10 px-4 py-3 text-sm text-court-100">All Matches</button>
              </div>
              <div class="mt-4 space-y-3">
                ${recent
                  .map(
                    (match) => `
                    <button data-action="select-match" data-id="${match.id}" class="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-left">
                      <div>
                        <p class="font-semibold text-white">${escapeHtml(match.playerA)} vs ${escapeHtml(match.playerB)}</p>
                        <p class="mt-1 text-sm text-court-200/60">${formatDate(match.updatedAt)}</p>
                      </div>
                      <span class="rounded-full px-3 py-1 text-xs uppercase tracking-[0.2em] ${match.status === "complete" ? "bg-court-300/15 text-court-300" : "bg-clay-500/15 text-clay-400"}">${match.status.replace("_", " ")}</span>
                    </button>
                  `
                  )
                  .join("")}
              </div>
            </section>`
          : ""
      }
    </main>
  `;
}

function renderLive(view) {
  const { match, computed } = view;
  const setCards = [0, 1, 2]
    .map((setIndex) => {
      const set = computed.sets.find((entry) => entry.index === setIndex);
      const games = set ? set.score : setIndex === computed.liveSetIndex ? computed.liveSetGames : [0, 0];
      return `
        <div class="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p class="text-xs uppercase tracking-[0.25em] text-court-300/60">Set ${setIndex + 1}</p>
          <div class="mt-3 grid grid-cols-2 gap-2 text-center font-mono text-2xl text-white">
            <span>${games[0]}</span>
            <span>${games[1]}</span>
          </div>
        </div>
      `;
    })
    .join("");
  const winnerBanner =
    computed.matchWinner !== null
      ? `<div class="mt-4 rounded-2xl border border-court-300/30 bg-court-300/10 px-4 py-3 text-sm text-court-200">Match complete. <span class="font-semibold text-white">${playerName(match, computed.matchWinner)}</span> wins.</div>`
      : "";

  return `
    <section class="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <div class="space-y-5">
        ${
          computed.matchWinner === null
            ? renderPointComposer(match, computed, state.draft, "draft")
            : `<section class="rounded-[2rem] border border-white/10 bg-court-900/80 p-5 text-sm text-court-200/70">
                Start a new match from the matches tab or export this result below.
              </section>`
        }
        <section class="rounded-[2rem] border border-white/10 bg-court-900/85 p-5 shadow-panel backdrop-blur">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-xs uppercase tracking-[0.3em] text-court-300/70">Live Score</p>
              <h2 class="mt-2 text-2xl font-bold text-white">${escapeHtml(match.playerA)} <span class="text-court-300/60">vs</span> ${escapeHtml(match.playerB)}</h2>
              <p class="mt-2 text-sm text-court-200/65">${formatDate(match.date)} · Best of 3 sets</p>
            </div>
            <div class="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-right">
              <p class="text-xs uppercase tracking-[0.25em] text-court-300/60">Server</p>
              <p class="mt-1 text-base font-semibold text-white">${playerName(match, computed.liveServer)}</p>
            </div>
          </div>
          ${winnerBanner}
          <div class="mt-5 grid gap-3 sm:grid-cols-3">${setCards}</div>
          <div class="mt-5 rounded-[1.75rem] border border-white/10 bg-court-950/70 p-5">
            <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
              <div>
                <p class="text-sm uppercase tracking-[0.22em] text-court-300/60">${escapeHtml(match.playerA)}</p>
                <p class="mt-3 font-mono text-5xl font-semibold text-white">${computed.liveScoreDisplay[0]}</p>
              </div>
              <span class="text-court-300/30">:</span>
              <div>
                <p class="text-sm uppercase tracking-[0.22em] text-court-300/60">${escapeHtml(match.playerB)}</p>
                <p class="mt-3 font-mono text-5xl font-semibold text-white">${computed.liveScoreDisplay[1]}</p>
              </div>
            </div>
            <p class="mt-4 text-center text-sm text-court-200/65">${computed.liveGameIsTiebreak ? "Tiebreak in progress" : "Current game score"}</p>
          </div>
        </section>
      </div>
      <div class="space-y-5">
        <section class="rounded-[2rem] border border-white/10 bg-court-900/80 p-5">
          <p class="text-xs uppercase tracking-[0.3em] text-court-300/70">Match Summary</p>
          <div class="mt-4 grid gap-3">
            ${renderMetric("Sets Won", `${computed.setsWon[0]} - ${computed.setsWon[1]}`)}
            ${renderMetric("Games In Set", `${computed.liveSetGames[0]} - ${computed.liveSetGames[1]}`, `Set ${computed.liveSetIndex + 1}`)}
            ${renderMetric("Points Logged", String(computed.totalPoints))}
          </div>
        </section>
        <section class="rounded-[2rem] border border-white/10 bg-court-900/80 p-5">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-xs uppercase tracking-[0.3em] text-court-300/70">Export</p>
              <p class="mt-2 text-sm text-court-200/65">Download or share the current match.</p>
            </div>
            ${state.exportMessage ? `<span class="text-xs text-court-300">${escapeHtml(state.exportMessage)}</span>` : ""}
          </div>
          <div class="mt-4 grid gap-3">
            <button data-action="export" data-kind="json" class="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-left text-sm font-medium text-white">Export JSON</button>
            <button data-action="export" data-kind="csv" class="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-left text-sm font-medium text-white">Export CSV</button>
            <button data-action="export" data-kind="share" class="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-left text-sm font-medium text-white ${state.shareSupported ? "" : "opacity-60"}">Share</button>
          </div>
        </section>
      </div>
    </section>
  `;
}

function renderHistory(view) {
  const { match, computed } = view;
  const set = computed.sets.find((entry) => entry.index === state.history.setIndex) || computed.sets[0];
  const game = set?.games.find((entry) => entry.index === state.history.gameIndex) || set?.games[0];
  const allSets = computed.sets.length ? computed.sets : [createSetContainer(0)];

  return `
    <section class="grid gap-5 lg:grid-cols-[320px_1fr]">
      <aside class="space-y-5">
        <section class="rounded-[2rem] border border-white/10 bg-court-900/80 p-5">
          <p class="text-xs uppercase tracking-[0.3em] text-court-300/70">Sets & Games</p>
          <div class="mt-4 space-y-4">
            ${allSets
              .map(
                (setEntry) => `
                <div>
                  <p class="mb-2 text-sm font-semibold text-white">Set ${setEntry.index + 1} · ${setEntry.score[0]}-${setEntry.score[1]}${setEntry.tiebreakScore ? ` TB ${setEntry.tiebreakScore[0]}-${setEntry.tiebreakScore[1]}` : ""}</p>
                  <div class="space-y-2">
                    ${
                      setEntry.games.length
                        ? setEntry.games
                            .map((gameEntry) => {
                              const active = setEntry.index === set.index && gameEntry.index === game.index;
                              return `
                                <button data-action="history-game" data-set="${setEntry.index}" data-game="${gameEntry.index}" class="flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm ${
                                  active ? "border-court-300 bg-court-300/10 text-white" : "border-white/10 bg-white/5 text-court-100"
                                }">
                                  <span>Game ${gameEntry.index + 1}${gameEntry.isTiebreak ? " · TB" : ""}</span>
                                  <span>${playerName(match, gameEntry.server)} serves</span>
                                </button>
                              `;
                            })
                            .join("")
                        : `<p class="rounded-2xl border border-dashed border-white/10 px-4 py-3 text-sm text-court-200/50">No games logged.</p>`
                    }
                  </div>
                </div>
              `
              )
              .join("")}
          </div>
        </section>
      </aside>
      <section class="rounded-[2rem] border border-white/10 bg-court-900/80 p-5">
        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="text-xs uppercase tracking-[0.3em] text-court-300/70">Point History</p>
            <h3 class="mt-2 text-xl font-semibold text-white">${set ? `Set ${set.index + 1}` : "Set 1"}${game ? ` · Game ${game.index + 1}` : ""}</h3>
          </div>
          ${game ? `<span class="rounded-full bg-white/5 px-4 py-2 text-sm text-court-200/70">${game.isTiebreak ? "Tiebreak" : "Standard game"}</span>` : ""}
        </div>
        <div class="mt-5 space-y-3">
          ${
            game?.points.length
              ? game.points
                  .map(
                    (point) => `
                    <article class="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div class="flex items-start justify-between gap-4">
                        <div>
                          <p class="font-semibold text-white">Point ${point.pointNumber} · ${playerName(match, point.winner)} won</p>
                          <p class="mt-1 text-sm text-court-200/65">${pointDescription(point)}</p>
                          <p class="mt-2 text-sm text-court-200/65">Score ${Array.isArray(point.scoreBefore) ? point.scoreBefore.join("-") : point.scoreBefore} → ${Array.isArray(point.scoreAfter) ? point.scoreAfter.join("-") : point.scoreAfter}</p>
                          <p class="mt-2 text-sm text-court-200/55">${playerName(match, point.server)} served${point.isBreakPoint ? " · Break point" : ""}${point.returnWinnerPlayers.length ? ` · Return winner: ${formatPlayerList(match, point.returnWinnerPlayers)}` : ""}${point.netApproachPlayers.length ? ` · Net: ${formatPlayerList(match, point.netApproachPlayers)}` : ""}</p>
                        </div>
                        <div class="flex gap-2">
                          <button data-action="edit-point" data-id="${point.id}" class="rounded-xl border border-white/10 px-3 py-2 text-sm text-court-100">Edit</button>
                          <button data-action="delete-point" data-id="${point.id}" class="rounded-xl border border-red-400/30 px-3 py-2 text-sm text-red-300">Delete</button>
                        </div>
                      </div>
                    </article>
                  `
                  )
                  .join("")
              : `<div class="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-court-200/55">No points in this game yet.</div>`
          }
        </div>
      </section>
    </section>
  `;
}

function renderStatsTable(match, stats) {
  const players = [match.playerA, match.playerB];
  const rows = [
    ["1st Serve %", formatPercent(stats[0].firstServeIn, stats[0].firstServeAttempts), formatPercent(stats[1].firstServeIn, stats[1].firstServeAttempts)],
    ["2nd Serve %", formatPercent(stats[0].secondServeIn, stats[0].secondServeAttempts), formatPercent(stats[1].secondServeIn, stats[1].secondServeAttempts)],
    ["1st Serve Pts Won %", formatPercent(stats[0].firstServePointsWon, stats[0].firstServeIn), formatPercent(stats[1].firstServePointsWon, stats[1].firstServeIn)],
    ["2nd Serve Pts Won %", formatPercent(stats[0].secondServePointsWon, stats[0].secondServeAttempts), formatPercent(stats[1].secondServePointsWon, stats[1].secondServeAttempts)],
    ["Aces", stats[0].aces, stats[1].aces],
    ["Double Faults", stats[0].doubleFaults, stats[1].doubleFaults],
    ["Winners", totalShotCount(stats[0].winners), totalShotCount(stats[1].winners)],
    ["Winners FH/BH/V/O/D", shortShotLine(stats[0].winners), shortShotLine(stats[1].winners)],
    ["Unforced Errors", totalShotCount(stats[0].unforcedErrors), totalShotCount(stats[1].unforcedErrors)],
    ["UFE FH/BH", `${stats[0].unforcedErrors.forehand}/${stats[0].unforcedErrors.backhand}`, `${stats[1].unforcedErrors.forehand}/${stats[1].unforcedErrors.backhand}`],
    ["Forced Errors", stats[0].forcedErrors, stats[1].forcedErrors],
    ["Net Points", formatFraction(stats[0].netPointsWon, stats[0].netPointsPlayed), formatFraction(stats[1].netPointsWon, stats[1].netPointsPlayed)],
    ["Return Winners", stats[0].returnWinners, stats[1].returnWinners],
    ["Break Points", formatFraction(stats[0].breakPointsConverted, stats[0].breakPointsOpportunities), formatFraction(stats[1].breakPointsConverted, stats[1].breakPointsOpportunities)],
    ["Break Points Saved", formatFraction(stats[0].breakPointsSaved, stats[0].breakPointsFaced), formatFraction(stats[1].breakPointsSaved, stats[1].breakPointsFaced)],
    ["Total Points Won", stats[0].totalPointsWon, stats[1].totalPointsWon],
  ];
  return `
    <div class="overflow-hidden rounded-[2rem] border border-white/10 bg-court-900/80">
      <div class="grid grid-cols-[1.15fr_1fr_1fr] gap-px bg-white/10 text-sm">
        <div class="bg-court-900 px-4 py-3 text-court-300/70">Metric</div>
        <div class="bg-court-900 px-4 py-3 text-center font-semibold text-white">${escapeHtml(players[0])}</div>
        <div class="bg-court-900 px-4 py-3 text-center font-semibold text-white">${escapeHtml(players[1])}</div>
        ${rows
          .map(
            ([label, a, b]) => `
              <div class="bg-court-950/80 px-4 py-3 text-court-200/70">${label}</div>
              <div class="bg-court-950/80 px-4 py-3 text-center font-mono text-court-100">${a}</div>
              <div class="bg-court-950/80 px-4 py-3 text-center font-mono text-court-100">${b}</div>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function totalShotCount(bucket) {
  return Object.values(bucket).reduce((sum, value) => sum + value, 0);
}

function shortShotLine(bucket) {
  return `${bucket.forehand}/${bucket.backhand}/${bucket.volley}/${bucket.overhead}/${bucket.drop_shot}`;
}

function pointDescription(point) {
  const shotType = normalizeShotType(point.shotType);
  return [serveLabel(point.serveResult), point.outcome ? outcomeLabel(point.outcome) : "", shotType ? shotLabel(shotType) : ""]
    .filter(Boolean)
    .join(" · ");
}

function renderStats(view) {
  const { match, computed } = view;
  const setTabs = ["Overall", ...computed.statsBySet.map((_, index) => `Set ${index + 1}`)];
  const sections = [
    {
      title: "Overall",
      stats: computed.statsOverall,
    },
    ...computed.statsBySet.map((stats, index) => ({
      title: `Set ${index + 1}`,
      stats,
    })),
  ];

  return `
    <section class="space-y-5">
      ${sections
        .map(
          (section, index) => `
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <p class="text-xs uppercase tracking-[0.3em] text-court-300/70">${setTabs[index]}</p>
              ${
                index > 0
                  ? `<span class="text-sm text-court-200/60">${computed.sets[index - 1]?.score?.join(" - ") || "0 - 0"}</span>`
                  : ""
              }
            </div>
            ${renderStatsTable(match, section.stats)}
          </div>
        `
        )
        .join("")}
    </section>
  `;
}

function renderMatches() {
  return `
    <section class="rounded-[2rem] border border-white/10 bg-court-900/80 p-5">
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-xs uppercase tracking-[0.3em] text-court-300/70">Saved Matches</p>
          <p class="mt-2 text-sm text-court-200/65">Every match lives locally in IndexedDB.</p>
        </div>
        <div class="flex items-center gap-2">
          <button data-action="import-match" class="rounded-2xl border border-court-300/35 bg-transparent px-4 py-3 text-sm font-medium text-court-200 transition hover:border-court-300/60 hover:bg-white/5">Import Match</button>
          <button data-action="new-match" class="rounded-2xl bg-court-300 px-4 py-3 text-sm font-semibold text-court-950">New Match</button>
        </div>
      </div>
      <div class="mt-5 space-y-3">
        ${
          state.matches.length
            ? state.matches
                .map((match) => {
                  const selected = match.id === state.currentMatchId;
                  return `
                    <article class="rounded-2xl border px-4 py-4 ${
                      selected ? "border-court-300 bg-court-300/10" : "border-white/10 bg-white/5"
                    }">
                      <div class="flex items-start justify-between gap-4">
                        <button data-action="select-match" data-id="${match.id}" class="text-left">
                          <p class="font-semibold text-white">${escapeHtml(match.playerA)} vs ${escapeHtml(match.playerB)}</p>
                          <p class="mt-1 text-sm text-court-200/60">${formatDate(match.updatedAt)}</p>
                        </button>
                        <div class="flex gap-2">
                          <span class="rounded-full px-3 py-2 text-xs uppercase tracking-[0.2em] ${match.status === "complete" ? "bg-court-300/15 text-court-300" : "bg-clay-500/15 text-clay-400"}">${match.status.replace("_", " ")}</span>
                          <button data-action="delete-match" data-id="${match.id}" class="rounded-xl border border-red-400/30 px-3 py-2 text-sm text-red-300">Delete</button>
                        </div>
                      </div>
                    </article>
                  `;
                })
                .join("")
            : `<div class="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-court-200/55">No saved matches yet.</div>`
        }
      </div>
    </section>
  `;
}

function renderEditorModal(view) {
  if (!state.editor.pointId) {
    return "";
  }
  const point = flattenPoints(view.computed).find((entry) => entry.id === state.editor.pointId);
  return `
    <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div class="max-h-[95vh] w-full max-w-3xl overflow-auto rounded-[2rem] border border-white/10 bg-court-950 p-4">
        <div class="mb-4 flex items-center justify-between gap-3">
          <div>
            <p class="text-xs uppercase tracking-[0.3em] text-court-300/70">Edit Point</p>
            <p class="mt-2 text-sm text-court-200/60">Update the original event and the match will recompute.</p>
          </div>
          <button data-action="close-editor" class="rounded-xl border border-white/10 px-4 py-3 text-sm text-court-100">Close</button>
        </div>
        ${renderPointComposer(view.match, view.computed, state.editor.draft, "edit", point ? { server: point.server, receiver: point.receiver } : null)}
      </div>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function render() {
  const app = document.querySelector("#app");
  if (!app) {
    return;
  }
  if (state.loading) {
    app.innerHTML = `<div class="flex min-h-screen items-center justify-center text-sm text-court-200/70">Loading tennis tracker…</div>`;
    return;
  }
  const view = derivedCurrentMatch();
  const hasMatch = Boolean(view);
  const body = !hasMatch && state.currentTab !== "matches"
    ? renderSetup()
    : `
      <div class="px-4 py-5 sm:px-6">
        <header class="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p class="text-xs uppercase tracking-[0.35em] text-court-300/70">Tennis Tracker</p>
            <h1 class="mt-2 text-2xl font-bold text-white">${hasMatch ? `${escapeHtml(view.match.playerA)} vs ${escapeHtml(view.match.playerB)}` : "Match Center"}</h1>
          </div>
          <nav class="grid grid-cols-4 gap-2 rounded-[1.4rem] border border-white/10 bg-court-900/80 p-2">
            ${TABS.map((tab) => {
              const active = state.currentTab === tab;
              return `
                <button data-action="tab" data-tab="${tab}" class="rounded-xl px-3 py-3 text-sm font-medium transition ${
                  active ? "bg-court-300 text-court-950" : "text-court-100"
                }">
                  ${tab[0].toUpperCase()}${tab.slice(1)}
                </button>
              `;
            }).join("")}
          </nav>
        </header>
        <input id="match-import-input" type="file" accept=".json,.csv,application/json,text/csv" class="hidden" />
        ${state.notice ? `<div class="mb-4 rounded-2xl border px-4 py-3 text-sm ${state.noticeType === "error" ? "border-red-400/30 bg-red-400/10 text-red-200" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"}">${escapeHtml(state.notice)}</div>` : ""}
        ${state.error ? `<div class="mb-4 rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">${escapeHtml(state.error)}</div>` : ""}
        ${
          state.currentTab === "live"
            ? (hasMatch ? renderLive(view) : renderSetup())
            : state.currentTab === "history"
              ? (hasMatch ? renderHistory(view) : renderSetup())
              : state.currentTab === "stats"
                ? (hasMatch ? renderStats(view) : renderSetup())
                : renderMatches()
        }
      </div>
      ${hasMatch ? renderEditorModal(view) : ""}
    `;
  app.innerHTML = body;
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) {
    return;
  }
  const action = target.dataset.action;
  state.error = "";

  if (action === "start-match") {
    await createMatchFromSetup();
    return;
  }
  if (action === "tab") {
    state.currentTab = target.dataset.tab;
    render();
    return;
  }
  if (action === "setup-server") {
    state.setup.initialServer = Number(target.dataset.value);
    render();
    return;
  }
  if (action === "draft-save") {
    await addPoint();
    return;
  }
  if (action === "edit-save") {
    await savePointEdit();
    return;
  }
  if (action === "draft-serve") {
    setDraftValue("draft", "serveResult", target.dataset.value);
    return;
  }
  if (action === "draft-outcome") {
    setDraftValue("draft", "outcome", target.dataset.value);
    return;
  }
  if (action === "draft-shot") {
    setDraftValue("draft", "shotType", target.dataset.value);
    return;
  }
  if (action === "draft-winner") {
    setDraftValue("draft", "winner", target.dataset.value);
    return;
  }
  if (action === "draft-player-flag") {
    state.draft[target.dataset.key] = updateFlagState(
      state.draft[target.dataset.key],
      Number(target.dataset.player),
      target.dataset.value
    );
    render();
    return;
  }
  if (action === "edit-serve") {
    updateEditorDraft("serveResult", target.dataset.value);
    return;
  }
  if (action === "edit-outcome") {
    updateEditorDraft("outcome", target.dataset.value);
    return;
  }
  if (action === "edit-shot") {
    updateEditorDraft("shotType", target.dataset.value);
    return;
  }
  if (action === "edit-winner") {
    updateEditorDraft("winner", target.dataset.value);
    return;
  }
  if (action === "edit-player-flag") {
    updateEditorDraft(
      target.dataset.key,
      updateFlagState(
        state.editor.draft[target.dataset.key],
        Number(target.dataset.player),
        target.dataset.value
      )
    );
    return;
  }
  if (action === "history-game") {
    setHistoryFocus(Number(target.dataset.set), Number(target.dataset.game));
    return;
  }
  if (action === "edit-point") {
    openEditor(target.dataset.id);
    return;
  }
  if (action === "close-editor") {
    closeEditor();
    return;
  }
  if (action === "delete-point") {
    await deletePoint(target.dataset.id);
    return;
  }
  if (action === "select-match") {
    setActiveMatch(target.dataset.id);
    return;
  }
  if (action === "new-match") {
    state.currentMatchId = "";
    state.currentTab = "live";
    resetDrafts();
    render();
    return;
  }
  if (action === "import-match") {
    openImportPicker();
    return;
  }
  if (action === "delete-match") {
    if (window.confirm("Delete this match and all logged points?")) {
      await deleteMatch(target.dataset.id);
    }
    return;
  }
  if (action === "export") {
    await exportMatch(target.dataset.kind);
  }
});

document.addEventListener("input", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) {
    return;
  }
  const action = target.dataset.action;
  if (action === "setup-input") {
    state.setup[target.dataset.key] = target.value;
  }
});

document.addEventListener("change", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.id !== "match-import-input") {
    return;
  }

  clearNotice();
  state.error = "";

  try {
    await importMatchFile(target.files?.[0] || null);
  } catch (error) {
    console.error(error);
    setNotice(error instanceof Error ? error.message : "Unable to import this file.", "error");
    render();
  } finally {
    target.value = "";
  }
});

bootstrap();
