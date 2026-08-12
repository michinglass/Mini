(() => {
  "use strict";

  const COLS = 15;
  const ROWS = 11;
  const CELL = 40;

  const EMPTY = 0;
  const HARD = 1;
  const SOFT = 2;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayMessage = document.getElementById("overlay-message");
  const overlayHint = document.getElementById("overlay-hint");
  const scoreP1El = document.getElementById("score-p1");
  const scoreP2El = document.getElementById("score-p2");

  let audioCtx = null;
  function playBlip(freq, duration) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
      // audio not available, ignore
    }
  }

  function buildMap() {
    const map = [];
    for (let r = 0; r < ROWS; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) {
        if (r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1) {
          row.push(HARD);
        } else if (r % 2 === 0 && c % 2 === 0) {
          row.push(HARD);
        } else {
          row.push(EMPTY);
        }
      }
      map.push(row);
    }

    const safeZones = new Set();
    const spawnSafe = [
      [1, 1], [1, 2], [2, 1],
      [1, COLS - 2], [1, COLS - 3], [2, COLS - 2],
      [ROWS - 2, 1], [ROWS - 2, 2], [ROWS - 3, 1],
      [ROWS - 2, COLS - 2], [ROWS - 2, COLS - 3], [ROWS - 3, COLS - 2],
    ];
    spawnSafe.forEach(([r, c]) => safeZones.add(r + "," + c));

    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        if (map[r][c] !== EMPTY) continue;
        if (safeZones.has(r + "," + c)) continue;
        if (Math.random() < 0.65) map[r][c] = SOFT;
      }
    }
    return map;
  }

  function makePlayer(id, color, spawnR, spawnC, keymap) {
    return {
      id,
      color,
      x: spawnC * CELL + 4,
      y: spawnR * CELL + 4,
      w: CELL - 8,
      h: CELL - 8,
      speed: 155,
      alive: true,
      keymap,
      activeBombs: 0,
      bombLimit: 1,
      blastRange: 2,
      standingOn: null,
      faceDir: id === 1 ? "right" : "left",
    };
  }

  const KEYS_P1 = { up: "KeyW", down: "KeyS", left: "KeyA", right: "KeyD", bomb: "Space" };
  const KEYS_P2 = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight", bomb: "Enter" };

  let state = "title"; // title | playing | roundover
  let map, bombs, explosions, players;
  let score = { 1: 0, 2: 0 };
  let roundEndTimer = 0;
  let restartArmed = false;

  const keysDown = new Set();

  window.addEventListener("keydown", (e) => {
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
      e.preventDefault();
    }
    keysDown.add(e.code);

    if (e.code === "KeyR") {
      if (state === "title" || state === "roundover") {
        if (state === "title" || restartArmed) startRound();
      }
    }
  });
  window.addEventListener("keyup", (e) => keysDown.delete(e.code));

  function startRound() {
    map = buildMap();
    bombs = [];
    explosions = [];
    players = {
      1: makePlayer(1, getComputedColor("--p1"), 1, 1, KEYS_P1),
      2: makePlayer(2, getComputedColor("--p2"), ROWS - 2, COLS - 2, KEYS_P2),
    };
    state = "playing";
    overlay.classList.add("hidden");
    restartArmed = false;
  }

  function getComputedColor(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || "#fff";
  }

  function cellBlocked(r, c, ignoreBombFor) {
    if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return true;
    const t = map[r][c];
    if (t === HARD || t === SOFT) return true;
    const bomb = bombs.find((b) => b.r === r && b.c === c);
    if (bomb) {
      if (ignoreBombFor && ignoreBombFor.standingOn === bomb) return false;
      return true;
    }
    return false;
  }

  function tryMove(player, dx, dy, dt) {
    if (dx === 0 && dy === 0) return;
    const nx = player.x + dx * player.speed * dt;
    const ny = player.y + dy * player.speed * dt;

    if (dx !== 0) {
      const testX = dx > 0 ? nx + player.w : nx;
      const topR = Math.floor(player.y / CELL);
      const botR = Math.floor((player.y + player.h - 1) / CELL);
      const testC = Math.floor(testX / CELL);
      if (!cellBlocked(topR, testC, player) && !cellBlocked(botR, testC, player)) {
        player.x = nx;
      }
    }
    if (dy !== 0) {
      const testY = dy > 0 ? ny + player.h : ny;
      const leftC = Math.floor(player.x / CELL);
      const rightC = Math.floor((player.x + player.w - 1) / CELL);
      const testR = Math.floor(testY / CELL);
      if (!cellBlocked(testR, leftC, player) && !cellBlocked(testR, rightC, player)) {
        player.y = ny;
      }
    }

    const curR = Math.floor((player.y + player.h / 2) / CELL);
    const curC = Math.floor((player.x + player.w / 2) / CELL);
    const onBomb = bombs.find((b) => b.r === curR && b.c === curC);
    player.standingOn = onBomb || null;
  }

  function placeBomb(player) {
    if (player.activeBombs >= player.bombLimit) return;
    const r = Math.floor((player.y + player.h / 2) / CELL);
    const c = Math.floor((player.x + player.w / 2) / CELL);
    if (bombs.some((b) => b.r === r && b.c === c)) return;
    if (map[r][c] !== EMPTY) return;
    const bomb = { r, c, timer: 1.9, range: player.blastRange, owner: player, exploded: false };
    bombs.push(bomb);
    player.activeBombs++;
    player.standingOn = bomb;
    playBlip(520, 0.08);
  }

  function explodeBomb(bomb) {
    if (bomb.exploded) return;
    bomb.exploded = true;
    bomb.owner.activeBombs = Math.max(0, bomb.owner.activeBombs - 1);
    bombs = bombs.filter((b) => b !== bomb);

    const cells = [{ r: bomb.r, c: bomb.c }];
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    dirs.forEach(([dr, dc]) => {
      for (let step = 1; step <= bomb.range; step++) {
        const r = bomb.r + dr * step;
        const c = bomb.c + dc * step;
        if (r < 0 || c < 0 || r >= ROWS || c >= COLS) break;
        const t = map[r][c];
        if (t === HARD) break;
        cells.push({ r, c });
        const chained = bombs.find((b) => b.r === r && b.c === c && !b.exploded);
        if (chained) chained.timer = 0;
        if (t === SOFT) {
          map[r][c] = EMPTY;
          break;
        }
      }
    });

    explosions.push({ cells, timeLeft: 0.45, total: 0.45 });
    playBlip(180, 0.25);
  }

  function update(dt) {
    if (state !== "playing") return;

    [players[1], players[2]].forEach((p) => {
      if (!p.alive) return;
      let dx = 0, dy = 0;
      if (keysDown.has(p.keymap.left)) dx -= 1;
      if (keysDown.has(p.keymap.right)) dx += 1;
      if (keysDown.has(p.keymap.up)) dy -= 1;
      if (keysDown.has(p.keymap.down)) dy += 1;
      if (dx !== 0 && dy !== 0) { dx *= 0.7071; dy *= 0.7071; }
      if (dx > 0) p.faceDir = "right";
      if (dx < 0) p.faceDir = "left";
      tryMove(p, dx, dy, dt);
    });

    [players[1], players[2]].forEach((p) => {
      if (!p.alive) return;
      if (keysDown.has(p.keymap.bomb)) {
        keysDown.delete(p.keymap.bomb);
        placeBomb(p);
      }
    });

    bombs.forEach((b) => (b.timer -= dt));
    bombs.filter((b) => b.timer <= 0 && !b.exploded).forEach(explodeBomb);

    explosions.forEach((ex) => (ex.timeLeft -= dt));
    explosions = explosions.filter((ex) => ex.timeLeft > 0);

    explosions.forEach((ex) => {
      ex.cells.forEach(({ r, c }) => {
        [players[1], players[2]].forEach((p) => {
          if (!p.alive) return;
          const pr = Math.floor((p.y + p.h / 2) / CELL);
          const pc = Math.floor((p.x + p.w / 2) / CELL);
          if (pr === r && pc === c) {
            p.alive = false;
          }
        });
      });
    });

    const alive = [players[1], players[2]].filter((p) => p.alive);
    if (alive.length <= 1) {
      state = "roundover";
      roundEndTimer = 0;
      restartArmed = false;
      let title, msg;
      if (alive.length === 1) {
        score[alive[0].id]++;
        title = `🏆 Player ${alive[0].id} 승리!`;
        msg = "물풍선으로 상대를 침수시켰습니다.";
      } else {
        title = "무승부!";
        msg = "두 플레이어가 동시에 물에 빠졌습니다.";
      }
      scoreP1El.textContent = score[1];
      scoreP2El.textContent = score[2];
      overlayTitle.textContent = title;
      overlayMessage.textContent = msg;
      overlayHint.textContent = "잠시 후 R 키로 다시 시작";
      overlay.classList.remove("hidden");
    }
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!map) return;

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = c * CELL, y = r * CELL;
        ctx.fillStyle = (r + c) % 2 === 0 ? "#cdeeff" : "#b9e4fb";
        ctx.fillRect(x, y, CELL, CELL);

        const t = map[r][c];
        if (t === HARD) {
          ctx.fillStyle = "#35506b";
          ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
          ctx.fillStyle = "#4a6a8a";
          ctx.fillRect(x + 4, y + 4, CELL - 8, CELL - 8);
        } else if (t === SOFT) {
          ctx.fillStyle = "#4f8fce";
          ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
          ctx.strokeStyle = "#2c6aa3";
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
        }
      }
    }

    if (bombs) {
      bombs.forEach((b) => {
        const cx = b.c * CELL + CELL / 2;
        const cy = b.r * CELL + CELL / 2;
        const pulse = 1 + Math.sin((1.9 - b.timer) * 12) * 0.08;
        const urgency = Math.max(0, 1 - b.timer / 1.9);
        ctx.beginPath();
        ctx.arc(cx, cy, (CELL / 2 - 4) * pulse, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${60 + urgency * 180}, ${140 - urgency * 100}, 255, 0.9)`;
        ctx.fill();
        ctx.strokeStyle = "#0a2b4d";
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    }

    if (explosions) {
      explosions.forEach((ex) => {
        const alpha = Math.max(0, ex.timeLeft / ex.total);
        ex.cells.forEach(({ r, c }) => {
          const x = c * CELL, y = r * CELL;
          ctx.fillStyle = `rgba(160, 220, 255, ${0.55 * alpha + 0.15})`;
          ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
          ctx.fillStyle = `rgba(255, 255, 255, ${0.6 * alpha})`;
          ctx.beginPath();
          ctx.arc(x + CELL / 2, y + CELL / 2, (CELL / 2 - 6) * alpha, 0, Math.PI * 2);
          ctx.fill();
        });
      });
    }

    if (players) {
      [players[1], players[2]].forEach((p) => {
        if (!p.alive) return;
        const cx = p.x + p.w / 2;
        const cy = p.y + p.h / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, p.w / 2, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.strokeStyle = "#0a2b4d";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = "#fff";
        const eyeOffset = p.faceDir === "right" ? 4 : -4;
        ctx.beginPath();
        ctx.arc(cx + eyeOffset, cy - 3, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#0a2b4d";
        ctx.beginPath();
        ctx.arc(cx + eyeOffset + (p.faceDir === "right" ? 1.2 : -1.2), cy - 3, 1.6, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  let lastTime = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    if (state === "roundover") {
      roundEndTimer += dt;
      if (roundEndTimer > 1) restartArmed = true;
    }

    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
})();
