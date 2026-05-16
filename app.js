const VIEW_SIZE = 1000;

const state = {
  step: "calibrate",
  paperWidth: 8.5,
  paperHeight: 11,
  inputUnit: "in",
  outputUnit: "ft",
  displayFormat: "decimal",
  shapeMode: "free",
  shapeWidth: 72,
  shapeHeight: 48,
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
  inputUnit: document.getElementById("inputUnit"),
  outputUnit: document.getElementById("outputUnit"),
  displayFormat: document.getElementById("displayFormat"),
  shapeWidth: document.getElementById("shapeWidth"),
  shapeHeight: document.getElementById("shapeHeight"),
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
const shapeBadge = document.getElementById("shapeBadge");
const statusLabel = document.getElementById("statusLabel");
const cameraHint = document.getElementById("cameraHint");
const debugLine = document.getElementById("debugLine");
const uploadInput = document.getElementById("uploadInput");
const cameraInput = document.getElementById("cameraInput");
const measureButton = document.getElementById("measureButton");
const freeShapeButton = document.getElementById("freeShapeButton");
const rectangleButton = document.getElementById("rectangleButton");
const squareButton = document.getElementById("squareButton");
const cameraFreeShapeButton = document.getElementById("cameraFreeShapeButton");
const cameraRectangleButton = document.getElementById("cameraRectangleButton");
const cameraSquareButton = document.getElementById("cameraSquareButton");
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
    if (inputs[key].type === "number" || inputs[key].type === "range") {
      state[key] = Number(inputs[key].value) || 0;
    } else {
      state[key] = inputs[key].value;
    }
  });
}

function toInches(value, unit) {
  return unit === "ft" ? value * 12 : value;
}

function fromInches(value, unit) {
  return unit === "ft" ? value / 12 : value;
}

function unitLabel(unit) {
  return unit === "ft" ? "ft" : "in";
}

function areaLabel(unit) {
  return unit === "ft" ? "sq ft" : "sq in";
}

function formatLength(valueInches) {
  if (state.outputUnit === "in" && state.displayFormat === "fraction") {
    return `${formatInchFraction(valueInches)} in`;
  }
  const converted = fromInches(valueInches, state.outputUnit);
  return `${converted.toFixed(state.outputUnit === "ft" ? 2 : 1)} ${unitLabel(state.outputUnit)}`;
}

function formatArea(valueSqInches) {
  const converted = state.outputUnit === "ft" ? valueSqInches / 144 : valueSqInches;
  return `${converted.toFixed(state.outputUnit === "ft" ? 2 : 1)} ${areaLabel(state.outputUnit)}`;
}

function gcd(a, b) {
  return b ? gcd(b, a % b) : a;
}

