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
  angle: 0,
  distance: 18,
  photo: "",
  photoUrl: "",
  photoStatus: "",
  dragging: null,
  paperLocked: false,
  targetLocked: false,
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
const resultSize = document.getElementById("resultSize");
const resultArea = document.getElementById("resultArea");
const angleReadout = document.getElementById("angleReadout");
const debugLine = document.getElementById("debugLine");
const uploadInput = document.getElementById("uploadInput");
const cameraInput = document.getElementById("cameraInput");
const measureButton = document.getElementById("measureButton");
const cameraFreeShapeButton = document.getElementById("cameraFreeShapeButton");
const cameraRectangleButton = document.getElementById("cameraRectangleButton");
const cameraSquareButton = document.getElementById("cameraSquareButton");
const paperLockButton = document.getElementById("paperLockButton");
const targetLockButton = document.getElementById("targetLockButton");
const resultButton = document.getElementById("resultButton");
const resetButton = document.getElementById("resetButton");
const stepButtons = document.querySelectorAll("[data-step]");
const stepLabels = document.querySelectorAll("[data-step-label]");

function resetHandles() {
  state.paper = rectangleFromBounds(625, 455, 745, 620);
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

function formatAngle(value) {
  if (value === 0) return "0° center";
  return `${Math.abs(value)}° ${value < 0 ? "left" : "right"}`;
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

function imageToMeasurement(point) {
  const h = homographyFromPaper();
  return h ? applyHomography(h, point) : null;
}

function measurementToImage(point) {
  const h = inverseHomographyFromPaper();
  return h ? applyHomography(h, point) : null;
}

function applyStandardShape(mode) {
  const widthValue = Math.max(1, state.shapeWidth);
  const heightValue = mode === "square" ? widthValue : Math.max(1, state.shapeHeight);
  if (mode === "square") {
    state.shapeHeight = state.shapeWidth;
  }

  const box = boundingBox(state.target);
  const center = {
    x: (box.minX + box.maxX) / 2,
    y: (box.minY + box.maxY) / 2
  };
  const currentWidth = Math.max(90, box.maxX - box.minX);
  const currentHeight = Math.max(90, box.maxY - box.minY);
  const aspect = heightValue / widthValue;
  let screenWidth = currentWidth;
  let screenHeight = mode === "square" ? currentWidth : currentWidth * aspect;

  if (screenHeight > VIEW_SIZE * 0.7) {
    screenHeight = Math.min(currentHeight, VIEW_SIZE * 0.7);
    screenWidth = mode === "square" ? screenHeight : screenHeight / aspect;
  }

  state.target = rectangleFromBounds(
    center.x - screenWidth / 2,
    center.y - screenHeight / 2,
    center.x + screenWidth / 2,
    center.y + screenHeight / 2
  );

  state.step = "outline";
  render();
}

function boundingBox(points) {
  return points.reduce((box, point) => ({
    minX: Math.min(box.minX, point.x),
    minY: Math.min(box.minY, point.y),
    maxX: Math.max(box.maxX, point.x),
    maxY: Math.max(box.maxY, point.y)
  }), {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY
  });
}

function rectangleFromBounds(x1, y1, x2, y2) {
  const left = Math.max(0, Math.min(x1, x2));
  const right = Math.min(VIEW_SIZE, Math.max(x1, x2));
  const top = Math.max(0, Math.min(y1, y2));
  const bottom = Math.min(VIEW_SIZE, Math.max(y1, y2));
  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom }
  ];
}

function lockedShapeFromDrag(point) {
  if (!state.dragging) return null;
  const index = state.dragging.index;
  const opposite = state.dragging.startTarget[(index + 2) % 4];
  let dx = point.x - opposite.x;
  let dy = point.y - opposite.y;

  if (state.shapeMode === "square") {
    const size = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * size;
    dy = Math.sign(dy || 1) * size;
  }

  const dragged = { x: opposite.x + dx, y: opposite.y + dy };
  return rectangleFromBounds(opposite.x, opposite.y, dragged.x, dragged.y);
}

