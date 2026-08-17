// Nachmal-Minigame (Item-Freischaltung durch Formen nachzeichnen)

let drawState = null; // { storeKey, guidePoints, userPoints, drawing }

function buildShape(shapeName) {
  const points = [];
  let d = "";

  if (shapeName === "kreis") {
    const cx = 110, cy = 110, r = 70;
    const steps = 72;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      points.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
    d = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map((p) => `L ${p.x} ${p.y}`).join(" ");
  } else if (shapeName === "welle") {
    const steps = 80;
    for (let i = 0; i <= steps; i++) {
      const x = 30 + (i / steps) * 160;
      const y = 110 + 45 * Math.sin(((x - 30) / 160) * Math.PI * 2 * 2);
      points.push({ x, y });
    }
    d = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map((p) => `L ${p.x} ${p.y}`).join(" ");
  } else if (shapeName === "zickzack") {
    const verts = [
      { x: 30, y: 150 },
      { x: 70, y: 60 },
      { x: 110, y: 150 },
      { x: 150, y: 60 },
      { x: 190, y: 150 },
    ];
    d = `M ${verts[0].x} ${verts[0].y} ` + verts.slice(1).map((p) => `L ${p.x} ${p.y}`).join(" ");
    sampleAlongSegments(verts, points, true);
  } else if (shapeName === "dreieck") {
    const verts = [
      { x: 110, y: 40 },
      { x: 185, y: 170 },
      { x: 35, y: 170 },
      { x: 110, y: 40 },
    ];
    d = `M ${verts[0].x} ${verts[0].y} ` + verts.slice(1).map((p) => `L ${p.x} ${p.y}`).join(" ");
    sampleAlongSegments(verts, points, true);
  } else if (shapeName === "quadrat") {
    const verts = [
      { x: 45, y: 45 },
      { x: 175, y: 45 },
      { x: 175, y: 175 },
      { x: 45, y: 175 },
      { x: 45, y: 45 },
    ];
    d = `M ${verts[0].x} ${verts[0].y} ` + verts.slice(1).map((p) => `L ${p.x} ${p.y}`).join(" ");
    sampleAlongSegments(verts, points, true);
  }

  return { d, points };
}

