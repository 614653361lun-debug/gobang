const BOARD_SIZE = 15;
const WIN_COUNT = 5;
const ROOM_PREFIX = "love-games-";
const ADMIN_CODE = "1115";
const CARD_ASSET_BASE = "https://webisso.github.io/playing-cards";
const params = new URLSearchParams(location.search);

const els = {
  lobby: document.querySelector("#lobby"),
  gameScreen: document.querySelector("#gameScreen"),
  gameChoices: document.querySelectorAll(".game-choice"),
  createRoomBtn: document.querySelector("#createRoomBtn"),
  createLandlordRoomBtn: document.querySelector("#createLandlordRoomBtn"),
  joinRoomBtn: document.querySelector("#joinRoomBtn"),
  roomInput: document.querySelector("#roomInput"),
  lobbyStatus: document.querySelector("#lobbyStatus"),
  roleLabel: document.querySelector("#roleLabel"),
  turnLabel: document.querySelector("#turnLabel"),
  copyInviteBtn: document.querySelector("#copyInviteBtn"),
  secretAdminBtn: document.querySelector("#secretAdminBtn"),
  gobangMeta: document.querySelector("#gobangMeta"),
  blackName: document.querySelector("#blackName"),
  whiteName: document.querySelector("#whiteName"),
  adminPanel: document.querySelector("#adminPanel"),
  adminTitle: document.querySelector("#adminTitle"),
  minusQuotaBtn: document.querySelector("#minusQuotaBtn"),
  plusQuotaBtn: document.querySelector("#plusQuotaBtn"),
  quotaValue: document.querySelector("#quotaValue"),
  gobangArea: document.querySelector("#gobangArea"),
  board: document.querySelector("#board"),
  landlordArea: document.querySelector("#landlordArea"),
  lastPlay: document.querySelector("#lastPlay"),
  playHint: document.querySelector("#playHint"),
  passBtn: document.querySelector("#passBtn"),
  opponentRole: document.querySelector("#opponentRole"),
  opponentCount: document.querySelector("#opponentCount"),
  myRole: document.querySelector("#myRole"),
  myCount: document.querySelector("#myCount"),
  hand: document.querySelector("#hand"),
  playCardsBtn: document.querySelector("#playCardsBtn"),
  clearSelectionBtn: document.querySelector("#clearSelectionBtn"),
  adminModal: document.querySelector("#adminModal"),
  adminCodeInput: document.querySelector("#adminCodeInput"),
  adminCancelBtn: document.querySelector("#adminCancelBtn"),
  adminConfirmBtn: document.querySelector("#adminConfirmBtn"),
  restartBtn: document.querySelector("#restartBtn"),
  leaveBtn: document.querySelector("#leaveBtn"),
  gameStatus: document.querySelector("#gameStatus"),
  toast: document.querySelector("#toast"),
};

let peer = null;
let conn = null;
let roomId = "";
let isHost = false;
let myColor = "black";
let selectedGame = params.get("game") || "gobang";
let adminQuota = 1;
let placedThisTurn = 0;
let adminUnlocked = false;
let toastTimer = 0;

const gobang = {
  board: createEmptyBoard(),
  turn: "black",
  winner: null,
  winLine: [],
};

const landlord = {
  hands: { black: [], white: [] },
  turn: "black",
  winner: null,
  lastPlay: null,
  selectedIds: [],
  passCount: 0,
};

function createEmptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
}

function makeRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function showToast(text) {
  clearTimeout(toastTimer);
  els.toast.textContent = text;
  els.toast.classList.remove("hidden");
  toastTimer = setTimeout(() => els.toast.classList.add("hidden"), 1800);
}

function setLobbyStatus(text) {
  els.lobbyStatus.textContent = text;
}

function setGameStatus(text) {
  els.gameStatus.textContent = text;
}

function setSelectedGame(game) {
  selectedGame = game;
  els.gameChoices.forEach((button) => {
    button.classList.toggle("active", button.dataset.game === game);
  });
  els.createRoomBtn.textContent = game === "landlord" ? "创建斗地主房间" : "创建五子棋房间";
}

