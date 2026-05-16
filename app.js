const VIEW_SIZE = 1000;

const state = {
  step: "calibrate",
  paperWidth: 8.5,
  paperHeight: 11,
  angle: 24,
  distance: 18,
  photo: "",
  photoUrl: "",
  photoStatus: "",
  dragging: null,
  paper: [
    { x: 625, y: 470 },
    { x: 735, y: 455 },
    { x: 745, y: 605 },
    { x: 620, y: 620 }
  ],
  target: [
    { x: 155, y: 265 },
    { x: 845, y: 245 },
    { x: 870, y: 775 },
    { x: 135, y: 795 }
  ]
};

const inputs = {
  paperWidth: document.getElementById("paperWidth"),
  paperHeight: document.getElementById("paperHeight"),
  angle: document.getElementById("angle"),
  distance: document.getElementById("distance")
};

const camera = document.getElementById("camera");
const scene = document.getElementById("scene");
const photoPreview = document.getElementById("photoPreview");
const loupe = document.getElementById("loupe");
const loupePhoto = document.getElementById("loupePhoto");
const overlay = document.getElementById("overlay");
const paperPoly = document.getElementById("paperPoly");
const targetPoly = document.getElementById("targetPoly");
const paperHandles = document.getElementById("paperHandles");
const targetHandles = document.getElementById("targetHandles");
const confidence = document.getElementById("confidence");
const confidenceNote = document.getElementById("confidenceNote");
const readoutSize = document.getElementById("readoutSize");
const readoutArea = document.getElementById("readoutArea");
const resultSize = document.getElementById("resultSize");
const resultArea = document.getElementById("resultArea");
const statusLabel = document.getElementById("statusLabel");
const cameraHint = document.getElementById("cameraHint");
const debugLine = document.getElementById("debugLine");
const uploadInput = document.getElementById("uploadInput");
const cameraInput = document.getElementById("cameraInput");
const measureButton = document.getElementById("measureButton");
const resultButton = document.getElementById("resultButton");
const resetButton = document.getElementById("resetButton");
const stepButtons = document.querySelectorAll("[data-step]");
const stepLabels = document.querySelectorAll("[data-step-label]");

function resetHandles() {
  state.paper = [
    { x: 625, y: 470 },
    { x: 735, y: 455 },
    { x: 745, y: 605 },
    { x: 620, y: 620 }
  ];
  state.target = [
    { x: 155, y: 265 },
    { x: 845, y: 245 },
    { x: 870, y: 775 },
    { x: 135, y: 795 }
  ];
  render();
}

function setStep(step) {
  state.step = step;
  render();
}

function readInputs() {
  Object.keys(inputs).forEach((key) => {
    state[key] = Number(inputs[key].value) || 0;
  });
}

function pointsToString(points) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function polygonArea(points) {
  let sum = 0;
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    sum += point.x * next.y - next.x * point.y;
  });
  return Math.abs(sum) / 2;
}

function solveLinearSystem(matrix, values) {
  const n = values.length;
  const a = matrix.map((row, index) => [...row, values[index]]);

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }

    if (Math.abs(a[pivot][col]) < 1e-9) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];

    const divisor = a[col][col];
    for (let item = col; item <= n; item += 1) a[col][item] /= divisor;

    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let item = col; item <= n; item += 1) {
        a[row][item] -= factor * a[col][item];
      }
    }
  }

  return a.map((row) => row[n]);
}

function homographyFromPaper() {
  const src = state.paper;
  const dst = [
    { x: 0, y: 0 },
    { x: state.paperWidth, y: 0 },
    { x: state.paperWidth, y: state.paperHeight },
    { x: 0, y: state.paperHeight }
  ];
  const matrix = [];
  const values = [];

  src.forEach((point, index) => {
    const target = dst[index];
    matrix.push([point.x, point.y, 1, 0, 0, 0, -target.x * point.x, -target.x * point.y]);
    values.push(target.x);
    matrix.push([0, 0, 0, point.x, point.y, 1, -target.y * point.x, -target.y * point.y]);
    values.push(target.y);
  });

  const solution = solveLinearSystem(matrix, values);
  if (!solution) return null;
  return [...solution, 1];
}

function applyHomography(h, point) {
  const denominator = h[6] * point.x + h[7] * point.y + h[8];
  return {
    x: (h[0] * point.x + h[1] * point.y + h[2]) / denominator,
    y: (h[3] * point.x + h[4] * point.y + h[5]) / denominator
  };
}