function formatInchFraction(value) {
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  const whole = Math.floor(absolute);
  const denominator = 16;
  let numerator = Math.round((absolute - whole) * denominator);
  let displayWhole = whole;

  if (numerator === denominator) {
    displayWhole += 1;
    numerator = 0;
  }
  if (!numerator) return `${sign}${displayWhole}`;

  const divisor = gcd(numerator, denominator);
  const reducedNumerator = numerator / divisor;
  const reducedDenominator = denominator / divisor;
  return displayWhole
    ? `${sign}${displayWhole} ${reducedNumerator}/${reducedDenominator}`
    : `${sign}${reducedNumerator}/${reducedDenominator}`;
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
  const paperWidthInches = toInches(state.paperWidth, state.inputUnit);
  const paperHeightInches = toInches(state.paperHeight, state.inputUnit);
  const dst = [
    { x: 0, y: 0 },
    { x: paperWidthInches, y: 0 },
    { x: paperWidthInches, y: paperHeightInches },
    { x: 0, y: paperHeightInches }
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

function inverseHomographyFromPaper() {
  const paperWidthInches = toInches(state.paperWidth, state.inputUnit);
  const paperHeightInches = toInches(state.paperHeight, state.inputUnit);
  const src = [
    { x: 0, y: 0 },
    { x: paperWidthInches, y: 0 },
    { x: paperWidthInches, y: paperHeightInches },
    { x: 0, y: paperHeightInches }
  ];
  return homographyFromFourPoints(src, state.paper);
}

function homographyFromFourPoints(src, dst) {
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
  return solution ? [...solution, 1] : null;
}

function setShapeMode(mode) {
  readInputs();
  state.shapeMode = mode;
  if (mode === "free") {
    render();
    return;
  }
  applyStandardShape(mode);
}

function applyStandardShape(mode) {
  const measurement = measureTarget();
  const h = inverseHomographyFromPaper();
  if (!h) return;

  const widthInches = toInches(state.shapeWidth, state.inputUnit);
  const heightInches = mode === "square" ? widthInches : toInches(state.shapeHeight, state.inputUnit);
  if (mode === "square") {
    state.shapeHeight = state.shapeWidth;
    inputs.shapeHeight.value = state.shapeHeight;
  }

  let center = { x: 0, y: 0 };
  if (measurement) {
    const mapped = state.target.map((point) => applyHomography(homographyFromPaper(), point));
    center = mapped.reduce((acc, point) => ({ x: acc.x + point.x / 4, y: acc.y + point.y / 4 }), center);
  } else {
    center = { x: widthInches / 2, y: heightInches / 2 };
  }

  const targetInches = [
    { x: center.x - widthInches / 2, y: center.y - heightInches / 2 },
    { x: center.x + widthInches / 2, y: center.y - heightInches / 2 },
    { x: center.x + widthInches / 2, y: center.y + heightInches / 2 },
    { x: center.x - widthInches / 2, y: center.y + heightInches / 2 }
  ];

  state.target = targetInches.map((point) => applyHomography(h, point));
  state.step = "outline";
  render();
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
  const point = pointerToSvgPoint(event);
  const list = state.dragging.kind === "paper" ? state.paper : state.target;

  if (state.dragging.kind === "target" && state.shapeMode !== "free") {
    const dx = point.x - state.dragging.startPoint.x;
    const dy = point.y - state.dragging.startPoint.y;
    state.target = state.dragging.startTarget.map((targetPoint) => clampPoint({
      x: targetPoint.x + dx,
      y: targetPoint.y + dy
    }));
  } else {
    list[state.dragging.index] = clampPoint(point);
  }

  updateLoupe(point, event);
  render();
}

function pointerToSvgPoint(event) {
  const svgPoint = overlay.createSVGPoint();
  svgPoint.x = event.clientX;
  svgPoint.y = event.clientY - 72;
  return svgPoint.matrixTransform(overlay.getScreenCTM().inverse());
}

function clampPoint(point) {
  return {
    x: Math.max(0, Math.min(VIEW_SIZE, point.x)),
    y: Math.max(0, Math.min(VIEW_SIZE, point.y))
  };
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
  shapeBadge.textContent = state.shapeMode === "free" ? "Free draw" : state.shapeMode === "square" ? "Square" : "Rectangle";
  freeShapeButton.classList.toggle("active-shape", state.shapeMode === "free");
  rectangleButton.classList.toggle("active-shape", state.shapeMode === "rectangle");
  squareButton.classList.toggle("active-shape", state.shapeMode === "square");
  cameraFreeShapeButton.classList.toggle("active-shape", state.shapeMode === "free");
  cameraRectangleButton.classList.toggle("active-shape", state.shapeMode === "rectangle");
  cameraSquareButton.classList.toggle("active-shape", state.shapeMode === "square");

  confidence.textContent = confidenceState.label;
  confidence.className = `badge ${confidenceState.className}`;
  confidenceNote.textContent = confidenceState.note;
  statusLabel.textContent = state.step === "photo" ? "Take photo" : state.step === "outline" ? "Outline area" : state.step === "result" ? "Result" : "Calibrate paper";
  cameraHint.textContent = state.photoStatus || (state.step === "outline" && state.shapeMode !== "free"
    ? "Locked shape mode: drag any gold handle to move the whole shape."
    : state.step === "outline"
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

  readoutSize.textContent = `${formatLength(measurement.width)} x ${formatLength(measurement.height)}`;
  readoutArea.textContent = `${formatArea(measurement.area)} estimated`;
  resultSize.textContent = `${formatLength(measurement.width)} wide by ${formatLength(measurement.height)} high`;
  resultArea.textContent = `${formatArea(measurement.area)}. Edge check: top ${formatLength(measurement.top)}, right ${formatLength(measurement.right)}, bottom ${formatLength(measurement.bottom)}, left ${formatLength(measurement.left)}.`;
}

Object.values(inputs).forEach((input) => {
  input.addEventListener("input", () => {
    readInputs();
    if (state.shapeMode === "square" && input === inputs.shapeWidth) {
      state.shapeHeight = state.shapeWidth;
      inputs.shapeHeight.value = state.shapeHeight;
    }
    if (state.shapeMode !== "free" && (input === inputs.shapeWidth || input === inputs.shapeHeight || input === inputs.inputUnit)) {
      applyStandardShape(state.shapeMode);
      return;
    }
    render();
  });
});

stepButtons.forEach((button) => {
  button.addEventListener("click", () => setStep(button.dataset.step));
});

measureButton.addEventListener("click", () => setStep("outline"));
freeShapeButton.addEventListener("click", () => setShapeMode("free"));
rectangleButton.addEventListener("click", () => setShapeMode("rectangle"));
squareButton.addEventListener("click", () => setShapeMode("square"));
cameraFreeShapeButton.addEventListener("click", () => setShapeMode("free"));
cameraRectangleButton.addEventListener("click", () => setShapeMode("rectangle"));
cameraSquareButton.addEventListener("click", () => setShapeMode("square"));
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
  const startPoint = pointerToSvgPoint(event);
  state.dragging = {
    kind: handle.dataset.kind,
    index: Number(handle.dataset.index),
    startPoint,
    startTarget: state.target.map((point) => ({ ...point }))
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