function openGameScreen() {
  els.lobby.classList.add("hidden");
  els.gameScreen.classList.remove("hidden");
  els.adminPanel.classList.toggle("hidden", !adminUnlocked);
  els.blackName.textContent = isHost ? "你" : "对方";
  els.whiteName.textContent = isHost ? "对方" : "你";
  render();
}

function resetGame() {
  if (selectedGame === "landlord") {
    resetLandlord();
    return;
  }
  resetGobang();
}

function resetGobang() {
  gobang.board = createEmptyBoard();
  gobang.turn = "black";
  gobang.winner = null;
  gobang.winLine = [];
  placedThisTurn = 0;
  adminQuota = 1;
}

function resetLandlord() {
  const deck = shuffle(createDeck());
  landlord.hands.black = sortCards(deck.slice(0, 27));
  landlord.hands.white = sortCards(deck.slice(27));
  landlord.turn = "black";
  landlord.winner = null;
  landlord.lastPlay = null;
  landlord.selectedIds = [];
  landlord.passCount = 0;
}

function buildBoard() {
  els.board.innerHTML = "";
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const cell = document.createElement("button");
      cell.className = "cell";
      cell.type = "button";
      cell.dataset.x = x;
      cell.dataset.y = y;
      cell.setAttribute("aria-label", `${x + 1},${y + 1}`);
      cell.addEventListener("click", () => playGobangAt(x, y));
      els.board.appendChild(cell);
    }
  }
}

function render() {
  const isGobang = selectedGame === "gobang";
  els.gobangMeta.classList.toggle("hidden", !isGobang);
  els.gobangArea.classList.toggle("hidden", !isGobang);
  els.landlordArea.classList.toggle("hidden", isGobang);
  els.adminTitle.textContent = isGobang ? "本回合下棋数量" : "无视出牌规则";
  els.quotaValue.textContent = isGobang ? String(adminQuota) : "开";
  els.minusQuotaBtn.classList.toggle("hidden", !isGobang);
  els.plusQuotaBtn.classList.toggle("hidden", !isGobang);

  if (isGobang) {
    renderGobang();
  } else {
    renderLandlord();
  }
}

function renderHeader(statusText) {
  const gameName = selectedGame === "gobang" ? "五子棋" : "斗地主";
  const side = myColor === "black" ? (selectedGame === "gobang" ? "黑棋" : "地主") : (selectedGame === "gobang" ? "白棋" : "农民");
  const adminText = adminUnlocked ? " · 管理员" : "";
  els.roleLabel.textContent = roomId ? `${gameName} · 房间 ${roomId} · ${side}${adminText}` : "未连接";
  els.turnLabel.textContent = statusText;
}

function renderGobang() {
  const winKeys = new Set(gobang.winLine.map(([x, y]) => `${x},${y}`));
  els.board.querySelectorAll(".cell").forEach((cell) => {
    const x = Number(cell.dataset.x);
    const y = Number(cell.dataset.y);
    const value = gobang.board[y][x];
    cell.classList.toggle("black-piece", value === "black");
    cell.classList.toggle("white-piece", value === "white");
    cell.classList.toggle("win", winKeys.has(`${x},${y}`));
  });

  if (gobang.winner) {
    renderHeader(gobang.winner === myColor ? "你赢了" : "对方赢了");
    return;
  }
  if (gobang.turn === myColor) {
    if (adminUnlocked) {
      const left = Math.max(0, adminQuota - placedThisTurn);
      renderHeader(left > 1 ? `你的回合，还能下 ${left} 颗` : "你的回合");
    } else {
      renderHeader("你的回合");
    }
  } else {
    renderHeader("等对方下棋");
  }
}

function playGobangAt(x, y) {
  if (selectedGame !== "gobang") return;
  if (gobang.winner) return showToast("这一局已经结束");
  if (gobang.turn !== myColor && !adminUnlocked) return showToast("还没轮到你");
  if (gobang.board[y][x]) return showToast("这里已经有棋子了");

  gobang.board[y][x] = myColor;
  placedThisTurn += 1;
  const result = findGobangWinner(x, y, myColor);
  if (result) {
    gobang.winner = myColor;
    gobang.winLine = result;
  } else {
    const quota = adminUnlocked ? adminQuota : 1;
    if (placedThisTurn >= quota) {
      gobang.turn = myColor === "black" ? "white" : "black";
      placedThisTurn = 0;
    }
  }
  sendState();
  render();
}