function lockedRectangleFromCornerDrag(point, preserveAspect = false) {
  if (!state.dragging) return null;
  const source = state.dragging.kind === "paper" ? state.dragging.startPaper : state.dragging.startTarget;
  const index = state.dragging.index;
  const opposite = source[(index + 2) % 4];
  let dx = point.x - opposite.x;
  let dy = point.y - opposite.y;

  if (preserveAspect) {
    const aspect = Math.max(0.05, state.paperHeight / state.paperWidth);
    const width = Math.max(Math.abs(dx), Math.abs(dy) / aspect);
    dx = Math.sign(dx || 1) * width;
    dy = Math.sign(dy || 1) * width * aspect;
  }

  return rectangleFromBounds(opposite.x, opposite.y, opposite.x + dx, opposite.y + dy);
}

function lockedShapeFromEdgeDrag(point) {
  if (!state.dragging || !state.dragging.startBox) return null;
  let { minX, minY, maxX, maxY } = state.dragging.startBox;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  if (state.dragging.edge === "left") minX = Math.min(point.x, maxX - 20);
  if (state.dragging.edge === "right") maxX = Math.max(point.x, minX + 20);
  if (state.dragging.edge === "top") minY = Math.min(point.y, maxY - 20);
  if (state.dragging.edge === "bottom") maxY = Math.max(point.y, minY + 20);

  if (state.shapeMode === "square") {
    const size = Math.max(maxX - minX, maxY - minY);
    if (state.dragging.edge === "left") {
      minX = maxX - size;
      minY = centerY - size / 2;
      maxY = centerY + size / 2;
    } else if (state.dragging.edge === "right") {
      maxX = minX + size;
      minY = centerY - size / 2;
      maxY = centerY + size / 2;
    } else if (state.dragging.edge === "top") {
      minY = maxY - size;
      minX = centerX - size / 2;
      maxX = centerX + size / 2;
    } else if (state.dragging.edge === "bottom") {
      maxY = minY + size;
      minX = centerX - size / 2;
      maxX = centerX + size / 2;
    }
  }

  return rectangleFromBounds(minX, minY, maxX, maxY);
}

function lockedRectangleFromEdgeDrag(point, preserveAspect = false) {
  if (!state.dragging || !state.dragging.startBox) return null;
  let { minX, minY, maxX, maxY } = state.dragging.startBox;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  if (state.dragging.edge === "left") minX = Math.min(point.x, maxX - 20);
  if (state.dragging.edge === "right") maxX = Math.max(point.x, minX + 20);
  if (state.dragging.edge === "top") minY = Math.min(point.y, maxY - 20);
  if (state.dragging.edge === "bottom") maxY = Math.max(point.y, minY + 20);

  if (preserveAspect) {
    const aspect = Math.max(0.05, state.paperHeight / state.paperWidth);
    let width = maxX - minX;
    let height = maxY - minY;
    if (state.dragging.edge === "left" || state.dragging.edge === "right") {
      height = width * aspect;
      minY = centerY - height / 2;
      maxY = centerY + height / 2;
    } else {
      width = height / aspect;
      minX = centerX - width / 2;
      maxX = centerX + width / 2;
    }
  }

  return rectangleFromBounds(minX, minY, maxX, maxY);
}

