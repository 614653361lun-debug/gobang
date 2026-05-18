const BOARD_SIZE = 15;
const WIN_COUNT = 5;
const ROOM_PREFIX = "love-gobang-";
const params = new URLSearchParams(location.search);

const els = {
  lobby: document.querySelector("#lobby"),
  gameScreen: document.querySelector("#gameScreen"),
  createRoomBtn: document.querySelector("#createRoomBtn"),
  joinRoomBtn: document.querySelector("#joinRoomBtn"),
  roomInput: document.querySelector("#roomInput"),
  lobbyStatus: document.querySelector("#lobbyStatus"),
  roleLabel: document.querySelector("#roleLabel"),
  turnLabel: document.querySelector("#turnLabel"),
  copyInviteBtn: document.querySelector("#copyInviteBtn"),
  secretAdminBtn: document.querySelector("#secretAdminBtn"),
  blackName: document.querySelector("#blackName"),
  whiteName: document.querySelector("#whiteName"),
  adminPanel: document.querySelector("#adminPanel"),
  minusQuotaBtn: document.querySelector("#minusQuotaBtn"),
  plusQuotaBtn: document.querySelector("#plusQuotaBtn"),
  quotaValue: document.querySelector("#quotaValue"),
  board: document.querySelector("#board"),
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
let adminQuota = 1;
let placedThisTurn = 0;
let adminUnlocked = false;
let toastTimer = 0;

const state = {
  board: createEmptyBoard(),
  turn: "black",
  winner: null,
  winLine: [],
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

function openGameScreen() {
  els.lobby.classList.add("hidden");
  els.gameScreen.classList.remove("hidden");
  els.adminPanel.classList.toggle("hidden", !adminUnlocked);
  els.blackName.textContent = isHost ? "你" : "对方";
  els.whiteName.textContent = isHost ? "对方" : "你";
  render();
}

function resetLocalGame() {
  state.board = createEmptyBoard();
  state.turn = "black";
  state.winner = null;
  state.winLine = [];
  placedThisTurn = 0;
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
      cell.addEventListener("click", () => playAt(x, y));
      els.board.appendChild(cell);
    }
  }
}

function render() {
  const winKeys = new Set(state.winLine.map(([x, y]) => `${x},${y}`));
  els.board.querySelectorAll(".cell").forEach((cell) => {
    const x = Number(cell.dataset.x);
    const y = Number(cell.dataset.y);
    const value = state.board[y][x];
    cell.classList.toggle("black-piece", value === "black");
    cell.classList.toggle("white-piece", value === "white");
    cell.classList.toggle("win", winKeys.has(`${x},${y}`));
  });

  els.quotaValue.textContent = String(adminQuota);
  const adminText = adminUnlocked ? " · 管理员" : "";
  els.roleLabel.textContent = roomId ? `房间 ${roomId} · ${myColor === "black" ? "黑棋" : "白棋"}${adminText}` : "未连接";

  if (state.winner) {
    els.turnLabel.textContent = state.winner === myColor ? "你赢了" : "对方赢了";
    return;
  }

  if (state.turn === myColor) {
    if (adminUnlocked) {
      const left = Math.max(0, adminQuota - placedThisTurn);
      els.turnLabel.textContent = left > 1 ? `你的回合，还能下 ${left} 颗` : "你的回合";
    } else {
      els.turnLabel.textContent = "你的回合";
    }
  } else {
    els.turnLabel.textContent = "等对方下棋";
  }
}

function playAt(x, y) {
  if (state.winner) {
    showToast("这一局已经结束");
    return;
  }
  if (state.turn !== myColor && !adminUnlocked) {
    showToast("还没轮到你");
    return;
  }
  if (state.board[y][x]) {
    showToast("这里已经有棋子了");
    return;
  }

  state.board[y][x] = myColor;
  placedThisTurn += 1;

  const result = findWinner(x, y, myColor);
  if (result) {
    state.winner = myColor;
    state.winLine = result;
  } else {
    const quota = adminUnlocked ? adminQuota : 1;
    if (placedThisTurn >= quota) {
      state.turn = myColor === "black" ? "white" : "black";
      placedThisTurn = 0;
    }
  }

  sendState();
  render();
}

