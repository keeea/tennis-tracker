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
  { value: "unforced_error", label: "UE" },
  { value: "forced_error", label: "FE" },
  { value: "uncertain", label: "Uncertain" },
];
const SHOT_OPTIONS = ["forehand", "backhand", "volley", "overhead", "drop_shot"];
const RALLY_LENGTH_OPTIONS = [
  { value: "short", label: "Short (1-4)" },
  { value: "long", label: "Long (5+)" },
  { value: "uncertain", label: "Uncertain" },
];
const TABS = ["live", "history", "stats", "matches"];
const STORAGE_KEY = "tennisTracker.activeMatchId";
const MATCH_FORMAT = "best_of_2_super_tiebreak";
const MATCH_FORMAT_LABEL = "Best of 2 sets + match tiebreak";

function createInitialDoublesSetup() {
  return {
    teamA: { player1: "", player2: "" },
    teamB: { player1: "", player2: "" },
    scoringFormat: "ad",
    serveOrder: [null, null, null, null],
    receiveFormation: {
      teamA: { deuce: 0, ad: 1 },
      teamB: { deuce: 2, ad: 3 },
    },
  };
}

function createInitialSetupState() {
  return {
    matchType: null,
    playerA: "",
    playerB: "",
    initialServer: 0,
    scoringFormat: "ad",
    doublesSetup: createInitialDoublesSetup(),
  };
}

const state = {
  matches: [],
  currentMatchId: localStorage.getItem(STORAGE_KEY) || "",
  currentTab: "live",
  setup: createInitialSetupState(),
  draft: createEmptyDraft(),
  history: {
    setIndex: 0,
    gameIndex: 0,
    showFlaggedOnly: false,
  },
  editor: {
    entryId: "",
    entryType: "point",
    draft: createEmptyDraft(),
  },
  adjustment: {
    open: false,
    editId: "",
    draft: createEmptyCheckpointDraft(),
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
    outcome: "uncertain",
    resultShotType: "uncertain",
    precedingShotType: "uncertain",
    rallyLength: "uncertain",
    winner: "",
    flagged: false,
    excludeFromStats: false,
    netApproachStates: createEmptyTriStates(),
    returnWinnerStates: createEmptyTriStates(),
  };
}

function createEmptyCheckpointDraft() {
  return {
    setScore: ["0", "0"],
    gameScore: ["0", "0"],
    server: "0",
    isTiebreak: false,
  };
}

