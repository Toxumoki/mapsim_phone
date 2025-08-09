// =============================
// 視覚シミュレーター script.js
// FOV（視野角）+ 射線遮断 + 編集モード付き
// =============================

// ---- キャンバス設定 ----
// HTML上の<canvas>要素を取得し、描画用コンテキストを取得
const canvas = document.getElementById("visionCanvas");
const ctx = canvas.getContext("2d");

// 1マスの大きさ（セルサイズ）とマップの行列数
const cellSize = 20;
const cols = 16;  // 横16セル
const rows = 36;  // 縦36セル

// キャンバスサイズをグリッドサイズに合わせる
canvas.width = cols * cellSize;
canvas.height = rows * cellSize;

// ---- 追加: ドラッグ状態管理 ----
let isDraggingCharacter = false;
let draggedCharacter = null;


// ---- プレイヤー設定 ----
// プレイヤーの初期位置はキャンバス中央
let playerX = canvas.width / 2;
let playerY = canvas.height / 2;
const playerSpeed = 2; // 移動速度（矢印キーで使用）

// マウス位置（視線方向を制御）
let mouseX = playerX;
let mouseY = playerY;

// プレイヤーが見ている方向を保存
let playerView = { x: playerX, y: playerY };

// ---- キャラクター管理 ----
// 敵と味方の配列を用意
const enemies = [];
const allies = [];

// 選択中のキャラクター（クリックで選択）
let selectedCharacter = null;

// ---- 敵・味方追加 ----
// ランダム位置に敵を追加
function addEnemy() {
  enemies.push({
    //敵のランダム生成
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    // 敵の大きさ
    radius: 8, 
    // 射線表示用
    mouseX: Math.random() * canvas.width, 
    mouseY: Math.random() * canvas.height,
    // 種別
    type: "enemy" 
  });
}

// ランダム位置に味方を追加
function addAlly() {
  allies.push({
    //味方のランダム生成
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    //味方の大きさ
    radius: 8,
    //射線表示用
    mouseX: Math.random() * canvas.width,
    mouseY: Math.random() * canvas.height,
    //種別
    type: "ally"
  });
}

// 敵の描画
function drawEnemies() {
  enemies.forEach(e => {
    // 敵の色
    ctx.fillStyle = "red"; 
    ctx.beginPath();
    //敵を丸く描画
    ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
    ctx.fill();
    // 選択中の敵には黄色の枠
    if (selectedCharacter === e) { ctx.strokeStyle = "yellow"; ctx.stroke(); }
  });
}

// 味方の描画
function drawAllies() {
  allies.forEach(a => {
    // 味方は緑
    ctx.fillStyle = "green"; 
    ctx.beginPath();
    //味方を丸く描画
    ctx.arc(a.x, a.y, a.radius, 0, Math.PI * 2);
    ctx.fill();
    // 選択中の敵には黄色の枠
    if (selectedCharacter === a) { ctx.strokeStyle = "yellow"; ctx.stroke(); }
  });
}

// ---- 障害物管理 ----
// 編集モード中はtrue
let isEditMode = true;

// FOV（視野角）の角度
const fovAngle = Math.PI / 3;

// 障害物のリスト
const obstacles = [];
let selectedObstacleIndex = null;

// 形状の表示名
const shapeNames = { small_triangle: "小三角形", big_triangle: "大三角形", rhombus: "ひし形", trapezoid: "台形" };

// 押されているキーの状態
const keysPressed = {};

// 射線・FOVの表示フラグ
let showLines = false;
let showFOV = false;

// グリッド基準点(anchorIndex)に合わせて図形を配置
function alignShapeToGrid(points, gx, gy, anchorIndex) {
  const ox = gx * cellSize - points[anchorIndex].x;
  const oy = gy * cellSize - points[anchorIndex].y;
  return points.map(p => ({ x: p.x + ox, y: p.y + oy }));
}