function findWinner(x, y, color) {
  const directions = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];

  for (const [dx, dy] of directions) {
    const line = [[x, y]];
    collectLine(line, x, y, dx, dy, color);
    collectLine(line, x, y, -dx, -dy, color);
    if (line.length >= WIN_COUNT) {
      return line.slice(0, line.length);
    }
  }
  return null;
}

function collectLine(line, x, y, dx, dy, color) {
  let nx = x + dx;
  let ny = y + dy;
  while (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && state.board[ny][nx] === color) {
    line.push([nx, ny]);
    nx += dx;
    ny += dy;
  }
}

function sendMessage(message) {
  if (conn && conn.open) {
    conn.send(message);
  }
}

function sendState() {
  sendMessage({
    type: "state",
    state,
    adminQuota,
    placedThisTurn,
  });
}

function applyRemoteState(payload) {
  state.board = payload.state.board;
  state.turn = payload.state.turn;
  state.winner = payload.state.winner;
  state.winLine = payload.state.winLine || [];
  adminQuota = payload.adminQuota || adminQuota;
  placedThisTurn = payload.placedThisTurn || 0;
  render();
}

function wireConnection(nextConn) {
  conn = nextConn;
  conn.on("open", () => {
    setGameStatus("已连接，可以开始");
    if (isHost) {
      sendState();
    }
  });
  conn.on("data", (message) => {
    if (!message || !message.type) return;
    if (message.type === "state") {
      applyRemoteState(message);
      setGameStatus("棋盘已同步");
    }
    if (message.type === "restart") {
      resetLocalGame();
      render();
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
    resetLocalGame();
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
    resetLocalGame();
    isHost = false;
    myColor = "white";
    roomId = id.trim().toUpperCase();
    if (!roomId) {
      setLobbyStatus("请输入房间号");
      return;
    }
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
  return url.toString();
}

async function copyInvite() {
  const url = new URL(location.href);
  url.searchParams.set("room", roomId);
  url.searchParams.set("join", "1");
  const text = url.toString();
  try {
    await navigator.clipboard.writeText(text);
    showToast("邀请链接已复制");
  } catch {
    showToast(`房间号：${roomId}`);
  }
}

function restartGame() {
  resetLocalGame();
  sendMessage({ type: "restart" });
  sendState();
  render();
  setGameStatus("新一局开始");
}

function leaveGame() {
  if (conn) conn.close();
  if (peer) peer.destroy();
  location.href = location.pathname;
}

function changeQuota(delta) {
  if (!adminUnlocked || state.winner) return;
  adminQuota = Math.max(1, Math.min(225, adminQuota + delta));
  sendState();
  render();
}

function unlockAdmin() {
  const code = window.prompt("输入管理员密码");
  if (code !== "1115") {
    showToast("密码错误");
    return;
  }
  adminUnlocked = true;
  els.adminPanel.classList.remove("hidden");
  render();
  showToast("管理员已开启");
}

els.createRoomBtn.addEventListener("click", createRoom);
els.joinRoomBtn.addEventListener("click", () => joinRoom(els.roomInput.value));
els.copyInviteBtn.addEventListener("click", copyInvite);
els.secretAdminBtn.addEventListener("click", unlockAdmin);
els.restartBtn.addEventListener("click", restartGame);
els.leaveBtn.addEventListener("click", leaveGame);
els.minusQuotaBtn.addEventListener("click", () => changeQuota(-1));
els.plusQuotaBtn.addEventListener("click", () => changeQuota(1));

buildBoard();

const incomingRoom = params.get("room");
if (incomingRoom && params.get("join") === "1") {
  els.roomInput.value = incomingRoom;
  joinRoom(incomingRoom);
}
