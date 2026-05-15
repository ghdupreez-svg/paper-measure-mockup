const state = {
  step: "calibrate",
  paperWidth: 8.5,
  paperHeight: 11,
  angle: 24,
  distance: 18,
  width: 183,
  height: 111,
  photo: ""
};

const inputs = {
  paperWidth: document.getElementById("paperWidth"),
  paperHeight: document.getElementById("paperHeight"),
  angle: document.getElementById("angle"),
  distance: document.getElementById("distance"),
  width: document.getElementById("width"),
  height: document.getElementById("height")
};

const camera = document.getElementById("camera");
const scene = document.getElementById("scene");
const confidence = document.getElementById("confidence");
const confidenceNote = document.getElementById("confidenceNote");
const readoutSize = document.getElementById("readoutSize");
const readoutArea = document.getElementById("readoutArea");
const resultSize = document.getElementById("resultSize");
const resultArea = document.getElementById("resultArea");
const photoInput = document.getElementById("photoInput");
const stepButtons = document.querySelectorAll("[data-step]");
const stepLabels = document.querySelectorAll("[data-step-label]");

function confidenceForAngle() {
  const angle = Math.abs(state.angle);
  if (!state.paperWidth || !state.paperHeight) {
    return {
      label: "Low confidence",
      className: "low",
      note: "Add the real paper size before measuring."
    };
  }
  if (angle <= 10) {
    return {
      label: "High confidence",
      className: "high",
      note: "Straight-on view with same-plane paper calibration."
    };
  }
  if (angle <= 30) {
    return {
      label: "Medium confidence",
      className: "",
      note: "Perspective correction is needed because the camera is angled."
    };
  }
  return {
    label: "Low confidence",
    className: "low",
    note: "Retake closer to straight-on or use AR scan for better accuracy."
  };
}

function setStep(step) {
  state.step = step;
  render();
}

function openPhotoPicker(nextStep = "calibrate") {
  state.step = nextStep;
  render();
  photoInput.click();
}

function readInputs() {
  Object.keys(inputs).forEach((key) => {
    state[key] = Number(inputs[key].value) || 0;
  });
}

function render() {
  const sceneAngle = state.angle * -0.45;
  const widthFt = state.width / 12;
  const heightFt = state.height / 12;
  const area = widthFt * heightFt;
  const confidenceState = confidenceForAngle();

  camera.className = `camera ${state.step}`;
  camera.classList.toggle("has-photo", Boolean(state.photo));
  if (state.photo) {
    camera.style.setProperty("--photo", `url("${state.photo}")`);
  } else {
    camera.style.removeProperty("--photo");
  }
  scene.style.setProperty("--scene-angle", `${sceneAngle}deg`);

  stepButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.step === state.step);
  });
  stepLabels.forEach((item) => {
    item.classList.toggle("active", item.dataset.stepLabel === state.step);
  });

  confidence.textContent = confidenceState.label;
  confidence.className = `badge ${confidenceState.className}`;
  confidenceNote.textContent = confidenceState.note;

  readoutSize.textContent = `${widthFt.toFixed(1)} ft x ${heightFt.toFixed(1)} ft`;
  readoutArea.textContent = `${area.toFixed(1)} sq ft estimated`;
  resultSize.textContent = `${widthFt.toFixed(2)} ft wide by ${heightFt.toFixed(2)} ft high`;
  resultArea.textContent = `${area.toFixed(2)} square feet. Distance is supporting context; same-plane paper calibration drives the scale.`;
}

Object.values(inputs).forEach((input) => {
  input.addEventListener("input", () => {
    readInputs();
    render();
  });
});

stepButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (button.classList.contains("shutter") || button.dataset.step === "photo") {
      openPhotoPicker(button.classList.contains("shutter") ? "calibrate" : "photo");
      return;
    }
    setStep(button.dataset.step);
  });
});

photoInput.addEventListener("change", () => {
  const file = photoInput.files && photoInput.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    state.photo = String(reader.result || "");
    state.step = "calibrate";
    render();
  });
  reader.readAsDataURL(file);
});

render();
