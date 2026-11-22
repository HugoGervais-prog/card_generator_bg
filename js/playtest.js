(function () {
  "use strict";

  var core = window.PlaytestCore;
  var DIRS = {
    n: { dx: 0, dy: -1 },
    s: { dx: 0, dy: 1 },
    w: { dx: -1, dy: 0 },
    e: { dx: 1, dy: 0 }
  };
  var ZOOM_MIN = 0.5;
  var ZOOM_MAX = 1.4;
  var ZOOM_STEP = 0.1;

  var state = null;
  var inspect = null;
  var boardMode = "move";
  var zoom = 1;
  var rooms = [];
  var draggingToken = null;
  var suppressClick = false;

  var els = {
    banner: document.getElementById("banner"),
    players: document.getElementById("players"),
    log: document.getElementById("log"),
    inspectDialog: document.getElementById("inspect-dialog"),
    inspectBody: document.getElementById("inspect-body"),
    inspectClose: document.getElementById("inspect-close"),
    inspectTitle: document.getElementById("inspect-title"),
    destroyBtn: document.getElementById("destroy-room-btn"),
    grid: document.getElementById("grid"),
    frame: document.getElementById("board-frame"),
    sizer: document.getElementById("board-sizer"),
    wrap: document.getElementById("board-wrap"),
    status: document.getElementById("status"),
    undo: document.getElementById("undo-btn"),
    home: document.getElementById("home-btn"),
    reset: document.getElementById("reset-btn"),
    zoomIn: document.getElementById("zoom-in"),
    zoomOut: document.getElementById("zoom-out"),
    zoomLabel: document.getElementById("zoom-label"),
    modeMove: document.getElementById("mode-move"),
    modeInspect: document.getElementById("mode-inspect"),
    occupants: document.getElementById("occupants"),
    newGameDialog: document.getElementById("new-game-dialog"),
    newGameForm: document.getElementById("new-game-form"),
    newGameCancel: document.getElementById("new-game-cancel"),
    newGameStart: document.getElementById("new-game-start")
  };

  function showBanner(message, ok) {
    if (!els.banner) return;
    els.banner.textContent = message || "";
    els.banner.classList.toggle("visible", !!message);
    els.banner.classList.toggle("ok", !!ok);
  }

  function roomImage(room) {
    return core.roomImagePath(room && room.image);
  }

  function padId(id) {
    return String(id).padStart(3, "0");
  }

  function selectedToken() {
    return state && state.tokens[state.selected];
  }

  function save() {
    if (!state) return;
    try {
      var payload = core.serialize(state);
      payload.zoom = zoom;
      payload.inspect = inspect;
      payload.boardMode = boardMode;
      localStorage.setItem(core.STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      showBanner("The board could not be saved in this browser: " + err.message);
    }
  }

  function loadSaved() {
    try {
      var raw = localStorage.getItem(core.STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      return { _corrupt: true, error: err.message };
    }
  }

  function setStatus(text) {
    if (!els.status) return;
    els.status.textContent = text;
    var routine = core.isRoutineStatus(text);
    els.status.hidden = routine;
  }

  function setZoom(next) {
    zoom = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next)) * 10) / 10;
    if (els.frame) els.frame.style.transform = "scale(" + zoom + ")";
    if (els.zoomLabel) els.zoomLabel.textContent = Math.round(zoom * 100) + "%";
    if (!els.frame) return;
    var width = els.frame.offsetWidth;
    var height = els.frame.offsetHeight;
    if (els.sizer) {
      els.sizer.style.width = Math.ceil(width * zoom) + "px";
      els.sizer.style.height = Math.ceil(height * zoom) + "px";
    }
  }

  function isEdge(x, y) {
    return x === 0 || y === 0 || x === state.gridSize - 1 || y === state.gridSize - 1;
  }

  function renderPlayers() {
    if (!els.players) return;
    els.players.innerHTML = "";
    state.tokens.forEach(function (token, i) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "token-btn" + (i === state.selected ? " active" : "");
      btn.style.setProperty("--token-color", token.color);
      btn.setAttribute("aria-label", token.name);
      btn.setAttribute("aria-pressed", i === state.selected ? "true" : "false");
      btn.title = token.name;
      btn.textContent = "P" + token.id;
      btn.addEventListener("click", function () {
        state.selected = i;
        if (boardMode !== "inspect") inspect = { x: token.x, y: token.y };
        render();
        save();
      });
      els.players.appendChild(btn);
    });
  }

  function renderRoomBlock(title, room, emptyText) {
    var wrap = document.createElement("div");
    var head = document.createElement("p");
    head.className = "subhead";
    head.textContent = title;
    wrap.appendChild(head);
    if (!room) {
      var p = document.createElement("p");
      p.className = "help";
      p.textContent = emptyText || "Nothing here yet.";
      wrap.appendChild(p);
      return wrap;
    }
    var card = document.createElement("div");
    card.className = "room-card";
    var img = document.createElement("img");
    img.className = "room-art";
    img.alt = room.name;
    var src = roomImage(room);
    if (src) img.src = src;
    else img.alt = "";
    img.addEventListener("error", function () {
      var fallback = document.createElement("div");
      fallback.className = "room-art-fallback";
      fallback.textContent = "No art";
      if (img.parentNode) img.parentNode.replaceChild(fallback, img);
    });
    var body = document.createElement("div");
    body.innerHTML =
      '<p class="name">' + core.escapeHtml(room.name) + "</p>" +
      '<span class="room-id">' + padId(room.id) + "</span>" +
      '<p class="effect">' + core.formatEffect(room.effect) + "</p>";
    card.appendChild(img);
    card.appendChild(body);
    wrap.appendChild(card);
    return wrap;
  }

  function closeInspectDialog() {
    var dialog = els.inspectDialog;
    if (!dialog) return;
    if (typeof dialog.close === "function" && dialog.open) dialog.close();
    dialog.classList.remove("open");
  }

  function updateDestroyButton() {
    if (!els.destroyBtn) return;
    var allowed = !!(state && inspect && core.canDestroyRoom(state, inspect.x, inspect.y).ok);
    els.destroyBtn.hidden = !allowed;
    els.destroyBtn.disabled = !allowed;
  }

  function openInspectDialog(room, x, y) {
    if (!els.inspectDialog || !els.inspectBody) return;
    if (!room) {
      closeInspectDialog();
      return;
    }
    if (x != null && y != null) inspect = { x: x, y: y };
    if (els.inspectTitle) els.inspectTitle.textContent = room.name || "Inspected room";
    els.inspectBody.innerHTML = "";
    els.inspectBody.appendChild(renderRoomBlock("", room, "No details for this room."));
    updateDestroyButton();
    var dialog = els.inspectDialog;
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.classList.add("open");
    }
  }

  function confirmDestroyRoom() {
    if (!state || !inspect) return;
    var check = core.canDestroyRoom(state, inspect.x, inspect.y);
    if (!check.ok) return;
    var room = core.cellRoom(state, inspect.x, inspect.y);
    var name = room ? room.name : "this room";
    var ok = window.confirm("Destroy " + name + "? Everyone in that room returns to the Starting Hall, and this room stays out of the deck for this game.");
    if (!ok) return;
    var result = core.destroyRoom(state, inspect.x, inspect.y);
    if (!result.ok) {
      setStatus(reasonMessage(result.reason) === "That move isn’t possible." ? "That room cannot be destroyed." : reasonMessage(result.reason));
      if (els.status) els.status.dataset.lock = "1";
      return;
    }
    inspect = { x: state.center.x, y: state.center.y };
    closeInspectDialog();
    setStatus(result.entry.text);
    if (els.status) els.status.dataset.lock = "1";
    render();
    save();
  }

  function renderDetails() {
    // Room details live in the inspect dialog, not a persistent sidebar box.
  }

  function renderOccupants() {
    if (!els.occupants) return;
    if (!state) {
      els.occupants.innerHTML = "";
      return;
    }
    els.occupants.innerHTML = core.formatPlayerRoomsHtml(core.playerRooms(state));
  }

  function renderLog() {
    if (!els.log) return;
    els.log.innerHTML = "";
    if (!state || !state.log.length) {
      var empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = "Moves and discoveries will appear here.";
      els.log.appendChild(empty);
      return;
    }
    state.log.forEach(function (entry) {
      var li = document.createElement("li");
      var token = state.tokens[entry.tokenIndex];
      if (token) li.style.setProperty("--token-color", token.color);
      li.textContent = entry.text;
      els.log.appendChild(li);
    });
  }

  function renderGrid() {
    els.grid.innerHTML = "";
    if (!state) return;
    var selected = selectedToken();
    for (var y = 0; y < state.gridSize; y++) {
      for (var x = 0; x < state.gridSize; x++) {
        (function (x, y) {
          var room = core.cellRoom(state, x, y);
          var here = core.tokensAt(state, x, y);
          var btn = document.createElement("div");
          btn.className = "cell";
          btn.setAttribute("role", "gridcell");
          btn.tabIndex = 0;
          btn.setAttribute("data-x", String(x));
          btn.setAttribute("data-y", String(y));
          if (isEdge(x, y)) btn.classList.add("edge");
          if (inspect && inspect.x === x && inspect.y === y) btn.classList.add("inspected");
          if (selected && selected.x === x && selected.y === y) {
            btn.classList.add("occupied-selected");
            btn.style.setProperty("--token-color", selected.color);
          }
          if (room) {
            btn.title = padId(room.id) + " " + room.name;
            var img = document.createElement("img");
            img.className = "cell-art";
            img.alt = "";
            var cellSrc = roomImage(room);
            if (cellSrc) img.src = cellSrc;
            img.addEventListener("error", function () { img.remove(); });
            var name = document.createElement("span");
            name.className = "cell-name";
            name.textContent = room.name;
            btn.appendChild(img);
            btn.appendChild(createInspectButton(room, x, y));
            btn.appendChild(name);
          } else {
            btn.classList.add("hidden");
            btn.title = "Hidden room";
            var mystery = document.createElement("span");
            mystery.className = "mystery";
            mystery.textContent = "?";
            btn.appendChild(mystery);
          }
          if (here.length) {
            var stack = document.createElement("div");
            stack.className = "token-stack";
            here.forEach(function (index) {
              var token = state.tokens[index];
              var pawn = document.createElement("span");
              pawn.className = "pawn" + (index === state.selected ? " selected" : "");
              pawn.style.setProperty("--token-color", token.color);
              pawn.textContent = token.id;
              pawn.title = token.name;
              pawn.draggable = boardMode === "move";
              pawn.addEventListener("click", function (ev) {
                ev.stopPropagation();
                if (suppressClick) {
                  suppressClick = false;
                  return;
                }
                if (boardMode === "inspect") {
                  inspect = { x: x, y: y };
                } else {
                  state.selected = index;
                  inspect = { x: token.x, y: token.y };
                }
                render();
                save();
              });
              pawn.addEventListener("contextmenu", function (ev) {
                ev.stopPropagation();
                onCellContextMenu(ev, x, y);
              });
              pawn.addEventListener("dragstart", function (ev) {
                if (boardMode !== "move") {
                  ev.preventDefault();
                  return;
                }
                ev.stopPropagation();
                draggingToken = index;
                state.selected = index;
                ev.dataTransfer.setData("text/plain", String(index));
                ev.dataTransfer.effectAllowed = "move";
                pawn.classList.add("dragging");
                highlightDropTargets(index);
              });
              pawn.addEventListener("dragend", function () {
                pawn.classList.remove("dragging");
                clearDropTargets();
                draggingToken = null;
                suppressClick = true;
                setTimeout(function () { suppressClick = false; }, 0);
              });
              stack.appendChild(pawn);
            });
            btn.appendChild(stack);
          }
          btn.addEventListener("click", function () { onCellClick(x, y); });
          btn.addEventListener("contextmenu", function (ev) { onCellContextMenu(ev, x, y); });
          btn.addEventListener("keydown", function (ev) {
            if (ev.key !== "Enter" && ev.key !== " ") return;
            ev.preventDefault();
            onCellClick(x, y);
          });
          btn.addEventListener("dragover", function (ev) {
            if (boardMode !== "move" || draggingToken == null) return;
            var can = core.canDropToken(state, draggingToken, x, y);
            if (!can.ok) return;
            ev.preventDefault();
            ev.dataTransfer.dropEffect = "move";
          });
          btn.addEventListener("drop", function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            if (boardMode !== "move") return;
            var raw = ev.dataTransfer.getData("text/plain");
            var tokenIndex = raw === "" ? draggingToken : Number(raw);
            var decision = core.resolveDragDrop(boardMode, state, tokenIndex, x, y);
            suppressClick = true;
            clearDropTargets();
            if (decision.type !== "move") return;
            tryMoveTo(decision.tokenIndex, decision.x, decision.y);
          });
          els.grid.appendChild(btn);
        })(x, y);
      }
    }
  }

  function highlightDropTargets(tokenIndex) {
    if (!els.grid || !state) return;
    Array.prototype.forEach.call(els.grid.querySelectorAll(".cell"), function (cell) {
      var cx = Number(cell.getAttribute("data-x"));
      var cy = Number(cell.getAttribute("data-y"));
      cell.classList.toggle("drop-ok", core.canDropToken(state, tokenIndex, cx, cy).ok);
    });
  }

  function clearDropTargets() {
    if (!els.grid) return;
    Array.prototype.forEach.call(els.grid.querySelectorAll(".drop-ok"), function (cell) {
      cell.classList.remove("drop-ok");
    });
  }

  function updateButtons() {
    if (els.undo) els.undo.disabled = !state || !state.history.length;
    var token = selectedToken();
    var atStart = !!(token && state && token.x === state.center.x && token.y === state.center.y);
    if (els.home) els.home.disabled = !token || atStart;
    if (els.modeMove && els.modeInspect) {
      els.modeMove.classList.toggle("active", boardMode === "move");
      els.modeInspect.classList.toggle("active", boardMode === "inspect");
      els.modeMove.setAttribute("aria-pressed", boardMode === "move" ? "true" : "false");
      els.modeInspect.setAttribute("aria-pressed", boardMode === "inspect" ? "true" : "false");
    }
    document.body.classList.toggle("mode-inspect", boardMode === "inspect");
    document.body.classList.toggle("mode-move", boardMode === "move");
  }

  function deckStatus() {
    var hidden = state.gridSize * state.gridSize - core.discoveredCount(state);
    return core.discoveredCount(state) + " rooms revealed · " + hidden + " hidden cells · " +
      core.remainingCount(state) + " rooms still in the deck";
  }

  function render() {
    if (!state) return;
    renderPlayers();
    renderOccupants();
    renderLog();
    renderGrid();
    updateButtons();
    setZoom(zoom);
    if (!els.status.dataset.lock) setStatus(deckStatus());
  }

  function reasonMessage(reason) {
    if (reason === "edge") return "That way is the edge of the map.";
    if (reason === "deck-empty") return "No unused rooms remain to discover there.";
    if (reason === "not-orthogonal" || reason === "no-move") return "Tokens move one step north, south, east, or west.";
    if (reason === "nothing-to-undo") return "Nothing to undo.";
    return "That move isn’t possible.";
  }

  function tryMoveTo(tokenIndex, x, y) {
    if (!state) return;
    if (!core.movementAllowed(boardMode)) {
      setStatus("Inspect mode: tokens stay put. Switch to Move to walk.");
      els.status.dataset.lock = "1";
      return;
    }
    var result = core.moveTo(state, tokenIndex, x, y);
    if (!result.ok) {
      setStatus(result.reason === "same-cell" ? "Already in that room." : reasonMessage(result.reason));
      els.status.dataset.lock = "1";
      updateButtons();
      return;
    }
    state.selected = tokenIndex;
    var token = state.tokens[tokenIndex];
    inspect = { x: token.x, y: token.y };
    setStatus(result.entry.text);
    els.status.dataset.lock = "1";
    render();
    save();
  }

  function tryMove(dx, dy, tokenIndex) {
    if (!state) return;
    if (!core.movementAllowed(boardMode)) {
      setStatus("Inspect mode: tokens stay put. Switch to Move to walk.");
      els.status.dataset.lock = "1";
      return;
    }
    if (tokenIndex == null) tokenIndex = state.selected;
    els.status.dataset.lock = "";
    var result = core.move(state, tokenIndex, dx, dy);
    if (!result.ok) {
      setStatus(reasonMessage(result.reason));
      els.status.dataset.lock = "1";
      updateButtons();
      return;
    }
    state.selected = tokenIndex;
    var token = state.tokens[tokenIndex];
    inspect = { x: token.x, y: token.y };
    setStatus(result.entry.text);
    els.status.dataset.lock = "1";
    render();
    save();
  }

  function inspectRevealedCell(x, y) {
    if (!state) return;
    var decision = core.resolveContextInspect(state, x, y);
    if (decision.type !== "inspect") return;
    var room = core.cellRoom(state, decision.x, decision.y);
    if (!room) return;
    var selected = state.selected;
    var mode = boardMode;
    openInspectDialog(room, decision.x, decision.y);
    state.selected = selected;
    boardMode = mode;
    render();
    save();
  }

  function onCellContextMenu(ev, x, y) {
    if (ev && ev.preventDefault) ev.preventDefault();
    if (ev && ev.stopPropagation) ev.stopPropagation();
    inspectRevealedCell(x, y);
  }

  function createInspectButton(room, x, y) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "cell-inspect";
    var label = core.inspectControlLabel(room && room.name);
    button.setAttribute("title", label);
    button.setAttribute("aria-label", label);
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M15 15l6 6"/></svg>';
    function isolate(ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
    }
    ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart"].forEach(function (type) {
      button.addEventListener(type, isolate);
    });
    button.addEventListener("dragstart", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    });
    button.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      inspectRevealedCell(x, y);
    });
    button.addEventListener("contextmenu", function (ev) {
      ev.stopPropagation();
      onCellContextMenu(ev, x, y);
    });
    return button;
  }

  function onCellClick(x, y) {
    if (!state) return;
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    var decision = core.resolveBoardClick(boardMode, state, state.selected, x, y);
    if (decision.type === "move") {
      tryMove(decision.dx, decision.dy);
      return;
    }
    if (decision.type === "inspect") {
      inspect = { x: decision.x, y: decision.y };
      if (boardMode === "inspect") {
        var room = core.cellRoom(state, decision.x, decision.y);
        if (room) {
          openInspectDialog(room, decision.x, decision.y);
          setStatus("Inspecting " + room.name + ".");
        } else {
          closeInspectDialog();
          setStatus("That cell is still hidden.");
        }
        if (els.status) els.status.dataset.lock = "1";
      }
    }
    render();
    save();
  }

  function returnToStart() {
    if (!state) return;
    var token = selectedToken();
    if (!token) return;
    if (token.x === state.center.x && token.y === state.center.y) return;
    var from = { x: token.x, y: token.y, roomId: core.cellRoomId(state, token.x, token.y) };
    var to = { x: state.center.x, y: state.center.y, roomId: state.startRoomId };
    var left = core.roomById(state, from.roomId);
    var entered = core.roomById(state, to.roomId);
    token.x = to.x;
    token.y = to.y;
    var entry = {
      text: token.name + " returned to " + (entered ? entered.name : "the Starting Hall") +
        " from " + (left ? left.name : "an unmarked space") + ". Resolve that leave, then the enter.",
      tokenIndex: state.selected,
      from: from,
      to: to,
      discovered: false
    };
    state.log.push(entry);
    state.history.push({
      tokenIndex: state.selected,
      from: from,
      to: to,
      discovered: false,
      discoveredId: null
    });
    inspect = { x: token.x, y: token.y };
    setStatus(entry.text);
    els.status.dataset.lock = "1";
    render();
    save();
  }

  function undoMove() {
    if (!state) return;
    var result = core.undo(state);
    if (!result.ok) {
      setStatus(reasonMessage(result.reason));
      els.status.dataset.lock = "1";
      return;
    }
    var token = state.tokens[result.step.tokenIndex];
    state.selected = result.step.tokenIndex;
    inspect = token ? { x: token.x, y: token.y } : inspect;
    setStatus("Undid the last move.");
    els.status.dataset.lock = "1";
    render();
    save();
  }

  function currentPlayerCount() {
    return core.normalizePlayerCount(state && state.playerCount, state && state.tokens);
  }

  function selectedDialogPlayerCount() {
    var chosen = 0;
    if (els.newGameForm) {
      var input = els.newGameForm.querySelector('input[name="player-count"]:checked');
      if (input) chosen = Number(input.value);
    }
    return core.normalizePlayerCount(chosen || currentPlayerCount());
  }

  function setDialogPlayerCount(count) {
    count = core.normalizePlayerCount(count);
    if (!els.newGameForm) return;
    var inputs = els.newGameForm.querySelectorAll('input[name="player-count"]');
    Array.prototype.forEach.call(inputs, function (input) {
      input.checked = Number(input.value) === count;
    });
  }

  function isNewGameDialogOpen() {
    return !!(els.newGameDialog && els.newGameDialog.open);
  }

  function closeNewGameDialog() {
    var dialog = els.newGameDialog;
    if (!dialog) return;
    if (typeof dialog.close === "function" && dialog.open) dialog.close();
    else dialog.classList.remove("open");
  }

  function openNewGameDialog() {
    if (!rooms.length) return;
    closeInspectDialog();
    setDialogPlayerCount(currentPlayerCount());
    var dialog = els.newGameDialog;
    if (!dialog) return;
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.classList.add("open");
    }
    var checked = dialog.querySelector('input[name="player-count"]:checked');
    if (checked && checked.focus) checked.focus();
  }

  function cancelNewGameDialog() {
    var wasOpen = isNewGameDialogOpen() || !!(els.newGameDialog && els.newGameDialog.classList.contains("open"));
    closeNewGameDialog();
    if (!state && rooms.length && wasOpen) beginNewGame(core.DEFAULT_PLAYERS);
  }

  function beginNewGame(playerCount) {
    if (!rooms.length) return;
    closeNewGameDialog();
    closeInspectDialog();
    state = core.createGame(rooms, { playerCount: playerCount });
    boardMode = "move";
    inspect = { x: state.center.x, y: state.center.y };
    if (els.status) els.status.dataset.lock = "";
    setStatus("New delve. All " + state.tokens.length + " tokens are in the Starting Hall.");
    if (els.status) els.status.dataset.lock = "1";
    render();
    save();
  }

  function newGame() {
    openNewGameDialog();
  }

  function submitNewGame(ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    beginNewGame(selectedDialogPlayerCount());
  }

  function onKey(ev) {
    if (!state) return;
    var tag = (ev.target && ev.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || ev.target.isContentEditable) return;
    if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
    var key = ev.key;
    if (isNewGameDialogOpen()) return;
    var index = core.playerHotkeyIndex(key, state.tokens.length);
    if (index >= 0) {
      state.selected = index;
      if (boardMode !== "inspect") inspect = { x: state.tokens[index].x, y: state.tokens[index].y };
      render();
      save();
      ev.preventDefault();
      return;
    }
    var map = {
      ArrowUp: "n", w: "n", W: "n",
      ArrowDown: "s", s: "s", S: "s",
      ArrowLeft: "w", a: "w", A: "w",
      ArrowRight: "e", d: "e", D: "e"
    };
    var dir = map[key];
    if (!dir) return;
    ev.preventDefault();
    if (!core.movementAllowed(boardMode)) {
      setStatus("Inspect mode: tokens stay put. Switch to Move to walk.");
      els.status.dataset.lock = "1";
      return;
    }
    tryMove(DIRS[dir].dx, DIRS[dir].dy);
  }

  function setBoardMode(mode) {
    boardMode = mode === "inspect" ? "inspect" : "move";
    if (boardMode === "inspect") {
      setStatus("Inspect mode: click a revealed room to read it. Tokens will not move.");
    } else {
      closeInspectDialog();
      setStatus("Move mode: click an adjacent cell, or use the arrows or WASD.");
    }
    els.status.dataset.lock = "1";
    render();
    save();
  }

  document.addEventListener("error", function (ev) {
    var el = ev.target;
    if (!el || !el.classList) return;
    if (el.classList.contains("occupant-art") || el.classList.contains("room-art")) {
      el.style.display = "none";
      return;
    }
    if (!el.classList.contains("mana-symbol")) return;
    var mark = document.createElement("span");
    mark.className = "mana";
    mark.textContent = el.getAttribute("alt") || "";
    if (el.parentNode) el.parentNode.replaceChild(mark, el);
  }, true);

  function bind() {
    if (els.modeMove) els.modeMove.addEventListener("click", function () { setBoardMode("move"); });
    if (els.modeInspect) els.modeInspect.addEventListener("click", function () { setBoardMode("inspect"); });
    if (els.undo) els.undo.addEventListener("click", undoMove);
    if (els.home) els.home.addEventListener("click", returnToStart);
    if (els.reset) els.reset.addEventListener("click", newGame);
    if (els.newGameForm) els.newGameForm.addEventListener("submit", submitNewGame);
    if (els.newGameCancel) els.newGameCancel.addEventListener("click", function () { cancelNewGameDialog(); });
    if (els.newGameDialog) {
      els.newGameDialog.addEventListener("cancel", function (ev) {
        ev.preventDefault();
        cancelNewGameDialog();
      });
      els.newGameDialog.addEventListener("click", function (ev) {
        if (ev.target === els.newGameDialog) cancelNewGameDialog();
      });
    }
    if (els.zoomIn) els.zoomIn.addEventListener("click", function () { setZoom(zoom + ZOOM_STEP); save(); });
    if (els.zoomOut) els.zoomOut.addEventListener("click", function () { setZoom(zoom - ZOOM_STEP); save(); });
    if (els.inspectClose) els.inspectClose.addEventListener("click", closeInspectDialog);
    if (els.destroyBtn) els.destroyBtn.addEventListener("click", confirmDestroyRoom);
    if (els.inspectDialog) {
      els.inspectDialog.addEventListener("click", function (ev) {
        if (ev.target === els.inspectDialog) closeInspectDialog();
      });
    }
    document.addEventListener("keydown", onKey);
    if (els.wrap) els.wrap.addEventListener("wheel", function (ev) {
      if (!ev.ctrlKey && !ev.metaKey) return;
      ev.preventDefault();
      setZoom(zoom + (ev.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
      save();
    }, { passive: false });
  }

  function start(loadedRooms, saved) {
    rooms = loadedRooms;
    if (saved && saved._corrupt) {
      showBanner("A saved board was found but could not be read, so a new game was started.");
    }
    if (saved && !saved._corrupt) {
      if (saved.gridSize && saved.gridSize !== core.GRID_SIZE) {
        try {
          var bakKey = core.STORAGE_KEY + "-backup-" + saved.gridSize + "x" + saved.gridSize;
          if (!localStorage.getItem(bakKey)) localStorage.setItem(bakKey, JSON.stringify(saved));
        } catch (err) {}
      }
      state = core.deserialize(saved, rooms);
      if (typeof saved.zoom === "number") zoom = saved.zoom;
      if (saved.boardMode === "inspect" || saved.boardMode === "move") boardMode = saved.boardMode;
      if (!state.migratedFrom && saved.inspect && core.inBounds(saved.inspect.x, saved.inspect.y, state.gridSize)) {
        inspect = { x: saved.inspect.x, y: saved.inspect.y };
      }
      if (!inspect) inspect = { x: state.center.x, y: state.center.y };
      setZoom(zoom);
      if (state && state.migratedFrom) {
        setStatus("Your map was resized from " + state.migratedFrom + "×" + state.migratedFrom +
          " to " + state.gridSize + "×" + state.gridSize +
          ". Rooms that no longer fit were set aside and will not reappear. Tokens outside the new map returned to the Starting Hall. Undo was cleared.");
        els.status && (els.status.dataset.lock = "1");
      } else {
        setStatus(deckStatus());
      }
      render();
      save();
      return;
    }
    openNewGameDialog();
  }

  bind();
  setZoom(1);

  fetch("data/rooms.csv", { cache: "no-store" })
    .then(function (res) {
      if (!res.ok) throw new Error("Could not load data/rooms.csv (" + res.status + ").");
      return res.text();
    })
    .then(function (text) {
      var parsed = core.parseRooms(text);
      if (parsed.error) throw new Error(parsed.error);
      start(parsed.rooms, loadSaved());
    })
    .catch(function (err) {
      showBanner("Rooms could not be loaded. Serve this folder over the local site and keep data/rooms.csv in place. " + (err && err.message ? err.message : err));
      setStatus("Waiting for rooms.csv…");
    });
})();