function createEmptyTriStates() {
  return [null, null];
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
    resultShots: {
      forehand: 0,
      backhand: 0,
      volley: 0,
      overhead: 0,
      drop_shot: 0,
    },
    forcingShots: {
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
    errorsAfterOpponentShot: {
      forehand: 0,
      backhand: 0,
      volley: 0,
      overhead: 0,
      drop_shot: 0,
    },
    winnersAfterOpponentShot: {
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
    shortRallyPointsPlayed: 0,
    shortRallyPointsWon: 0,
    longRallyPointsPlayed: 0,
    longRallyPointsWon: 0,
    totalPointsWon: 0,
  };
}

function createMatchRecord({
  playerA,
  playerB,
  initialServer,
  matchType,
  scoringFormat = "ad",
  teamA,
  teamB,
  setConfigs,
}) {
  const timestamp = new Date().toISOString();
  const normalizedMatchType = matchType === "doubles" ? "doubles" : "singles";
  if (normalizedMatchType === "doubles") {
    return {
      id: crypto.randomUUID(),
      createdAt: timestamp,
      updatedAt: timestamp,
      date: timestamp,
      status: "in_progress",
      format: MATCH_FORMAT,
      matchType: "doubles",
      scoringFormat: scoringFormat === "no_ad" ? "no_ad" : "ad",
      teamA: {
        player1: String(teamA?.player1 || "").trim(),
        player2: String(teamA?.player2 || "").trim(),
      },
      teamB: {
        player1: String(teamB?.player1 || "").trim(),
        player2: String(teamB?.player2 || "").trim(),
      },
      setConfigs: Array.isArray(setConfigs) ? setConfigs : [],
      points: [],
    };
  }
  return {
    id: crypto.randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    date: timestamp,
    status: "in_progress",
    format: MATCH_FORMAT,
    matchType: normalizedMatchType,
    scoringFormat: scoringFormat === "no_ad" ? "no_ad" : "ad",
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

function getDoublesPlayerName(match, playerIndex) {
  if (playerIndex === 0) {
    return match.teamA.player1;
  }
  if (playerIndex === 1) {
    return match.teamA.player2;
  }
  if (playerIndex === 2) {
    return match.teamB.player1;
  }
  if (playerIndex === 3) {
    return match.teamB.player2;
  }
  return "";
}

function getTeamIndex(playerIndex) {
  return playerIndex < 2 ? 0 : 1;
}

function getPartnerIndex(playerIndex) {
  if (playerIndex === 0) {
    return 1;
  }
  if (playerIndex === 1) {
    return 0;
  }
  if (playerIndex === 2) {
    return 3;
  }
  if (playerIndex === 3) {
    return 2;
  }
  return null;
}

function getTeamName(match, teamIndex) {
  if (teamIndex === 0) {
    return `${match.teamA.player1} & ${match.teamA.player2}`;
  }
  return `${match.teamB.player1} & ${match.teamB.player2}`;
}

function sideName(match, index) {
  if (match.matchType === "doubles") {
    return getTeamName(match, index);
  }
  return index === 0 ? match.playerA : match.playerB;
}

function matchTitle(match) {
  return `${sideName(match, 0)} vs ${sideName(match, 1)}`;
}

function playerName(match, index) {
  if (match.matchType === "doubles") {
    return getDoublesPlayerName(match, index);
  }
  return index === 0 ? match.playerA : match.playerB;
}

function flattenPoints(computed) {
  return computed.sets.flatMap((set) => set.games.flatMap((game) => game.points));
}

function flattenHistoryEntries(computed) {
  return computed.historyEntries || [];
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

function isGameWon(pointsA, pointsB, scoringFormat = "ad") {
  if (scoringFormat === "no_ad") {
    if (pointsA >= 3 && pointsB >= 3) {
      return pointsA !== pointsB;
    }
    return pointsA >= 4 || pointsB >= 4;
  }
  return (pointsA >= 4 || pointsB >= 4) && Math.abs(pointsA - pointsB) >= 2;
}

function getGameScoreLabel(pointsA, pointsB, scoringFormat = "ad") {
  const labels = ["0", "15", "30", "40"];
  if (pointsA >= 3 && pointsB >= 3) {
    if (pointsA === pointsB) {
      return scoringFormat === "no_ad" ? ["Deciding Pt", "Deciding Pt"] : ["Deuce", "Deuce"];
    }
    if (scoringFormat === "no_ad") {
      return [labels[Math.min(pointsA, 3)] || "40", labels[Math.min(pointsB, 3)] || "40"];
    }
    return pointsA > pointsB ? ["Ad", "40"] : ["40", "Ad"];
  }
  return [labels[pointsA] || "40", labels[pointsB] || "40"];
}

function isTiebreakWon(pointsA, pointsB) {
  return (pointsA >= 7 || pointsB >= 7) && Math.abs(pointsA - pointsB) >= 2;
}

function isSuperTiebreakWon(pointsA, pointsB) {
  return (pointsA >= 10 || pointsB >= 10) && Math.abs(pointsA - pointsB) >= 2;
}

function isMatchTiebreakSet(setIndex, setsWon) {
  return setIndex === 2 && setsWon[0] === 1 && setsWon[1] === 1;
}

function getSetLabel(setEntry) {
  return setEntry.isMatchTiebreak ? "Match Tiebreak" : `Set ${setEntry.index + 1}`;
}

function getSetDisplayScore(setEntry) {
  return setEntry.isMatchTiebreak ? (setEntry.tiebreakScore || setEntry.score || [0, 0]) : setEntry.score;
}

function sanitizePlayerIndexes(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map((entry) => Number(entry)).filter((entry) => entry === 0 || entry === 1))];
}

function sanitizeTriStates(value) {
  const next = createEmptyTriStates();
  if (Array.isArray(value)) {
    return value.slice(0, 2).map((entry, index) => (entry === 0 || entry === 1 ? entry : next[index]));
  }
  if (value && typeof value === "object") {
    ["0", "1"].forEach((playerIndex) => {
      const raw = value[playerIndex];
      if (raw === 1 || raw === 0 || raw === null) {
        next[Number(playerIndex)] = raw;
      } else if (raw === "yes") {
        next[Number(playerIndex)] = 1;
      } else if (raw === "no") {
        next[Number(playerIndex)] = 0;
      }
    });
  }
  return next;
}

function normalizeWinner(value) {
  return value === 0 || value === 1 ? value : null;
}

function normalizeShotType(value) {
  return SHOT_OPTIONS.includes(value) ? value : "uncertain";
}

function normalizeRallyLength(value) {
  return value === "short" || value === "long" ? value : "uncertain";
}

function normalizeOutcome(value) {
  return OUTCOME_OPTIONS.some((option) => option.value === value) ? value : "uncertain";
}

function normalizeFlagged(value) {
  return value === true;
}

function normalizeExcludeFromStats(value) {
  return value === true;
}

function normalizeRequiredServeResult(value) {
  return SERVE_OPTIONS.some((option) => option.value === value) ? value : "";
}

function normalizeMatchType(value) {
  return value === "doubles" ? "doubles" : "singles";
}

function normalizeScoringFormat(value) {
  return value === "no_ad" ? "no_ad" : "ad";
}

function triStatesToPlayerIndexes(triStates) {
  return sanitizeTriStates(triStates).map((value) => (value === 0 || value === 1 ? value : null));
}

function sumShots(bucket) {
  return Object.values(bucket).reduce((sum, count) => sum + count, 0);
}

function deriveShotPlayers(winner, outcome) {
  if (winner !== 0 && winner !== 1) {
    return { loser: null, resultShotPlayer: null, precedingShotPlayer: null };
  }
  const loser = 1 - winner;
  if (outcome === "winner") {
    return { loser, resultShotPlayer: winner, precedingShotPlayer: loser };
  }
  if (outcome === "unforced_error" || outcome === "forced_error") {
    return { loser, resultShotPlayer: loser, precedingShotPlayer: winner };
  }
  return { loser, resultShotPlayer: null, precedingShotPlayer: null };
}

function pointWinnerFromServeResult(serveResult, server) {
  if (serveResult === "ace") {
    return server;
  }
  if (serveResult === "double_fault") {
    return 1 - server;
  }
  return null;
}

function isCheckpointEntry(entry) {
  return entry?.type === "checkpoint";
}

function sanitizeNumericScorePair(value, fallback = [0, 0]) {
  if (!Array.isArray(value) || value.length < 2) {
    return [...fallback];
  }
  return value.slice(0, 2).map((entry, index) => {
    const next = Number(entry);
    return Number.isFinite(next) && next >= 0 ? Math.floor(next) : fallback[index];
  });
}

function standardPointLabelToValue(value) {
  const mapping = { 0: 0, 15: 1, 30: 2, 40: 3, Ad: 4 };
  return mapping[value] ?? 0;
}

function setIsCompleteByScore(score) {
  const [gamesA, gamesB] = sanitizeNumericScorePair(score, [0, 0]);
  const high = Math.max(gamesA, gamesB);
  const low = Math.min(gamesA, gamesB);
  return (
    (high === 6 && low <= 4) ||
    (high === 7 && (low === 5 || low === 6))
  );
}

function shouldUseTiebreakGame(setScore, setIsMatchTiebreak) {
  return setIsMatchTiebreak || (setScore[0] === 6 && setScore[1] === 6);
}

function checkpointGameIndex(currentSet, currentGame) {
  if (currentGame) {
    return currentGame.index;
  }
  return Math.max(currentSet.games.length - 1, 0);
}

function resolveLegacyTriStates(rawPoint, kind, winner, loser, server, receiver) {
  const states = createEmptyTriStates();
  const explicitKey = kind === "net" ? "netApproachStates" : "returnWinnerStates";
  const explicitStates = sanitizeTriStates(rawPoint[explicitKey]);
  if (explicitStates.some((value) => value !== null)) {
    return explicitStates;
  }

  const players = sanitizePlayerIndexes(kind === "net" ? rawPoint.netApproachPlayers : rawPoint.returnWinnerPlayers);
  if (players.length) {
    players.forEach((playerIndex) => {
      states[playerIndex] = 1;
    });
    return states;
  }

  if (kind === "net") {
    if (!rawPoint.netApproach) {
      return states;
    }
    const playerIndex = rawPoint.netPlayerMode === "loser"
      ? loser
      : rawPoint.netPlayerMode === "server"
        ? server
        : rawPoint.netPlayerMode === "receiver"
          ? receiver
          : winner;
    states[playerIndex] = 1;
    return states;
  }

  if (rawPoint.returnWinner && rawPoint.outcome === "winner") {
    states[receiver] = 1;
  }
  return states;
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

function normalizeStoredPoint(rawPoint) {
  const winner = normalizeWinner(Number(rawPoint.winner));
  const migratedResultShot = rawPoint.resultShotType ?? rawPoint.shotType;
  const migratedPrecedingShot = rawPoint.precedingShotType ?? rawPoint.forcingShotType;
  return {
    id: typeof rawPoint.id === "string" && rawPoint.id ? rawPoint.id : crypto.randomUUID(),
    type: "point",
    serveResult: normalizeRequiredServeResult(rawPoint.serveResult),
    outcome: normalizeOutcome(rawPoint.outcome),
    resultShotType: normalizeShotType(migratedResultShot),
    precedingShotType: normalizeShotType(migratedPrecedingShot),
    rallyLength: normalizeRallyLength(rawPoint.rallyLength),
    winner,
    flagged: normalizeFlagged(rawPoint.flagged),
    excludeFromStats: normalizeExcludeFromStats(rawPoint.excludeFromStats),
    netApproachStates: sanitizeTriStates(rawPoint.netApproachStates),
    returnWinnerStates: sanitizeTriStates(rawPoint.returnWinnerStates),
    timestamp: typeof rawPoint.timestamp === "string" && rawPoint.timestamp ? rawPoint.timestamp : new Date().toISOString(),
  };
}

function computeMatch(match) {
  if (normalizeMatchType(match.matchType) === "doubles") {
    const liveServer = Number(match.setConfigs?.[0]?.serveOrder?.[0]);
    return {
      sets: [],
      setsWon: [0, 0],
      statsOverall: [createStatsBucket(), createStatsBucket()],
      statsBySet: [],
      matchWinner: null,
      isComplete: false,
      liveSetIndex: 0,
      liveServer: Number.isInteger(liveServer) ? liveServer : 0,
      liveSetGames: [0, 0],
      liveSetDisplay: [0, 0],
      liveSetIsMatchTiebreak: false,
      liveGamePoints: [0, 0],
      liveGameIsTiebreak: false,
      liveGameType: "standard",
      liveScoreDisplay: ["0", "0"],
      totalPoints: 0,
      flaggedPoints: 0,
      historyEntries: [],
    };
  }
  const scoringFormat = normalizeScoringFormat(match.scoringFormat);
  const sets = [];
  const statsOverall = [createStatsBucket(), createStatsBucket()];
  const statsBySet = [];
  const rawEntries = Array.isArray(match.points) ? match.points : [];
  const historyEntries = [];
  let setsWon = [0, 0];
  let currentSet = createSetContainer(0);
  currentSet.isMatchTiebreak = isMatchTiebreakSet(currentSet.index, setsWon);
  let currentGame = null;
  let nextGameServer = Number.isInteger(match.initialServer) ? match.initialServer : 0;
  let matchWinner = null;
  let flaggedPoints = 0;

  function startGame(serverOverride = nextGameServer, pointsWon = [0, 0]) {
    const isMatchTiebreak = currentSet.isMatchTiebreak;
    currentGame = {
      index: currentSet.games.length,
      setIndex: currentSet.index,
      server: serverOverride,
      isTiebreak: shouldUseTiebreakGame(currentSet.gamesWon, isMatchTiebreak),
      isSuperTiebreak: isMatchTiebreak,
      pointsWon: [...pointsWon],
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
    const tiebreakWon = currentGame.isTiebreak && (
      currentGame.isSuperTiebreak
        ? isSuperTiebreakWon(currentGame.pointsWon[0], currentGame.pointsWon[1])
        : isTiebreakWon(currentGame.pointsWon[0], currentGame.pointsWon[1])
    );
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
      currentSet.score = currentGame.isSuperTiebreak ? [...currentGame.pointsWon] : [...currentSet.gamesWon];
      setsWon[winner] += 1;
      sets.push(currentSet);
      currentGame = null;

      if (setsWon[winner] === 2) {
        matchWinner = winner;
      } else {
        currentSet = createSetContainer(currentSet.index + 1);
        currentSet.isMatchTiebreak = isMatchTiebreakSet(currentSet.index, setsWon);
      }
    } else {
      currentGame = null;
    }
  }

  function finalizeSetFromCheckpoint(serverOverride, scoreOverride = null) {
    const winner = (scoreOverride || currentSet.gamesWon)[0] > (scoreOverride || currentSet.gamesWon)[1] ? 0 : 1;
    currentSet.winner = winner;
    currentSet.score = currentSet.isMatchTiebreak
      ? [...(scoreOverride || currentGame?.pointsWon || [0, 0])]
      : [...(scoreOverride || currentSet.gamesWon)];
    setsWon[winner] += 1;
    sets.push(currentSet);
    currentGame = null;
    nextGameServer = serverOverride;

    if (setsWon[winner] === 2) {
      matchWinner = winner;
      return;
    }

    currentSet = createSetContainer(currentSet.index + 1);
    currentSet.isMatchTiebreak = isMatchTiebreakSet(currentSet.index, setsWon);
  }

  rawEntries.forEach((rawEntry, pointListIndex) => {
    if (matchWinner !== null) {
      return;
    }

    if (isCheckpointEntry(rawEntry)) {
      const setScore = sanitizeNumericScorePair(rawEntry.setScore, currentSet.gamesWon);
      const server = Number(rawEntry.server) === 1 ? 1 : 0;
      const useTiebreak = shouldUseTiebreakGame(setScore, currentSet.isMatchTiebreak);
      const gameScore = sanitizeNumericScorePair(rawEntry.gameScore, [0, 0]);

      historyEntries.push({
        id: rawEntry.id,
        type: "checkpoint",
        rawIndex: pointListIndex,
        setIndex: currentSet.index,
        gameIndex: checkpointGameIndex(currentSet, currentGame),
        pointNumber: null,
        server,
        setScore: [...setScore],
        gameScore: [...gameScore],
        isTiebreak: useTiebreak,
        isSuperTiebreak: currentSet.isMatchTiebreak,
        timestamp: typeof rawEntry.timestamp === "string" && rawEntry.timestamp ? rawEntry.timestamp : new Date().toISOString(),
      });

      currentSet.gamesWon = [...setScore];
      currentSet.score = currentSet.isMatchTiebreak ? [...gameScore] : [...setScore];
      nextGameServer = server;
      currentGame = null;

      if (currentSet.isMatchTiebreak) {
        currentSet.tiebreakScore = [...gameScore];
        if (isSuperTiebreakWon(gameScore[0], gameScore[1])) {
          finalizeSetFromCheckpoint(server, gameScore);
        } else {
          startGame(server, gameScore);
        }
        return;
      }

      if (setIsCompleteByScore(setScore)) {
        if ((setScore[0] === 7 || setScore[1] === 7) && (gameScore[0] > 0 || gameScore[1] > 0)) {
          currentSet.tiebreakScore = [...gameScore];
        }
        finalizeSetFromCheckpoint(server);
        return;
      }

      startGame(server, useTiebreak ? gameScore : gameScore);
      return;
    }

    if (!currentGame) {
      startGame(nextGameServer, [0, 0]);
    }

    const pointInGame = currentGame.points.length;
    const server = currentGame.isTiebreak
      ? getTiebreakServer(currentGame.server, pointInGame)
      : currentGame.server;
    const receiver = 1 - server;
    const normalizedPoint = normalizeStoredPoint(rawEntry);
    const winner = normalizedPoint.winner;
    if (winner === null) {
      return;
    }
    const loser = 1 - winner;
    const isBreakChance = !currentGame.isTiebreak && isBreakPoint(currentGame.pointsWon, server);
    const scoreBeforeGamePoint = currentGame.isTiebreak
      ? [...currentGame.pointsWon]
      : getGameScoreLabel(currentGame.pointsWon[0], currentGame.pointsWon[1], scoringFormat);
    const netApproachStates = resolveLegacyTriStates(rawEntry, "net", winner, loser, server, receiver);
    const returnWinnerStates = resolveLegacyTriStates(rawEntry, "return", winner, loser, server, receiver);
    const { outcome, resultShotType, precedingShotType, rallyLength } = normalizedPoint;
    const { resultShotPlayer, precedingShotPlayer } = deriveShotPlayers(winner, outcome);
    const setBuckets = ensureSetBucket(statsBySet, currentSet.index);
    const flagged = normalizedPoint.flagged;
    const excludeFromStats = normalizedPoint.excludeFromStats;

    if (flagged) {
      flaggedPoints += 1;
    }

    if (!excludeFromStats) {
      [statsOverall, setBuckets].forEach((bucketGroup) => {
        bucketGroup[winner].totalPointsWon += 1;
        bucketGroup[server].servicePoints += 1;
        bucketGroup[receiver].returnPoints += 1;
        bucketGroup[server].firstServeAttempts += 1;

        if (normalizedPoint.serveResult === "first_in" || normalizedPoint.serveResult === "ace") {
          bucketGroup[server].firstServeIn += 1;
          if (winner === server) {
            bucketGroup[server].firstServePointsWon += 1;
          }
        }

        if (normalizedPoint.serveResult === "second_in" || normalizedPoint.serveResult === "double_fault") {
          bucketGroup[server].secondServeAttempts += 1;
        }

        if (normalizedPoint.serveResult === "second_in") {
          bucketGroup[server].secondServeIn += 1;
          if (winner === server) {
            bucketGroup[server].secondServePointsWon += 1;
          }
        }

        if (normalizedPoint.serveResult === "ace") {
          bucketGroup[server].aces += 1;
        }

        if (normalizedPoint.serveResult === "double_fault") {
          bucketGroup[server].doubleFaults += 1;
        }

        if (outcome === "winner" && resultShotType !== "uncertain") {
          bucketGroup[winner].resultShots[resultShotType] += 1;
        }

        if (outcome === "unforced_error" && resultShotType !== "uncertain" && resultShotPlayer !== null) {
          bucketGroup[resultShotPlayer].unforcedErrors[resultShotType] += 1;
        }

        if (outcome === "forced_error") {
          bucketGroup[loser].forcedErrors += 1;
          if (precedingShotType !== "uncertain" && precedingShotPlayer !== null) {
            bucketGroup[precedingShotPlayer].forcingShots[precedingShotType] += 1;
          }
        }

        if (outcome !== "uncertain" && precedingShotType !== "uncertain") {
          if (outcome === "winner") {
            bucketGroup[winner].winnersAfterOpponentShot[precedingShotType] += 1;
          } else {
            bucketGroup[loser].errorsAfterOpponentShot[precedingShotType] += 1;
          }
        }

        [0, 1].forEach((playerIndex) => {
          if (netApproachStates[playerIndex] === 1 || netApproachStates[playerIndex] === 0) {
            bucketGroup[playerIndex].netPointsPlayed += 1;
            if (netApproachStates[playerIndex] === 1 && winner === playerIndex) {
              bucketGroup[playerIndex].netPointsWon += 1;
            }
          }
          if (returnWinnerStates[playerIndex] === 1) {
            bucketGroup[playerIndex].returnWinners += 1;
          }
        });

        if (rallyLength === "short") {
          bucketGroup[0].shortRallyPointsPlayed += 1;
          bucketGroup[1].shortRallyPointsPlayed += 1;
          bucketGroup[winner].shortRallyPointsWon += 1;
        }
        if (rallyLength === "long") {
          bucketGroup[0].longRallyPointsPlayed += 1;
          bucketGroup[1].longRallyPointsPlayed += 1;
          bucketGroup[winner].longRallyPointsWon += 1;
        }

        if (isBreakChance) {
          bucketGroup[receiver].breakPointsOpportunities += 1;
          bucketGroup[server].breakPointsFaced += 1;
        }
      });
    }

    currentGame.pointsWon[winner] += 1;
    const wonGame = currentGame.isTiebreak
      ? currentGame.isSuperTiebreak
        ? isSuperTiebreakWon(currentGame.pointsWon[0], currentGame.pointsWon[1])
        : isTiebreakWon(currentGame.pointsWon[0], currentGame.pointsWon[1])
      : isGameWon(currentGame.pointsWon[0], currentGame.pointsWon[1], scoringFormat);
    const scoreAfterGamePoint = currentGame.isTiebreak
      ? [...currentGame.pointsWon]
      : getGameScoreLabel(currentGame.pointsWon[0], currentGame.pointsWon[1], scoringFormat);

    if (isBreakChance && !excludeFromStats) {
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
      ...normalizedPoint,
      type: "point",
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
      resultShotPlayer,
      precedingShotPlayer,
      flagged,
      excludeFromStats,
      netApproachStates,
      returnWinnerStates,
      rallyLength,
    });

    historyEntries.push(currentGame.points[currentGame.points.length - 1]);

    if (wonGame) {
      finalizeGame();
    }
  });

  if (currentSet.games.length && !sets.find((set) => set.index === currentSet.index)) {
    currentSet.score = currentSet.isMatchTiebreak && currentGame ? [...currentGame.pointsWon] : [...currentSet.gamesWon];
    sets.push(currentSet);
  }

  const liveSetIsMatchTiebreak = currentSet.isMatchTiebreak;
  const liveSetDisplay = liveSetIsMatchTiebreak && currentGame ? [...currentGame.pointsWon] : [...currentSet.gamesWon];
  const liveGameType = currentGame
    ? currentGame.isSuperTiebreak
      ? "super_tiebreak"
      : currentGame.isTiebreak
        ? "tiebreak"
        : "standard"
    : liveSetIsMatchTiebreak
      ? "super_tiebreak"
      : "standard";
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
    liveSetDisplay,
    liveSetIsMatchTiebreak,
    liveGamePoints: currentGame ? currentGame.pointsWon : [0, 0],
    liveGameIsTiebreak: Boolean(currentGame?.isTiebreak),
    liveGameType,
    liveScoreDisplay: currentGame
      ? currentGame.isTiebreak
        ? currentGame.pointsWon.map(String)
        : getGameScoreLabel(currentGame.pointsWon[0], currentGame.pointsWon[1], scoringFormat)
      : currentSet.gamesWon[0] === 6 && currentSet.gamesWon[1] === 6
        ? ["0", "0"]
        : ["0", "0"],
    totalPoints: historyEntries.filter((entry) => entry.type === "point").length,
    flaggedPoints,
    historyEntries,
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
    isMatchTiebreak: false,
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
    entryId: "",
    entryType: "point",
    draft: createEmptyDraft(),
  };
  state.adjustment = {
    open: false,
    editId: "",
    draft: createEmptyCheckpointDraft(),
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
  const exportInitialServer = match.matchType === "doubles"
    ? playerName(match, match.setConfigs?.[0]?.serveOrder?.[0] ?? 0)
    : playerName(match, match.initialServer);
  return {
    match: {
      id: match.id,
      playerA: sideName(match, 0),
      playerB: sideName(match, 1),
      teamA: match.teamA,
      teamB: match.teamB,
      status: match.status,
      date: match.date,
      initialServer: exportInitialServer,
      format: match.format,
      matchType: normalizeMatchType(match.matchType),
      scoringFormat: normalizeScoringFormat(match.scoringFormat),
      setConfigs: match.setConfigs,
    },
    entries: (Array.isArray(match.points) ? match.points : []).map((entry) => (
      isCheckpointEntry(entry)
        ? {
          id: entry.id,
          type: "checkpoint",
          setScore: sanitizeNumericScorePair(entry.setScore, [0, 0]),
          gameScore: sanitizeNumericScorePair(entry.gameScore, [0, 0]),
          server: Number(entry.server) === 1 ? 1 : 0,
          timestamp: entry.timestamp,
        }
        : {
          id: entry.id,
          type: "point",
          serveResult: entry.serveResult,
          outcome: normalizeOutcome(entry.outcome),
          resultShotType: normalizeShotType(entry.resultShotType ?? entry.shotType),
          precedingShotType: normalizeShotType(entry.precedingShotType ?? entry.forcingShotType),
          rallyLength: normalizeRallyLength(entry.rallyLength),
          winner: Number(entry.winner),
          flagged: normalizeFlagged(entry.flagged),
          excludeFromStats: normalizeExcludeFromStats(entry.excludeFromStats),
          netApproachStates: sanitizeTriStates(entry.netApproachStates),
          returnWinnerStates: sanitizeTriStates(entry.returnWinnerStates),
          timestamp: entry.timestamp,
        }
    )),
    summary: {
      setsWon: computed.setsWon,
      totalPoints: computed.totalPoints,
      winner: computed.matchWinner === null ? null : sideName(match, computed.matchWinner),
    },
    sets: computed.sets.map((set) => ({
      index: set.index + 1,
      score: set.score,
      winner: set.winner === null ? null : sideName(match, set.winner),
      tiebreakScore: set.tiebreakScore,
      isMatchTiebreak: set.isMatchTiebreak,
      games: set.games.map((game) => ({
        index: game.index + 1,
        server: playerName(match, game.server),
        isTiebreak: game.isTiebreak,
        isSuperTiebreak: Boolean(game.isSuperTiebreak),
        scoreBefore: game.scoreBefore,
        scoreAfter: game.scoreAfter,
        winner: sideName(match, game.winner),
        points: game.points.map((point) => ({
          pointNumber: point.pointNumber,
          server: playerName(match, point.server),
          receiver: playerName(match, point.receiver),
          winner: sideName(match, point.winner),
          scoreBefore: point.scoreBefore,
          scoreAfter: point.scoreAfter,
          serveResult: point.serveResult,
          outcome: point.outcome,
          resultShotType: normalizeShotType(point.resultShotType),
          precedingShotType: normalizeShotType(point.precedingShotType),
          rallyLength: normalizeRallyLength(point.rallyLength),
          netApproachStates: point.netApproachStates.map((value) => (value === null ? "uncertain" : value === 1 ? "yes" : "no")),
          returnWinnerStates: point.returnWinnerStates.map((value) => (value === null ? "uncertain" : value === 1 ? "yes" : "no")),
          isBreakPoint: point.isBreakPoint,
          flagged: normalizeFlagged(point.flagged),
          excludeFromStats: normalizeExcludeFromStats(point.excludeFromStats),
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
      "result_shot_type",
      "preceding_shot_type",
      "rally_length",
      "score_before",
      "score_after",
      "break_point",
      "net_player_a",
      "net_player_b",
      "return_winner_player_a",
      "return_winner_player_b",
      "flagged",
      "exclude_from_stats",
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
          normalizeShotType(point.resultShotType),
          normalizeShotType(point.precedingShotType),
          normalizeRallyLength(point.rallyLength),
          Array.isArray(point.scoreBefore) ? point.scoreBefore.join("-") : point.scoreBefore,
          Array.isArray(point.scoreAfter) ? point.scoreAfter.join("-") : point.scoreAfter,
          point.isBreakPoint ? "yes" : "no",
          point.netApproachStates[0] === null ? "uncertain" : point.netApproachStates[0] === 1 ? "yes" : "no",
          point.netApproachStates[1] === null ? "uncertain" : point.netApproachStates[1] === 1 ? "yes" : "no",
          point.returnWinnerStates[0] === null ? "uncertain" : point.returnWinnerStates[0] === 1 ? "yes" : "no",
          point.returnWinnerStates[1] === null ? "uncertain" : point.returnWinnerStates[1] === 1 ? "yes" : "no",
          normalizeFlagged(point.flagged) ? "yes" : "no",
          normalizeExcludeFromStats(point.excludeFromStats) ? "yes" : "no",
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
  if (isCheckpointEntry(point)) {
    return {
      id: crypto.randomUUID(),
      type: "checkpoint",
      setScore: sanitizeNumericScorePair(point.setScore, [0, 0]),
      gameScore: sanitizeNumericScorePair(point.gameScore, [0, 0]),
      server: Number(point.server) === 1 ? 1 : 0,
      timestamp: typeof point.timestamp === "string" && point.timestamp ? point.timestamp : new Date().toISOString(),
    };
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
  if (point.outcome !== undefined && !OUTCOME_OPTIONS.some((option) => option.value === point.outcome)) {
    throw new Error("Imported point has an invalid outcome.");
  }
  const resultShotType = point.resultShotType ?? point.shotType;
  const precedingShotType = point.precedingShotType ?? point.forcingShotType;
  if (resultShotType !== "uncertain" && resultShotType !== "" && resultShotType !== undefined && !SHOT_OPTIONS.includes(resultShotType)) {
    throw new Error("Imported point has an invalid result shot type.");
  }
  if (precedingShotType !== "uncertain" && precedingShotType !== "" && precedingShotType !== undefined && !SHOT_OPTIONS.includes(precedingShotType)) {
    throw new Error("Imported point has an invalid preceding shot type.");
  }
  if (point.rallyLength !== "" && point.rallyLength !== undefined && point.rallyLength !== "short" && point.rallyLength !== "long" && point.rallyLength !== "uncertain") {
    throw new Error("Imported point has an invalid rally length.");
  }
  const netApproachStates = sanitizeTriStates(point.netApproachStates);
  if (!netApproachStates.some((value) => value !== null)) {
    sanitizePlayerIndexes(point.netApproachPlayers).forEach((playerIndex) => {
      netApproachStates[playerIndex] = 1;
    });
  }
  const returnWinnerStates = sanitizeTriStates(point.returnWinnerStates);
  if (!returnWinnerStates.some((value) => value !== null)) {
    sanitizePlayerIndexes(point.returnWinnerPlayers).forEach((playerIndex) => {
      returnWinnerStates[playerIndex] = 1;
    });
  }
  return {
    id: crypto.randomUUID(),
    type: "point",
    serveResult: point.serveResult,
    outcome: normalizeOutcome(point.outcome),
    resultShotType: normalizeShotType(resultShotType),
    precedingShotType: normalizeShotType(precedingShotType),
    rallyLength: normalizeRallyLength(point.rallyLength),
    winner,
    flagged: normalizeFlagged(point.flagged),
    excludeFromStats: normalizeExcludeFromStats(point.excludeFromStats),
    netApproachStates,
    returnWinnerStates,
    timestamp: typeof point.timestamp === "string" && point.timestamp ? point.timestamp : new Date().toISOString(),
  };
}

function createImportedMatch({
  playerA,
  playerB,
  initialServer,
  points,
  matchType = "singles",
  scoringFormat = "ad",
  teamA,
  teamB,
  setConfigs,
}) {
  const timestamp = new Date().toISOString();
  const normalizedMatchType = normalizeMatchType(matchType);
  if (normalizedMatchType === "doubles") {
    return {
      id: crypto.randomUUID(),
      createdAt: timestamp,
      updatedAt: timestamp,
      importedAt: timestamp,
      date: timestamp,
      status: "in_progress",
      format: MATCH_FORMAT,
      matchType: "doubles",
      scoringFormat: normalizeScoringFormat(scoringFormat),
      teamA: {
        player1: String(teamA?.player1 || "").trim(),
        player2: String(teamA?.player2 || "").trim(),
      },
      teamB: {
        player1: String(teamB?.player1 || "").trim(),
        player2: String(teamB?.player2 || "").trim(),
      },
      setConfigs: Array.isArray(setConfigs) ? setConfigs : [],
      points,
    };
  }
  return {
    id: crypto.randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    importedAt: timestamp,
    date: timestamp,
    status: "in_progress",
    format: MATCH_FORMAT,
    matchType: normalizedMatchType,
    scoringFormat: normalizeScoringFormat(scoringFormat),
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
  const matchType = normalizeMatchType(match.matchType);
  if (matchType === "doubles") {
    if (
      typeof match.teamA?.player1 !== "string" || !match.teamA.player1.trim() ||
      typeof match.teamA?.player2 !== "string" || !match.teamA.player2.trim() ||
      typeof match.teamB?.player1 !== "string" || !match.teamB.player1.trim() ||
      typeof match.teamB?.player2 !== "string" || !match.teamB.player2.trim()
    ) {
      throw new Error("Imported doubles match must include all 4 player names.");
    }
    if (!Array.isArray(match.setConfigs)) {
      throw new Error("Imported doubles match is missing set configuration.");
    }
  } else if (typeof match.playerA !== "string" || !match.playerA.trim() || typeof match.playerB !== "string" || !match.playerB.trim()) {
    throw new Error("Imported match must include both player names.");
  }
  normalizeScoringFormat(match.scoringFormat);
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
    if (!payload || typeof payload !== "object" || !payload.match || !Array.isArray(payload.entries)) {
      throw new Error("JSON does not match the exported match format.");
    }
  }
  if (typeof payload.match.id !== "string" || !payload.match.id) {
    throw new Error("JSON export is missing the original match id.");
  }

  if (normalizeMatchType(payload.match.matchType) === "doubles") {
    const importedMatch = createImportedMatch({
      matchType: "doubles",
      scoringFormat: payload.match.scoringFormat,
      teamA: payload.match.teamA,
      teamB: payload.match.teamB,
      setConfigs: payload.match.setConfigs,
      points: [],
    });
    validateImportedMatchShape(importedMatch);
    return importedMatch;
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
  if (Array.isArray(payload.entries)) {
    payload.entries.forEach((entry) => {
      points.push(validateImportedPoint(entry));
    });
  } else {
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
          type: "point",
          serveResult: point.serveResult,
          outcome: point.outcome || "uncertain",
          resultShotType: point.resultShotType || point.shotType || "uncertain",
          precedingShotType: point.precedingShotType || point.forcingShotType || "uncertain",
          rallyLength: point.rallyLength || "uncertain",
          winner: playerLookup.get(point.winner),
          flagged: normalizeFlagged(point.flagged),
          excludeFromStats: normalizeExcludeFromStats(point.excludeFromStats),
          netApproachStates: Array.isArray(point.netApproachStates)
            ? point.netApproachStates.map((value) => (value === "yes" ? 1 : value === "no" ? 0 : null))
            : sanitizePlayerIndexes(point.netApproachPlayers).reduce((states, playerIndex) => {
              states[playerIndex] = 1;
              return states;
            }, createEmptyTriStates()),
          returnWinnerStates: Array.isArray(point.returnWinnerStates)
            ? point.returnWinnerStates.map((value) => (value === "yes" ? 1 : value === "no" ? 0 : null))
            : sanitizePlayerIndexes(point.returnWinnerPlayers).reduce((states, playerIndex) => {
              states[playerIndex] = 1;
              return states;
            }, createEmptyTriStates()),
        }));
      });
    });
  });
  }

  const importedMatch = createImportedMatch({
    playerA,
    playerB,
    initialServer: playerLookup.get(initialServerName),
    matchType: payload.match.matchType,
    scoringFormat: payload.match.scoringFormat,
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
    "result_shot_type",
    "preceding_shot_type",
    "rally_length",
    "score_before",
    "score_after",
    "break_point",
    "net_player_a",
    "net_player_b",
    "return_winner_player_a",
    "return_winner_player_b",
    "flagged",
    "exclude_from_stats",
  ];
  const legacyHeaders = [
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
    "forcing_shot_type",
    "rally_length",
    "score_before",
    "score_after",
    "break_point",
    "net_approach",
    "net_players",
    "return_winner",
    "return_winner_players",
    "flagged",
    "exclude_from_stats",
  ];
  const matchesNew = headers.length === expectedHeaders.length && headers.every((header, index) => header === expectedHeaders[index]);
  const matchesLegacy = headers.length === legacyHeaders.length && headers.every((header, index) => header === legacyHeaders[index]);
  if (!matchesNew && !matchesLegacy) {
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
      resultShotType: matchesNew ? record.result_shot_type : record.shot_type,
      precedingShotType: matchesNew ? record.preceding_shot_type : record.forcing_shot_type,
      rallyLength: record.rally_length,
      winner: playerLookup.get(record.winner.trim()),
      netApproachStates: matchesNew
        ? [
          record.net_player_a === "yes" ? 1 : record.net_player_a === "no" ? 0 : null,
          record.net_player_b === "yes" ? 1 : record.net_player_b === "no" ? 0 : null,
        ]
        : parsePlayerList(record.net_players, playerLookup).reduce((states, playerIndex) => {
          states[playerIndex] = 1;
          return states;
        }, createEmptyTriStates()),
      returnWinnerStates: matchesNew
        ? [
          record.return_winner_player_a === "yes" ? 1 : record.return_winner_player_a === "no" ? 0 : null,
          record.return_winner_player_b === "yes" ? 1 : record.return_winner_player_b === "no" ? 0 : null,
        ]
        : parsePlayerList(record.return_winner_players, playerLookup).reduce((states, playerIndex) => {
          states[playerIndex] = 1;
          return states;
        }, createEmptyTriStates()),
      flagged: record.flagged === "yes",
      excludeFromStats: record.exclude_from_stats === "yes",
    }));

  const importedMatch = createImportedMatch({
    playerA,
    playerB,
    initialServer: playerLookup.get(firstRecord.server.trim()),
    matchType: "singles",
    scoringFormat: "ad",
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
  const title = matchTitle(view.match);
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
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
      title,
      text: `${title} tennis match export`,
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
  const forcedWinner = pointWinnerFromServeResult(draft.serveResult, server);
  if (forcedWinner !== null) {
    draft.winner = String(forcedWinner);
    if (draft.serveResult === "ace" && draft.outcome === "uncertain") {
      draft.outcome = "winner";
    }
    if (draft.serveResult === "double_fault" && draft.outcome === "uncertain") {
      draft.outcome = "unforced_error";
    }
  }
  if (draft.winner === "") {
    return "Select who won the point.";
  }
  return "";
}

function getCheckpointDraftFromComputed(computed) {
  return {
    setScore: computed.liveSetGames.map(String),
    gameScore: computed.liveGamePoints.map(String),
    server: String(computed.liveServer),
    isTiebreak: computed.liveGameIsTiebreak || computed.liveSetIsMatchTiebreak,
  };
}

function getCheckpointDraftFromEntry(entry) {
  return {
    setScore: sanitizeNumericScorePair(entry.setScore, [0, 0]).map(String),
    gameScore: sanitizeNumericScorePair(entry.gameScore, [0, 0]).map(String),
    server: String(Number(entry.server) === 1 ? 1 : 0),
    isTiebreak: Boolean(entry.isTiebreak || entry.isSuperTiebreak),
  };
}

function normalizeCheckpointDraft(draft) {
  const isTiebreak = Boolean(draft.isTiebreak);
  return {
    setScore: sanitizeNumericScorePair(draft.setScore, [0, 0]),
    gameScore: isTiebreak
      ? sanitizeNumericScorePair(draft.gameScore, [0, 0])
      : draft.gameScore.map((value) => standardPointLabelToValue(value)),
    server: Number(draft.server) === 1 ? 1 : 0,
    isTiebreak,
  };
}

function validateCheckpointDraft(draft) {
  const normalized = normalizeCheckpointDraft(draft);
  const [setA, setB] = normalized.setScore;
  const [gameA, gameB] = normalized.gameScore;

  if (setA > 7 || setB > 7) {
    return "Set score must stay within standard set bounds.";
  }
  if (!normalized.isTiebreak && (gameA > 4 || gameB > 4)) {
    return "Standard game scores must be 0, 15, 30, 40, or Ad.";
  }
  if (!normalized.isTiebreak && gameA === 4 && gameB === 4) {
    return "Both players cannot have Ad at the same time.";
  }
  return "";
}

function openAdjustmentModal() {
  const view = derivedCurrentMatch();
  if (!view || view.computed.matchWinner !== null) {
    return;
  }
  state.editor = {
    entryId: "",
    entryType: "point",
    draft: createEmptyDraft(),
  };
  state.adjustment.open = true;
  state.adjustment.editId = "";
  state.adjustment.draft = getCheckpointDraftFromComputed(view.computed);
  render();
}

function openAdjustmentEditor(entry) {
  state.editor = {
    entryId: "",
    entryType: "point",
    draft: createEmptyDraft(),
  };
  state.adjustment.open = true;
  state.adjustment.editId = entry.id;
  state.adjustment.draft = getCheckpointDraftFromEntry(entry);
  render();
}

function closeAdjustmentModal() {
  state.adjustment.open = false;
  state.adjustment.editId = "";
  state.adjustment.draft = createEmptyCheckpointDraft();
  render();
}

async function applyCheckpointDraft() {
  const view = derivedCurrentMatch();
  if (!view) {
    return;
  }
  const error = validateCheckpointDraft(state.adjustment.draft);
  if (error) {
    state.error = error;
    render();
    return;
  }

  const normalized = normalizeCheckpointDraft(state.adjustment.draft);
  const nextEntry = {
    id: state.adjustment.editId || crypto.randomUUID(),
    type: "checkpoint",
    setScore: normalized.setScore,
    gameScore: normalized.gameScore,
    server: normalized.server,
    timestamp: new Date().toISOString(),
  };

  if (state.adjustment.editId) {
    const entryIndex = view.match.points.findIndex((point) => point.id === state.adjustment.editId);
    if (entryIndex < 0) {
      return;
    }
    view.match.points[entryIndex] = {
      ...view.match.points[entryIndex],
      ...nextEntry,
    };
  } else {
    view.match.points.push(nextEntry);
  }

  await saveMatch(view.match);
  state.error = "";
  closeAdjustmentModal();
}

async function createMatchFromSetup() {
  if (state.setup.matchType === "doubles") {
    const doublesSetup = state.setup.doublesSetup;
    const teamA = {
      player1: doublesSetup.teamA.player1.trim(),
      player2: doublesSetup.teamA.player2.trim(),
    };
    const teamB = {
      player1: doublesSetup.teamB.player1.trim(),
      player2: doublesSetup.teamB.player2.trim(),
    };
    if (!teamA.player1 || !teamA.player2 || !teamB.player1 || !teamB.player2) {
      state.error = "Enter all 4 player names.";
      render();
      return;
    }
    if (!doublesSetup.serveOrder.every((playerIndex) => Number.isInteger(playerIndex))) {
      state.error = "Complete the Set 1 serve order.";
      render();
      return;
    }
    const match = createMatchRecord({
      matchType: "doubles",
      scoringFormat: doublesSetup.scoringFormat,
      teamA,
      teamB,
      setConfigs: [
        {
          serveOrder: [...doublesSetup.serveOrder],
          receiveFormation: {
            teamA: { ...doublesSetup.receiveFormation.teamA },
            teamB: { ...doublesSetup.receiveFormation.teamB },
          },
        },
      ],
    });
    await saveMatch(match);
    state.currentMatchId = match.id;
    localStorage.setItem(STORAGE_KEY, match.id);
    state.currentTab = "live";
    resetDrafts();
    state.setup = createInitialSetupState();
    state.error = "";
    render();
    return;
  }
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
    matchType: state.setup.matchType,
    scoringFormat: state.setup.scoringFormat,
  });
  await saveMatch(match);
  state.currentMatchId = match.id;
  localStorage.setItem(STORAGE_KEY, match.id);
  state.currentTab = "live";
  resetDrafts();
  state.setup = createInitialSetupState();
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
    type: "point",
    serveResult: draft.serveResult,
    outcome: normalizeOutcome(draft.outcome),
    resultShotType: normalizeShotType(draft.resultShotType),
    precedingShotType: normalizeShotType(draft.precedingShotType),
    rallyLength: normalizeRallyLength(draft.rallyLength),
    winner: Number(draft.winner),
    flagged: Boolean(draft.flagged),
    excludeFromStats: Boolean(draft.excludeFromStats),
    netApproachStates: sanitizeTriStates(draft.netApproachStates),
    returnWinnerStates: sanitizeTriStates(draft.returnWinnerStates),
    timestamp: new Date().toISOString(),
  });
  await saveMatch(view.match);
  state.error = "";
  state.exportMessage = "";
  state.history = {
    ...state.history,
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
  if (!view || !state.editor.entryId || state.editor.entryType !== "point") {
    return;
  }
  const pointIndex = view.match.points.findIndex((point) => point.id === state.editor.entryId);
  if (pointIndex < 0) {
    return;
  }
  const draft = structuredClone(state.editor.draft);
  const original = view.match.points[pointIndex];
  const derivedPoint = flattenPoints(view.computed).find((point) => point.id === original.id);
  const validationError = validatePointDraft(draft, { liveServer: derivedPoint?.server ?? view.computed.liveServer });
  if (validationError) {
    state.error = validationError;
    render();
    return;
  }

  view.match.points[pointIndex] = {
    ...original,
    type: "point",
    serveResult: draft.serveResult,
    outcome: normalizeOutcome(draft.outcome),
    resultShotType: normalizeShotType(draft.resultShotType),
    precedingShotType: normalizeShotType(draft.precedingShotType),
    rallyLength: normalizeRallyLength(draft.rallyLength),
    winner: Number(draft.winner),
    flagged: Boolean(draft.flagged),
    excludeFromStats: Boolean(draft.excludeFromStats),
    netApproachStates: sanitizeTriStates(draft.netApproachStates),
    returnWinnerStates: sanitizeTriStates(draft.returnWinnerStates),
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
  const targetEntry = view.match.points[target];
  if (!window.confirm(`Delete this ${isCheckpointEntry(targetEntry) ? "score adjustment" : "point"}?`)) {
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
  if (!point) {
    return;
  }
  if (isCheckpointEntry(point)) {
    openAdjustmentEditor(point);
    return;
  }
  const derivedPoint = view ? flattenPoints(view.computed).find((entry) => entry.id === pointId) : null;
  if (!derivedPoint) {
    return;
  }
  state.adjustment = {
    open: false,
    editId: "",
    draft: createEmptyCheckpointDraft(),
  };
  state.editor.entryId = pointId;
  state.editor.entryType = "point";
  state.editor.draft = {
    serveResult: point.serveResult,
    outcome: normalizeOutcome(point.outcome),
    resultShotType: normalizeShotType(point.resultShotType ?? point.shotType),
    precedingShotType: normalizeShotType(point.precedingShotType ?? point.forcingShotType),
    rallyLength: normalizeRallyLength(point.rallyLength),
    winner: String(point.winner),
    flagged: normalizeFlagged(point.flagged),
    excludeFromStats: normalizeExcludeFromStats(point.excludeFromStats),
    netApproachStates: sanitizeTriStates(derivedPoint.netApproachStates),
    returnWinnerStates: sanitizeTriStates(derivedPoint.returnWinnerStates),
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
  state.history = { ...state.history, setIndex, gameIndex };
  render();
}

function setDraftValue(target, key, value) {
  state[target][key] = value;
  if (key === "serveResult") {
    if (value === "ace") {
      state[target].outcome = "winner";
    } else if (value === "double_fault") {
      state[target].outcome = "unforced_error";
    }
  }
  render();
}

function updateEditorDraft(key, value) {
  state.editor.draft[key] = value;
  if (key === "serveResult") {
    if (value === "ace") {
      state.editor.draft.outcome = "winner";
    } else if (value === "double_fault") {
      state.editor.draft.outcome = "unforced_error";
    }
  }
  render();
}

function toggleOptionalChoice(target, key, value) {
  setDraftValue(target, key, value);
}

function toggleEditorOptionalChoice(key, value) {
  updateEditorDraft(key, value);
}

function updateAdjustmentDraft(key, value) {
  state.adjustment.draft[key] = value;
  render();
}

function updateAdjustmentScore(key, playerIndex, value) {
  const next = [...state.adjustment.draft[key]];
  next[playerIndex] = value;
  state.adjustment.draft[key] = next;
  if (key === "setScore") {
    const normalizedSet = sanitizeNumericScorePair(next, [0, 0]);
    if (normalizedSet[0] === 6 && normalizedSet[1] === 6) {
      state.adjustment.draft.isTiebreak = true;
    }
  }
  render();
}

function updateFlagState(flagStates, playerIndex, value) {
  const next = sanitizeTriStates(flagStates);
  const normalized = value === "yes" ? 1 : value === "no" ? 0 : null;
  next[playerIndex] = next[playerIndex] === normalized ? null : normalized;
  return next;
}

function renderMetric(title, value, detail = "") {
  return `
    <div class="rounded-2xl border border-white/10 bg-white/5 p-4 md:p-3">
      <p class="text-xs uppercase tracking-[0.24em] text-court-300/70">${title}</p>
      <p class="mt-2 font-mono text-2xl text-white md:text-xl">${value}</p>
      ${detail ? `<p class="mt-1 text-sm text-court-200/60 md:text-xs">${detail}</p>` : ""}
    </div>
  `;
}

function renderPointComposer(match, computed, draft, prefix, context = null) {
  const serverIndex = context?.server ?? computed.liveServer;
  const receiverIndex = context?.receiver ?? 1 - serverIndex;
  const serverName = playerName(match, serverIndex);
  const receiverName = playerName(match, receiverIndex);
  const forcedWinner = pointWinnerFromServeResult(draft.serveResult, serverIndex);
  const winnerIndex = draft.winner === "" ? null : Number(draft.winner);
  const loserIndex = winnerIndex === 0 || winnerIndex === 1 ? 1 - winnerIndex : null;
  const submitLabel = prefix === "edit" ? "Save Point Changes" : "Submit Point";
  const resultShotLabel = draft.outcome === "winner" && winnerIndex !== null
    ? `Winning Shot (by ${playerName(match, winnerIndex)})`
    : (draft.outcome === "unforced_error" || draft.outcome === "forced_error") && loserIndex !== null
      ? `Error Shot (by ${playerName(match, loserIndex)})`
      : "Decisive Shot";
  const precedingShotLabel = draft.outcome === "winner" && loserIndex !== null
    ? `Setup Shot (by ${playerName(match, loserIndex)})`
    : draft.outcome === "unforced_error" && winnerIndex !== null
      ? `Preceding Shot (by ${playerName(match, winnerIndex)})`
      : draft.outcome === "forced_error" && winnerIndex !== null
        ? `Forcing Shot (by ${playerName(match, winnerIndex)})`
        : "Preceding Shot";
  return `
    <section class="rounded-[2rem] border border-white/10 bg-court-900/80 p-4 shadow-panel backdrop-blur md:p-3.5">
      <div>
        <div>
          <p class="text-xs uppercase tracking-[0.3em] text-court-300/70">Point Entry</p>
          <p class="mt-2 text-sm text-court-200/70 md:text-xs">Server: <span class="font-semibold text-white">${serverName}</span> · Returner: <span class="font-semibold text-white">${receiverName}</span></p>
        </div>
      </div>
      <div class="mt-5 space-y-5 md:mt-4 md:space-y-4">
        <div class="space-y-4 rounded-[1.75rem] border border-white/10 bg-white/5 p-4">
          <p class="text-xs uppercase tracking-[0.3em] text-court-300/70">Required</p>
          ${renderChoiceGrid("Serve Result", SERVE_OPTIONS, draft.serveResult, `${prefix}-serve`, "grid-cols-2")}
          ${renderChoiceGrid(
            "Point Winner",
            [
              { value: "0", label: match.playerA, hint: forcedWinner === 0 ? "Auto from serve result" : "" },
              { value: "1", label: match.playerB, hint: forcedWinner === 1 ? "Auto from serve result" : "" },
            ],
            forcedWinner !== null ? String(forcedWinner) : draft.winner,
            `${prefix}-winner`,
            "grid-cols-2",
            false,
            forcedWinner !== null
          )}
        </div>
        <div class="space-y-4 rounded-[1.75rem] border border-white/10 bg-white/5 p-4">
          <p class="text-xs uppercase tracking-[0.3em] text-court-300/70">Optional</p>
          ${renderChoiceGrid("Point Outcome", OUTCOME_OPTIONS, draft.outcome, `${prefix}-outcome`, "grid-cols-4")}
          ${renderChoiceGrid(precedingShotLabel, [
            { value: "forehand", label: "FH" },
            { value: "backhand", label: "BH" },
            { value: "volley", label: "Volley" },
            { value: "overhead", label: "OH" },
            { value: "drop_shot", label: "Drop" },
            { value: "uncertain", label: "Uncertain", muted: true },
          ], draft.precedingShotType, `${prefix}-preceding-shot`, "grid-cols-3 sm:grid-cols-6")}
          ${renderChoiceGrid(resultShotLabel, [
            { value: "forehand", label: "FH" },
            { value: "backhand", label: "BH" },
            { value: "volley", label: "Volley" },
            { value: "overhead", label: "OH" },
            { value: "drop_shot", label: "Drop" },
            { value: "uncertain", label: "Uncertain", muted: true },
          ], draft.resultShotType, `${prefix}-result-shot`, "grid-cols-3 sm:grid-cols-6")}
          ${renderChoiceGrid("Rally Length", RALLY_LENGTH_OPTIONS.map((option) => ({ ...option, muted: option.value === "uncertain" })), draft.rallyLength, `${prefix}-rally`, "grid-cols-3")}
          <div class="rounded-[1.5rem] border border-white/10 bg-court-950/40 p-4">
            <p class="text-sm font-semibold text-white">Flags</p>
            <div class="mt-4 space-y-4">
              ${renderPlayerToggleSection(prefix, "netApproachStates", "Net Approach", match, draft.netApproachStates)}
              ${renderPlayerToggleSection(prefix, "returnWinnerStates", "Return Winner", match, draft.returnWinnerStates)}
              <div class="grid gap-3 sm:grid-cols-2">
                ${renderBooleanToggle(prefix, "flagged", "Flag", draft.flagged)}
                ${renderBooleanToggle(prefix, "excludeFromStats", "Exclude from Stats", draft.excludeFromStats)}
              </div>
            </div>
          </div>
        </div>
        <button data-action="${prefix}-save" class="w-full rounded-2xl bg-emerald-500 px-5 py-5 text-base font-semibold text-emerald-950 transition hover:bg-emerald-400 md:px-4 md:py-4 md:text-sm">
          ${submitLabel}
        </button>
      </div>
    </section>
  `;
}

function renderBooleanToggle(prefix, key, label, selected, description = "") {
  const knobPosition = selected ? "translate-x-5" : "translate-x-0";
  return `
    <div class="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 md:p-3">
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-sm font-semibold text-white md:text-xs">${label}</p>
          ${description ? `<p class="mt-1 text-sm text-court-200/60 md:text-xs">${description}</p>` : ""}
        </div>
        <button
          data-action="${prefix}-toggle-boolean"
          data-key="${key}"
          aria-pressed="${selected ? "true" : "false"}"
          class="relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition md:h-7 md:w-12 ${
            selected
              ? "border-court-300/50 bg-court-300/25"
              : "border-white/10 bg-court-950/70"
          }"
        >
          <span class="pointer-events-none absolute inset-x-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] ${selected ? "text-court-950/75" : "text-court-200/60"}">
            <span>Off</span>
            <span>On</span>
          </span>
          <span class="pointer-events-none absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow-[0_4px_12px_rgba(15,23,42,0.35)] transition-transform md:h-5 md:w-5 ${knobPosition}"></span>
        </button>
      </div>
    </div>
  `;
}

function renderChoiceGrid(label, options, selected, action, gridClass, allowUnset = false, lockSelected = false) {
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
                data-allow-unset="${allowUnset ? "yes" : "no"}"
                class="min-h-14 rounded-2xl border px-4 py-4 text-sm font-medium transition md:min-h-12 md:px-3 md:py-3 md:text-xs ${
                  active
                    ? "border-court-300 bg-court-300 text-court-950"
                    : option.muted
                      ? "border-white/10 bg-court-950/30 text-court-200/55 hover:border-court-300/35"
                      : "border-white/10 bg-white/5 text-court-100 hover:border-court-400/70"
                }"
                ${(option.disabled || (lockSelected && !active)) ? "disabled" : ""}
              >
                <span>${option.label}</span>
                ${option.hint ? `<span class="mt-1 block text-[11px] font-normal ${active ? "text-court-950/70" : "text-court-200/50"}">${option.hint}</span>` : ""}
              </button>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function doublesPlayerLabel(setup, playerIndex) {
  const name = playerIndex === 0
    ? setup.teamA.player1
    : playerIndex === 1
      ? setup.teamA.player2
      : playerIndex === 2
        ? setup.teamB.player1
        : setup.teamB.player2;
  return name.trim() || `Player ${playerIndex + 1}`;
}

function renderDoublesFormationOptions(teamKey, label, players, formation) {
  const firstOption = {
    deuce: players[0].index,
    ad: players[1].index,
    label: `${players[0].name} Deuce / ${players[1].name} Ad`,
  };
  const secondOption = {
    deuce: players[1].index,
    ad: players[0].index,
    label: `${players[1].name} Deuce / ${players[0].name} Ad`,
  };
  const selected = formation.deuce === firstOption.deuce && formation.ad === firstOption.ad ? "first" : "second";
  return `
    <div class="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
      <p class="text-sm font-semibold text-white">${label}</p>
      <p class="mt-2 text-sm text-court-200/65">When receiving, who covers deuce court (right side)?</p>
      <div class="mt-4 grid gap-3 sm:grid-cols-2">
        ${[
          { value: "first", label: firstOption.label },
          { value: "second", label: secondOption.label },
        ].map((option) => `
          <button
            data-action="setup-doubles-formation"
            data-team="${teamKey}"
            data-value="${option.value}"
            class="rounded-2xl border px-4 py-4 text-sm font-medium ${
              selected === option.value
                ? "border-court-300 bg-court-300 text-court-950"
                : "border-white/10 bg-court-950/30 text-court-100"
            }"
          >
            ${escapeHtml(option.label)}
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

function renderDoublesSetup() {
  const doublesSetup = state.setup.doublesSetup;
  const firstServer = doublesSetup.serveOrder[0];
  const secondServer = doublesSetup.serveOrder[1];
  const teamAPlayers = [
    { index: 0, name: doublesPlayerLabel(doublesSetup, 0) },
    { index: 1, name: doublesPlayerLabel(doublesSetup, 1) },
  ];
  const teamBPlayers = [
    { index: 2, name: doublesPlayerLabel(doublesSetup, 2) },
    { index: 3, name: doublesPlayerLabel(doublesSetup, 3) },
  ];
  const firstServerOptions = [...teamAPlayers, ...teamBPlayers];
  const secondServerOptions = firstServer === null
    ? []
    : firstServerOptions.filter((player) => getTeamIndex(player.index) !== getTeamIndex(firstServer));
  const serveOrderComplete = doublesSetup.serveOrder.every((playerIndex) => Number.isInteger(playerIndex));

  return `
    <div class="mt-6 space-y-5">
      <div class="grid gap-4 sm:grid-cols-2">
        <div class="space-y-4">
          <p class="text-xs uppercase tracking-[0.3em] text-court-300/70">Team A</p>
          <label class="block rounded-2xl border border-white/10 bg-white/5 p-4">
            <span class="text-xs uppercase tracking-[0.3em] text-court-300/70">Player 1</span>
            <input data-action="setup-doubles-input" data-team="teamA" data-player="player1" value="${escapeHtml(doublesSetup.teamA.player1)}" class="mt-3 w-full bg-transparent text-lg text-white outline-none placeholder:text-court-200/35" placeholder="Player 1" />
          </label>
          <label class="block rounded-2xl border border-white/10 bg-white/5 p-4">
            <span class="text-xs uppercase tracking-[0.3em] text-court-300/70">Player 2</span>
            <input data-action="setup-doubles-input" data-team="teamA" data-player="player2" value="${escapeHtml(doublesSetup.teamA.player2)}" class="mt-3 w-full bg-transparent text-lg text-white outline-none placeholder:text-court-200/35" placeholder="Player 2" />
          </label>
        </div>
        <div class="space-y-4">
          <p class="text-xs uppercase tracking-[0.3em] text-court-300/70">Team B</p>
          <label class="block rounded-2xl border border-white/10 bg-white/5 p-4">
            <span class="text-xs uppercase tracking-[0.3em] text-court-300/70">Player 3</span>
            <input data-action="setup-doubles-input" data-team="teamB" data-player="player1" value="${escapeHtml(doublesSetup.teamB.player1)}" class="mt-3 w-full bg-transparent text-lg text-white outline-none placeholder:text-court-200/35" placeholder="Player 3" />
          </label>
          <label class="block rounded-2xl border border-white/10 bg-white/5 p-4">
            <span class="text-xs uppercase tracking-[0.3em] text-court-300/70">Player 4</span>
            <input data-action="setup-doubles-input" data-team="teamB" data-player="player2" value="${escapeHtml(doublesSetup.teamB.player2)}" class="mt-3 w-full bg-transparent text-lg text-white outline-none placeholder:text-court-200/35" placeholder="Player 4" />
          </label>
        </div>
      </div>
      ${renderChoiceGrid(
        "Scoring Format",
        [
          { value: "ad", label: "Ad Scoring" },
          { value: "no_ad", label: "No-Ad Scoring" },
        ],
        doublesSetup.scoringFormat,
        "setup-doubles-scoring-format",
        "grid-cols-2"
      )}
      <div class="rounded-[1.75rem] border border-white/10 bg-white/5 p-4">
        <p class="text-xs uppercase tracking-[0.3em] text-court-300/70">Set 1 Serve Order</p>
        <div class="mt-4 space-y-4">
          <div>
            <p class="mb-3 text-sm font-semibold text-white">1st Server</p>
            <div class="grid gap-3 sm:grid-cols-2">
              ${firstServerOptions.map((player) => `
                <button
                  data-action="setup-doubles-first-server"
                  data-value="${player.index}"
                  class="rounded-2xl border px-4 py-4 text-sm font-medium ${
                    firstServer === player.index
                      ? "border-court-300 bg-court-300 text-court-950"
                      : "border-white/10 bg-court-950/30 text-court-100"
                  }"
                >
                  ${escapeHtml(player.name)}
                </button>
              `).join("")}
            </div>
          </div>
          ${
            firstServer !== null
              ? `
                <div>
                  <p class="mb-3 text-sm font-semibold text-white">2nd Server</p>
                  <div class="grid gap-3 sm:grid-cols-2">
                    ${secondServerOptions.map((player) => `
                      <button
                        data-action="setup-doubles-second-server"
                        data-value="${player.index}"
                        class="rounded-2xl border px-4 py-4 text-sm font-medium ${
                          secondServer === player.index
                            ? "border-court-300 bg-court-300 text-court-950"
                            : "border-white/10 bg-court-950/30 text-court-100"
                        }"
                      >
                        ${escapeHtml(player.name)}
                      </button>
                    `).join("")}
                  </div>
                </div>
              `
              : ""
          }
          ${
            serveOrderComplete
              ? `<div class="rounded-2xl border border-court-300/25 bg-court-300/10 px-4 py-4 text-sm text-court-100">
                  1st: <span class="font-semibold text-white">${escapeHtml(doublesPlayerLabel(doublesSetup, doublesSetup.serveOrder[0]))}</span>
                  &rarr; 2nd: <span class="font-semibold text-white">${escapeHtml(doublesPlayerLabel(doublesSetup, doublesSetup.serveOrder[1]))}</span>
                  &rarr; 3rd: <span class="font-semibold text-white">${escapeHtml(doublesPlayerLabel(doublesSetup, doublesSetup.serveOrder[2]))}</span>
                  &rarr; 4th: <span class="font-semibold text-white">${escapeHtml(doublesPlayerLabel(doublesSetup, doublesSetup.serveOrder[3]))}</span>
                </div>`
              : `<p class="text-sm text-court-200/65">${firstServer === null ? "Pick any player to serve first." : "Pick the second server from the other team."}</p>`
          }
        </div>
      </div>
      <div class="space-y-4">
        <p class="text-xs uppercase tracking-[0.3em] text-court-300/70">Set 1 Receive Formation</p>
        ${renderDoublesFormationOptions("teamA", "Team A", teamAPlayers, doublesSetup.receiveFormation.teamA)}
        ${renderDoublesFormationOptions("teamB", "Team B", teamBPlayers, doublesSetup.receiveFormation.teamB)}
      </div>
      <button data-action="start-match" class="w-full rounded-2xl bg-court-300 px-5 py-5 text-base font-semibold text-court-950 transition hover:bg-court-200">
        Start Match
      </button>
    </div>
  `;
}

function renderPlayerToggleSection(prefix, key, label, match, flagStates) {
  const states = sanitizeTriStates(flagStates);
  const positions = {
    uncertain: "translateX(0)",
    no: "translateX(calc(100% + 0.25rem))",
    yes: "translateX(calc(200% + 0.5rem))",
  };
  return `
    <div class="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 md:p-3">
      <p class="text-sm font-semibold text-white md:text-xs">${label}</p>
      <div class="mt-4 space-y-3 md:mt-3">
        ${[0, 1]
          .map((playerIndex) => {
            const selectedState = states[playerIndex];
            const selectedValue = selectedState === 1 ? "yes" : selectedState === 0 ? "no" : "uncertain";
            return `
              <div class="flex items-center justify-between gap-3">
                <p class="text-sm text-court-100 md:text-xs">${escapeHtml(playerName(match, playerIndex))}</p>
                <div class="relative grid min-w-[15rem] grid-cols-3 gap-1 rounded-full border border-white/10 bg-court-950/70 p-1 md:min-w-[13rem]">
                  <span class="pointer-events-none absolute bottom-1 left-1 top-1 rounded-full bg-white/12 shadow-[0_4px_10px_rgba(15,23,42,0.3)] transition-transform" style="width: calc((100% - 0.5rem) / 3); transform: ${positions[selectedValue]};"></span>
                  <button
                    data-action="${prefix}-player-flag"
                    data-key="${key}"
                    data-player="${playerIndex}"
                    data-value="uncertain"
                    aria-pressed="${selectedValue === "uncertain" ? "true" : "false"}"
                    class="relative z-10 rounded-full px-4 py-2 text-sm font-medium transition md:px-3 md:py-1.5 md:text-xs ${
                      selectedValue === "uncertain"
                        ? "text-white"
                        : "text-court-200/55 hover:text-court-100"
                    }"
                  >
                    Unc
                  </button>
                  <button
                    data-action="${prefix}-player-flag"
                    data-key="${key}"
                    data-player="${playerIndex}"
                    data-value="no"
                    aria-pressed="${selectedValue === "no" ? "true" : "false"}"
                    class="relative z-10 rounded-full px-4 py-2 text-sm font-medium transition md:px-3 md:py-1.5 md:text-xs ${
                      selectedValue === "no"
                        ? "text-white"
                        : "text-court-200/55 hover:text-court-100"
                    }"
                  >
                    No
                  </button>
                  <button
                    data-action="${prefix}-player-flag"
                    data-key="${key}"
                    data-player="${playerIndex}"
                    data-value="yes"
                    aria-pressed="${selectedValue === "yes" ? "true" : "false"}"
                    class="relative z-10 rounded-full px-4 py-2 text-sm font-medium transition md:px-3 md:py-1.5 md:text-xs ${
                      selectedValue === "yes"
                        ? "text-white"
                        : "text-court-200/55 hover:text-court-100"
                    }"
                  >
                    Yes
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
  const showSinglesSetup = state.setup.matchType === "singles";
  const showDoublesSetup = state.setup.matchType === "doubles";
  return `
    <main class="px-4 py-6 sm:px-6">
      <input id="match-import-input" type="file" accept=".json,.csv,application/json,text/csv" class="hidden" />
      <section class="rounded-[2rem] border border-white/10 bg-court-900/80 p-6 shadow-panel backdrop-blur">
        <p class="text-xs uppercase tracking-[0.35em] text-court-300/70">Tennis Tracker</p>
        <h1 class="mt-3 text-3xl font-bold text-white">Start a match and log every point courtside.</h1>
        <p class="mt-3 max-w-2xl text-sm text-court-200/70">Offline-first scoring, full point history, per-set stats, and one-tap exports.</p>
        <div class="mt-6 grid gap-3 sm:grid-cols-2">
          <button data-action="setup-match-type" data-value="singles" class="rounded-[1.75rem] border px-5 py-6 text-left transition ${showSinglesSetup ? "border-court-300 bg-court-300/10" : "border-white/10 bg-white/5 hover:border-court-300/50"}">
            <span class="block text-xs uppercase tracking-[0.3em] ${showSinglesSetup ? "text-court-300" : "text-court-300/70"}">Match Type</span>
            <span class="mt-3 block text-xl font-semibold text-white">Singles Match</span>
          </button>
          <button data-action="setup-match-type" data-value="doubles" class="rounded-[1.75rem] border px-5 py-6 text-left transition ${showDoublesSetup ? "border-court-300 bg-court-300/10" : "border-white/10 bg-white/5 hover:border-court-300/50"}">
            <span class="block text-xs uppercase tracking-[0.3em] ${showDoublesSetup ? "text-court-300" : "text-court-300/70"}">Match Type</span>
            <span class="mt-3 block text-xl font-semibold text-white">Doubles Match</span>
          </button>
        </div>
        ${
          showSinglesSetup
            ? `
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
                  "Scoring Format",
                  [
                    { value: "ad", label: "Ad Scoring" },
                    { value: "no_ad", label: "No-Ad Scoring" },
                  ],
                  state.setup.scoringFormat,
                  "setup-scoring-format",
                  "grid-cols-2"
                )}
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
            `
            : showDoublesSetup
              ? renderDoublesSetup()
              : ""
        }
        <button data-action="import-match" class="mt-3 w-full rounded-2xl border border-court-300/35 bg-transparent px-5 py-5 text-base font-medium text-court-200 transition hover:border-court-300/60 hover:bg-white/5">
          Import Match
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
                        <p class="font-semibold text-white">${escapeHtml(matchTitle(match))}</p>
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
  if (match.matchType === "doubles") {
    const setConfig = match.setConfigs?.[0] || {};
    const serveOrder = Array.isArray(setConfig.serveOrder) ? setConfig.serveOrder : [];
    const receiveFormation = setConfig.receiveFormation || {};
    return `
      <section class="space-y-4">
        <section class="rounded-[2rem] border border-white/10 bg-court-900/85 p-5 shadow-panel backdrop-blur md:p-4">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-xs uppercase tracking-[0.3em] text-court-300/70">Live Match</p>
              <h2 class="mt-2 text-2xl font-bold text-white md:text-xl">${escapeHtml(matchTitle(match))}</h2>
              <p class="mt-2 text-sm text-court-200/65 md:text-xs">${formatDate(match.date)} · ${MATCH_FORMAT_LABEL}</p>
            </div>
            <div class="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-right md:px-3 md:py-2">
              <p class="text-xs uppercase tracking-[0.25em] text-court-300/60">1st Server</p>
              <p class="mt-1 text-base font-semibold text-white md:text-sm">${escapeHtml(playerName(match, serveOrder[0] ?? 0))}</p>
            </div>
          </div>
          <div class="mt-4 grid gap-4 md:grid-cols-2">
            <div class="rounded-[1.75rem] border border-white/10 bg-court-950/70 p-5">
              <p class="text-xs uppercase tracking-[0.25em] text-court-300/60">Set 1 Serve Order</p>
              <p class="mt-3 text-sm text-court-100">${serveOrder.map((playerIndex, orderIndex) => `${orderIndex + 1}. ${playerName(match, playerIndex)}`).join(" → ")}</p>
            </div>
            <div class="rounded-[1.75rem] border border-white/10 bg-court-950/70 p-5">
              <p class="text-xs uppercase tracking-[0.25em] text-court-300/60">Receive Formation</p>
              <p class="mt-3 text-sm text-court-100">Team A: Deuce ${escapeHtml(playerName(match, receiveFormation.teamA?.deuce ?? 0))} · Ad ${escapeHtml(playerName(match, receiveFormation.teamA?.ad ?? 1))}</p>
              <p class="mt-2 text-sm text-court-100">Team B: Deuce ${escapeHtml(playerName(match, receiveFormation.teamB?.deuce ?? 2))} · Ad ${escapeHtml(playerName(match, receiveFormation.teamB?.ad ?? 3))}</p>
            </div>
          </div>
          <div class="mt-4 rounded-2xl border border-court-300/30 bg-court-300/10 px-4 py-4 text-sm text-court-100">
            Doubles scoring coming soon. Match setup saved.
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
      </section>
    `;
  }
  const visibleSetIndexes = [0, 1];
  if (computed.setsWon[0] === 1 && computed.setsWon[1] === 1) {
    visibleSetIndexes.push(2);
  }
  const setCards = visibleSetIndexes
    .map((setIndex) => {
      const set = computed.sets.find((entry) => entry.index === setIndex);
      const isLiveSet = setIndex === computed.liveSetIndex;
      const isMatchTiebreak = set?.isMatchTiebreak || (isLiveSet && computed.liveSetIsMatchTiebreak);
      const score = set ? getSetDisplayScore(set) : isLiveSet ? computed.liveSetDisplay : [0, 0];
      return `
        <div class="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p class="text-xs uppercase tracking-[0.25em] text-court-300/60">${isMatchTiebreak ? "Match Tiebreak" : `Set ${setIndex + 1}`}</p>
          <div class="mt-3 grid grid-cols-2 gap-2 text-center font-mono text-2xl text-white">
            <span>${score[0]}</span>
            <span>${score[1]}</span>
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
    <section class="space-y-4">
      <div class="grid gap-4 md:grid-cols-2 md:items-start">
        <section class="rounded-[2rem] border border-white/10 bg-court-900/85 p-5 shadow-panel backdrop-blur md:p-4">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-xs uppercase tracking-[0.3em] text-court-300/70">Live Match</p>
              <h2 class="mt-2 text-2xl font-bold text-white md:text-xl">${escapeHtml(sideName(match, 0))} <span class="text-court-300/60">vs</span> ${escapeHtml(sideName(match, 1))}</h2>
              <p class="mt-2 text-sm text-court-200/65 md:text-xs">${formatDate(match.date)} · ${MATCH_FORMAT_LABEL}</p>
            </div>
            <div class="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-right md:px-3 md:py-2">
              <p class="text-xs uppercase tracking-[0.25em] text-court-300/60">Server</p>
              <p class="mt-1 text-base font-semibold text-white md:text-sm">${playerName(match, computed.liveServer)}</p>
            </div>
          </div>
          ${winnerBanner}
          <div class="mt-4 grid gap-3 sm:grid-cols-3">${setCards}</div>
          <div class="mt-4 rounded-[1.75rem] border border-white/10 bg-court-950/70 p-5 md:p-4">
            <div class="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)] md:items-start">
              <div>
                <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
                  <div>
                    <p class="text-sm uppercase tracking-[0.22em] text-court-300/60 md:text-xs">${escapeHtml(sideName(match, 0))}</p>
                    <p class="mt-3 font-mono text-5xl font-semibold text-white md:mt-2 md:text-4xl">${computed.liveScoreDisplay[0]}</p>
                  </div>
                  <span class="text-court-300/30">:</span>
                  <div>
                    <p class="text-sm uppercase tracking-[0.22em] text-court-300/60 md:text-xs">${escapeHtml(sideName(match, 1))}</p>
                    <p class="mt-3 font-mono text-5xl font-semibold text-white md:mt-2 md:text-4xl">${computed.liveScoreDisplay[1]}</p>
                  </div>
                </div>
                <p class="mt-3 text-center text-sm text-court-200/65 md:text-xs">${
                  computed.liveGameType === "super_tiebreak"
                    ? "Super Tiebreak in progress"
                    : computed.liveGameType === "tiebreak"
                      ? "Tiebreak in progress"
                      : "Current game score"
                }</p>
              </div>
              <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                ${renderMetric(
                  computed.liveSetIsMatchTiebreak ? "Match Tiebreak" : "Games In Set",
                  `${computed.liveSetDisplay[0]} - ${computed.liveSetDisplay[1]}`,
                  computed.liveSetIsMatchTiebreak ? "First to 10, win by 2" : `Set ${computed.liveSetIndex + 1}`
                )}
                ${renderMetric("Points Logged", String(computed.totalPoints))}
              </div>
            </div>
            <div class="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p class="text-sm text-court-100">Flagged: <span class="font-semibold text-amber-200">${computed.flaggedPoints}</span></p>
              <button data-action="open-adjust-score" class="rounded-xl border border-white/10 px-4 py-2 text-sm text-court-100 transition hover:border-court-300/40 hover:bg-white/5">
                Adjust Score
              </button>
            </div>
          </div>
        </section>
        ${
          computed.matchWinner === null
            ? renderPointComposer(match, computed, state.draft, "draft")
            : `<section class="rounded-[2rem] border border-white/10 bg-court-900/80 p-5 text-sm text-court-200/70 md:p-4 md:text-xs">
                Start a new match from the matches tab or export this result below.
              </section>`
        }
      </div>
      <div>
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
  const historyEntries = state.history.showFlaggedOnly
    ? flattenHistoryEntries(computed).filter((entry) => entry.type === "point" && normalizeFlagged(entry.flagged))
    : flattenHistoryEntries(computed).filter((entry) => entry.setIndex === set?.index && entry.gameIndex === game?.index);

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
                  <p class="mb-2 text-sm font-semibold text-white">${getSetLabel(setEntry)} · ${getSetDisplayScore(setEntry)[0]}-${getSetDisplayScore(setEntry)[1]}${setEntry.tiebreakScore && !setEntry.isMatchTiebreak ? ` TB ${setEntry.tiebreakScore[0]}-${setEntry.tiebreakScore[1]}` : ""}</p>
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
                                  <span>${gameEntry.isSuperTiebreak ? "Match Tiebreak" : `Game ${gameEntry.index + 1}${gameEntry.isTiebreak ? " · TB" : ""}`}</span>
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
            <h3 class="mt-2 text-xl font-semibold text-white">${state.history.showFlaggedOnly ? "Flagged Points" : `${set ? getSetLabel(set) : "Set 1"}${game ? ` · ${game.isSuperTiebreak ? "Match Tiebreak" : `Game ${game.index + 1}`}` : ""}`}</h3>
          </div>
          <div class="flex items-center gap-2">
            <button data-action="history-toggle-flagged-only" class="rounded-full border px-4 py-2 text-sm ${
              state.history.showFlaggedOnly
                ? "border-amber-400/40 bg-amber-400/15 text-amber-200"
                : "border-white/10 bg-white/5 text-court-200/70"
            }">Show flagged only</button>
            ${!state.history.showFlaggedOnly && game ? `<span class="rounded-full bg-white/5 px-4 py-2 text-sm text-court-200/70">${game.isSuperTiebreak ? "Super Tiebreak" : game.isTiebreak ? "Tiebreak" : "Standard game"}</span>` : ""}
          </div>
        </div>
        <div class="mt-5 space-y-3">
          ${
            historyEntries.length
              ? historyEntries
                  .map(
                    (entry) => entry.type === "checkpoint"
                      ? `
                    <article class="rounded-2xl border border-sky-400/30 bg-sky-400/10 p-4">
                      <div class="flex items-start justify-between gap-4">
                        <div>
                          <p class="font-semibold text-white">Score Adjustment</p>
                          <p class="mt-1 text-sm text-court-200/70">Adjusted to set ${entry.setScore[0]}-${entry.setScore[1]} · game ${entry.gameScore[0]}-${entry.gameScore[1]} · ${playerName(match, entry.server)} serving</p>
                          <p class="mt-2 text-sm text-court-200/55">${entry.isSuperTiebreak ? "Super tiebreak checkpoint" : entry.isTiebreak ? "Tiebreak checkpoint" : "Standard game checkpoint"}</p>
                        </div>
                        <div class="flex gap-2">
                          <button data-action="edit-point" data-id="${entry.id}" class="rounded-xl border border-white/10 px-3 py-2 text-sm text-court-100">Edit</button>
                          <button data-action="delete-point" data-id="${entry.id}" class="rounded-xl border border-red-400/30 px-3 py-2 text-sm text-red-300">Delete</button>
                        </div>
                      </div>
                    </article>
                  `
                      : `
                    <article class="rounded-2xl border ${
                      normalizeFlagged(entry.flagged)
                        ? "border-amber-400/35 bg-amber-400/10"
                        : normalizeExcludeFromStats(entry.excludeFromStats)
                          ? "border-slate-300/25 bg-slate-300/10"
                          : "border-white/10 bg-white/5"
                    } p-4">
                      <div class="flex items-start justify-between gap-4">
                        <div>
                          <p class="font-semibold text-white">Point ${entry.pointNumber} · ${playerName(match, entry.winner)} won ${normalizeFlagged(entry.flagged) ? '<span class="ml-2 rounded-full bg-amber-400/20 px-2 py-1 text-xs text-amber-200">Flagged</span>' : ""}${normalizeExcludeFromStats(entry.excludeFromStats) ? '<span class="ml-2 rounded-full bg-slate-300/20 px-2 py-1 text-xs text-slate-100">Excluded</span>' : ""}</p>
                          <p class="mt-1 text-sm text-court-200/65">${state.history.showFlaggedOnly ? `${getSetLabel(computed.sets.find((setEntry) => setEntry.index === entry.setIndex) || { index: entry.setIndex, isMatchTiebreak: false })} · Game ${entry.gameIndex + 1} · ` : ""}${pointDescription(entry)}</p>
                          <p class="mt-2 text-sm text-court-200/65">Score ${Array.isArray(entry.scoreBefore) ? entry.scoreBefore.join("-") : entry.scoreBefore} → ${Array.isArray(entry.scoreAfter) ? entry.scoreAfter.join("-") : entry.scoreAfter}</p>
                          <p class="mt-2 text-sm text-court-200/55">${playerName(match, entry.server)} served${entry.isBreakPoint ? " · Break point" : ""}${entry.returnWinnerStates.some((value) => value === 1) ? ` · Return winner: ${[0, 1].filter((playerIndex) => entry.returnWinnerStates[playerIndex] === 1).map((playerIndex) => playerName(match, playerIndex)).join(", ")}` : ""}${entry.netApproachStates.some((value) => value === 1) ? ` · Net: ${[0, 1].filter((playerIndex) => entry.netApproachStates[playerIndex] === 1).map((playerIndex) => playerName(match, playerIndex)).join(", ")}` : ""}</p>
                        </div>
                        <div class="flex gap-2">
                          <button data-action="edit-point" data-id="${entry.id}" class="rounded-xl border border-white/10 px-3 py-2 text-sm text-court-100">Edit</button>
                          <button data-action="delete-point" data-id="${entry.id}" class="rounded-xl border border-red-400/30 px-3 py-2 text-sm text-red-300">Delete</button>
                        </div>
                      </div>
                    </article>
                  `
                  )
                  .join("")
              : `<div class="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-court-200/55">${state.history.showFlaggedOnly ? "No flagged points yet." : "No points or adjustments in this game yet."}</div>`
          }
        </div>
      </section>
    </section>
  `;
}

function renderStatsTable(match, stats) {
  const players = [sideName(match, 0), sideName(match, 1)];
  const rows = [
    ["Serve", "", ""],
    ["1st Serve %", formatPercent(stats[0].firstServeIn, stats[0].firstServeAttempts), formatPercent(stats[1].firstServeIn, stats[1].firstServeAttempts)],
    ["2nd Serve %", formatPercent(stats[0].secondServeIn, stats[0].secondServeAttempts), formatPercent(stats[1].secondServeIn, stats[1].secondServeAttempts)],
    ["1st Serve Points Won %", formatPercent(stats[0].firstServePointsWon, stats[0].firstServeIn), formatPercent(stats[1].firstServePointsWon, stats[1].firstServeIn)],
    ["2nd Serve Points Won %", formatPercent(stats[0].secondServePointsWon, stats[0].secondServeIn), formatPercent(stats[1].secondServePointsWon, stats[1].secondServeIn)],
    ["Aces", stats[0].aces, stats[1].aces],
    ["Double Faults", stats[0].doubleFaults, stats[1].doubleFaults],
    ["Points", "", ""],
    ["Total Points Won", stats[0].totalPointsWon, stats[1].totalPointsWon],
    ["Short Rally Win %", formatCountPercent(stats[0].shortRallyPointsWon, stats[0].shortRallyPointsPlayed), formatCountPercent(stats[1].shortRallyPointsWon, stats[1].shortRallyPointsPlayed)],
    ["Long Rally Win %", formatCountPercent(stats[0].longRallyPointsWon, stats[0].longRallyPointsPlayed), formatCountPercent(stats[1].longRallyPointsWon, stats[1].longRallyPointsPlayed)],
    ["Winners & Errors", "", ""],
    ["Winners", sumShots(stats[0].resultShots), sumShots(stats[1].resultShots)],
    ["Winners FH/BH/V/OH/D", shortShotLine(stats[0].resultShots), shortShotLine(stats[1].resultShots)],
    ["Unforced Errors", sumShots(stats[0].unforcedErrors), sumShots(stats[1].unforcedErrors)],
    ["UE FH/BH/V/OH/D", shortShotLine(stats[0].unforcedErrors), shortShotLine(stats[1].unforcedErrors)],
    ["Forced Errors", stats[0].forcedErrors, stats[1].forcedErrors],
    ["Forcing Shots", sumShots(stats[0].forcingShots), sumShots(stats[1].forcingShots)],
    ["Forcing Shots FH/BH/V/OH/D", shortShotLine(stats[0].forcingShots), shortShotLine(stats[1].forcingShots)],
    ["Patterns", "", ""],
    ["Winners After Opp FH/BH/V/OH/D", shortShotLine(stats[0].winnersAfterOpponentShot), shortShotLine(stats[1].winnersAfterOpponentShot)],
    ["Errors After Opp FH/BH/V/OH/D", shortShotLine(stats[0].errorsAfterOpponentShot), shortShotLine(stats[1].errorsAfterOpponentShot)],
    ["Net & Break", "", ""],
    ["Net Points Won / Played", formatFraction(stats[0].netPointsWon, stats[0].netPointsPlayed), formatFraction(stats[1].netPointsWon, stats[1].netPointsPlayed)],
    ["Return Winners", stats[0].returnWinners, stats[1].returnWinners],
    ["Break Points Converted", formatFraction(stats[0].breakPointsConverted, stats[0].breakPointsOpportunities), formatFraction(stats[1].breakPointsConverted, stats[1].breakPointsOpportunities)],
    ["Break Points Saved", formatFraction(stats[0].breakPointsSaved, stats[0].breakPointsFaced), formatFraction(stats[1].breakPointsSaved, stats[1].breakPointsFaced)],
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
              <div class="${a === "" && b === "" ? "bg-court-900 px-4 py-3 font-semibold text-white" : "bg-court-950/80 px-4 py-3 text-court-200/70"}">${label}</div>
              <div class="${a === "" && b === "" ? "bg-court-900 px-4 py-3" : "bg-court-950/80 px-4 py-3 text-center font-mono text-court-100"}">${a}</div>
              <div class="${a === "" && b === "" ? "bg-court-900 px-4 py-3" : "bg-court-950/80 px-4 py-3 text-center font-mono text-court-100"}">${b}</div>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function shortShotLine(bucket) {
  return `${bucket.forehand}/${bucket.backhand}/${bucket.volley}/${bucket.overhead}/${bucket.drop_shot}`;
}

function formatCountPercent(count, total) {
  return `${count} (${formatPercent(count, total)})`;
}

function pointDescription(point) {
  const rallyLength = normalizeRallyLength(point.rallyLength);
  const contextMatch = currentMatch();
  return [
    serveLabel(point.serveResult),
    point.outcome !== "uncertain" ? outcomeLabel(point.outcome) : "",
    point.outcome !== "uncertain" && point.resultShotType !== "uncertain" && point.resultShotPlayer !== null && contextMatch
      ? `${point.outcome === "winner" ? "Winning shot" : "Error shot"} (${playerName(contextMatch, point.resultShotPlayer)}): ${shotLabel(point.resultShotType)}`
      : "",
    point.outcome !== "uncertain" && point.precedingShotType !== "uncertain" && point.precedingShotPlayer !== null && contextMatch
      ? `${point.outcome === "winner" ? "Setup by" : point.outcome === "forced_error" ? "Forcing shot" : "Preceding shot"} ${playerName(contextMatch, point.precedingShotPlayer)}: ${shotLabel(point.precedingShotType)}`
      : "",
    rallyLength !== "uncertain" ? `Rally: ${rallyLength === "short" ? "Short (1-4)" : "Long (5+)"}` : "",
  ]
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
                          <p class="font-semibold text-white">${escapeHtml(matchTitle(match))}</p>
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
  if (!state.editor.entryId) {
    return "";
  }
  const point = flattenPoints(view.computed).find((entry) => entry.id === state.editor.entryId);
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

function renderAdjustScoreModal(view) {
  if (!state.adjustment.open) {
    return "";
  }
  const { match } = view;
  const draft = state.adjustment.draft;
  const standardOptions = ["0", "15", "30", "40", "Ad"];
  const title = state.adjustment.editId ? "Edit Score Adjustment" : "Adjust Score";

  return `
    <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div class="max-h-[95vh] w-full max-w-2xl overflow-auto rounded-[2rem] border border-white/10 bg-court-950 p-5">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-xs uppercase tracking-[0.3em] text-court-300/70">${title}</p>
            <p class="mt-2 text-sm text-court-200/60">Insert a checkpoint that forces the score and server from this point forward.</p>
          </div>
          <button data-action="close-adjust-score" class="rounded-xl border border-white/10 px-4 py-3 text-sm text-court-100">Close</button>
        </div>
        <div class="mt-5 space-y-5">
          <div>
            <p class="mb-3 text-xs uppercase tracking-[0.3em] text-court-300/70">Current Set Score</p>
            <div class="grid grid-cols-2 gap-3">
              ${[0, 1].map((playerIndex) => `
                <label class="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <span class="text-sm text-court-100">${escapeHtml(playerName(match, playerIndex))}</span>
                  <input data-action="adjust-set-score" data-player="${playerIndex}" type="number" min="0" max="7" value="${escapeHtml(draft.setScore[playerIndex])}" class="mt-3 w-full bg-transparent font-mono text-2xl text-white outline-none" />
                </label>
              `).join("")}
            </div>
          </div>
          <div>
            <div class="mb-3 flex items-center justify-between gap-3">
              <p class="text-xs uppercase tracking-[0.3em] text-court-300/70">Current Game Score</p>
              <button data-action="toggle-adjust-tiebreak" class="rounded-full border px-4 py-2 text-sm ${
                draft.isTiebreak
                  ? "border-court-300/40 bg-court-300/10 text-court-100"
                  : "border-white/10 bg-white/5 text-court-200/70"
              }">${draft.isTiebreak ? "Tiebreak Mode" : "Standard Mode"}</button>
            </div>
            <div class="grid grid-cols-2 gap-3">
              ${[0, 1].map((playerIndex) => `
                <label class="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <span class="text-sm text-court-100">${escapeHtml(playerName(match, playerIndex))}</span>
                  ${
                    draft.isTiebreak
                      ? `<input data-action="adjust-game-score" data-player="${playerIndex}" type="number" min="0" value="${escapeHtml(draft.gameScore[playerIndex])}" class="mt-3 w-full bg-transparent font-mono text-2xl text-white outline-none" />`
                      : `<select data-action="adjust-standard-score" data-player="${playerIndex}" class="mt-3 w-full rounded-xl border border-white/10 bg-court-950/70 px-3 py-3 text-white outline-none">
                          ${standardOptions.map((option) => `<option value="${option}" ${draft.gameScore[playerIndex] === option ? "selected" : ""}>${option}</option>`).join("")}
                        </select>`
                  }
                </label>
              `).join("")}
            </div>
          </div>
          <div>
            <p class="mb-3 text-xs uppercase tracking-[0.3em] text-court-300/70">Who Is Serving?</p>
            <div class="grid grid-cols-2 gap-3">
              ${[0, 1].map((playerIndex) => `
                <button data-action="adjust-server" data-value="${playerIndex}" class="rounded-2xl border px-4 py-4 text-sm font-medium ${
                  draft.server === String(playerIndex)
                    ? "border-court-300 bg-court-300 text-court-950"
                    : "border-white/10 bg-white/5 text-court-100"
                }">
                  ${escapeHtml(playerName(match, playerIndex))}
                </button>
              `).join("")}
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <button data-action="close-adjust-score" class="rounded-2xl border border-white/10 px-5 py-4 text-sm text-court-100">Cancel</button>
            <button data-action="apply-adjust-score" class="rounded-2xl bg-court-300 px-5 py-4 text-sm font-semibold text-court-950">Apply</button>
          </div>
        </div>
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
            <h1 class="mt-2 text-2xl font-bold text-white">${hasMatch ? escapeHtml(matchTitle(view.match)) : "Match Center"}</h1>
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
      ${hasMatch ? `${renderEditorModal(view)}${renderAdjustScoreModal(view)}` : ""}
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
  if (action === "setup-doubles-first-server") {
    const firstServer = Number(target.dataset.value);
    state.setup.doublesSetup.serveOrder = [firstServer, null, getPartnerIndex(firstServer), null];
    render();
    return;
  }
  if (action === "setup-doubles-second-server") {
    const secondServer = Number(target.dataset.value);
    const firstServer = state.setup.doublesSetup.serveOrder[0];
    if (!Number.isInteger(firstServer) || getTeamIndex(firstServer) === getTeamIndex(secondServer)) {
      return;
    }
    state.setup.doublesSetup.serveOrder = [
      firstServer,
      secondServer,
      getPartnerIndex(firstServer),
      getPartnerIndex(secondServer),
    ];
    render();
    return;
  }
  if (action === "setup-match-type") {
    state.setup.matchType = target.dataset.value === "doubles" ? "doubles" : "singles";
    render();
    return;
  }
  if (action === "setup-scoring-format") {
    state.setup.scoringFormat = normalizeScoringFormat(target.dataset.value);
    render();
    return;
  }
  if (action === "setup-doubles-scoring-format") {
    state.setup.doublesSetup.scoringFormat = normalizeScoringFormat(target.dataset.value);
    render();
    return;
  }
  if (action === "setup-doubles-formation") {
    const teamKey = target.dataset.team;
    if (teamKey !== "teamA" && teamKey !== "teamB") {
      return;
    }
    const baseIndex = teamKey === "teamA" ? 0 : 2;
    state.setup.doublesSetup.receiveFormation[teamKey] = target.dataset.value === "second"
      ? { deuce: baseIndex + 1, ad: baseIndex }
      : { deuce: baseIndex, ad: baseIndex + 1 };
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
  if (action === "draft-result-shot") {
    toggleOptionalChoice("draft", "resultShotType", target.dataset.value);
    return;
  }
  if (action === "draft-preceding-shot") {
    toggleOptionalChoice("draft", "precedingShotType", target.dataset.value);
    return;
  }
  if (action === "draft-rally") {
    toggleOptionalChoice("draft", "rallyLength", target.dataset.value);
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
  if (action === "draft-toggle-boolean") {
    setDraftValue("draft", target.dataset.key, !state.draft[target.dataset.key]);
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
  if (action === "edit-result-shot") {
    toggleEditorOptionalChoice("resultShotType", target.dataset.value);
    return;
  }
  if (action === "edit-preceding-shot") {
    toggleEditorOptionalChoice("precedingShotType", target.dataset.value);
    return;
  }
  if (action === "edit-rally") {
    toggleEditorOptionalChoice("rallyLength", target.dataset.value);
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
  if (action === "edit-toggle-boolean") {
    updateEditorDraft(target.dataset.key, !state.editor.draft[target.dataset.key]);
    return;
  }
  if (action === "history-game") {
    setHistoryFocus(Number(target.dataset.set), Number(target.dataset.game));
    return;
  }
  if (action === "history-toggle-flagged-only") {
    state.history.showFlaggedOnly = !state.history.showFlaggedOnly;
    render();
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
    state.setup = createInitialSetupState();
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
    return;
  }
  if (action === "open-adjust-score") {
    openAdjustmentModal();
    return;
  }
  if (action === "close-adjust-score") {
    closeAdjustmentModal();
    return;
  }
  if (action === "apply-adjust-score") {
    await applyCheckpointDraft();
    return;
  }
  if (action === "adjust-server") {
    updateAdjustmentDraft("server", target.dataset.value);
    return;
  }
  if (action === "toggle-adjust-tiebreak") {
    updateAdjustmentDraft("isTiebreak", !state.adjustment.draft.isTiebreak);
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
    return;
  }
  if (action === "setup-doubles-input") {
    state.setup.doublesSetup[target.dataset.team][target.dataset.player] = target.value;
  }
});

document.addEventListener("change", async (event) => {
  const target = event.target;
  if (target instanceof HTMLSelectElement && target.dataset.action === "adjust-standard-score") {
    updateAdjustmentScore("gameScore", Number(target.dataset.player), target.value);
    return;
  }
  if (!(target instanceof HTMLInputElement) || target.id !== "match-import-input") {
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (target.dataset.action === "adjust-set-score") {
      updateAdjustmentScore("setScore", Number(target.dataset.player), target.value);
      return;
    }
    if (target.dataset.action === "adjust-game-score") {
      updateAdjustmentScore("gameScore", Number(target.dataset.player), target.value);
    }
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
