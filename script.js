// --- GLOBAL VARIABLES ---
var game = new Chess();
var stockfish = null;
var isEngineThinking = false;
var engineReady = false;
var isFirstLaunch = true;
var isSelfPlay = false;

// Player settings
var playerSide = "white";
var playerName = "Player";

// --- 1. ENGINE LOADER (WASM VERSION) ---
function initStockfish() {
  // Modern Stockfish (WASM) usually detects the .wasm file automatically
  // if it's in the same folder.
  try {
    stockfish = new Worker("stockfish.js");

    stockfish.onerror = function (e) {
      console.error("Stockfish Error:", e);
      alert("Engine failed to load. Check if stockfish.wasm is in the folder.");
    };

    setupStockfishListeners();
  } catch (err) {
    alert(
      "Could not load Stockfish. Note: WASM workers often require a local server (or 'Save to Home Screen') to work due to browser security.",
    );
  }
}

// --- 2. ENGINE COMMUNICATION ---

// --- MANUAL DIFFICULTY CONFIGURATION ---

// Skill: Stockfish "Stupidity" (0=Dumbest, 20=Smartest)
// Depth: How many moves ahead it can see (1=Blind, 20=All Seeing)

var difficultyLevels = [
  { name: "Monkey", skill: 0, depth: 1, time: 10 }, // Blind & Dumb
  { name: "Sparrow", skill: 1, depth: 1, time: 50 }, // Still blind
  { name: "Penguin", skill: 2, depth: 2, time: 50 }, // Sees 1 move ahead
  { name: "Turtle", skill: 3, depth: 3, time: 100 }, // Sees 2 moves ahead
  { name: "Fox", skill: 4, depth: 4, time: 100 }, // Casual player
  { name: "Eagle", skill: 5, depth: 5, time: 200 }, // Club player
  { name: "Wolf", skill: 6, depth: 6, time: 300 }, // Strong Club
  { name: "Bear", skill: 7, depth: 7, time: 300 }, // Expert
  { name: "Tiger", skill: 8, depth: 15, time: 400 }, // Master
  { name: "Dragon", skill: 9, depth: 20, time: 500 }, // Grandmaster
];

function setupStockfishListeners() {
  stockfish.postMessage("uci");

  stockfish.onmessage = function (event) {
    var line = event.data;
    // console.log("SF: " + line); // Uncomment for debugging

    if (line === "uciok") {
      updateDifficulty();
      stockfish.postMessage("isready");
    }

    if (line === "readyok") {
      engineReady = true;

      if (isFirstLaunch) {
        isFirstLaunch = false;
        var splash = document.getElementById("splash-screen");
        if (splash) {
          splash.style.opacity = "0";
          setTimeout(function () {
            splash.style.display = "none";
          }, 500);
        }
        setTimeout(function () {
          if (!loadProgress()) {
            openNewGameModal();
          }
        }, 100);
      }
    }

    if (line.startsWith("bestmove")) {
      isEngineThinking = false;
      document.title = "TextChess";

      // VISUAL FEEDBACK: Unlock the input
      var input = document.getElementById("moveInput");
      var btn = document.querySelector("#controls button");
      if (input) {
        input.disabled = false;
        input.classList.remove("input-disabled");
        input.placeholder = "Enter move (e.g. e4)";
        input.focus(); // Auto-focus so they can type immediately
      }
      if (btn) btn.disabled = false;

      var parts = line.split(" ");
      var bestMove = parts[1];

      if (!bestMove || bestMove === "(none)") return;

      var fromSq = bestMove.substring(0, 2);
      var toSq = bestMove.substring(2, 4);
      var promo = bestMove.length > 4 ? bestMove.substring(4, 5) : "q";

      var result = game.move({ from: fromSq, to: toSq, promotion: promo });

      if (result) {
        updateUI();
        saveProgress();

        if (isSelfPlay) {
          if (game.game_over()) {
            isSelfPlay = false; // Stop at checkmate/draw
            alert("Game Over!");
          } else {
            // Wait 500ms so we can see the move, then trigger again
            setTimeout(triggerStockfish, 500);
          }
        }
      }
    }
  };
}

function updateDifficulty() {
  if (!engineReady) return;

  var levelIndex =
    parseInt(document.getElementById("difficultySelect").value) || 0;
  var config = difficultyLevels[levelIndex];

  console.log("Applying: " + config.name + " (Skill " + config.skill + ")");

  stockfish.postMessage("setoption name Skill Level value " + config.skill);
}