function measureTarget() {
  const h = homographyFromPaper();
  if (!h) return null;

  const mapped = state.target.map((point) => applyHomography(h, point));
  if (mapped.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null;

  const top = distance(mapped[0], mapped[1]);
  const right = distance(mapped[1], mapped[2]);
  const bottom = distance(mapped[2], mapped[3]);
  const left = distance(mapped[3], mapped[0]);
  const width = (top + bottom) / 2;
  const height = (right + left) / 2;
  const area = polygonArea(mapped);

  return { width, height, area, top, right, bottom, left };
}

function confidenceForMeasurement(measurement) {
  const paperTop = distance(state.paper[0], state.paper[1]);
  const paperRight = distance(state.paper[1], state.paper[2]);
  const paperArea = polygonArea(state.paper);

  if (!state.photo) {
    return {
      label: "Demo mode",
      className: "",
      note: "Take or upload a real photo to test the measurement workflow."
    };
  }
  if (!measurement || paperArea < 5000 || paperTop < 45 || paperRight < 45) {
    return {
      label: "Low confidence",
      className: "low",
      note: "The paper selection is too small or distorted. Move the green handles to the visible sheet corners."
    };
  }
  if (Math.abs(state.angle) > 35) {
    return {
      label: "Low confidence",
      className: "low",
      note: "The camera angle is steep. Retake closer to straight-on for a stronger test."
    };
  }
  if (Math.abs(state.angle) > 15) {
    return {
      label: "Medium confidence",
      className: "",
      note: "Perspective correction is active. Results are best when the paper and target area are on the same flat wall."
    };
  }
  return {
    label: "High confidence",
    className: "high",
    note: "Straight-on photo with same-plane paper calibration."
  };
}

function makeHandle(group, kind, point, index) {
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", point.x);
  circle.setAttribute("cy", point.y);
  circle.setAttribute("r", kind === "paper" ? 20 : 18);
  circle.setAttribute("class", `handle ${kind}-handle`);
  circle.dataset.kind = kind;
  circle.dataset.index = index;
  group.appendChild(circle);

  const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
  label.setAttribute("x", point.x);
  label.setAttribute("y", point.y + 6);
  label.setAttribute("class", "handle-label");
  label.textContent = index + 1;
  group.appendChild(label);
}

function renderHandles() {
  paperHandles.replaceChildren();
  targetHandles.replaceChildren();
  state.paper.forEach((point, index) => makeHandle(paperHandles, "paper", point, index));
  state.target.forEach((point, index) => makeHandle(targetHandles, "target", point, index));
}

function updateOverlayFromPointer(event) {
  if (!state.dragging) return;
  const svgPoint = overlay.createSVGPoint();
  svgPoint.x = event.clientX;
  svgPoint.y = event.clientY - 72;
  const point = svgPoint.matrixTransform(overlay.getScreenCTM().inverse());
  const list = state.dragging.kind === "paper" ? state.paper : state.target;
  list[state.dragging.index] = {
    x: Math.max(0, Math.min(VIEW_SIZE, point.x)),
    y: Math.max(0, Math.min(VIEW_SIZE, point.y))
  };
  updateLoupe(point, event);
  render();
}

function updateLoupe(point, event) {
  const cameraRect = camera.getBoundingClientRect();
  const scaleX = cameraRect.width / VIEW_SIZE;
  const scaleY = cameraRect.height / VIEW_SIZE;
  const targetX = point.x * scaleX;
  const targetY = point.y * scaleY;
  const loupeSize = 138;
  const loupeX = Math.max(8, Math.min(cameraRect.width - loupeSize - 8, event.clientX - cameraRect.left - loupeSize / 2));
  const loupeY = Math.max(8, Math.min(cameraRect.height - loupeSize - 8, targetY - loupeSize - 28));

  loupe.classList.add("active");
  loupe.style.left = `${loupeX}px`;
  loupe.style.top = `${loupeY}px`;

  if (state.photoUrl) {
    loupePhoto.src = state.photoUrl;
    loupePhoto.style.width = `${cameraRect.width * 2.4}px`;
    loupePhoto.style.height = `${cameraRect.height * 2.4}px`;
    loupePhoto.style.left = `${loupeSize / 2 - targetX * 2.4}px`;
    loupePhoto.style.top = `${loupeSize / 2 - targetY * 2.4}px`;
  }
}

function hideLoupe() {
  loupe.classList.remove("active");
}

function render() {
  const sceneAngle = state.angle * -0.45;
  const measurement = measureTarget();
  const confidenceState = confidenceForMeasurement(measurement);

  camera.className = `camera ${state.step}`;
  camera.classList.toggle("has-photo", Boolean(state.photoUrl));
  if (state.photoUrl) {
    if (photoPreview.src !== state.photoUrl) photoPreview.src = state.photoUrl;
    photoPreview.alt = "Selected measurement photo";
    if (loupePhoto.src !== state.photoUrl) loupePhoto.src = state.photoUrl;
  } else {
    photoPreview.removeAttribute("src");
    loupePhoto.removeAttribute("src");
  }
  scene.style.setProperty("--scene-angle", `${sceneAngle}deg`);

  stepButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.step === state.step);
  });
  stepLabels.forEach((item) => {
    item.classList.toggle("active", item.dataset.stepLabel === state.step);
  });

  paperPoly.setAttribute("points", pointsToString(state.paper));
  targetPoly.setAttribute("points", pointsToString(state.target));
  renderHandles();

  confidence.textContent = confidenceState.label;
  confidence.className = `badge ${confidenceState.className}`;
  confidenceNote.textContent = confidenceState.note;
  statusLabel.textContent = state.step === "photo" ? "Take photo" : state.step === "outline" ? "Outline area" : state.step === "result" ? "Result" : "Calibrate paper";
  cameraHint.textContent = state.photoStatus || (state.step === "outline"
    ? "Drag the gold corners around the area you want measured."
    : "Drag the green corners onto the exact paper corners.");
  debugLine.textContent = state.photoStatus || (state.photo ? `Loaded ${state.photo}` : "No photo selected yet.");

  if (!measurement) {
    readoutSize.textContent = "--";
    readoutArea.textContent = "Waiting for calibration";
    resultSize.textContent = "Waiting for target outline";
    resultArea.textContent = "Use the green paper handles first, then set the gold measurement handles.";
    return;
  }

  const widthFt = measurement.width / 12;
  const heightFt = measurement.height / 12;
  const areaSqFt = measurement.area / 144;
  readoutSize.textContent = `${widthFt.toFixed(2)} ft x ${heightFt.toFixed(2)} ft`;
  readoutArea.textContent = `${areaSqFt.toFixed(2)} sq ft estimated`;
  resultSize.textContent = `${widthFt.toFixed(2)} ft wide by ${heightFt.toFixed(2)} ft high`;
  resultArea.textContent = `${areaSqFt.toFixed(2)} square feet. Edge check: top ${measurement.top.toFixed(1)} in, right ${measurement.right.toFixed(1)} in, bottom ${measurement.bottom.toFixed(1)} in, left ${measurement.left.toFixed(1)} in.`;
}