function findGobangWinner(x, y, color) {
  const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (const [dx, dy] of directions) {
    const line = [[x, y]];
    collectGobangLine(line, x, y, dx, dy, color);
    collectGobangLine(line, x, y, -dx, -dy, color);
    if (line.length >= WIN_COUNT) return line;
  }
  return null;
}

function collectGobangLine(line, x, y, dx, dy, color) {
  let nx = x + dx;
  let ny = y + dy;
  while (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && gobang.board[ny][nx] === color) {
    line.push([nx, ny]);
    nx += dx;
    ny += dy;
  }
}

function createDeck() {
  const suits = ["S", "H", "C", "D"];
  const ranks = [
    ["3", 3], ["4", 4], ["5", 5], ["6", 6], ["7", 7], ["8", 8], ["9", 9],
    ["10", 10], ["J", 11], ["Q", 12], ["K", 13], ["A", 14], ["2", 16],
  ];
  const deck = [];
  for (const [rank, value] of ranks) {
    for (const suit of suits) {
      deck.push({ id: `${suit}${rank}`, suit, rank, value, label: `${rank}${suitLabel(suit)}`, image: cardImageUrl(suit, rank) });
    }
  }
  deck.push({ id: "joker-small", suit: "J", rank: "小王", value: 17, label: "小王", image: `${CARD_ASSET_BASE}/png/black_joker.png` });
  deck.push({ id: "joker-big", suit: "J", rank: "大王", value: 18, label: "大王", image: `${CARD_ASSET_BASE}/png/red_joker.png` });
  return deck;
}

function suitLabel(suit) {
  return { S: "♠", H: "♥", C: "♣", D: "♦" }[suit];
}

function cardImageUrl(suit, rank) {
  const suitName = { S: "spades", H: "hearts", C: "clubs", D: "diamonds" }[suit];
  const rankName = { A: "ace", J: "jack", Q: "queen", K: "king" }[rank] || String(rank);
  return `${CARD_ASSET_BASE}/png/${rankName}_of_${suitName}.png`;
}

function shuffle(cards) {
  const next = [...cards];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function sortCards(cards) {
  return [...cards].sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
}

function renderLandlord() {
  const myHand = landlord.hands[myColor] || [];
  const opponentColor = myColor === "black" ? "white" : "black";
  els.myRole.textContent = myColor === "black" ? "你 · 地主" : "你 · 农民";
  els.opponentRole.textContent = opponentColor === "black" ? "对方 · 地主" : "对方 · 农民";
  els.myCount.textContent = `${myHand.length} 张`;
  els.opponentCount.textContent = `${(landlord.hands[opponentColor] || []).length} 张`;
  renderLastPlay();
  els.playHint.textContent = landlord.lastPlay ? playName(landlord.lastPlay.play) : "本轮自由出牌";
  els.hand.innerHTML = "";

  for (const card of myHand) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `card ${isRedCard(card) ? "red" : ""}`;
    button.classList.toggle("selected", landlord.selectedIds.includes(card.id));
    button.title = card.label;
    button.appendChild(createCardImage(card, button));
    const fallback = document.createElement("span");
    fallback.textContent = card.label;
    button.appendChild(fallback);
    button.addEventListener("click", () => toggleCard(card.id));
    els.hand.appendChild(button);
  }

  if (landlord.winner) {
    renderHeader(landlord.winner === myColor ? "你赢了" : "对方赢了");
  } else {
    renderHeader(landlord.turn === myColor ? "你的回合" : "等对方出牌");
  }
}

function renderLastPlay() {
  els.lastPlay.innerHTML = "";
  if (!landlord.lastPlay) {
    els.lastPlay.textContent = "还没人出牌";
    return;
  }
  const owner = document.createElement("span");
  owner.className = "play-owner";
  owner.textContent = `${landlord.lastPlay.owner === myColor ? "你" : "对方"}：`;
  els.lastPlay.appendChild(owner);
  for (const card of landlord.lastPlay.cards) {
    const cardWrap = document.createElement("span");
    cardWrap.className = "table-card";
    cardWrap.appendChild(createCardImage(card, cardWrap));
    const fallback = document.createElement("span");
    fallback.textContent = card.label;
    cardWrap.appendChild(fallback);
    els.lastPlay.appendChild(cardWrap);
  }
}