function triggerStockfish() {
  if (!engineReady) return;

  isEngineThinking = true;
  document.title = "Thinking...";

  // VISUAL FEEDBACK: Lock the input
  var input = document.getElementById("moveInput");
  var btn = document.querySelector("#controls button");
  if (input) {
    input.disabled = true;
    input.classList.add("input-disabled");
    input.placeholder = "Opponent is thinking...";
  }
  if (btn) btn.disabled = true;

  var levelIndex =
    parseInt(document.getElementById("difficultySelect").value) || 0;
  var config = difficultyLevels[levelIndex];

  setTimeout(function () {
    stockfish.postMessage("position fen " + game.fen());

    // HYBRID LOGIC:
    // Weak bots (Depth <= 12) are limited by "Blindness".
    // Strong bots (Depth > 12) are limited by Time (to prevent freezing phone).

    if (config.depth <= 12) {
      stockfish.postMessage("go depth " + config.depth);
    } else {
      stockfish.postMessage("go movetime " + config.time);
    }
  }, 100);
}

// --- 3. GAME LOGIC ---
function handleUserMove() {
  // 1. SILENT CHECKS (Just return, don't nag)
  if (!engineReady || isEngineThinking) return;

  var input = document.getElementById("moveInput");
  var moveText = input.value.trim();
  if (moveText === "") return;

  // 2. ATTEMPT MOVE
  var move = game.move(moveText);

  // 3. INVALID MOVE HANDLING (Shake it!)
  if (move === null) {
    // Add the error class
    input.classList.add("input-error");

    // Remove it after 0.5s so it can trigger again
    setTimeout(function () {
      input.classList.remove("input-error");
    }, 500);
    return;
  }

  // 4. VALID MOVE
  input.value = "";
  updateUI();
  saveProgress();

  if (game.game_over()) {
    return;
  }

  triggerStockfish();
}

function updateUI() {
  var log = document.getElementById("game-log");
  log.innerText = getFormattedMoves();
  log.scrollTop = log.scrollHeight;

  var boardDiv = document.getElementById("ascii-board");
  boardDiv.innerText = game.ascii();

  updateMaterialScore();
}

// --- 4. START GAME & MENU LOGIC ---
function confirmNewGame() {
  var diffSelect = document.getElementById("difficultySelect");
  var sideSelect = document.getElementById("sideSelect");
  var nameInput = document.getElementById("playerNameInput");

  var levelName = diffSelect.options[diffSelect.selectedIndex].text;

  playerName = nameInput.value.trim() || "Player";
  localStorage.setItem("textchess_player_name", playerName);

  var choice = sideSelect.value;
  if (choice === "random") {
    playerSide = Math.random() < 0.5 ? "white" : "black";
  } else {
    playerSide = choice;
  }

  document.getElementById("controls").classList.remove("game-hidden");
  document.getElementById("tools").classList.remove("game-hidden");

  closeModal();
  startNewGame(levelName, playerSide);
}

function startNewGame(levelName, side) {
  clearProgress();
  game.reset();

  var infoBox = document.getElementById("game-info");
  var whiteSpan = document.getElementById("whiteNameDisplay");
  var blackSpan = document.getElementById("blackNameDisplay");

  infoBox.style.display = "block";

  if (side === "white") {
    whiteSpan.innerText = playerName;
    blackSpan.innerText = "Stockfish (" + levelName + ")";
  } else {
    whiteSpan.innerText = "Stockfish (" + levelName + ")";
    blackSpan.innerText = playerName;
  }

  document.getElementById("game-log").innerText = "";

  updateUI();
  saveProgress();

  if (stockfish) {
    stockfish.postMessage("stop");
    stockfish.postMessage("ucinewgame");
    stockfish.postMessage("isready");

    updateDifficulty();

    if (side === "black") {
      triggerStockfish();
    }
  }
}

// --- 5. UTILS & MODALS ---
function toggleBoard() {
  var board = document.getElementById("ascii-board");
  var btn = document.getElementById("btnBoard");
  if (board.style.display === "block") {
    board.style.display = "none";
    btn.innerText = "Show Board";
  } else {
    board.style.display = "block";
    btn.innerText = "Hide Board";
  }
}

function openNewGameModal() {
  var savedName = localStorage.getItem("textchess_player_name");
  if (savedName) document.getElementById("playerNameInput").value = savedName;

  var modal = document.getElementById("newGameModal");
  var cancelBtn = document.querySelector(".btn-cancel");

  if (
    game.history().length === 0 &&
    game.fen() === "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
  ) {
    cancelBtn.style.display = "none";
  } else {
    cancelBtn.style.display = "inline-block";
  }
  modal.style.display = "flex";
}

function closeModal() {
  document.getElementById("newGameModal").style.display = "none";
}
function openHelpModal() {
  document.getElementById("helpModal").style.display = "flex";
}
function closeHelpModal() {
  document.getElementById("helpModal").style.display = "none";
}