// 指定点(px,py)を(cx,cy)中心にangleDeg度回転
// 障害物追加時の関数
function rotatePoint(px, py, cx, cy, angleDeg) {
  const r = angleDeg * Math.PI / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const dx = px - cx;
  const dy = py - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

// 障害物全体を回転
// 回転反映時の関数
function rotateObstacle(shapes, deg, cx, cy) {
  return shapes.map(poly => poly.map(p => rotatePoint(p.x, p.y, cx, cy, deg)));
}

// ---- 各形状を生成する関数 ----
// 三角形（小）
function createTriangleAtGridPoint(x, y, ang = 0, anch = "topLeft") {
  // 一片の長さと高さ
  const s = 2 * cellSize * 0.9, h = Math.sqrt(3) / 2 * s;
  let pts = [{ x: 0, y: 0 }, { x: -s / 2, y: h }, { x: s / 2, y: h }];
  let ai = anch === "bottomLeft" ? 1 : anch === "bottomRight" ? 2 : 0;
  pts = alignShapeToGrid(pts, x, y, ai);
  const cx = pts[ai].x, cy = pts[ai].y;
  return pts.map(p => rotatePoint(p.x, p.y, cx, cy, ang));
}

// 三角形（大）
function createBigTriangleAtGridPoint(x, y, ang = 0, anch = "topLeft") {
  // 一片の長さと高さ
  const s = 4 * cellSize * 0.9, h = Math.sqrt(3) / 2 * s;
  let pts = [{ x: 0, y: 0 }, { x: -s / 2, y: h }, { x: s / 2, y: h }];
  let ai = anch === "bottomLeft" ? 1 : anch === "bottomRight" ? 2 : 0;
  pts = alignShapeToGrid(pts, x, y, ai);
  const cx = pts[ai].x, cy = pts[ai].y;
  return pts.map(p => rotatePoint(p.x, p.y, cx, cy, ang));
}

// ひし形
function createRhombusAtGridPoint(x, y, ang = 0, anch = "topLeft") {
  // 一片の長さと一つの角
  const s = 2 * cellSize * 0.9, r = Math.PI / 3;
  let pts = [
    { x: 0, y: 0 },
    { x: s, y: 0 },
    { x: s + s * Math.cos(r), y: s * Math.sin(r) },
    { x: s * Math.cos(r), y: s * Math.sin(r) }
  ];
  let ai = anch === "topRight" ? 1 : anch === "bottomRight" ? 2 : anch === "bottomLeft" ? 3 : 0;
  pts = alignShapeToGrid(pts, x, y, ai);
  const cx = pts[ai].x, cy = pts[ai].y;
  return pts.map(p => rotatePoint(p.x, p.y, cx, cy, ang));
}

// 台形
function createTrapezoidAtGridPoint(x, y, ang = 0, anch = "topLeft") {
  // 上底と下底と高さ
  const tw = 2 * cellSize * 0.9, bw = 2 * tw, h = Math.sqrt(3)/2 * tw;
  let pts = [
    { x: 0, y: 0 },
    { x: tw, y: 0 },
    { x: tw + (bw - tw) / 2, y: h },
    { x: -(bw - tw) / 2, y: h }
  ];
  let ai = anch === "topRight" ? 1 : anch === "bottomRight" ? 2 : anch === "bottomLeft" ? 3 : 0;
  pts = alignShapeToGrid(pts, x, y, ai);
  const cx = pts[ai].x, cy = pts[ai].y;
  return pts.map(p => rotatePoint(p.x, p.y, cx, cy, ang));
}

// ---- 射線が障害物に当たるまで交点を計算 ----
// (sx,sy) → (ex,ey) に向かって直線を飛ばし、最も近い障害物の衝突点を返す
function castRayUntilObstacle(sx, sy, ex, ey) {
  const ray = { a: { x: sx, y: sy }, b: { x: ex, y: ey } };
  let closest = null;
  for (const ob of obstacles) {
    for (const shape of ob.shapes) {
      for (let i = 0; i < shape.length; i++) {
        const seg = { a: shape[i], b: shape[(i + 1) % shape.length] };
        const hit = getIntersection(ray, seg);
        if (hit && (!closest || hit.dist < closest.dist)) closest = hit;
      }
    }
  }
  // 交点があれば交点、なければ元のターゲット座標を返す
  return closest ? { x: closest.x, y: closest.y } : { x: ex, y: ey };
}

// ---- チェックボックス制御 ----
// FOV・射線のON/OFFをUIから切り替える
document.getElementById("showLines").addEventListener("change", e => showLines = e.target.checked);
document.getElementById("showFOV").addEventListener("change", e => showFOV = e.target.checked);

// ---- キー入力状態 ----
document.addEventListener("keydown", e => keysPressed[e.key] = true);
document.addEventListener("keyup", e => keysPressed[e.key] = false);
// ---- マウス移動イベント ----
// マウスが動くたびに座標を取得し、選択中キャラの視線方向を更新
// ✅ キャラクターをドラッグ中なら位置をマウスに追従
canvas.addEventListener("mousemove", e => {
  const r = canvas.getBoundingClientRect();
  const mx = e.clientX - r.left;
  const my = e.clientY - r.top;

  // ✅ ドラッグ中はキャラを移動、射線方向は更新しない
  if (isDraggingCharacter && draggedCharacter) {
    const rsize = 8;
    const nx = Math.max(rsize, Math.min(canvas.width - rsize, mx));
    const ny = Math.max(rsize, Math.min(canvas.height - rsize, my));

    if (draggedCharacter.type === "player") {
      playerX = nx;
      playerY = ny;
    } else {
      draggedCharacter.x = nx;
      draggedCharacter.y = ny;
    }
  }

  // ✅ ドラッグしていないときのみ射線方向を更新（既存処理）
  mouseX = mx;
  mouseY = my;

  if (selectedCharacter?.type === "player") {
    playerView = { x: mouseX, y: mouseY };
  }
  if (selectedCharacter && (selectedCharacter.type === "enemy" || selectedCharacter.type === "ally")) {
    selectedCharacter.mouseX = mouseX;
    selectedCharacter.mouseY = mouseY;
  }
});


canvas.addEventListener("mouseup", () => {
  if (isDraggingCharacter) {
    isDraggingCharacter = false;
    draggedCharacter = null;
    // ✅ ドロップ直後にマウス方向を射線更新
    playerView = { x: mouseX, y: mouseY };
    if (selectedCharacter && (selectedCharacter.type === "enemy" || selectedCharacter.type === "ally")) {
      selectedCharacter.mouseX = mouseX;
      selectedCharacter.mouseY = mouseY;
    }
  }
});




// ---- クリック選択 ----
// キャラ・障害物をクリックしたら選択
canvas.addEventListener("mousedown", e => {
  const r = canvas.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;

  // ✅ キャラ選択と同時にドラッグ開始
  if (enemies.some(en => Math.hypot(en.x - x, en.y - y) < en.radius && (selectedCharacter = en))) {
    updateDeleteBtnUI();
    isDraggingCharacter = true;
    draggedCharacter = selectedCharacter;
    return;
  }
  if (allies.some(al => Math.hypot(al.x - x, al.y - y) < al.radius && (selectedCharacter = al))) {
    updateDeleteBtnUI();
    isDraggingCharacter = true;
    draggedCharacter = selectedCharacter;
    return;
  }
  if (Math.hypot(playerX - x, playerY - y) < 8) {
    selectedCharacter = { type: "player" };
    updateDeleteBtnUI();
    isDraggingCharacter = true;
    draggedCharacter = selectedCharacter;
    return;
  }

  // ✅ 障害物選択（既存処理そのまま）
  if (isEditMode) {
    for (let i = 0; i < obstacles.length; i++) {
      for (const s of obstacles[i].shapes) {
        if (isPointInPolygon({ x, y }, s)) { selectedObstacleIndex = i; updateSelectedUI(); return; }
      }
    }
    selectedObstacleIndex = null; updateSelectedUI();
  } else {
    selectedCharacter = null;
  }

  updateDeleteBtnUI();
});

// ✅ モバイル用ボタン押下で疑似キー操作
function bindMobileButton(buttonId, keyName) {
  const btn = document.getElementById(buttonId);
  btn.addEventListener("touchstart", e => {
    e.preventDefault();
    keysPressed[keyName] = true;
  });
  btn.addEventListener("touchend", e => {
    e.preventDefault();
    keysPressed[keyName] = false;
  });
}

bindMobileButton("btnUp", "ArrowUp");
bindMobileButton("btnDown", "ArrowDown");
bindMobileButton("btnLeft", "ArrowLeft");
bindMobileButton("btnRight", "ArrowRight");



// ---- タブ切替 ----
// 編集モード/射線管理モードを切り替えるタブの挙動
window.addEventListener("DOMContentLoaded", () => {
  updateMobileControlsUI();
  const tabs = document.querySelectorAll("#tabMenu .tab");
  const contents = document.querySelectorAll(".tabContent");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      // すべてのタブからactiveを外し、クリックされたタブだけactive
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");

      // コンテンツも切替
      contents.forEach(c => c.classList.remove("active"));
      document.getElementById(tab.dataset.target).classList.add("active");

      // 編集モードかどうかを判定
      isEditMode = (tab.dataset.target === "editPanel");

      updateMobileControlsUI(); // ✅ 初回ロードでもUI制御

      // 編集モードの時だけ編集ボタンを有効化
      ["addObstacleBtn","applyRotationBtn","clearObstaclesBtn","mirrorObstaclesBtn"]
        .forEach(id => { const b=document.getElementById(id); if(b) b.disabled=!isEditMode; });

      if (!isEditMode) { selectedObstacleIndex = null; updateSelectedUI(); }
    });

    isEditMode = (tab.dataset.target === "editPanel");

    // 編集ボタンの有効化
    ["addObstacleBtn","applyRotationBtn","clearObstaclesBtn","mirrorObstaclesBtn"]
      .forEach(id => { const b=document.getElementById(id); if(b) b.disabled=!isEditMode; });

    // ✅ 射線管理モードではプレイヤー選択
    if (!isEditMode) {
      selectedCharacter = { type: "player" };
    } else {
      selectedCharacter = null;
    }

    updateDeleteBtnUI();
    //updateMobileControlsUI(); // ✅ モバイルUI制御
  });
});