function createCardImage(card, ownerEl) {
  const img = document.createElement("img");
  img.src = getCardImage(card);
  img.alt = card.label;
  img.loading = "lazy";
  img.draggable = false;
  img.onerror = () => {
    img.hidden = true;
    if (ownerEl) ownerEl.classList.add("image-failed");
  };
  return img;
}

function getCardImage(card) {
  if (card.image) return card.image;
  if (card.id === "joker-small" || card.rank === "小王") return `${CARD_ASSET_BASE}/png/black_joker.png`;
  if (card.id === "joker-big" || card.rank === "大王") return `${CARD_ASSET_BASE}/png/red_joker.png`;
  return cardImageUrl(card.suit, card.rank);
}

function isRedCard(card) {
  return card.suit === "H" || card.suit === "D" || card.id === "joker-big";
}

function toggleCard(id) {
  const index = landlord.selectedIds.indexOf(id);
  if (index >= 0) {
    landlord.selectedIds.splice(index, 1);
  } else {
    landlord.selectedIds.push(id);
  }
  render();
}

function playSelectedCards() {
  if (selectedGame !== "landlord") return;
  if (landlord.winner) return showToast("这一局已经结束");
  if (landlord.turn !== myColor && !adminUnlocked) return showToast("还没轮到你");

  const myHand = landlord.hands[myColor];
  const cards = sortCards(myHand.filter((card) => landlord.selectedIds.includes(card.id)));
  if (!cards.length) return showToast("先选牌");

  const play = classifyCards(cards);
  const mustBeat = landlord.lastPlay && landlord.lastPlay.owner !== myColor;
  if (!adminUnlocked) {
    if (!play) return showToast("这个牌型不能出");
    if (mustBeat && !beats(play, landlord.lastPlay.play)) return showToast("要出更大的牌");
  }

  landlord.hands[myColor] = myHand.filter((card) => !landlord.selectedIds.includes(card.id));
  landlord.lastPlay = {
    owner: myColor,
    cards,
    play: play || { type: "admin", value: 999, length: cards.length },
  };
  landlord.selectedIds = [];
  landlord.passCount = 0;
  landlord.winner = landlord.hands[myColor].length === 0 ? myColor : null;
  landlord.turn = myColor === "black" ? "white" : "black";
  sendState();
  render();
}

function passLandlord() {
  if (selectedGame !== "landlord") return;
  if (landlord.winner) return;
  if (landlord.turn !== myColor) return showToast("还没轮到你");
  if (!landlord.lastPlay || landlord.lastPlay.owner === myColor) return showToast("你现在需要出牌");
  landlord.selectedIds = [];
  landlord.passCount += 1;
  landlord.turn = landlord.lastPlay.owner;
  landlord.lastPlay = null;
  sendState();
  render();
}

function classifyCards(cards) {
  const values = cards.map((card) => card.value).sort((a, b) => a - b);
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  const unique = [...counts.keys()].sort((a, b) => a - b);
  const pairChains = findChains(unique.filter((value) => counts.get(value) >= 2 && value < 15), 3);
  const tripleChains = findChains(unique.filter((value) => counts.get(value) >= 3 && value < 15), 2);

  if (cards.length === 1) return { type: "single", value: values[0], length: 1 };
  if (cards.length === 2 && unique.length === 1) return { type: "pair", value: unique[0], length: 2 };
  if (cards.length === 2 && values[0] === 17 && values[1] === 18) return { type: "rocket", value: 99, length: 2 };
  if (cards.length === 3 && unique.length === 1) return { type: "triple", value: unique[0], length: 3 };
  if (cards.length === 4 && unique.length === 1) return { type: "bomb", value: unique[0], length: 4 };

  for (const chain of tripleChains) {
    const chainLength = chain.length;
    const high = chain.at(-1);
    if (cards.length === chainLength * 3) return { type: "airplane", value: high, length: cards.length, chains: chainLength };
    if (cards.length === chainLength * 4) return { type: "airplane_single", value: high, length: cards.length, chains: chainLength };
    if (cards.length === chainLength * 5) return { type: "airplane_pair", value: high, length: cards.length, chains: chainLength };
  }

  const tripleMain = unique.find((value) => counts.get(value) >= 3);
  if (cards.length === 4 && tripleMain) return { type: "triple_single", value: tripleMain, length: 4 };
  if (cards.length === 5 && tripleMain) return { type: "triple_pair", value: tripleMain, length: 5 };

  if (cards.length >= 5 && unique.length === cards.length && unique.every((value) => value < 15)) {
    const straight = unique.every((value, index) => index === 0 || value === unique[index - 1] + 1);
    if (straight) return { type: "straight", value: unique.at(-1), length: cards.length };
  }

  for (const chain of pairChains) {
    if (cards.length === chain.length * 2) {
      return { type: "pair_straight", value: chain.at(-1), length: cards.length, chains: chain.length };
    }
  }
  return null;
}