function movedPointsFromDrag(points) {
  if (!state.dragging || !state.dragging.startBox) return points;
  const point = state.dragging.currentPoint;
  let dx = point.x - state.dragging.startPoint.x;
  let dy = point.y - state.dragging.startPoint.y;
  const box = state.dragging.startBox;

  dx = Math.max(-box.minX, Math.min(VIEW_SIZE - box.maxX, dx));
  dy = Math.max(-box.minY, Math.min(VIEW_SIZE - box.maxY, dy));

  return points.map((start) => ({
    x: start.x + dx,
    y: start.y + dy
  }));
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

function makeEdgeHandle(group, edge, point) {
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("x", point.x - 26);
  rect.setAttribute("y", point.y - 13);
  rect.setAttribute("width", 52);
  rect.setAttribute("height", 26);
  rect.setAttribute("rx", 9);
  const kind = group === paperHandles ? "paper" : "target";
  rect.setAttribute("class", `edge-handle ${kind}-edge-handle edge-${edge}`);
  rect.dataset.kind = kind;
  rect.dataset.edge = edge;
  group.appendChild(rect);
}

function renderHandles() {
  paperHandles.replaceChildren();
  targetHandles.replaceChildren();
  if (!state.paperLocked) {
    state.paper.forEach((point, index) => makeHandle(paperHandles, "paper", point, index));
    const paperBox = boundingBox(state.paper);
    makeEdgeHandle(paperHandles, "top", { x: (paperBox.minX + paperBox.maxX) / 2, y: paperBox.minY });
    makeEdgeHandle(paperHandles, "right", { x: paperBox.maxX, y: (paperBox.minY + paperBox.maxY) / 2 });
    makeEdgeHandle(paperHandles, "bottom", { x: (paperBox.minX + paperBox.maxX) / 2, y: paperBox.maxY });
    makeEdgeHandle(paperHandles, "left", { x: paperBox.minX, y: (paperBox.minY + paperBox.maxY) / 2 });
  }
  if (!state.targetLocked) {
    state.target.forEach((point, index) => makeHandle(targetHandles, "target", point, index));
  }
  if (!state.targetLocked && state.shapeMode !== "free") {
    const box = boundingBox(state.target);
    makeEdgeHandle(targetHandles, "top", { x: (box.minX + box.maxX) / 2, y: box.minY });
    makeEdgeHandle(targetHandles, "right", { x: box.maxX, y: (box.minY + box.maxY) / 2 });
    makeEdgeHandle(targetHandles, "bottom", { x: (box.minX + box.maxX) / 2, y: box.maxY });
    makeEdgeHandle(targetHandles, "left", { x: box.minX, y: (box.minY + box.maxY) / 2 });
  }
}

function updateOverlayFromPointer(event) {
  if (!state.dragging) return;
  const point = pointerToSvgPoint(event);
  const list = state.dragging.kind === "paper" ? state.paper : state.target;
  state.dragging.currentPoint = point;

  if (state.dragging.mode === "move" && state.dragging.kind === "paper") {
    state.paper = movedPointsFromDrag(state.dragging.startPaper);
  } else if (state.dragging.mode === "move") {
    state.target = movedPointsFromDrag(state.dragging.startTarget);
  } else if (state.dragging.edge && state.dragging.kind === "paper") {
    const locked = lockedRectangleFromEdgeDrag(point, true);
    if (locked) state.paper = locked;
  } else if (state.dragging.kind === "paper") {
    const locked = lockedRectangleFromCornerDrag(point, true);
    if (locked) state.paper = locked;
  } else if (state.dragging.edge && state.shapeMode !== "free") {
    const locked = lockedShapeFromEdgeDrag(point);
    if (locked) state.target = locked;
  } else if (state.dragging.kind === "target" && state.shapeMode !== "free") {
    const locked = lockedShapeFromDrag(point);
    if (locked) state.target = locked;
  } else {
    list[state.dragging.index] = clampPoint(point);
  }

  updateLoupe(point, event);
  render();
}

function getPhotoFrame() {
  const cameraRect = camera.getBoundingClientRect();
  if (!state.photoUrl || !photoPreview.naturalWidth || !photoPreview.naturalHeight) {
    return {
      left: 0,
      top: 0,
      width: cameraRect.width,
      height: cameraRect.height
    };
  }

  const scale = Math.min(
    cameraRect.width / photoPreview.naturalWidth,
    cameraRect.height / photoPreview.naturalHeight
  );
  const width = photoPreview.naturalWidth * scale;
  const height = photoPreview.naturalHeight * scale;

  return {
    left: (cameraRect.width - width) / 2,
    top: (cameraRect.height - height) / 2,
    width,
    height
  };
}

function pointerToSvgPoint(event) {
  const svgPoint = overlay.createSVGPoint();
  svgPoint.x = event.clientX;
  svgPoint.y = event.clientY;
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
  const frame = getPhotoFrame();
  const scaleX = frame.width / VIEW_SIZE;
  const scaleY = frame.height / VIEW_SIZE;
  const targetX = point.x * scaleX;
  const targetY = point.y * scaleY;
  const loupeSize = 138;
  const loupeX = Math.max(8, Math.min(cameraRect.width - loupeSize - 8, event.clientX - cameraRect.left - loupeSize / 2));
  const loupeY = Math.max(8, Math.min(cameraRect.height - loupeSize - 8, frame.top + targetY - loupeSize - 28));

  loupe.classList.add("active");
  loupe.style.left = `${loupeX}px`;
  loupe.style.top = `${loupeY}px`;

  if (state.photoUrl) {
    loupePhoto.src = state.photoUrl;
    loupePhoto.style.width = `${frame.width * 2.4}px`;
    loupePhoto.style.height = `${frame.height * 2.4}px`;
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
  const frame = getPhotoFrame();

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
  overlay.style.left = `${frame.left}px`;
  overlay.style.top = `${frame.top}px`;
  overlay.style.right = "auto";
  overlay.style.bottom = "auto";
  overlay.style.width = `${frame.width}px`;
  overlay.style.height = `${frame.height}px`;

  stepButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.step === state.step);
  });
  stepLabels.forEach((item) => {
    item.classList.toggle("active", item.dataset.stepLabel === state.step);
  });

  paperPoly.setAttribute("points", pointsToString(state.paper));
  targetPoly.setAttribute("points", pointsToString(state.target));
  paperPoly.classList.toggle("locked", state.paperLocked);
  targetPoly.classList.toggle("locked", state.targetLocked);
  renderHandles();
  cameraFreeShapeButton.classList.toggle("active-shape", state.shapeMode === "free");
  cameraRectangleButton.classList.toggle("active-shape", state.shapeMode === "rectangle");
  cameraSquareButton.classList.toggle("active-shape", state.shapeMode === "square");
  paperLockButton.classList.toggle("active-lock", state.paperLocked);
  targetLockButton.classList.toggle("active-lock", state.targetLocked);
  paperLockButton.textContent = `Paper: ${state.paperLocked ? "Locked" : "Unlocked"}`;
  targetLockButton.textContent = `Measure: ${state.targetLocked ? "Locked" : "Unlocked"}`;

  confidence.textContent = confidenceState.label;
  confidence.className = `badge ${confidenceState.className}`;
  confidenceNote.textContent = confidenceState.note;
  angleReadout.textContent = formatAngle(state.angle);
  debugLine.textContent = state.photoStatus || (state.photo ? `Loaded ${state.photo}` : "No photo selected yet.");

  if (!measurement) {
    resultSize.textContent = "Waiting for target outline";
    resultArea.textContent = "Use the green paper handles first, then set the gold measurement handles.";
    return;
  }

  resultSize.textContent = `${formatLength(measurement.width)} wide by ${formatLength(measurement.height)} high`;
  resultArea.textContent = `${formatArea(measurement.area)}. Edge check: top ${formatLength(measurement.top)}, right ${formatLength(measurement.right)}, bottom ${formatLength(measurement.bottom)}, left ${formatLength(measurement.left)}.`;
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
cameraFreeShapeButton.addEventListener("click", () => setShapeMode("free"));
cameraRectangleButton.addEventListener("click", () => setShapeMode("rectangle"));
cameraSquareButton.addEventListener("click", () => setShapeMode("square"));
paperLockButton.addEventListener("click", () => {
  state.paperLocked = !state.paperLocked;
  render();
});
targetLockButton.addEventListener("click", () => {
  state.targetLocked = !state.targetLocked;
  render();
});
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
  const dragTarget = event.target.closest(".handle, .edge-handle, #targetPoly, #paperPoly");
  if (!dragTarget) return;
  const startPoint = pointerToSvgPoint(event);
  const isPolygon = dragTarget === targetPoly || dragTarget === paperPoly;
  const kind = isPolygon ? (dragTarget === paperPoly ? "paper" : "target") : dragTarget.dataset.kind;
  if ((kind === "paper" && state.paperLocked) || (kind === "target" && state.targetLocked)) return;
  state.dragging = {
    kind,
    mode: isPolygon ? "move" : "resize",
    index: dragTarget.dataset.index === undefined ? null : Number(dragTarget.dataset.index),
    edge: dragTarget.dataset.edge || "",
    startPoint,
    currentPoint: startPoint,
    startPaper: state.paper.map((point) => ({ ...point })),
    startTarget: state.target.map((point) => ({ ...point })),
    startBox: boundingBox(kind === "paper" ? state.paper : state.target)
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
