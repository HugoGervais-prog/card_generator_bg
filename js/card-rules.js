// ===== Shared card rules: types, type codes and rarity defaults =====
// Used by index_r.html (card generator), item.html (area generator) and js/dashboard.js.

var TYPES = ["Normal","Fire","Water","Electric","Grass","Ice","Fighting","Poison","Ground",
             "Flying","Psychic","Bug","Rock","Ghost","Dragon","Dark","Steel","Fairy"];

var TYPE_CODES = { "Normal": "NOR", "Fire": "FIR", "Water": "WAT", "Electric": "ELE", "Grass": "GRA", "Ice": "ICE",
                   "Fighting": "FIG", "Poison": "POS", "Ground": "GRD", "Flying": "FLY", "Psychic": "PSY", "Bug": "BUG",
                   "Rock": "ROC", "Ghost": "GHO", "Dragon": "DRG", "Dark": "DRK", "Steel": "STE", "Fairy": "FAR" };

// Default points and area cost per rarity (CSV columns Points / Cost override these per Pokémon)
var RARITY_POINTS = { B: 1, I: 3, A: 6, E: 9, M: 12, L: 17 };
var RARITY_TOTAL  = { B: 2, I: 3, A: 5, E: 7, M: 9, L: 12 };   // total area cost
var RARITY_PIPS_MONO = { B: 1, I: 1, A: 2, E: 3, M: 4, L: 5 }; // type icons, single type
var RARITY_PIPS_DUAL = { B: [1, 1], I: [1, 1], A: [2, 1], E: [2, 2], M: [3, 2], L: [3, 3] }; // [type1, type2]

function defaultPoints(rarity) { return RARITY_POINTS[rarity] != null ? RARITY_POINTS[rarity] : ""; }

function defaultCost(rarity, type1, type2) {
    if (!RARITY_TOTAL[rarity] || !TYPE_CODES[type1]) return "";
    var n = type2 && TYPE_CODES[type2] ? RARITY_PIPS_DUAL[rarity] : [RARITY_PIPS_MONO[rarity], 0];
    var generic = RARITY_TOTAL[rarity] - n[0] - n[1];
    return (generic ? "{" + generic + "}" : "") +
           new Array(n[0] + 1).join("{" + TYPE_CODES[type1] + "}") +
           (n[1] ? new Array(n[1] + 1).join("{" + TYPE_CODES[type2] + "}") : "");
}

// Text colour of each type, for "Fire-type" style words in ability text.
// Usual type colours; Dark, Ghost and Dragon are lightened so they stay readable on the dark ability box.
var TYPE_COLORS = { "Normal": "#c6c6a7", "Fire": "#ee8130", "Water": "#6390f0", "Electric": "#f7d02c", "Grass": "#7ac74c",
                    "Ice": "#96d9d6", "Fighting": "#e0443d", "Poison": "#c35bc1", "Ground": "#e2bf65", "Flying": "#a98ff3",
                    "Psychic": "#f95587", "Bug": "#a6b91a", "Rock": "#c9b548", "Ghost": "#9a7fc4", "Dragon": "#8f66ff",
                    "Dark": "#a58a75", "Steel": "#b7b7ce", "Fairy": "#e29cc4" };

// Wraps "Water-type", "fire-types"... in a span with that type's colour. Other words ("dual-type") are left alone.
function colorTypeWords(html) {
    var re = /\b(Normal|Fire|Water|Electric|Grass|Ice|Fighting|Poison|Ground|Flying|Psychic|Bug|Rock|Ghost|Dragon|Dark|Steel|Fairy)-types?\b/gi;
    return String(html || "").replace(re, function (word, type) {
        var t = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
        return '<span class="type_word" style="color:' + TYPE_COLORS[t] + '">' + word + '</span>';
    });
}
