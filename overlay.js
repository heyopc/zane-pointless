import { subscribe, cloudInit } from "./sync.js";

const BASE_WIDTH = 1920;
const BASE_HEIGHT = 1080;
const BARS_HEIGHT = 730;

const COUNT_STEP_MS = 55;
const PRE_REVEAL_HOLD_MS = 760;
const TICK_INTERVAL_MS = 82;
const COUNTDOWN_TICK_VOLUME = 0.48;

const stage = document.getElementById("stage");
const scoreEl = document.getElementById("score");
const barsWindow = document.getElementById("bars-window");
const scanline = document.getElementById("scanline");
const landingGlow = document.getElementById("landing-glow");

let animationFrame = null;
let holdTimer = null;
let finishTimer = null;
let tickTimer = null;
let lastCommandId = null;
let currentScore = 100;

function makeAudio(src, volume = 1) {
  const audio = new Audio(src);
  audio.preload = "auto";
  audio.volume = volume;
  audio.load();
  return audio;
}

const sounds = {
  camera: makeAudio("./assets/sounds/camera-flash.mp3", 0.82),
  incorrect: makeAudio("./assets/sounds/incorrect-answer.mp3", 0.95),
  bell: makeAudio("./assets/sounds/winning-bell.mp3", 0.90),
  ticks: Array.from({ length: 7 }, (_, i) => {
    const src = `./assets/sounds/countdown-tick-${i + 1}.wav`;
    return [makeAudio(src, COUNTDOWN_TICK_VOLUME), makeAudio(src, COUNTDOWN_TICK_VOLUME)];
  })
};

let tickVoice = 0;

function safePlay(audio, restart = true) {
  try {
    if (restart) audio.currentTime = 0;
    const p = audio.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch (_) {}
}

function stopAudio(audio) {
  try {
    audio.pause();
    audio.currentTime = 0;
  } catch (_) {}
}

function stopAllSounds() {
  stopAudio(sounds.camera);
  stopAudio(sounds.incorrect);
  stopAudio(sounds.bell);
  sounds.ticks.flat().forEach(stopAudio);
}

stage.addEventListener("pointerdown", () => {
  const a = sounds.ticks[0][0];
  const oldVolume = a.volume;
  a.volume = 0;
  safePlay(a);
  setTimeout(() => {
    stopAudio(a);
    a.volume = oldVolume;
  }, 20);
}, { once: true });

function fitStage() {
  const scale = Math.min(innerWidth / BASE_WIDTH, innerHeight / BASE_HEIGHT);
  stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
}
addEventListener("resize", fitStage, { passive: true });
fitStage();

function clampScore(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 100;
}

function setBars(value) {
  const score = clampScore(value);
  const clipTop = 100 - score;
  barsWindow.style.clipPath = `inset(${clipTop}% 0 0 0)`;

  const y = BARS_HEIGHT * (1 - score / 100);
  scanline.style.transform = `translateY(${Math.min(BARS_HEIGHT - 3, y)}px)`;

  const glowY = Math.max(-82, Math.min(BARS_HEIGHT - 86, y - 92));
  landingGlow.style.transform = `translateY(${glowY}px)`;
}

function clearModes() {
  stage.classList.remove("wrong", "revealing", "pointless", "finish");
  scoreEl.classList.remove("wrong-mark");
  scanline.style.opacity = "";
}

function showScore(value) {
  currentScore = clampScore(value);
  scoreEl.textContent = String(currentScore);
  setBars(currentScore);
}

function cancelTickLoop() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
  sounds.ticks.flat().forEach(stopAudio);
}

function cancelAnimation() {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  if (holdTimer) clearTimeout(holdTimer);
  if (finishTimer) clearTimeout(finishTimer);
  cancelTickLoop();
  animationFrame = null;
  holdTimer = null;
  finishTimer = null;
}

function tickIndexForScore(score) {
  const descended = Math.max(0, 100 - clampScore(score));
  return Math.min(6, Math.floor(descended / (100 / 7)));
}

function playCountdownTick() {
  const index = tickIndexForScore(currentScore);
  const voice = sounds.ticks[index][tickVoice % 2];
  tickVoice += 1;
  safePlay(voice);
}

function startTickLoop() {
  cancelTickLoop();
  tickVoice = 0;
  playCountdownTick();
  tickTimer = setInterval(playCountdownTick, TICK_INTERVAL_MS);
}

function playNormalFinish() {
  safePlay(sounds.camera);
  stage.classList.remove("finish");
  void stage.offsetWidth;
  stage.classList.add("finish");
  finishTimer = setTimeout(() => {
    stage.classList.remove("finish");
    finishTimer = null;
  }, 1500);
}

function playPointlessFinish() {
  safePlay(sounds.camera);
  safePlay(sounds.bell);
  stage.classList.remove("pointless");
  void stage.offsetWidth;
  stage.classList.add("pointless");
  finishTimer = setTimeout(() => {
    stage.classList.remove("pointless");
    finishTimer = null;
  }, 1850);
}

function reset() {
  cancelAnimation();
  stopAllSounds();
  clearModes();
  showScore(100);
}

function wrong() {
  cancelAnimation();
  stopAllSounds();
  clearModes();
  currentScore = 100;
  setBars(100);
  scoreEl.textContent = "X";
  scoreEl.classList.add("wrong-mark");
  void stage.offsetWidth;
  stage.classList.add("wrong");
  safePlay(sounds.incorrect);
}

function finishReveal(target) {
  cancelTickLoop();
  stage.classList.remove("revealing");
  showScore(target);

  if (target === 0) playPointlessFinish();
  else playNormalFinish();
}

function reveal(target) {
  target = clampScore(target);
  cancelAnimation();
  stopAllSounds();
  clearModes();
  showScore(100);
  stage.classList.add("revealing");

  holdTimer = setTimeout(() => {
    holdTimer = null;

    if (target === 100) {
      finishReveal(100);
      return;
    }

    const startTime = performance.now();
    startTickLoop();

    const tick = now => {
      const steps = Math.floor((now - startTime) / COUNT_STEP_MS);
      const shown = Math.max(target, 100 - steps);
      showScore(shown);

      if (shown > target) {
        animationFrame = requestAnimationFrame(tick);
        return;
      }

      animationFrame = null;
      finishReveal(target);
    };

    animationFrame = requestAnimationFrame(tick);
  }, PRE_REVEAL_HOLD_MS);
}

function handleCommand(cmd) {
  if (!cmd || cmd.id === lastCommandId) return;
  lastCommandId = cmd.id;

  switch (cmd.action) {
    case "reset": reset(); break;
    case "reveal": reveal(cmd.target); break;
    case "wrong": wrong(); break;
    case "set":
      cancelAnimation();
      stopAllSounds();
      clearModes();
      showScore(cmd.target);
      break;
  }
}

reset();
subscribe(handleCommand);
await cloudInit;