// ---- UI更新 ----
// キャラ削除ボタンの有効/無効を更新
function updateDeleteBtnUI() {
  document.getElementById("deleteCharacterBtn").disabled = !(selectedCharacter && (selectedCharacter.type === "enemy" || selectedCharacter.type === "ally"));
}

// 障害物一覧のUIを更新
function updateObstacleList() {
  const l = document.getElementById("obstacleList");
  l.innerHTML = "";
  const cnt = {};
  obstacles.forEach((o, i) => {
    const tn = shapeNames[o.type] || "障害物";
    cnt[o.type] = (cnt[o.type] || 0) + 1;
    const li = document.createElement("li");
    li.textContent = `${tn} ${cnt[o.type]}`;
    // クリックで障害物を選択
    li.addEventListener("click", () => { selectedObstacleIndex = i; updateSelectedUI(); });
    const b = document.createElement("button");
    b.textContent = "削除";
    // 削除ボタンで障害物削除
    b.onclick = e => {
      e.stopPropagation();
      obstacles.splice(i, 1);
      if (selectedObstacleIndex === i) { selectedObstacleIndex = null; updateSelectedUI(); }
      updateObstacleList();
    };
    li.appendChild(b);
    l.appendChild(li);
  });
}

// 障害物選択UIラベルの更新
function updateSelectedUI() {
  const l = document.getElementById("selectedLabel");
  const btn = document.getElementById("applyRotationBtn");
  if (selectedObstacleIndex !== null) {
    const cnt = {};
    let dn = "";
    obstacles.forEach((o, i) => { cnt[o.type] = (cnt[o.type] || 0) + 1; if (i === selectedObstacleIndex) dn = `${shapeNames[o.type]} ${cnt[o.type]}`; });
    l.textContent = `選択中: ${dn}`;
    btn.disabled = false;
  } else { l.textContent = "選択中: なし"; btn.disabled = true; }
}
// ---- 障害物操作イベント ----
// 障害物追加
document.getElementById("addObstacleBtn").addEventListener("click", () => {
  const gx = parseInt(document.getElementById("cellX").value);
  const gy = parseInt(document.getElementById("cellY").value);
  const ang = parseFloat(document.getElementById("triangleAngle").value);
  const st = document.getElementById("shapeType").value;
  const anchor = document.getElementById("vertexAnchor").value;

  let shape;
  if (st === "small_triangle") shape = createTriangleAtGridPoint(gx, gy, ang, anchor);
  else if (st === "big_triangle") shape = createBigTriangleAtGridPoint(gx, gy, ang, anchor);
  else if (st === "rhombus") shape = createRhombusAtGridPoint(gx, gy, ang, anchor);
  else if (st === "trapezoid") shape = createTrapezoidAtGridPoint(gx, gy, ang, anchor);

  obstacles.push({ type: st, shapes: [shape], anchorPoint: { x: gx * cellSize, y: gy * cellSize } });
  updateObstacleList();
});

