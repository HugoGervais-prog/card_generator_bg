(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.PlaytestCore = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var GRID_SIZE = 9;
  var CENTER = 4;
  var STORAGE_KEY = "mtg-room-playtest-v1";
  var MIN_PLAYERS = 2;
  var MAX_PLAYERS = 6;
  var DEFAULT_PLAYERS = 4;
  var TOKENS = [
    { id: 1, name: "Player 1", color: "#c23b3b", accent: "#ffd4d4" },
    { id: 2, name: "Player 2", color: "#2c6fdb", accent: "#d4e4ff" },
    { id: 3, name: "Player 3", color: "#d4a017", accent: "#fff1c4" },
    { id: 4, name: "Player 4", color: "#6c3bc2", accent: "#e8d6ff" },
    { id: 5, name: "Player 5", color: "#1a9a6c", accent: "#c9f5e4" },
    { id: 6, name: "Player 6", color: "#e25d1a", accent: "#ffd4c2" }
  ];

  function normalizePlayerCount(value, tokenList) {
    var n = Number(value);
    if (isFinite(n) && n !== 0) {
      n = Math.round(n);
      if (n >= MIN_PLAYERS && n <= MAX_PLAYERS) return n;
      if (n < MIN_PLAYERS) return MIN_PLAYERS;
      if (n > MAX_PLAYERS) return MAX_PLAYERS;
    }
    var len = tokenList && tokenList.length;
    if (len >= MIN_PLAYERS && len <= MAX_PLAYERS) return len;
    return DEFAULT_PLAYERS;
  }

  function makeTokens(count, x, y) {
    count = normalizePlayerCount(count);
    return TOKENS.slice(0, count).map(function (t) {
      return { id: t.id, name: t.name, color: t.color, accent: t.accent, x: x, y: y };
    });
  }

  function playerHotkeyIndex(key, tokenCount) {
    if (key == null) return -1;
    var text = String(key);
    if (text.length !== 1 || text < "1" || text > "6") return -1;
    var index = Number(text) - 1;
    var count = Number(tokenCount);
    if (index >= 0 && index < count && tokenCount != null) return index;
    return -1;
  }

  function trimBom(text) {
    text = String(text == null ? "" : text);
    if (text.charCodeAt(0) === 0xFEFF) return text.slice(1);
    return text;
  }

  function parseCsv(text) {
    text = trimBom(text);
    var rows = [];
    var row = [];
    var field = "";
    var i = 0;
    var inQuotes = false;
    while (i < text.length) {
      var c = text.charAt(i);
      if (inQuotes) {
        if (c === '"') {
          if (text.charAt(i + 1) === '"') {
            field += '"';
            i += 2;
            continue;
          }
          inQuotes = false;
          i += 1;
          continue;
        }
        field += c;
        i += 1;
        continue;
      }
      if (c === '"') {
        inQuotes = true;
        i += 1;
        continue;
      }
      if (c === ",") {
        row.push(field);
        field = "";
        i += 1;
        continue;
      }
      if (c === "\r") {
        i += 1;
        continue;
      }
      if (c === "\n") {
        row.push(field);
        field = "";
        rows.push(row);
        row = [];
        i += 1;
        continue;
      }
      field += c;
      i += 1;
    }
    if (inQuotes) {
      throw new Error("Unclosed quoted field in CSV.");
    }
    if (field.length || row.length) {
      row.push(field);
      rows.push(row);
    }
    if (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === "") {
      rows.pop();
    }
    return rows;
  }

  function headerIndex(header, name) {
    var want = String(name).trim().toLowerCase();
    for (var i = 0; i < header.length; i++) {
      if (String(header[i] || "").replace(/^\uFEFF/, "").trim().toLowerCase() === want) return i;
    }
    return -1;
  }

  function parseRooms(text) {
    var rows;
    try {
      rows = parseCsv(text);
    } catch (err) {
      return { rooms: [], error: err.message || String(err) };
    }
    if (!rows.length) return { rooms: [], error: "The rooms file is empty." };
    var header = rows[0];
    var iId = headerIndex(header, "ID");
    var iName = headerIndex(header, "Name");
    var iImage = headerIndex(header, "Image");
    var iEffect = headerIndex(header, "Effect");
    if (iId < 0 || iName < 0 || iImage < 0 || iEffect < 0) {
      return { rooms: [], error: "rooms.csv must have ID, Name, Image, and Effect columns." };
    }
    var rooms = [];
    var seenIds = Object.create(null);
    for (var r = 1; r < rows.length; r++) {
      var row = rows[r];
      var name = String(row[iName] == null ? "" : row[iName]).trim();
      if (!name) continue;
      var id = String(row[iId] == null ? "" : row[iId]).trim();
      if (!id) {
        return { rooms: [], error: "Row " + (r + 1) + " is missing an ID." };
      }
      if (seenIds[id]) {
        return { rooms: [], error: "Duplicate room ID " + id + "." };
      }
      seenIds[id] = true;
      rooms.push({
        id: id,
        name: name,
        image: String(row[iImage] == null ? "" : row[iImage]).trim(),
        effect: String(row[iEffect] == null ? "" : row[iEffect]).trim()
      });
    }
    if (!rooms.length) return { rooms: [], error: "No rooms were found in rooms.csv." };
    return { rooms: rooms, error: null };
  }

  function shuffle(list, rng) {
    var arr = list.slice();
    var random = rng || Math.random;
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(random() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function findStartRoom(rooms) {
    var i;
    for (i = 0; i < rooms.length; i++) {
      if (rooms[i].id === "1" && /starting hall/i.test(rooms[i].name)) return rooms[i];
    }
    for (i = 0; i < rooms.length; i++) {
      if (/starting hall/i.test(rooms[i].name)) return rooms[i];
    }
    for (i = 0; i < rooms.length; i++) {
      if (rooms[i].id === "1") return rooms[i];
    }
    return rooms[0];
  }

  function cellKey(x, y) {
    return x + "," + y;
  }

  function inBounds(x, y, size) {
    size = size == null ? GRID_SIZE : size;
    return x >= 0 && y >= 0 && x < size && y < size;
  }

  function roomMap(rooms) {
    var map = Object.create(null);
    for (var i = 0; i < rooms.length; i++) map[rooms[i].id] = rooms[i];
    return map;
  }

  function roomById(state, id) {
    if (id == null || id === "") return null;
    return state.roomIndex[id] || null;
  }

  function cellRoomId(state, x, y) {
    return state.cells[cellKey(x, y)] || null;
  }

  function cellRoom(state, x, y) {
    return roomById(state, cellRoomId(state, x, y));
  }

  function tokensAt(state, x, y) {
    var found = [];
    for (var i = 0; i < state.tokens.length; i++) {
      if (state.tokens[i].x === x && state.tokens[i].y === y) found.push(i);
    }
    return found;
  }

  function cloneTokens(tokens) {
    return tokens.map(function (t) {
      return { id: t.id, name: t.name, color: t.color, accent: t.accent, x: t.x, y: t.y };
    });
  }

  function unusedIds(rooms, startId, cells, discarded) {
    var used = Object.create(null);
    used[startId] = true;
    Object.keys(cells).forEach(function (k) {
      used[cells[k]] = true;
    });
    (discarded || []).forEach(function (id) { used[id] = true; });
    var ids = [];
    for (var i = 0; i < rooms.length; i++) {
      if (!used[rooms[i].id]) ids.push(rooms[i].id);
    }
    return ids;
  }

  function createGame(rooms, options) {
    options = options || {};
    if (!rooms || !rooms.length) {
      throw new Error("Cannot start a game without rooms.");
    }
    var start = options.startRoom || findStartRoom(rooms);
    var size = options.gridSize || GRID_SIZE;
    var cx = options.center != null ? options.center : Math.floor(size / 2);
    var count = normalizePlayerCount(options.playerCount);
    var cells = {};
    cells[cellKey(cx, cy(cx, size))] = start.id;
    var tokens = makeTokens(count, cx, cy(cx, size));
    var deck = shuffle(unusedIds(rooms, start.id, cells), options.rng);
    return {
      gridSize: size,
      center: { x: cx, y: cy(cx, size) },
      startRoomId: start.id,
      rooms: rooms,
      roomIndex: roomMap(rooms),
      cells: cells,
      deck: deck,
      discarded: [],
      tokens: tokens,
      playerCount: tokens.length,
      selected: 0,
      log: [],
      history: []
    };
  }

  function cy(cx, size) {
    return cx;
  }

  function canMove(state, tokenIndex, dx, dy) {
    if (!state || !state.tokens[tokenIndex]) return { ok: false, reason: "no-token" };
    if (!dx && !dy) return { ok: false, reason: "no-move" };
    if (Math.abs(dx) + Math.abs(dy) !== 1) return { ok: false, reason: "not-orthogonal" };
    var token = state.tokens[tokenIndex];
    var nx = token.x + dx;
    var ny = token.y + dy;
    if (!inBounds(nx, ny, state.gridSize)) return { ok: false, reason: "edge" };
    var destId = cellRoomId(state, nx, ny);
    if (!destId && !state.deck.length) return { ok: false, reason: "deck-empty" };
    return { ok: true, x: nx, y: ny, destId: destId };
  }

  function describeMove(token, left, entered, discovered) {
    var name = token.name;
    var leftName = left ? left.name : "an unmarked space";
    var enteredName = entered ? entered.name : "an unmarked space";
    if (discovered) {
      return name + " left " + leftName + " and discovered " + enteredName + ". Resolve that leave, then the enter.";
    }
    if (left && entered && left.id === entered.id) {
      return name + " stayed in " + enteredName + ".";
    }
    return name + " left " + leftName + " and entered " + enteredName + ". Resolve that leave, then the enter.";
  }

  function applyMoveTo(state, tokenIndex, x, y, destId) {
    var token = state.tokens[tokenIndex];
    var from = { x: token.x, y: token.y, roomId: cellRoomId(state, token.x, token.y) };
    var discovered = false;
    var discoveredId = null;
    if (!destId) {
      discoveredId = state.deck.shift();
      if (!discoveredId) return { ok: false, reason: "deck-empty" };
      destId = discoveredId;
      state.cells[cellKey(x, y)] = destId;
      discovered = true;
    }
    token.x = x;
    token.y = y;
    var left = roomById(state, from.roomId);
    var entered = roomById(state, destId);
    var entry = {
      text: describeMove(token, left, entered, discovered),
      tokenIndex: tokenIndex,
      from: from,
      to: { x: x, y: y, roomId: destId },
      discovered: discovered
    };
    state.log.push(entry);
    state.history.push({
      tokenIndex: tokenIndex,
      from: from,
      to: entry.to,
      discovered: discovered,
      discoveredId: discoveredId
    });
    return { ok: true, entry: entry };
  }

  function move(state, tokenIndex, dx, dy) {
    var check = canMove(state, tokenIndex, dx, dy);
    if (!check.ok) return check;
    return applyMoveTo(state, tokenIndex, check.x, check.y, check.destId);
  }

  function moveTo(state, tokenIndex, x, y) {
    var check = canDropToken(state, tokenIndex, x, y);
    if (!check.ok) return check;
    return applyMoveTo(state, tokenIndex, check.x, check.y, check.destId);
  }

  function undo(state) {
    var step = state.history.pop();
    if (!step) return { ok: false, reason: "nothing-to-undo" };
    if (step.type === "destroy" && step.destroy) {
      var d = step.destroy;
      state.cells[cellKey(d.x, d.y)] = d.roomId;
      if (!state.discarded) state.discarded = [];
      var di = state.discarded.lastIndexOf(d.roomId);
      if (di >= 0) state.discarded.splice(di, 1);
      (d.tokens || []).forEach(function (moved) {
        var tok = state.tokens[moved.tokenIndex];
        if (!tok || !moved.from) return;
        tok.x = moved.from.x;
        tok.y = moved.from.y;
      });
      state.log.pop();
      return { ok: true, step: step };
    }
    var token = state.tokens[step.tokenIndex];
    if (!token) return { ok: false, reason: "no-token" };
    token.x = step.from.x;
    token.y = step.from.y;
    if (step.discovered) {
      var k = cellKey(step.to.x, step.to.y);
      delete state.cells[k];
      if (step.discoveredId) state.deck.unshift(step.discoveredId);
    }
    state.log.pop();
    return { ok: true, step: step };
  }

  function canDestroyRoom(state, x, y) {
    if (!state || !inBounds(x, y, state.gridSize)) return { ok: false, reason: "invalid" };
    if (x === state.center.x && y === state.center.y) return { ok: false, reason: "start-protected" };
    var id = cellRoomId(state, x, y);
    if (!id) return { ok: false, reason: "no-room" };
    if (id === state.startRoomId) return { ok: false, reason: "start-protected" };
    return { ok: true, roomId: id };
  }

  function destroyRoom(state, x, y) {
    var check = canDestroyRoom(state, x, y);
    if (!check.ok) return check;
    var roomId = check.roomId;
    var room = roomById(state, roomId);
    var occupants = tokensAt(state, x, y);
    var tokenMoves = occupants.map(function (index) {
      var tok = state.tokens[index];
      return {
        tokenIndex: index,
        from: { x: tok.x, y: tok.y, roomId: roomId },
        to: { x: state.center.x, y: state.center.y, roomId: state.startRoomId }
      };
    });
    occupants.forEach(function (index) {
      state.tokens[index].x = state.center.x;
      state.tokens[index].y = state.center.y;
    });
    delete state.cells[cellKey(x, y)];
    if (!state.discarded) state.discarded = [];
    state.discarded.push(roomId);
    var startRoom = roomById(state, state.startRoomId);
    var startName = startRoom ? startRoom.name : "the Starting Hall";
    var roomName = room ? room.name : "a room";
    var text;
    if (occupants.length) {
      var who = occupants.map(function (index) { return state.tokens[index].name; }).join(", ");
      text = roomName + " was destroyed. " + who + " returned to " + startName + ".";
    } else {
      text = roomName + " was destroyed. It stays out of the deck for this game.";
    }
    var entry = {
      text: text,
      type: "destroy",
      tokenIndex: occupants.length ? occupants[0] : state.selected,
      from: { x: x, y: y, roomId: roomId },
      to: { x: state.center.x, y: state.center.y, roomId: state.startRoomId },
      discovered: false,
      destroy: { x: x, y: y, roomId: roomId, tokens: tokenMoves }
    };
    state.log.push(entry);
    state.history.push({
      type: "destroy",
      tokenIndex: entry.tokenIndex,
      from: entry.from,
      to: entry.to,
      discovered: false,
      discoveredId: null,
      destroy: { x: x, y: y, roomId: roomId, tokens: tokenMoves }
    });
    return { ok: true, entry: entry };
  }

  function canDropToken(state, tokenIndex, x, y) {
    if (!state || !state.tokens[tokenIndex]) return { ok: false, reason: "no-token" };
    if (!inBounds(x, y, state.gridSize)) return { ok: false, reason: "edge" };
    var token = state.tokens[tokenIndex];
    if (token.x === x && token.y === y) return { ok: false, reason: "same-cell" };
    var destId = cellRoomId(state, x, y);
    if (!destId && !state.deck.length) return { ok: false, reason: "deck-empty" };
    return { ok: true, x: x, y: y, destId: destId };
  }

  function resolveDragDrop(mode, state, tokenIndex, x, y) {
    if (!movementAllowed(mode)) return { type: "blocked" };
    var check = canDropToken(state, tokenIndex, x, y);
    if (!check.ok) return { type: "invalid", reason: check.reason };
    return { type: "move", tokenIndex: tokenIndex, x: check.x, y: check.y };
  }

  function cloneDestroy(d) {
    if (!d) return null;
    return {
      x: d.x,
      y: d.y,
      roomId: d.roomId,
      tokens: (d.tokens || []).map(function (m) {
        return {
          tokenIndex: m.tokenIndex,
          from: m.from ? { x: m.from.x, y: m.from.y, roomId: m.from.roomId } : null,
          to: m.to ? { x: m.to.x, y: m.to.y, roomId: m.to.roomId } : null
        };
      })
    };
  }

  function serialize(state) {
    return {
      version: 1,
      gridSize: state.gridSize,
      center: state.center,
      startRoomId: state.startRoomId,
      cells: Object.assign({}, state.cells),
      deck: state.deck.slice(),
      discarded: (state.discarded || []).slice(),
      tokens: cloneTokens(state.tokens),
      playerCount: normalizePlayerCount(state.playerCount, state.tokens),
      selected: state.selected,
      log: state.log.map(function (e) {
        var row = {
          text: e.text,
          tokenIndex: e.tokenIndex,
          from: e.from,
          to: e.to,
          discovered: !!e.discovered
        };
        if (e.type) row.type = e.type;
        if (e.destroy) row.destroy = cloneDestroy(e.destroy);
        return row;
      }),
      history: state.history.map(function (h) {
        var row = {
          tokenIndex: h.tokenIndex,
          from: h.from,
          to: h.to,
          discovered: !!h.discovered,
          discoveredId: h.discoveredId || null
        };
        if (h.type) row.type = h.type;
        if (h.destroy) row.destroy = cloneDestroy(h.destroy);
        return row;
      })
    };
  }

  function migrateGrid(saved, rooms, newSize, options) {
    options = options || {};
    var oldSize = Number(saved.gridSize) || newSize;
    var oldCenter = Math.floor(oldSize / 2);
    var newCenter = Math.floor(newSize / 2);
    var shift = newCenter - oldCenter;
    var count = normalizePlayerCount(
      options.playerCount != null ? options.playerCount : saved.playerCount,
      saved.tokens
    );
    var base = createGame(rooms, Object.assign({}, options, { gridSize: newSize, playerCount: count }));
    var index = base.roomIndex;
    var startId = base.startRoomId;
    var discarded = [];
    var seenDiscard = Object.create(null);
    function addDiscard(id) {
      if (id && id !== startId && index[id] && !seenDiscard[id]) {
        discarded.push(id);
        seenDiscard[id] = true;
      }
    }
    (saved.discarded || []).forEach(addDiscard);
    var cells = {};
    cells[cellKey(newCenter, newCenter)] = startId;
    Object.keys(saved.cells || {}).forEach(function (k) {
      var parts = k.split(",");
      var ox = Number(parts[0]);
      var oy = Number(parts[1]);
      var id = saved.cells[k];
      if (!index[id] || id === startId) return;
      var nx = ox + shift;
      var ny = oy + shift;
      if (!inBounds(nx, ny, newSize)) {
        addDiscard(id);
        return;
      }
      cells[cellKey(nx, ny)] = id;
    });
    var used = Object.create(null);
    used[startId] = true;
    Object.keys(cells).forEach(function (k) { used[cells[k]] = true; });
    discarded.forEach(function (id) { used[id] = true; });
    var deck = [];
    var seenDeck = Object.create(null);
    (saved.deck || []).forEach(function (id) {
      if (index[id] && !used[id] && !seenDeck[id]) {
        deck.push(id);
        seenDeck[id] = true;
      }
    });
    unusedIds(rooms, startId, cells, discarded).forEach(function (id) {
      if (!seenDeck[id]) deck.push(id);
    });
    var tokens = cloneTokens(base.tokens);
    (saved.tokens || []).forEach(function (t, i) {
      if (!tokens[i]) return;
      var nx = Number(t.x) + shift;
      var ny = Number(t.y) + shift;
      if (!inBounds(nx, ny, newSize) || !cells[cellKey(nx, ny)]) {
        tokens[i].x = newCenter;
        tokens[i].y = newCenter;
      } else {
        tokens[i].x = nx;
        tokens[i].y = ny;
      }
    });
    var selected = Number(saved.selected);
    if (!(selected >= 0 && selected < tokens.length)) selected = 0;
    var log = (saved.log || []).map(function (e) {
      var row = {
        text: e.text,
        tokenIndex: e.tokenIndex,
        from: e.from,
        to: e.to,
        discovered: !!e.discovered
      };
      if (e.type) row.type = e.type;
      if (e.destroy) row.destroy = cloneDestroy(e.destroy);
      return row;
    });
    return {
      gridSize: newSize,
      center: { x: newCenter, y: newCenter },
      startRoomId: startId,
      rooms: rooms,
      roomIndex: index,
      cells: cells,
      deck: deck,
      discarded: discarded,
      tokens: tokens,
      playerCount: tokens.length,
      selected: selected,
      log: log,
      history: [],
      migratedFrom: oldSize
    };
  }

  function deserialize(saved, rooms, options) {
    options = options || {};
    if (!saved || saved.version !== 1) return createGame(rooms, options);
    var count = normalizePlayerCount(
      options.playerCount != null ? options.playerCount : saved.playerCount,
      saved.tokens
    );
    options = Object.assign({}, options, { playerCount: count });
    var base = createGame(rooms, options);
    var index = base.roomIndex;
    var startId = base.startRoomId;
    var size = base.gridSize;
    var savedSize = Number(saved.gridSize) || 0;
    if (savedSize && savedSize !== size) {
      return migrateGrid(saved, rooms, size, options);
    }
    var cells = {};
    Object.keys(saved.cells || {}).forEach(function (k) {
      var parts = k.split(",");
      var x = Number(parts[0]);
      var y = Number(parts[1]);
      var id = saved.cells[k];
      if (!inBounds(x, y, size) || !index[id]) return;
      cells[k] = id;
    });
    var cx = base.center.x;
    var cy_ = base.center.y;
    cells[cellKey(cx, cy_)] = startId;
    Object.keys(cells).forEach(function (k) {
      if (k !== cellKey(cx, cy_) && cells[k] === startId) delete cells[k];
    });
    var discarded = [];
    var seenDiscard = Object.create(null);
    (saved.discarded || []).forEach(function (id) {
      if (index[id] && id !== startId && !seenDiscard[id]) {
        discarded.push(id);
        seenDiscard[id] = true;
      }
    });
    var used = Object.create(null);
    used[startId] = true;
    Object.keys(cells).forEach(function (k) { used[cells[k]] = true; });
    discarded.forEach(function (id) { used[id] = true; });
    var deck = [];
    var seenDeck = Object.create(null);
    (saved.deck || []).forEach(function (id) {
      if (index[id] && !used[id] && !seenDeck[id]) {
        deck.push(id);
        seenDeck[id] = true;
      }
    });
    unusedIds(rooms, startId, cells, discarded).forEach(function (id) {
      if (!seenDeck[id]) deck.push(id);
    });
    var tokens = cloneTokens(base.tokens);
    (saved.tokens || []).forEach(function (t, i) {
      if (!tokens[i]) return;
      var x = Number(t.x);
      var y = Number(t.y);
      if (!inBounds(x, y, size) || !cells[cellKey(x, y)]) {
        tokens[i].x = cx;
        tokens[i].y = cy_;
      } else {
        tokens[i].x = x;
        tokens[i].y = y;
      }
    });
    var history = [];
    (saved.history || []).forEach(function (h) {
      if (h.type === "destroy") {
        history.push({
          type: "destroy",
          tokenIndex: h.tokenIndex,
          from: h.from,
          to: h.to,
          discovered: false,
          discoveredId: null,
          destroy: cloneDestroy(h.destroy)
        });
        return;
      }
      if (!tokens[h.tokenIndex]) return;
      history.push({
        tokenIndex: h.tokenIndex,
        from: h.from,
        to: h.to,
        discovered: !!h.discovered,
        discoveredId: h.discoveredId || null
      });
    });
    var log = (saved.log || []).map(function (e) {
      var row = {
        text: e.text,
        tokenIndex: e.tokenIndex,
        from: e.from,
        to: e.to,
        discovered: !!e.discovered
      };
      if (e.type) row.type = e.type;
      if (e.destroy) row.destroy = cloneDestroy(e.destroy);
      return row;
    });
    var selected = Number(saved.selected);
    if (!(selected >= 0 && selected < tokens.length)) selected = 0;
    return {
      gridSize: size,
      center: { x: cx, y: cy_ },
      startRoomId: startId,
      rooms: rooms,
      roomIndex: index,
      cells: cells,
      deck: deck,
      discarded: discarded,
      tokens: tokens,
      playerCount: tokens.length,
      selected: selected,
      log: log,
      history: history
    };
  }

  function escapeHtml(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatEffect(text, symbolBase) {
    symbolBase = symbolBase || "img/symbols/";
    var safe = escapeHtml(text);
    return safe.replace(/\{([^}]+)\}/g, function (match, symbol) {
      var key = String(symbol).replace(/\//g, "").trim();
      if (!/^[0-9A-Za-z]+$/.test(key)) return match;
      return '<img class="mana-symbol" src="' + symbolBase + key + '.svg" alt="' + match + '">';
    });
  }

  function discoveredCount(state) {
    return Object.keys(state.cells).length;
  }

  function remainingCount(state) {
    return state.deck.length;
  }

  function movementAllowed(mode) {
    return mode !== "inspect";
  }

  function resolveBoardClick(mode, state, tokenIndex, x, y) {
    if (!state || !inBounds(x, y, state.gridSize)) return { type: "invalid" };
    if (mode === "inspect") {
      return { type: "inspect", x: x, y: y };
    }
    var token = state.tokens[tokenIndex];
    if (token && Math.abs(token.x - x) + Math.abs(token.y - y) === 1) {
      return { type: "move", dx: x - token.x, dy: y - token.y };
    }
    return { type: "inspect", x: x, y: y };
  }

  function resolveContextInspect(state, x, y) {
    if (!state || !inBounds(x, y, state.gridSize)) return { type: "invalid" };
    var room = cellRoom(state, x, y);
    if (!room) return { type: "hidden", x: x, y: y };
    return {
      type: "inspect",
      x: x,
      y: y,
      roomId: room.id,
      canDestroy: canDestroyRoom(state, x, y).ok
    };
  }

  function roomImagePath(image, base) {
    base = base || "img/rooms/";
    var name = String(image == null ? "" : image).trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:jpg|jpeg|png|webp|gif)$/i.test(name)) return "";
    return base + name;
  }

  function playerRooms(state) {
    if (!state || !state.tokens) return [];
    return state.tokens.map(function (token) {
      var room = cellRoom(state, token.x, token.y);
      return {
        id: token.id,
        name: token.name,
        color: token.color,
        x: token.x,
        y: token.y,
        roomId: room ? room.id : null,
        roomName: room ? room.name : null,
        effect: room ? room.effect : null,
        image: room ? room.image : null
      };
    });
  }

  function formatPlayerRoomsHtml(rows, symbolBase) {
    return (rows || []).map(function (row) {
      var color = /^#[0-9A-Fa-f]{6}$/.test(row.color) ? row.color : "#888888";
      var label = "P" + row.id;
      var title;
      var effectHtml;
      var art = "";
      if (row.roomName) {
        title = escapeHtml(row.roomName) +
          ' <span class="room-id">' + escapeHtml(String(row.roomId).padStart(3, "0")) + "</span>";
        effectHtml = formatEffect(row.effect, symbolBase);
        var src = roomImagePath(row.image);
        if (src) {
          art = '<img class="occupant-art" src="' + escapeHtml(src) + '" alt="">';
        }
      } else {
        title = "Unmarked space";
        effectHtml = "This player is not in a revealed room.";
      }
      return '<article class="occupant" style="--token-color:' + color + '">' +
        art +
        '<div class="occupant-body">' +
        '<div class="occupant-head">' +
        '<span class="pawn" aria-hidden="true">' + escapeHtml(String(row.id)) + "</span>" +
        "<strong>" + escapeHtml(label) + "</strong>" +
        '<span class="occupant-room">' + title + "</span></div>" +
        '<p class="effect">' + effectHtml + "</p></div></article>";
    }).join("");
  }

  function inspectControlLabel(roomName) {
    var name = String(roomName == null || roomName === "" ? "room" : roomName);
    return "Inspect " + name;
  }

  function isRoutineStatus(text) {
    text = String(text == null ? "" : text).trim();
    if (!text) return true;
    if (text === "Loading rooms…") return true;
    if (/\d+ rooms? revealed/.test(text)) return true;
    if (/^Inspect mode:/.test(text)) return true;
    if (/^Move mode:/.test(text)) return true;
    if (/^Inspecting /.test(text)) return true;
    return false;
  }

  return {
    GRID_SIZE: GRID_SIZE,
    MIN_PLAYERS: MIN_PLAYERS,
    MAX_PLAYERS: MAX_PLAYERS,
    DEFAULT_PLAYERS: DEFAULT_PLAYERS,
    CENTER: CENTER,
    STORAGE_KEY: STORAGE_KEY,
    TOKENS: TOKENS,
    normalizePlayerCount: normalizePlayerCount,
    makeTokens: makeTokens,
    playerHotkeyIndex: playerHotkeyIndex,
    trimBom: trimBom,
    parseCsv: parseCsv,
    parseRooms: parseRooms,
    shuffle: shuffle,
    findStartRoom: findStartRoom,
    cellKey: cellKey,
    inBounds: inBounds,
    roomById: roomById,
    cellRoomId: cellRoomId,
    cellRoom: cellRoom,
    tokensAt: tokensAt,
    unusedIds: unusedIds,
    createGame: createGame,
    canMove: canMove,
    move: move,
    moveTo: moveTo,
    undo: undo,
    serialize: serialize,
    deserialize: deserialize,
    migrateGrid: migrateGrid,
    escapeHtml: escapeHtml,
    formatEffect: formatEffect,
    inspectControlLabel: inspectControlLabel,
    isRoutineStatus: isRoutineStatus,
    discoveredCount: discoveredCount,
    remainingCount: remainingCount,
    movementAllowed: movementAllowed,
    resolveBoardClick: resolveBoardClick,
    resolveContextInspect: resolveContextInspect,
    canDestroyRoom: canDestroyRoom,
    destroyRoom: destroyRoom,
    canDropToken: canDropToken,
    resolveDragDrop: resolveDragDrop,
    playerRooms: playerRooms,
    formatPlayerRoomsHtml: formatPlayerRoomsHtml,
    roomImagePath: roomImagePath
  };
});