function sampleAlongSegments(verts, outPoints, closedAlready) {
  const stepsPerSegment = 20;
  for (let i = 0; i < verts.length - 1; i++) {
    const a = verts[i];
    const b = verts[i + 1];
    for (let s = 0; s <= stepsPerSegment; s++) {
      const t = s / stepsPerSegment;
      outPoints.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
}

function openDrawSceneForStore(locationId) {
  const trackedLocation = STORE_LOCATIONS.find((l) => l.id === locationId);
  trackEvent("store_selected", { storeId: locationId, category: trackedLocation.categoryKey });

  if (gameState.settings.skipMinigame) {
    grantRandomItemFromStore(locationId);
    return;
  }

  const location = STORE_LOCATIONS.find((l) => l.id === locationId);
  const category = STORE_CATEGORIES[location.categoryKey];
  const shape = randomChoice(DRAW_CONFIG.shapes);
  const { d, points } = buildShape(shape);

  drawState = {
    storeKey: locationId,
    guidePoints: points,
    userPoints: [],
    drawing: false,
  };

  document.getElementById("draw-bg").src = category.scene;
  document.getElementById("draw-store-label").textContent = category.name;
  document.getElementById("draw-guide-path").setAttribute("d", d);
  document.getElementById("draw-user-path").setAttribute("d", "");
  document.getElementById("draw-feedback").textContent = "Fahre die Form mit dem Finger/der Maus nach";
  document.getElementById("chk-skip-minigame").checked = gameState.settings.skipMinigame;

  showScreen("screen-draw");
}

function svgPointFromEvent(svg, evt) {
  const pt = svg.createSVGPoint();
  const src = evt.touches && evt.touches.length ? evt.touches[0] : evt;
  pt.x = src.clientX;
  pt.y = src.clientY;
  const ctm = svg.getScreenCTM().inverse();
  const transformed = pt.matrixTransform(ctm);
  return { x: transformed.x, y: transformed.y };
}

function updateUserPathVisual() {
  if (!drawState || drawState.userPoints.length === 0) return;
  const d =
    `M ${drawState.userPoints[0].x} ${drawState.userPoints[0].y} ` +
    drawState.userPoints.slice(1).map((p) => `L ${p.x} ${p.y}`).join(" ");
  document.getElementById("draw-user-path").setAttribute("d", d);
}

function onDrawStart(evt) {
  if (!drawState) return;
  evt.preventDefault();
  drawState.drawing = true;
  drawState.userPoints = [];
  const svg = document.getElementById("draw-svg");
  drawState.userPoints.push(svgPointFromEvent(svg, evt));
  updateUserPathVisual();
}

function onDrawMove(evt) {
  if (!drawState || !drawState.drawing) return;
  evt.preventDefault();
  const svg = document.getElementById("draw-svg");
  drawState.userPoints.push(svgPointFromEvent(svg, evt));
  updateUserPathVisual();
}

function onDrawEnd(evt) {
  if (!drawState || !drawState.drawing) return;
  drawState.drawing = false;
  evaluateDrawing();
}

function evaluateDrawing() {
  const { guidePoints, userPoints } = drawState;
  if (userPoints.length < 2) {
    showDrawFeedback("Bitte die Form nachzeichnen.", false);
    return;
  }

  const tol = DRAW_CONFIG.toleranceRadius;
  let covered = 0;
  guidePoints.forEach((gp) => {
    const hit = userPoints.some((up) => {
      const dx = up.x - gp.x;
      const dy = up.y - gp.y;
      return dx * dx + dy * dy <= tol * tol;
    });
    if (hit) covered++;
  });

  const coverage = covered / guidePoints.length;

  if (coverage >= DRAW_CONFIG.successThreshold) {
    showDrawFeedback(`Erkannt! (${Math.round(coverage * 100)}% Abdeckung)`, true);
    setTimeout(() => {
      grantRandomItemFromStore(drawState.storeKey);
      drawState = null;
    }, 500);
  } else {
    showDrawFeedback(`Nicht ganz — ${Math.round(coverage * 100)}% erkannt. Nochmal versuchen!`, false);
    setTimeout(() => {
      if (drawState) {
        drawState.userPoints = [];
        document.getElementById("draw-user-path").setAttribute("d", "");
      }
    }, 700);
  }
}

function showDrawFeedback(text, success) {
  const el = document.getElementById("draw-feedback");
  el.textContent = text;
  el.style.color = success ? "#4ade80" : "#f5f3ff";
}

function grantRandomItemFromStore(locationId) {
  const location = STORE_LOCATIONS.find((l) => l.id === locationId);
  const category = STORE_CATEGORIES[location.categoryKey];

  // Sonderregel: Bank-Standorte geben ausschliesslich Muenzen (neue
  // Waehrung, siehe addCoins() in state.js), nie ein normales Item — alle
  // anderen Standorttypen ziehen aus einem gemeinsamen, globalen Pool nach
  // Seltenheit (getDropRarityStandort()) statt aus dem frueheren
  // branchenspezifischen category.itemPool.
  if (location.categoryKey === "bank") {
    const coinAmount = Math.round(randomBetween(BANK_DROP_COINS_MIN, BANK_DROP_COINS_MAX));
    addCoins(coinAmount);
    updateCaughtCounter();
    trackEvent("coins_received", { storeId: locationId, category: location.categoryKey, amount: coinAmount });
    showItemSuccessQueue([
      { type: "coins", amount: coinAmount, storeText: `Ihre Bank-Filiale bei ${category.name}` },
    ]);
    return;
  }

  const itemKey = pickItemFromPool(LOCATION_DROP_ITEM_POOL, getDropRarityStandort());
  const item = ITEMS[itemKey];

  addItem(itemKey);
  addXp(item.xp);
  updateCaughtCounter();

  trackEvent("item_free_received", {
    storeId: locationId,
    category: location.categoryKey,
    itemKey,
    rarity: item.rarity,
  });

  showItemSuccessQueue([
    { itemKey, storeText: `Ihr Produkt als In-Game Drop bei ${category.name}` },
  ]);
}

function onSkipMinigameToggle(checked) {
  setSkipMinigame(checked);
}