// 障害物全削除
document.getElementById("clearObstaclesBtn").addEventListener("click", () => {
  obstacles.length = 0;
  selectedObstacleIndex = null;
  updateObstacleList();
  updateSelectedUI();
});

// 選択障害物を回転
document.getElementById("applyRotationBtn").addEventListener("click", () => {
  if (selectedObstacleIndex !== null) {
    const deg = parseFloat(document.getElementById("rotateAngleInput").value);
    const a = obstacles[selectedObstacleIndex].anchorPoint;
    obstacles[selectedObstacleIndex].shapes = rotateObstacle(obstacles[selectedObstacleIndex].shapes, deg, a.x, a.y);
    updateObstacleList();
  }
});

// 全障害物を中心点を基準に反転コピー
document.getElementById("mirrorObstaclesBtn").addEventListener("click", () => {
  const c = { x: canvas.width / 2, y: canvas.height / 2 };
  const m = obstacles.map(o => ({
    type: o.type,
    shapes: o.shapes.map(s => s.map(p => ({ x: 2 * c.x - p.x, y: 2 * c.y - p.y }))),
    anchorPoint: { x: 2 * c.x - o.anchorPoint.x, y: 2 * c.y - o.anchorPoint.y }
  }));
  obstacles.push(...m);
  updateObstacleList();
});

