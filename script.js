const canvas = document.querySelector("#flight-canvas");
const context = canvas.getContext("2d");
const modeButtons = [...document.querySelectorAll(".mode-button")];
const launchButton = document.querySelector("#launch-button");
const flyAgainButton = document.querySelector("#fly-again-button");
const compareButton = document.querySelector("#compare-button");
const startOverlay = document.querySelector("#start-overlay");
const finishOverlay = document.querySelector("#finish-overlay");
const briefingCopy = document.querySelector("#briefing-copy");
const modeQuestion = document.querySelector("#mode-question");
const progressValue = document.querySelector("#progress-value");
const progressBar = document.querySelector("#progress-bar");
const cueCount = document.querySelector("#cue-count");
const cueBar = document.querySelector("#cue-bar");
const flightStatus = document.querySelector("#flight-status");
const statusLight = document.querySelector("#status-light");
const cueIcon = document.querySelector("#cue-icon");
const cuePosition = document.querySelector("#cue-position");
const cueTitle = document.querySelector("#cue-title");
const cueDescription = document.querySelector("#cue-description");
const eventList = document.querySelector("#event-list");
const finishCopy = document.querySelector("#finish-copy");
const steerUp = document.querySelector("#steer-up");
const steerDown = document.querySelector("#steer-down");

const pigeonFlightFrames = [
  "assets/pigeon-postal-sketch.png",
  "assets/pigeon-postal-wing-up.png",
  "assets/pigeon-postal-sketch.png",
  "assets/pigeon-postal-wing-down.png"
].map((source) => {
  const image = new Image();
  image.decoding = "async";
  image.src = source;
  return image;
});

const WORLD_LENGTH = 3100;
const FLIGHT_SPEED = 158;
const PLAYER_X_RATIO = 0.19;

const modeContent = {
  familiar: {
    question: "What changes when landmarks and a remembered route are available?",
    briefing: "This release area is familiar. Look for landmarks, route memory, and compass cues.",
    compare: "Try unfamiliar area",
    cues: [
      {
        name: "Visual landmark",
        short: "LANDMARK",
        icon: "◇",
        x: 500,
        y: 0.30,
        description: "Recognizable features can help guide pigeons through familiar areas."
      },
      {
        name: "Route memory",
        short: "MEMORY",
        icon: "↝",
        x: 1010,
        y: 0.67,
        description: "Repeated flights can produce stable, remembered routes."
      },
      {
        name: "Sun compass",
        short: "SUN",
        icon: "☼",
        x: 1515,
        y: 0.36,
        description: "The sun and an internal clock can provide directional information."
      },
      {
        name: "Magnetic direction",
        short: "MAGNETIC",
        icon: "N",
        x: 2020,
        y: 0.70,
        description: "Earth's magnetic field may support compass direction, especially when other cues change."
      },
      {
        name: "Loft recognition",
        short: "HOME",
        icon: "⌂",
        x: 2530,
        y: 0.43,
        description: "The model ends at the familiar rooftop loft the pigeon has learned as home."
      }
    ]
  },
  unfamiliar: {
    question: "What changes when there is no remembered local route?",
    briefing: "This release area is unfamiliar. Look for odor-map and compass cues before home becomes recognizable.",
    compare: "Try familiar area",
    cues: [
      {
        name: "Olfactory map",
        short: "ODOR MAP",
        icon: "≈",
        x: 500,
        y: 0.66,
        description: "Environmental odors are supported as a rough positional map in unfamiliar territory."
      },
      {
        name: "Sun compass",
        short: "SUN",
        icon: "☼",
        x: 1010,
        y: 0.30,
        description: "After estimating position, the pigeon can use the sun and internal time to choose a heading."
      },
      {
        name: "Magnetic direction",
        short: "MAGNETIC",
        icon: "N",
        x: 1515,
        y: 0.68,
        description: "Magnetic information can provide direction, but it is not necessarily a complete map."
      },
      {
        name: "Approaching landmarks",
        short: "LANDMARK",
        icon: "◇",
        x: 2020,
        y: 0.35,
        description: "Familiar visual information may become more useful as the pigeon approaches its home area."
      },
      {
        name: "Cue correction",
        short: "RECHECK",
        icon: "↻",
        x: 2530,
        y: 0.57,
        description: "A flexible system can compare several available cues rather than relying on only one."
      }
    ]
  }
};