// --- 6. SAVE & EXPORT ---
function exportPGN() {
  var pgn = game.pgn();
  if (!pgn) {
    alert("No moves to save!");
    return;
  }

  var whiteName = playerSide === "white" ? playerName : "Stockfish";
  var blackName = playerSide === "black" ? playerName : "Stockfish";
  var dateStr = new Date().toISOString().slice(0, 10);

  var header =
    '[Event "TextChess Game"]\n' +
    '[Site "TextChess PWA"]\n' +
    '[Date "' +
    dateStr +
    '"]\n' +
    '[White "' +
    whiteName +
    '"]\n' +
    '[Black "' +
    blackName +
    '"]\n\n';

  var fullPgn = header + pgn;

  // --- WEB DOWNLOAD LOGIC ---
  // 1. Create a Blob (A virtual file in memory)
  var blob = new Blob([fullPgn], { type: "text/plain" });

  // 2. Create a hidden download link
  var url = window.URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = "textchess_" + dateStr + ".pgn"; // File name

  // 3. Trigger the click
  document.body.appendChild(a);
  a.click();

  // 4. Cleanup
  setTimeout(function () {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 0);

  closeModal();
}

function saveProgress() {
  var whiteName = document.getElementById("whiteNameDisplay").innerText;
  var blackName = document.getElementById("blackNameDisplay").innerText;

  var saveData = {
    pgn: game.pgn(),
    white: whiteName,
    black: blackName,
    playerSide: playerSide,
  };

  localStorage.setItem("textchess_save_data", JSON.stringify(saveData));
}

function loadProgress() {
  var jsonString = localStorage.getItem("textchess_save_data");
  if (!jsonString) return false;

  try {
    var data = JSON.parse(jsonString);

    if (data.pgn && data.pgn.trim().length > 0) {
      var result = game.load_pgn(data.pgn);

      if (result) {
        var infoBox = document.getElementById("game-info");
        var whiteSpan = document.getElementById("whiteNameDisplay");
        var blackSpan = document.getElementById("blackNameDisplay");

        infoBox.style.display = "block";
        whiteSpan.innerText = data.white || "Player";
        blackSpan.innerText = data.black || "Stockfish";

        if (data.playerSide) {
          playerSide = data.playerSide;
        }

        updateUI();

        document.getElementById("controls").classList.remove("game-hidden");
        document.getElementById("tools").classList.remove("game-hidden");

        return true;
      }
    }
  } catch (e) {
    console.error("Save file corrupted", e);
  }
  return false;
}

function getFormattedMoves() {
  var history = game.history();
  var str = "";
  for (var i = 0; i < history.length; i += 2) {
    var moveNum = i / 2 + 1;
    var whiteMove = history[i];
    var blackMove = history[i + 1] || "";
    str += moveNum + ". " + whiteMove + " " + blackMove + "\n";
  }
  return str;
}

function clearProgress() {
  localStorage.removeItem("textchess_save_data");
  localStorage.removeItem("textchess_saved_pgn");
}

function updateMaterialScore() {
  var board = game.board();
  var whiteTotal = 0;
  var blackTotal = 0;
  var values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

  for (var i = 0; i < 8; i++) {
    for (var j = 0; j < 8; j++) {
      var piece = board[i][j];
      if (piece) {
        if (piece.color === "w") whiteTotal += values[piece.type];
        else blackTotal += values[piece.type];
      }
    }
  }

  var diff = whiteTotal - blackTotal;
  var whiteScoreSpan = document.getElementById("whiteScore");
  var blackScoreSpan = document.getElementById("blackScore");

  if (diff > 0) {
    whiteScoreSpan.innerText = "+" + diff;
    blackScoreSpan.innerText = "";
  } else if (diff < 0) {
    whiteScoreSpan.innerText = "";
    blackScoreSpan.innerText = "+" + Math.abs(diff);
  } else {
    whiteScoreSpan.innerText = "";
    blackScoreSpan.innerText = "";
  }
}

// --- INITIALIZE ---
// We wrap this in a listener to ensure HTML is ready
document.addEventListener("DOMContentLoaded", function () {
  var controls = document.getElementById("controls");
  var tools = document.getElementById("tools");

  if (controls) controls.classList.add("game-hidden");
  if (tools) tools.classList.add("game-hidden");

  initStockfish();
});

// --- 7. KEYBOARD SUPPORT ---
var input = document.getElementById("moveInput");
if (input) {
  input.addEventListener("keypress", function (event) {
    // If the user presses the "Enter" key on the keyboard
    if (event.key === "Enter") {
      // Cancel the default action, if needed
      event.preventDefault();
      // Trigger the button element with a click
      handleUserMove();
    }
  });
}

// --- 8. SELF PLAY (SPECTATOR MODE) ---
function startSelfPlay() {
  // 1. Get settings
  var diffSelect = document.getElementById("difficultySelect");
  var levelName = diffSelect.options[diffSelect.selectedIndex].text;

  // 2. Setup Game
  isSelfPlay = true; // Turn on the loop

  // Close menu & Reset
  closeModal();
  startNewGame(levelName, "spectator"); // 'spectator' is a placeholder side

  // 3. Kickstart the loop
  // We trigger the engine immediately to make the first move
  setTimeout(triggerStockfish, 500);
}