// キャラ追加・削除
document.getElementById("addEnemyBtn").addEventListener("click", addEnemy);
document.getElementById("addAllyBtn").addEventListener("click", addAlly);
document.getElementById("deleteCharacterBtn").addEventListener("click", () => {
  if (!selectedCharacter) return;
  if (selectedCharacter.type === "enemy") enemies.splice(enemies.indexOf(selectedCharacter), 1);
  else if (selectedCharacter.type === "ally") allies.splice(allies.indexOf(selectedCharacter), 1);
  selectedCharacter = null;
  updateDeleteBtnUI();
});

// ---- 障害物描画 ----
function drawObstacles() {
  obstacles.forEach((o, i) => {
    ctx.fillStyle = "#006affff"; // 水色
    o.shapes.forEach(s => {
      ctx.beginPath();
      ctx.moveTo(s[0].x, s[0].y);
      for (let k = 1; k < s.length; k++) ctx.lineTo(s[k].x, s[k].y);
      ctx.closePath();
      ctx.fill();
      if (i === selectedObstacleIndex) { ctx.strokeStyle = "yellow"; ctx.stroke(); }
    });
  });
}

// ---- 射線描画（障害物で遮断）----
function drawLineOfSightControlled(entity, color) {
  let tx, ty;
  if (entity.type === "player") {
    tx = (selectedCharacter?.type === "player") ? mouseX : playerView.x;
    ty = (selectedCharacter?.type === "player") ? mouseY : playerView.y;
  } else {
    if (selectedCharacter === entity) { tx = mouseX; ty = mouseY; }
    else { tx = entity.mouseX; ty = entity.mouseY; }
  }
  // ✅ 障害物との交点まで射線を制限
  const hitPoint = castRayUntilObstacle(entity.x, entity.y, tx, ty);
  drawLine(entity.x, entity.y, hitPoint.x, hitPoint.y, color);
}

// 線を描画
function drawLine(x, y, tx, ty, col) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(tx, ty);
  ctx.strokeStyle = col;
  ctx.lineWidth = 2;
  ctx.stroke();
}