let mode = "familiar";
let width = 0;
let height = 0;
let pixelRatio = 1;
let running = false;
let finished = false;
let worldPosition = 0;
let pigeonY = 0;
let targetY = 0;
let previousY = 0;
let lastTimestamp = 0;
let startedAt = 0;
let animationFrame = null;
let pointerActive = false;
let collected = new Set();
let missed = new Set();
let recentCueIndex = 0;
const keys = { up: false, down: false };

function seededNoise(index) {
  const value = Math.sin(index * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function resizeCanvas() {
  const rectangle = canvas.getBoundingClientRect();
  pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  width = rectangle.width;
  height = rectangle.height;
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  if (!pigeonY) {
    pigeonY = height * 0.5;
    targetY = pigeonY;
    previousY = pigeonY;
  } else {
    pigeonY = Math.min(Math.max(pigeonY, 65), height - 92);
    targetY = Math.min(Math.max(targetY, 65), height - 92);
  }
}

function currentCues() {
  return modeContent[mode].cues;
}

function setMode(nextMode) {
  if (running) return;
  mode = nextMode;
  document.body.dataset.mode = mode;

  modeButtons.forEach((button) => {
    const isSelected = button.dataset.mode === mode;
    button.classList.toggle("is-active", isSelected);
    button.setAttribute("aria-checked", String(isSelected));
  });

  modeQuestion.textContent = modeContent[mode].question;
  briefingCopy.textContent = modeContent[mode].briefing;
  compareButton.textContent = modeContent[mode].compare;
  resetFlight();
}

function updateHud() {
  const progress = Math.min(worldPosition / WORLD_LENGTH, 1);
  const progressPercent = Math.round(progress * 100);
  progressValue.textContent = `${progressPercent}%`;
  progressBar.style.width = `${progressPercent}%`;
  cueCount.textContent = `${collected.size} / ${currentCues().length}`;
  cueBar.style.width = `${(collected.size / currentCues().length) * 100}%`;
}

function setStatus(text, state = "idle") {
  flightStatus.textContent = text;
  statusLight.className = "status-light";
  if (state === "live") statusLight.classList.add("is-live");
  if (state === "home") statusLight.classList.add("is-home");
}

function setCueDetails(index, prefix = "Next cue") {
  const cues = currentCues();
  const boundedIndex = Math.min(Math.max(index, 0), cues.length - 1);
  const cue = cues[boundedIndex];
  recentCueIndex = boundedIndex;
  cueIcon.textContent = cue.icon;
  cuePosition.textContent = `${prefix} · ${String(boundedIndex + 1).padStart(2, "0")}`;
  cueTitle.textContent = cue.name;
  cueDescription.textContent = cue.description;
}

function formatTime() {
  if (!startedAt) return "00:00";
  const seconds = Math.max(0, Math.floor((performance.now() - startedAt) / 1000));
  return `00:${String(seconds).padStart(2, "0")}`;
}

function logEvent(message) {
  const item = document.createElement("li");
  const time = document.createElement("time");
  const text = document.createElement("span");
  time.textContent = formatTime();
  text.textContent = message;
  item.append(time, text);
  eventList.prepend(item);

  while (eventList.children.length > 3) {
    eventList.lastElementChild.remove();
  }
}

function resetLog() {
  eventList.innerHTML = "<li><time>00:00</time><span>Route loaded</span></li><li><time>—</time><span>Waiting at release point</span></li>";
}

function resetFlight() {
  running = false;
  finished = false;
  worldPosition = 0;
  collected = new Set();
  missed = new Set();
  startedAt = 0;
  pigeonY = height ? height * 0.5 : 240;
  targetY = pigeonY;
  previousY = pigeonY;
  startOverlay.hidden = false;
  finishOverlay.hidden = true;
  modeButtons.forEach((button) => { button.disabled = false; });
  setStatus("Awaiting release");
  setCueDetails(0);
  resetLog();
  updateHud();
}

function launchFlight() {
  resetFlight();
  running = true;
  startedAt = performance.now();
  startOverlay.hidden = true;
  modeButtons.forEach((button) => { button.disabled = true; });
  setStatus("Pigeon in flight", "live");
  logEvent(`${mode === "familiar" ? "Familiar" : "Unfamiliar"} release began`);
  canvas.focus();
}

function finishFlight() {
  running = false;
  finished = true;
  worldPosition = WORLD_LENGTH;
  setStatus("Home at rooftop loft", "home");
  updateHud();
  finishCopy.textContent = `You flew through ${collected.size} of ${currentCues().length} model cues. The route still ended at the familiar loft.`;
  finishOverlay.hidden = false;
  modeButtons.forEach((button) => { button.disabled = false; });
  logEvent("Rooftop loft reached");
}

function steerTo(clientY) {
  const rectangle = canvas.getBoundingClientRect();
  targetY = Math.min(Math.max(clientY - rectangle.top, 60), height - 92);
}

function updateGame(deltaTime) {
  if (!running) return;

  const steerSpeed = 230;
  if (keys.up) targetY -= steerSpeed * deltaTime;
  if (keys.down) targetY += steerSpeed * deltaTime;
  targetY = Math.min(Math.max(targetY, 60), height - 92);

  previousY = pigeonY;
  pigeonY += (targetY - pigeonY) * Math.min(1, deltaTime * 5.5);
  worldPosition += FLIGHT_SPEED * deltaTime;

  const cues = currentCues();
  const playerX = width * PLAYER_X_RATIO;

  cues.forEach((cue, index) => {
    if (collected.has(index) || missed.has(index)) return;
    const cueScreenX = playerX + cue.x - worldPosition;
    const cueY = 60 + cue.y * (height - 150);

    if (cueScreenX < playerX + 240 && cueScreenX > playerX - 30) {
      setCueDetails(index, "Incoming cue");
    }

    if (cueScreenX <= playerX + 12) {
      if (Math.abs(pigeonY - cueY) <= 68) {
        collected.add(index);
        setCueDetails(index, "Cue sampled");
        logEvent(`${cue.name} sampled`);
      } else {
        missed.add(index);
        setCueDetails(index, "Cue passed");
        logEvent(`${cue.name} passed — other cues remain`);
      }

      const nextIndex = cues.findIndex((_, cueIndex) => !collected.has(cueIndex) && !missed.has(cueIndex));
      if (nextIndex >= 0) {
        window.setTimeout(() => setCueDetails(nextIndex), 650);
      }
    }
  });

  updateHud();

  if (worldPosition >= WORLD_LENGTH) {
    finishFlight();
  }
}

function drawSky(time) {
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, mode === "familiar" ? "#77c8dc" : "#709bb2");
  gradient.addColorStop(0.6, mode === "familiar" ? "#b9dfe1" : "#afc9ce");
  gradient.addColorStop(1, "#efd5ad");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const sunX = width * 0.78;
  const sunY = 82;
  const sunGlow = context.createRadialGradient(sunX, sunY, 3, sunX, sunY, 78);
  sunGlow.addColorStop(0, "rgba(255, 248, 181, 0.95)");
  sunGlow.addColorStop(0.3, "rgba(255, 239, 142, 0.35)");
  sunGlow.addColorStop(1, "rgba(255, 239, 142, 0)");
  context.fillStyle = sunGlow;
  context.beginPath();
  context.arc(sunX, sunY, 78, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "rgba(255, 250, 228, 0.86)";
  context.beginPath();
  context.arc(sunX, sunY, 19, 0, Math.PI * 2);
  context.fill();

  for (let index = 0; index < 8; index += 1) {
    const cloudWidth = 85 + seededNoise(index) * 100;
    const cycleWidth = width + 280;
    const cloudX = ((index * 233 - worldPosition * 0.08 + time * 0.006) % cycleWidth + cycleWidth) % cycleWidth - 140;
    const cloudY = 48 + seededNoise(index + 20) * height * 0.34;
    drawCloud(cloudX, cloudY, cloudWidth, 0.34 + seededNoise(index + 40) * 0.25);
  }
}

function drawCloud(x, y, cloudWidth, opacity) {
  context.save();
  context.globalAlpha = opacity;
  context.fillStyle = "#f8f5e9";
  context.beginPath();
  context.ellipse(x, y, cloudWidth * 0.34, 19, 0, 0, Math.PI * 2);
  context.ellipse(x + cloudWidth * 0.24, y - 12, cloudWidth * 0.27, 24, 0, 0, Math.PI * 2);
  context.ellipse(x + cloudWidth * 0.49, y, cloudWidth * 0.31, 17, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawSkyline(parallax, baseY, color, count, heightScale) {
  const spacing = 75;
  const offset = (worldPosition * parallax) % spacing;
  const firstIndex = Math.floor((worldPosition * parallax) / spacing) - 3;

  context.fillStyle = color;
  for (let screenIndex = -2; screenIndex < count; screenIndex += 1) {
    const worldIndex = firstIndex + screenIndex;
    const buildingX = screenIndex * spacing - offset;
    const buildingWidth = 45 + seededNoise(worldIndex + 51) * 46;
    const buildingHeight = 45 + seededNoise(worldIndex + 91) * heightScale;
    context.fillRect(buildingX, baseY - buildingHeight, buildingWidth, buildingHeight);

    if (parallax > 0.4) {
      context.fillStyle = "rgba(231, 239, 102, 0.28)";
      for (let row = 0; row < Math.floor(buildingHeight / 24); row += 1) {
        for (let column = 0; column < 2; column += 1) {
          if (seededNoise(worldIndex * 17 + row * 3 + column) > 0.48) {
            context.fillRect(buildingX + 10 + column * 18, baseY - buildingHeight + 12 + row * 24, 6, 8);
          }
        }
      }
      context.fillStyle = color;
    }
  }
}

function drawCity() {
  const horizon = height * 0.78;
  drawSkyline(0.14, horizon, "rgba(23, 73, 84, 0.28)", Math.ceil(width / 70) + 5, 130);
  drawSkyline(0.28, horizon + 22, "rgba(19, 60, 70, 0.48)", Math.ceil(width / 70) + 5, 160);

  context.fillStyle = "#225865";
  context.fillRect(0, horizon + 20, width, height - horizon - 20);

  context.strokeStyle = "rgba(146, 202, 225, 0.36)";
  context.lineWidth = 2;
  for (let line = 0; line < 6; line += 1) {
    const waveY = horizon + 42 + line * 14;
    context.beginPath();
    for (let x = -30; x < width + 30; x += 25) {
      const y = waveY + Math.sin((x + worldPosition * 0.4 + line * 40) * 0.025) * 3;
      if (x === -30) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  }

  drawSkyline(0.58, height + 8, "#0d303a", Math.ceil(width / 70) + 5, 230);
}

function drawGuideLine() {
  context.save();
  context.strokeStyle = "rgba(255, 255, 255, 0.12)";
  context.lineWidth = 1;
  context.setLineDash([5, 10]);
  context.beginPath();
  context.moveTo(0, pigeonY);
  context.lineTo(width, pigeonY);
  context.stroke();
  context.restore();
}

function drawCueGate(cue, index, time) {
  if (collected.has(index) || missed.has(index)) return;

  const playerX = width * PLAYER_X_RATIO;
  const x = playerX + cue.x - worldPosition;
  if (x < -100 || x > width + 100) return;

  const y = 60 + cue.y * (height - 150);
  const pulse = 1 + Math.sin(time * 0.004 + index) * 0.06;

  context.save();
  context.translate(x, y);
  context.scale(pulse, pulse);
  context.strokeStyle = "rgba(231, 239, 102, 0.24)";
  context.lineWidth = 16;
  context.beginPath();
  context.arc(0, 0, 64, 0, Math.PI * 2);
  context.stroke();

  context.strokeStyle = "#e7ef66";
  context.lineWidth = 3;
  context.setLineDash([7, 7]);
  context.beginPath();
  context.arc(0, 0, 55, 0, Math.PI * 2);
  context.stroke();
  context.setLineDash([]);

  context.fillStyle = "rgba(7, 27, 36, 0.78)";
  context.beginPath();
  context.arc(0, 0, 37, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#fffdf6";
  context.font = "700 18px Georgia";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(cue.icon, 0, -2);

  context.font = "800 9px Inter, sans-serif";
  context.fillStyle = "#e7ef66";
  context.fillText(cue.short, 0, 82);
  context.restore();
}

function drawLoft(time) {
  const playerX = width * PLAYER_X_RATIO;
  const x = playerX + WORLD_LENGTH - worldPosition;
  if (x < -160 || x > width + 260) return;

  const rooftopY = height * 0.67;
  const pulse = 1 + Math.sin(time * 0.003) * 0.05;

  context.save();
  context.fillStyle = "#071b24";
  context.fillRect(x - 90, rooftopY, 210, height - rooftopY);
  context.fillStyle = "#123c46";
  context.fillRect(x - 48, rooftopY - 58, 120, 58);
  context.fillStyle = "#e7ef66";
  context.fillRect(x - 18, rooftopY - 34, 28, 34);

  context.strokeStyle = `rgba(231, 239, 102, ${0.28 + pulse * 0.1})`;
  context.lineWidth = 3;
  context.beginPath();
  context.arc(x + 10, rooftopY - 60, 46 * pulse, Math.PI, Math.PI * 2);
  context.stroke();

  context.fillStyle = "#fffdf6";
  context.font = "800 10px Inter, sans-serif";
  context.textAlign = "center";
  context.fillText("ROOFTOP LOFT", x + 10, rooftopY - 82);
  context.restore();
}

function drawPigeon(time) {
  const x = width * PLAYER_X_RATIO;
  const verticalVelocity = pigeonY - previousY;
  const rotation = Math.max(-0.22, Math.min(0.22, verticalVelocity * 0.05));
  const wingLift = Math.sin(time * (running ? 0.018 : 0.006)) * (running ? 12 : 4);

  context.save();
  context.translate(x, pigeonY);
  context.rotate(rotation);

  context.fillStyle = "rgba(7, 27, 36, 0.12)";
  context.beginPath();
  context.ellipse(0, 12, 52, 22, 0, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#315c64";
  context.beginPath();
  context.moveTo(-20, 4);
  context.quadraticCurveTo(-55, -22 - wingLift, -70, -2);
  context.quadraticCurveTo(-48, 12, -13, 16);
  context.closePath();
  context.fill();

  context.fillStyle = "#47747a";
  context.beginPath();
  context.moveTo(-12, 4);
  context.quadraticCurveTo(20, -32 + wingLift, 38, -14);
  context.quadraticCurveTo(31, 9, 5, 17);
  context.closePath();
  context.fill();

  context.fillStyle = "#193b44";
  context.beginPath();
  context.ellipse(0, 5, 31, 19, -0.04, 0, Math.PI * 2);
  context.fill();

  const neckGradient = context.createLinearGradient(13, -20, 32, 3);
  neckGradient.addColorStop(0, "#67d7cf");
  neckGradient.addColorStop(0.5, "#336f70");
  neckGradient.addColorStop(1, "#193b44");
  context.fillStyle = neckGradient;
  context.beginPath();
  context.arc(23, -9, 15, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#f77c55";
  context.beginPath();
  context.moveTo(35, -12);
  context.lineTo(52, -7);
  context.lineTo(35, -3);
  context.closePath();
  context.fill();

  context.fillStyle = "#fffdf6";
  context.beginPath();
  context.arc(29, -13, 4, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#071b24";
  context.beginPath();
  context.arc(30, -13, 1.7, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#122d35";
  context.beginPath();
  context.moveTo(-29, 3);
  context.lineTo(-52, -7);
  context.lineTo(-44, 8);
  context.lineTo(-58, 13);
  context.lineTo(-27, 16);
  context.closePath();
  context.fill();

  context.restore();
}

function drawSketchPigeon(time) {
  const frameDuration = running ? 115 : 520;
  const frameIndex = running ? Math.floor(time / frameDuration) % pigeonFlightFrames.length : 0;
  const pigeonFrame = pigeonFlightFrames[frameIndex];
  if (!pigeonFrame.complete || pigeonFrame.naturalWidth === 0) return;

  const x = width * PLAYER_X_RATIO;
  const verticalVelocity = pigeonY - previousY;
  const rotation = Math.max(-0.2, Math.min(0.2, verticalVelocity * 0.045));
  const wingPhase = (time / frameDuration) * (Math.PI / 2);
  const float = Math.sin(wingPhase) * (running ? 3.5 : 1.8);
  const breathe = 1 + Math.sin(wingPhase) * 0.015;
  const spriteWidth = Math.min(148, width * 0.25);
  const spriteHeight = spriteWidth * (pigeonFrame.naturalHeight / pigeonFrame.naturalWidth);

  context.save();
  context.translate(x, pigeonY + float);
  context.rotate(rotation);

  if (running) {
    context.strokeStyle = "rgba(231, 239, 102, 0.5)";
    context.lineWidth = 2;
    context.lineCap = "round";
    [0, 1, 2].forEach((line) => {
      const length = 20 + line * 8 + Math.sin(wingPhase + line) * 3;
      const y = -18 + line * 17;
      context.beginPath();
      context.moveTo(-spriteWidth * 0.46, y);
      context.lineTo(-spriteWidth * 0.46 - length, y);
      context.stroke();
    });
  }

  const halo = context.createRadialGradient(0, 2, 16, 0, 2, spriteWidth * 0.62);
  halo.addColorStop(0, "rgba(255, 253, 246, 0.2)");
  halo.addColorStop(1, "rgba(255, 253, 246, 0)");
  context.fillStyle = halo;
  context.beginPath();
  context.ellipse(0, 3, spriteWidth * 0.6, spriteHeight * 0.54, 0, 0, Math.PI * 2);
  context.fill();

  // The source sketch faces left, so mirror it to travel toward the loft.
  context.scale(-1, breathe);
  context.drawImage(
    pigeonFrame,
    -spriteWidth / 2,
    -spriteHeight / 2,
    spriteWidth,
    spriteHeight
  );
  context.restore();
}

function draw(time) {
  context.clearRect(0, 0, width, height);
  drawSky(time);
  drawCity();
  drawGuideLine();
  currentCues().forEach((cue, index) => drawCueGate(cue, index, time));
  drawLoft(time);
  drawSketchPigeon(time);
}

function frame(timestamp) {
  const deltaTime = Math.min((timestamp - lastTimestamp) / 1000 || 0, 0.04);
  lastTimestamp = timestamp;
  updateGame(deltaTime);
  draw(timestamp);
  animationFrame = requestAnimationFrame(frame);
}

function setSteerKey(direction, isPressed) {
  keys[direction] = isPressed;
}

modeButtons.forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

launchButton.addEventListener("click", launchFlight);
flyAgainButton.addEventListener("click", launchFlight);
compareButton.addEventListener("click", () => setMode(mode === "familiar" ? "unfamiliar" : "familiar"));

window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "w", "W", "s", "S", " "].includes(event.key)) {
    event.preventDefault();
  }

  if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") setSteerKey("up", true);
  if (event.key === "ArrowDown" || event.key.toLowerCase() === "s") setSteerKey("down", true);
  if (event.key === " " && !running && !finished) launchFlight();
});

window.addEventListener("keyup", (event) => {
  if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") setSteerKey("up", false);
  if (event.key === "ArrowDown" || event.key.toLowerCase() === "s") setSteerKey("down", false);
});

canvas.addEventListener("pointerdown", (event) => {
  pointerActive = true;
  steerTo(event.clientY);
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  if (pointerActive) steerTo(event.clientY);
});

canvas.addEventListener("pointerup", (event) => {
  pointerActive = false;
  canvas.releasePointerCapture(event.pointerId);
});

[[steerUp, "up"], [steerDown, "down"]].forEach(([button, direction]) => {
  button.addEventListener("pointerdown", () => setSteerKey(direction, true));
  button.addEventListener("pointerup", () => setSteerKey(direction, false));
  button.addEventListener("pointercancel", () => setSteerKey(direction, false));
  button.addEventListener("pointerleave", () => setSteerKey(direction, false));
});

window.addEventListener("resize", resizeCanvas);

resizeCanvas();
setMode("familiar");
animationFrame = requestAnimationFrame(frame);
