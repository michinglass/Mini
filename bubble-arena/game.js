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

  // Open arena with scattered obstacles (not a corridor maze) — closer to
  // Crazy Arcade's single-room maps than a Pac-Man/Bomberman grid layout.
  function buildMap() {
    const map = [];
    for (let r = 0; r < ROWS; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) {
        const border = r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1;
        row.push(border ? HARD : EMPTY);
      }
      map.push(row);
    }

    const safeZones = new Set();
    const spawnSafe = [
      [1, 1], [1, 2], [2, 1], [2, 2],
      [1, COLS - 2], [1, COLS - 3], [2, COLS - 2], [2, COLS - 3],
      [ROWS - 2, 1], [ROWS - 2, 2], [ROWS - 3, 1], [ROWS - 3, 2],
      [ROWS - 2, COLS - 2], [ROWS - 2, COLS - 3], [ROWS - 3, COLS - 2], [ROWS - 3, COLS - 3],
    ];
    spawnSafe.forEach(([r, c]) => safeZones.add(r + "," + c));

    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        if (safeZones.has(r + "," + c)) continue;
        const roll = Math.random();
        if (roll < 0.12) {
          map[r][c] = HARD; // scattered ice block, indestructible
        } else if (roll < 0.55) {
          map[r][c] = SOFT; // breakable crate
        }
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
      moving: false,
      animT: 0,
      accent: id === 1 ? "#ffd23f" : "#c8f2ff",
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
      p.moving = dx !== 0 || dy !== 0;
      p.animT = (p.animT || 0) + (p.moving ? dt * 8 : 0);
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

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  const CRATE_COLORS = ["#ffb14e", "#ff8fa3", "#8fd694", "#8ec9ff", "#ffd166"];

  function drawWalls() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = c * CELL, y = r * CELL;
        ctx.fillStyle = (r + c) % 2 === 0 ? "#eaf9ff" : "#d8f1fb";
        ctx.fillRect(x, y, CELL, CELL);

        const t = map[r][c];
        if (t === HARD) {
          roundRect(x + 3, y + 3, CELL - 6, CELL - 6, 8);
          ctx.fillStyle = "#7fa9c9";
          ctx.fill();
          ctx.strokeStyle = "#4d7599";
          ctx.lineWidth = 2;
          ctx.stroke();
          roundRect(x + 8, y + 7, CELL - 20, 8, 4);
          ctx.fillStyle = "rgba(255,255,255,0.55)";
          ctx.fill();
        } else if (t === SOFT) {
          const color = CRATE_COLORS[Math.abs((r * 31 + c * 17) % CRATE_COLORS.length)];
          roundRect(x + 3, y + 3, CELL - 6, CELL - 6, 10);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.strokeStyle = "rgba(0,0,0,0.18)";
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.strokeStyle = "rgba(255,255,255,0.6)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x + CELL / 2, y + 6);
          ctx.lineTo(x + CELL / 2, y + CELL - 6);
          ctx.moveTo(x + 6, y + CELL / 2);
          ctx.lineTo(x + CELL - 6, y + CELL / 2);
          ctx.stroke();
        }
      }
    }
  }

  function drawBombs() {
    if (!bombs) return;
    bombs.forEach((b) => {
      const cx = b.c * CELL + CELL / 2;
      const cy = b.r * CELL + CELL / 2;
      const pulse = 1 + Math.sin((1.9 - b.timer) * 12) * 0.1;
      const urgency = Math.max(0, 1 - b.timer / 1.9);
      const rad = (CELL / 2 - 5) * pulse;

      ctx.beginPath();
      ctx.moveTo(cx - 3, cy + rad - 2);
      ctx.lineTo(cx + 3, cy + rad - 2);
      ctx.lineTo(cx, cy + rad + 5);
      ctx.closePath();
      ctx.fillStyle = "#2c6aa3";
      ctx.fill();

      const grad = ctx.createRadialGradient(cx - rad * 0.35, cy - rad * 0.35, 1, cx, cy, rad);
      const baseR = Math.round(120 + urgency * 120);
      const baseG = Math.round(200 - urgency * 120);
      grad.addColorStop(0, "#f2ffff");
      grad.addColorStop(0.55, `rgb(${baseR}, ${baseG}, 255)`);
      grad.addColorStop(1, `rgb(${baseR - 40}, ${baseG - 40}, 220)`);
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = "#0a2b4d";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(cx - rad * 0.35, cy - rad * 0.35, rad * 0.3, rad * 0.18, -0.6, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fill();
    });
  }

  function drawExplosions() {
    if (!explosions) return;
    explosions.forEach((ex) => {
      const alpha = Math.max(0, ex.timeLeft / ex.total);
      ex.cells.forEach(({ r, c }) => {
        const x = c * CELL, y = r * CELL;
        const cx = x + CELL / 2, cy = y + CELL / 2;
        ctx.fillStyle = `rgba(150, 225, 255, ${0.5 * alpha + 0.1})`;
        roundRect(x + 2, y + 2, CELL - 4, CELL - 4, 10);
        ctx.fill();

        ctx.fillStyle = `rgba(255, 255, 255, ${0.7 * alpha})`;
        ctx.beginPath();
        ctx.arc(cx, cy, (CELL / 2 - 6) * alpha, 0, Math.PI * 2);
        ctx.fill();

        for (let i = 0; i < 5; i++) {
          const ang = (i / 5) * Math.PI * 2 + alpha * 2;
          const dist = (CELL / 2) * (1 - alpha) + 4;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(ang) * dist, cy + Math.sin(ang) * dist, 3 * alpha, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${0.8 * alpha})`;
          ctx.fill();
        }
      });
    });
  }

  function drawPlayers() {
    if (!players) return;
    [players[1], players[2]].forEach((p) => {
      if (!p.alive) return;
      const cx = p.x + p.w / 2;
      const cy = p.y + p.h / 2;
      const bounce = p.moving ? Math.abs(Math.sin(p.animT)) * 3 : 0;
      const bodyR = p.w / 2;
      const squash = 1 - bounce * 0.03;

      ctx.beginPath();
      ctx.ellipse(cx, cy + bodyR - 2, bodyR * 0.8, bodyR * 0.28, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(10, 43, 77, 0.18)";
      ctx.fill();

      const bodyCy = cy - bounce;
      const grad = ctx.createRadialGradient(cx - bodyR * 0.3, bodyCy - bodyR * 0.4, 1, cx, bodyCy, bodyR);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.25, p.color);
      grad.addColorStop(1, p.color);
      ctx.save();
      ctx.translate(cx, bodyCy);
      ctx.scale(1, squash);
      ctx.translate(-cx, -bodyCy);
      ctx.beginPath();
      ctx.arc(cx, bodyCy, bodyR, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = "#0a2b4d";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(cx, bodyCy - bodyR * 0.55, bodyR * 0.95, Math.PI * 1.15, Math.PI * 1.85);
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 5;
      ctx.stroke();

      const eyeOffset = p.faceDir === "right" ? 4 : -4;
      const eyeY = bodyCy - 2;
      ["l", "r"].forEach((side, i) => {
        const sx = cx + eyeOffset + (side === "l" ? -6 : 6);
        ctx.beginPath();
        ctx.arc(sx, eyeY, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#fff";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(sx + (p.faceDir === "right" ? 1.4 : -1.4), eyeY, 1.8, 0, Math.PI * 2);
        ctx.fillStyle = "#0a2b4d";
        ctx.fill();
      });

      ["l", "r"].forEach((side) => {
        const sx = cx + (side === "l" ? -bodyR * 0.65 : bodyR * 0.65);
        ctx.beginPath();
        ctx.ellipse(sx, bodyCy + bodyR * 0.35, 3.5, 2.2, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 120, 140, 0.55)";
        ctx.fill();
      });
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!map) return;
    drawWalls();
    drawBombs();
    drawExplosions();
    drawPlayers();
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