function findChains(values, minLength) {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const chains = [];
  let current = [];
  for (const value of sorted) {
    if (!current.length || value === current.at(-1) + 1) {
      current.push(value);
    } else {
      addChainVariants(chains, current, minLength);
      current = [value];
    }
  }
  addChainVariants(chains, current, minLength);
  return chains.sort((a, b) => b.length - a.length || b.at(-1) - a.at(-1));
}

function addChainVariants(chains, chain, minLength) {
  if (chain.length < minLength) return;
  for (let length = chain.length; length >= minLength; length -= 1) {
    for (let start = 0; start <= chain.length - length; start += 1) {
      chains.push(chain.slice(start, start + length));
    }
  }
}

function beats(next, previous) {
  if (!previous) return true;
  if (next.type === "rocket") return true;
  if (previous.type === "rocket") return false;
  if (next.type === "bomb" && previous.type !== "bomb") return true;
  if (next.type !== previous.type || next.length !== previous.length) return false;
  if (next.chains && previous.chains && next.chains !== previous.chains) return false;
  return next.value > previous.value;
}

function playName(play) {
  if (!play) return "未知牌型";
  const names = {
    single: "单张",
    pair: "对子",
    triple: "三张",
    triple_single: "三带一",
    triple_pair: "三带二",
    straight: "顺子",
    pair_straight: "连对",
    airplane: "飞机",
    airplane_single: "飞机带单",
    airplane_pair: "飞机带对",
    bomb: "炸弹",
    rocket: "王炸",
    admin: "管理员出牌",
  };
  return names[play.type] || "未知牌型";
}

function sendMessage(message) {
  if (conn && conn.open) conn.send(message);
}

function snapshot() {
  return { selectedGame, gobang, landlord, adminQuota, placedThisTurn };
}

function sendState() {
  sendMessage({ type: "state", payload: snapshot() });
}

function applyRemoteState(payload) {
  selectedGame = payload.selectedGame || selectedGame;
  Object.assign(gobang, payload.gobang || {});
  Object.assign(landlord, payload.landlord || {});
  landlord.selectedIds = [];
  adminQuota = payload.adminQuota || adminQuota;
  placedThisTurn = payload.placedThisTurn || 0;
  setSelectedGame(selectedGame);
  render();
}

function wireConnection(nextConn) {
  conn = nextConn;
  conn.on("open", () => {
    setGameStatus("已连接，可以开始");
    if (isHost) sendState();
  });
  conn.on("data", (message) => {
    if (!message || !message.type) return;
    if (message.type === "state") {
      applyRemoteState(message.payload);
      setGameStatus("已同步");
    }
    if (message.type === "restart") {
      applyRemoteState(message.payload);
      setGameStatus("新一局开始");
    }
  });
  conn.on("close", () => setGameStatus("对方已离线"));
  conn.on("error", () => setGameStatus("连接出错，请重新开房间"));
}

function waitForPeerJs() {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (window.Peer) {
        clearInterval(timer);
        resolve();
      } else if (attempts > 80) {
        clearInterval(timer);
        reject(new Error("PeerJS 加载失败"));
      }
    }, 100);
  });
}