Object.values(inputs).forEach((input) => {
  input.addEventListener("input", () => {
    readInputs();
    render();
  });
});

stepButtons.forEach((button) => {
  button.addEventListener("click", () => setStep(button.dataset.step));
});

measureButton.addEventListener("click", () => setStep("outline"));
resultButton.addEventListener("click", () => setStep("result"));
resetButton.addEventListener("click", resetHandles);

function loadSelectedPhoto(input) {
  const file = input.files && input.files[0];
  if (!file) {
    state.photoStatus = "No photo was returned. Try the + button to select from your library.";
    render();
    return;
  }

  state.photoStatus = `Loading ${file.name || "photo"} (${Math.round(file.size / 1024)} KB, ${file.type || "unknown type"})...`;
  render();

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    state.photo = file.name || "Selected photo";
    state.photoUrl = String(reader.result || "");
    state.photoStatus = "Photo ready. Drag the green corners to the paper.";
    state.step = "calibrate";
    render();
  });
  reader.addEventListener("error", () => {
    state.photoStatus = "The browser could not read that image. Try taking another photo or selecting a JPEG/PNG.";
    render();
  });
  reader.readAsDataURL(file);
  input.value = "";
}

uploadInput.addEventListener("click", () => setStep("photo"));
cameraInput.addEventListener("click", () => setStep("photo"));
uploadInput.addEventListener("change", () => loadSelectedPhoto(uploadInput));
cameraInput.addEventListener("change", () => loadSelectedPhoto(cameraInput));

photoPreview.addEventListener("load", () => {
  state.photoStatus = "Photo ready. Drag the green corners to the paper.";
  render();
});

photoPreview.addEventListener("error", () => {
  state.photoStatus = "The image was received but could not be displayed. Try a JPEG/PNG photo.";
  state.photoUrl = "";
  render();
});

overlay.addEventListener("pointerdown", (event) => {
  const handle = event.target.closest(".handle");
  if (!handle) return;
  state.dragging = {
    kind: handle.dataset.kind,
    index: Number(handle.dataset.index)
  };
  overlay.setPointerCapture(event.pointerId);
  updateOverlayFromPointer(event);
});

overlay.addEventListener("pointermove", updateOverlayFromPointer);

overlay.addEventListener("pointerup", (event) => {
  state.dragging = null;
  hideLoupe();
  if (overlay.hasPointerCapture(event.pointerId)) overlay.releasePointerCapture(event.pointerId);
});

overlay.addEventListener("pointercancel", () => {
  state.dragging = null;
  hideLoupe();
});

render();