// ---- FOV描画（障害物で遮断）----
// 射線と線分の交差判定
function getIntersection(ray, seg) {
  const r_px = ray.a.x, r_py = ray.a.y;
  const r_dx = ray.b.x - ray.a.x, r_dy = ray.b.y - ray.a.y;
  const s_px = seg.a.x, s_py = seg.a.y;
  const s_dx = seg.b.x - seg.a.x, s_dy = seg.b.y - seg.a.y;

  const r_mag = Math.sqrt(r_dx * r_dx + r_dy * r_dy);
  const s_mag = Math.sqrt(s_dx * s_dx + s_dy * s_dy);
  if (r_dx / r_mag === s_dx / s_mag && r_dy / r_mag === s_dy / s_mag) return null;

  const T2 = (r_dx * (s_py - r_py) + r_dy * (r_px - s_px)) / (s_dx * r_dy - s_dy * r_dx);
  const T1 = (s_px + s_dx * T2 - r_px) / r_dx;

  if (T1 < 0) return null;
  if (T2 < 0 || T2 > 1) return null;

  return { x: r_px + r_dx * T1, y: r_py + r_dy * T1, dist: T1 * r_mag };
}

// 汎用FOV描画関数
function drawFOVGeneric(x, y, c, tx, ty) {
  const at = Math.atan2(ty - y, tx - x);
  const rc = 100; // レイキャスト本数
  const sa = at - fovAngle / 2;
  const max = Math.sqrt(canvas.width ** 2 + canvas.height ** 2);
  const rays = [];

  // FOVをレイキャストで描画
  for (let i = 0; i <= rc; i++) {
    const a = sa + (i / rc) * fovAngle;
    const dx = Math.cos(a), dy = Math.sin(a);
    const re = { x: x + dx * max, y: y + dy * max };
    const ray = { a: { x, y }, b: re };
    let cl = null;

    // 障害物との最短交点を探す
    for (const ob of obstacles) {
      for (const s of ob.shapes) {
        for (let j = 0; j < s.length; j++) {
          const seg = { a: s[j], b: s[(j + 1) % s.length] };
          const it = getIntersection(ray, seg);
          if (it && (!cl || it.dist < cl.dist)) cl = it;
        }
      }
    }
    rays.push(cl || re);
  }

  ctx.beginPath();
  ctx.moveTo(x, y);
  rays.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.closePath();
  ctx.fillStyle = c;
  ctx.fill();
}

// FOV描画関数（各キャラ用）
function drawPlayerFOV() { drawFOVGeneric(playerX, playerY, "rgba(0,255,0,0.3)", playerView.x, playerView.y); }
function drawEnemyFOV(e) { drawFOVGeneric(e.x, e.y, "rgba(255,0,0,0.3)", e.mouseX, e.mouseY); }
function drawAllyFOV(a) { drawFOVGeneric(a.x, a.y, "rgba(0,255,0,0.3)", a.mouseX, a.mouseY); }

// ---- グリッド描画（番号付き）----
function drawGrid() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i <= cols; i++) {
    ctx.beginPath(); ctx.lineWidth = i % 2 === 0 ? 2 : 0.5;
    ctx.strokeStyle = "#888";
    ctx.moveTo(i * cellSize, 0); ctx.lineTo(i * cellSize, canvas.height); ctx.stroke();
    if (i % 2 === 0 && i < cols) { ctx.fillStyle = "#fff"; ctx.font = "10px Arial"; ctx.fillText(i, i * cellSize + 2, 10); }
  }
  for (let j = 0; j <= rows; j++) {
    ctx.beginPath(); ctx.lineWidth = j % 2 === 0 ? 2 : 0.5;
    ctx.strokeStyle = "#888";
    ctx.moveTo(0, j * cellSize); ctx.lineTo(canvas.width, j * cellSize); ctx.stroke();
    if (j % 2 === 0 && j < rows) { ctx.fillStyle = "#fff"; ctx.font = "10px Arial"; ctx.fillText(j, 2, j * cellSize + 10); }
  }
}

// プレイヤー描画
function drawPlayer() {
  ctx.beginPath();
  ctx.arc(playerX, playerY, 8, 0, Math.PI * 2);
  ctx.fillStyle = "green";//初期プレイヤーの色
  ctx.fill();
  if (selectedCharacter?.type === "player") { ctx.strokeStyle = "yellow"; ctx.stroke(); }
}