async function createRoom() {
  try {
    await waitForPeerJs();
    resetGame();
    isHost = true;
    myColor = "black";
    roomId = makeRoomId();
    setLobbyStatus("正在创建房间...");
    peer = new Peer(`${ROOM_PREFIX}${roomId}`);
    peer.on("open", () => {
      openGameScreen();
      setGameStatus("房间已创建，把邀请链接发给她");
      history.replaceState(null, "", inviteUrl(true));
    });
    peer.on("connection", (incoming) => wireConnection(incoming));
    peer.on("error", () => {
      setLobbyStatus("创建失败，请再点一次创建房间");
      if (peer) peer.destroy();
    });
  } catch (error) {
    setLobbyStatus(error.message);
  }
}

async function joinRoom(id) {
  try {
    await waitForPeerJs();
    resetGame();
    isHost = false;
    myColor = "white";
    roomId = id.trim().toUpperCase();
    if (!roomId) return setLobbyStatus("请输入房间号");
    setLobbyStatus("正在加入房间...");
    peer = new Peer();
    peer.on("open", () => {
      openGameScreen();
      setGameStatus("正在连接对方...");
      wireConnection(peer.connect(`${ROOM_PREFIX}${roomId}`, { reliable: true }));
      history.replaceState(null, "", inviteUrl(false));
    });
    peer.on("error", () => setGameStatus("加入失败，确认房间号或让对方重新开房间"));
  } catch (error) {
    setLobbyStatus(error.message);
  }
}

function inviteUrl(asHost) {
  const url = new URL(location.href);
  url.searchParams.set("room", roomId);
  url.searchParams.set("join", asHost ? "0" : "1");
  url.searchParams.set("game", selectedGame);
  return url.toString();
}

async function copyInvite() {
  const url = new URL(location.href);
  url.searchParams.set("room", roomId);
  url.searchParams.set("join", "1");
  url.searchParams.set("game", selectedGame);
  try {
    await navigator.clipboard.writeText(url.toString());
    showToast("邀请链接已复制");
  } catch {
    showToast(`房间号：${roomId}`);
  }
}

function restartGame() {
  resetGame();
  sendMessage({ type: "restart", payload: snapshot() });
  render();
  setGameStatus("新一局开始");
}

function leaveGame() {
  if (conn) conn.close();
  if (peer) peer.destroy();
  location.href = location.pathname;
}

function changeQuota(delta) {
  if (!adminUnlocked || selectedGame !== "gobang" || gobang.winner) return;
  adminQuota = Math.max(1, Math.min(225, adminQuota + delta));
  sendState();
  render();
}

function unlockAdmin() {
  const code = els.adminCodeInput.value.trim();
  if (code !== ADMIN_CODE) return showToast("密码错误");
  adminUnlocked = true;
  closeAdminModal();
  els.adminPanel.classList.remove("hidden");
  render();
  showToast("管理员已开启");
}

function openAdminModal() {
  els.adminCodeInput.value = "";
  els.adminModal.classList.remove("hidden");
  setTimeout(() => els.adminCodeInput.focus(), 50);
}

function closeAdminModal() {
  els.adminModal.classList.add("hidden");
}

els.gameChoices.forEach((button) => button.addEventListener("click", () => setSelectedGame(button.dataset.game)));
els.createRoomBtn.addEventListener("click", createRoom);
els.createLandlordRoomBtn.addEventListener("click", () => {
  setSelectedGame("landlord");
  createRoom();
});
els.joinRoomBtn.addEventListener("click", () => joinRoom(els.roomInput.value));
els.copyInviteBtn.addEventListener("click", copyInvite);
els.secretAdminBtn.addEventListener("click", openAdminModal);
els.adminCancelBtn.addEventListener("click", closeAdminModal);
els.adminConfirmBtn.addEventListener("click", unlockAdmin);
els.adminCodeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") unlockAdmin();
});
els.restartBtn.addEventListener("click", restartGame);
els.leaveBtn.addEventListener("click", leaveGame);
els.minusQuotaBtn.addEventListener("click", () => changeQuota(-1));
els.plusQuotaBtn.addEventListener("click", () => changeQuota(1));
els.playCardsBtn.addEventListener("click", playSelectedCards);
els.passBtn.addEventListener("click", passLandlord);
els.clearSelectionBtn.addEventListener("click", () => {
  landlord.selectedIds = [];
  render();
});

buildBoard();
setSelectedGame(selectedGame);

const incomingRoom = params.get("room");
if (incomingRoom && params.get("join") === "1") {
  els.roomInput.value = incomingRoom;
  joinRoom(incomingRoom);
}