// 点がポリゴン内か判定
function isPointInPolygon(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// ✅ 射線管理モードのとき、スマホ画面なら十字ボタン表示
function updateMobileControlsUI() {
  const mc = document.getElementById("mobileControls");
  if (window.innerWidth <= 768000000) {
    mc.style.display = "flex";
  } else {
    mc.style.display = "none";
  }
}


// ---- メインループ ----
// 毎フレーム呼ばれる関数。描画と状態更新を行う
function animate() {
  // --- キャラクター移動処理 ---
  if (selectedCharacter) {
    const r = 8;
    const move = { dx: 0, dy: 0 };
    if (keysPressed.ArrowUp) move.dy -= playerSpeed;
    if (keysPressed.ArrowDown) move.dy += playerSpeed;
    if (keysPressed.ArrowLeft) move.dx -= playerSpeed;
    if (keysPressed.ArrowRight) move.dx += playerSpeed;

    if (selectedCharacter.type === "player") {
      playerX = Math.max(r, Math.min(canvas.width - r, playerX + move.dx));
      playerY = Math.max(r, Math.min(canvas.height - r, playerY + move.dy));
    } else {
      selectedCharacter.x = Math.max(r, Math.min(canvas.width - r, selectedCharacter.x + move.dx));
      selectedCharacter.y = Math.max(r, Math.min(canvas.height - r, selectedCharacter.y + move.dy));
    }
  }

  // --- 障害物移動（編集モード時のみ）---
  if (isEditMode && selectedObstacleIndex !== null) {
    const o = obstacles[selectedObstacleIndex];
    let dx = 0, dy = 0;
    if (keysPressed.ArrowUp) dy -= playerSpeed;
    if (keysPressed.ArrowDown) dy += playerSpeed;
    if (keysPressed.ArrowLeft) dx -= playerSpeed;
    if (keysPressed.ArrowRight) dx += playerSpeed;
    if (dx !== 0 || dy !== 0) {
      // 障害物の全頂点を移動
      o.shapes = o.shapes.map(shape => shape.map(p => ({ x: p.x + dx, y: p.y + dy })));
      o.anchorPoint.x += dx;
      o.anchorPoint.y += dy;
    }
  }


// 二本指操作禁止（ピンチ検出）
document.addEventListener('touchmove', function (e) {
    if (e.touches.length > 1) {
        e.preventDefault();
    }
}, { passive: false });

// ===== ピンチズーム・スクロール防止 =====
document.addEventListener('gesturestart', e => e.preventDefault());

document.addEventListener('touchend', e => {
    const now = new Date().getTime();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
}, false);

document.addEventListener('touchmove', e => {
    if (e.touches.length > 1) e.preventDefault();
}, { passive: false });

// ===== 安全なvw/vh計算（iOS Safariバグ対策）=====
function setViewportUnits() {
    let vw = window.innerWidth * 0.01;
    let vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vw', `${vw}px`);
    document.documentElement.style.setProperty('--vh', `${vh}px`);
}

// 初期化
setViewportUnits();

// 画面回転やリサイズ時も更新
window.addEventListener('resize', setViewportUnits);
window.addEventListener('orientationchange', setViewportUnits);

  // --- 描画処理 ---
  drawGrid(); // グリッド描画

  // 編集モードではFOV・射線は非表示
  if (!isEditMode) {
    // FOVチェックがON → FOVを描画
    if (showFOV) {
      drawPlayerFOV();
      enemies.forEach(drawEnemyFOV);
      allies.forEach(drawAllyFOV);
    }

    // 射線チェックがON → 射線を障害物で遮断しながら描画
    if (showLines) {
      //自分の射線の色
      drawLineOfSightControlled({ x: playerX, y: playerY, type: "player" }, "lime");
      //敵の射線の色
      enemies.forEach(e => drawLineOfSightControlled(e, "red"));
      //味方の射線描画
      allies.forEach(a => drawLineOfSightControlled(a, "lime")); 
    }

    // キャラクターの描画
    drawPlayer();
    drawEnemies();
    drawAllies();
  }

  // 障害物を常に描画
  drawObstacles();

  // 次のフレームを要求
  requestAnimationFrame(animate);
}

// ---- ループ開始 ----
// 最初の呼び出し → 無限に描画更新され続ける
animate();
