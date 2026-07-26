(() => {
  "use strict";

  // ---------- Formation: 11 unique slots, one player per named position ----------
  const FORMATION = [
    { key: "prop", label: "Prop", pos: "Prop" },
    { key: "hooker", label: "Hooker", pos: "Hooker" },
    { key: "lock", label: "Lock", pos: "Lock" },
    { key: "flanker", label: "Flanker", pos: "Flanker" },
    { key: "no8", label: "Number 8", pos: "Number 8" },
    { key: "scrumhalf", label: "Scrum-half", pos: "Scrum-half" },
    { key: "flyhalf", label: "Fly-half", pos: "Fly-half" },
    { key: "centre", label: "Centre", pos: "Centre" },
    { key: "wing", label: "Wing", pos: "Wing" },
    { key: "fullback", label: "Fullback", pos: "Fullback" },
  ];

  // How the squad panel groups slots into rows — a real team sheet, not a
  // flat list: front row pair, second row, back row pair, half-backs,
  // centre/wing pair, fullback alone.
  const FORMATION_ROWS = [
    ["prop", "hooker"],
    ["lock"],
    ["flanker", "no8"],
    ["scrumhalf", "flyhalf"],
    ["centre", "wing"],
    ["fullback"],
  ];

  const FLAGS = {
    "New Zealand": "🇳🇿", "South Africa": "🇿🇦", "England": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "France": "🇫🇷",
    "Ireland": "🇮🇪", "Scotland": "🏴󠁧󠁢󠁳󠁣󠁴󠁿", "Wales": "🏴󠁧󠁢󠁷󠁬󠁳󠁿", "Australia": "🇦🇺",
    "Argentina": "🇦🇷", "Fiji": "🇫🇯", "Georgia": "🇬🇪", "Italy": "🇮🇹",
    "Japan": "🇯🇵", "Samoa": "🇼🇸", "Tonga": "🇹🇴", "Canada": "🇨🇦", "Namibia": "🇳🇦",
    "Romania": "🇷🇴", "Russia": "🇷🇺", "United States": "🇺🇸", "USA": "🇺🇸", "Uruguay": "🇺🇾",
    "Spain": "🇪🇸", "Portugal": "🇵🇹", "Chile": "🇨🇱", "Zimbabwe": "🇿🇼", "Ivory Coast": "🇨🇮",
  };
  const flagFor = (nation) => FLAGS[nation] || "🏉";

  // ---------- State ----------
  let PLAYERS = [];          // players_master.json — one row per unique player
  let TEAM_ERAS = [];        // team_eras.json — one row per (nation, year) with roster
  let RWC_HISTORY = {};      // rwc_history.json — real pool + knockout results, 1987-2023
  let HISTORICAL_ELO = {};   // historical_elo.json — real Elo per nation right before each RWC
  let RWC2027 = { pools: {} }; // rwc2027.json — the real 2027 Rugby World Cup pool draw
  let slots = FORMATION.map((f) => ({ ...f, player: null }));
  let currentSpinEra = null; // the (nation, year) the last spin landed on
  let dateChangeUsed = false; // "Change date" — once per whole draft, not once per turn
  let teamChangeUsed = false; // "Change team" — once per whole draft, not once per turn
  let NATION_ELO = {};       // nation -> real current Elo, from rwc2027.json
  let blindMode = false;     // "no stats": ratings hidden, pick lists alphabetical
  let historyYear = null;    // set only once "World Cup" mode's year picker is used, post-draft
  let campaign = { mode: "regular", title: "", round: 0, wins: 0, losses: 0, log: [], series: [], teamElo: 0, teamRating: 0 };

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const screens = {
    home: $("screen-home"),
    how: $("screen-how"),
    ratings: $("screen-ratings"),
    historyYear: $("screen-history-year"),
    draft: $("screen-draft"),
    end: $("screen-end"),
  };

  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.add("hidden"));
    screens[name].classList.remove("hidden");
    window.scrollTo(0, 0);
  }

  // ---------- Data loading ----------
  async function loadData() {
    const [playersRes, erasRes, historyRes, eloRes, rwc2027Res] = await Promise.all([
      fetch("data/players_master.json"),
      fetch("data/team_eras.json"),
      fetch("data/rwc_history.json"),
      fetch("data/historical_elo.json"),
      fetch("data/rwc2027.json"),
    ]);
    PLAYERS = await playersRes.json();
    TEAM_ERAS = await erasRes.json();
    RWC_HISTORY = await historyRes.json();
    HISTORICAL_ELO = await eloRes.json();
    RWC2027 = await rwc2027Res.json();

    Object.values(RWC2027.pools).flat().forEach((t) => { NATION_ELO[t.nation] = t.elo; });
  }

  function isModern(p) {
    return p.rating_source === "production";
  }

  // ---------- Squad panel: shared team-sheet renderer ----------
  // Used by both the draft screen's squad pane (clickable, to clear a
  // pick) and the campaign screen's squad pane (read-only reference).
  function buildSlotCard(index, clickable) {
    const slot = slots[index];
    const row = document.createElement("div");
    row.className = "slot-row" + (slot.player ? " filled" : "");
    if (slot.player) {
      const p = slot.player;
      const years = (p.world_cups || []).join(", ");
      row.innerHTML = `
        <div class="sr-pos">${slot.label}</div>
        <div class="sr-body">
          <div class="sr-name">${flagFor(p.nation)} ${p.display_name || p.name}</div>
        </div>
        ${blindMode ? "" : `<div class="sr-rating">${p.rating}</div>`}
      `;
      if (clickable) {
        row.title = "Tap to clear this pick";
        row.addEventListener("click", () => {
          slots[index].player = null;
          renderSlots();
          renderPickPane();
        });
      }
    } else {
      row.innerHTML = `
        <div class="sr-pos">${slot.label}</div>
        <div class="sr-body"><span class="sr-empty">Open</span></div>
      `;
    }
    return row;
  }

  function renderSquadInto(containerId, clickable) {
    const el = $(containerId);
    if (!el) return;
    el.innerHTML = "";
    FORMATION_ROWS.forEach((keys) => {
      const rowWrap = document.createElement("div");
      rowWrap.className = "squad-row";
      keys.forEach((key) => {
        const index = slots.findIndex((s) => s.key === key);
        rowWrap.appendChild(buildSlotCard(index, clickable));
      });
      el.appendChild(rowWrap);
    });
  }

  // ---------- Draft screen: squad pane (right) ----------
  function renderSlots() {
    renderSquadInto("slots", true);

    const filled = slots.filter((s) => s.player).length;
    const full = filled === FORMATION.length;
    $("draft-progress").textContent = `${filled} / ${FORMATION.length}`;
    $("mode-buttons").classList.toggle("hidden", !full);
    updateSpinButtonStates();
    updateTeamPreview();
  }

  // "Change date"/"Change team" are each a one-time adjustment for the whole
  // draft, not per turn — use "Change date" on turn 2 and it's gone for good,
  // independent of "Change team", which stays available until you use it too.
  function updateSpinButtonStates() {
    const full = slots.every((s) => s.player);
    $("btn-spin-all").disabled = full;
    $("btn-spin-date").disabled = full || !currentSpinEra || dateChangeUsed;
    $("btn-spin-team").disabled = full || !currentSpinEra || teamChangeUsed;
  }

  function updateTeamPreview() {
    const filled = slots.filter((s) => s.player);
    const preview = $("team-preview");
    if (filled.length === 0) {
      preview.textContent = "";
      return;
    }
    if (blindMode) {
      preview.textContent = `${filled.length}/${FORMATION.length} filled`;
      return;
    }
    const { teamRating } = computeTeam();
    preview.textContent = `Squad rating so far: ${teamRating} · ${filled.length}/${FORMATION.length} filled`;
  }

  // ---------- Draft screen: pick pane (left) ----------
  function openSlotPositions() {
    return new Set(slots.filter((s) => !s.player).map((s) => s.pos));
  }

  function eraCandidates(filterFn) {
    const open = openSlotPositions();
    return TEAM_ERAS.filter((e) => e.roster.some((r) => open.has(r.position)) && filterFn(e));
  }

  function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function spinAll() {
    const candidates = eraCandidates(() => true);
    if (candidates.length === 0) return;
    currentSpinEra = pickRandom(candidates);
    renderSlots();
    renderPickPane();
  }

  function spinChangeDate() {
    if (!currentSpinEra || dateChangeUsed) return;
    const nation = currentSpinEra.nation;
    let candidates = eraCandidates((e) => e.nation === nation && e.year !== currentSpinEra.year);
    if (candidates.length === 0) candidates = eraCandidates((e) => e.nation === nation);
    if (candidates.length === 0) return;
    currentSpinEra = pickRandom(candidates);
    dateChangeUsed = true;
    updateSpinButtonStates();
    renderPickPane();
  }

  function spinChangeTeam() {
    if (!currentSpinEra || teamChangeUsed) return;
    const year = currentSpinEra.year;
    let candidates = eraCandidates((e) => e.year === year && e.nation !== currentSpinEra.nation);
    if (candidates.length === 0) candidates = eraCandidates((e) => e.year === year);
    if (candidates.length === 0) return;
    currentSpinEra = pickRandom(candidates);
    teamChangeUsed = true;
    updateSpinButtonStates();
    renderPickPane();
  }

  function renderPickPane() {
    const content = $("pick-content");
    const open = openSlotPositions();

    if (open.size === 0) {
      content.innerHTML = `<p class="pick-empty">Squad complete — pick a mode below to start your run.</p>`;
      return;
    }
    if (!currentSpinEra) {
      content.innerHTML = `<p class="pick-empty">Hit "Respin all" to land on a random nation and World Cup.</p>`;
      return;
    }

    const era = currentSpinEra;
    const playersByName = new Map(PLAYERS.map((p) => [p.name, p]));

    // Override with the era-specific position (r.position), not the player's
    // global primary position — a player can be eligible here under a
    // different slot than the one players_master picked as their primary
    // (e.g. undifferentiated "Back row" appearances, or genuine utility
    // players like a Centre/Fullback).
    const rows = era.roster
      .filter((r) => open.has(r.position))
      .map((r) => {
        const p = playersByName.get(r.name);
        return p ? { ...p, position: r.position } : null;
      })
      .filter(Boolean)
      .sort(blindMode
        ? (a, b) => (a.display_name || a.name).localeCompare(b.display_name || b.name)
        : (a, b) => b.rating - a.rating);

    content.innerHTML = "";
    const heading = document.createElement("div");
    heading.className = "spin-era-heading";
    heading.innerHTML = `
      <div class="se-name">${flagFor(era.nation)} ${era.nation} ${era.year}</div>
      <div class="se-sub">Pick anyone below to fill that position in your XV</div>
    `;
    content.appendChild(heading);

    const list = document.createElement("div");
    list.className = "picker-list";
    rows.forEach((p) => {
      const row = document.createElement("div");
      row.className = "pick-row";
      const years = (p.world_cups || []).join(", ") || (isModern(p) ? "2018–2025" : "");
      row.innerHTML = `
        <div class="pr-left">
          <div class="pr-name">${flagFor(p.nation)} ${p.display_name || p.name}</div>
          <div class="pr-meta">${p.position} · ${p.nation} <span class="squad-tag">· ${years}</span></div>
        </div>
        ${blindMode ? "" : `<div class="pr-rating">${p.rating}</div>`}
      `;
      row.addEventListener("click", () => {
        const slot = slots.find((s) => !s.player && s.pos === p.position);
        if (!slot) return;
        slot.player = p;
        // Each slot comes from its own spin — landing on a squad doesn't
        // let you clean out multiple positions from it in a row, so
        // picking always resets to "spin again" rather than staying put.
        currentSpinEra = null;
        renderSlots();
        renderPickPane();
      });
      list.appendChild(row);
    });
    content.appendChild(list);
  }

  // ---------- Ratings browser ----------
  function renderRatingsList(filterText) {
    const q = filterText.trim().toLowerCase();
    const list = PLAYERS
      .filter((p) => !q || (p.display_name || p.name).toLowerCase().includes(q) || p.nation.toLowerCase().includes(q) || p.position.toLowerCase().includes(q))
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 200);

    const el = $("ratings-list");
    el.innerHTML = "";
    list.forEach((p) => {
      const years = (p.world_cups || []).join(", ") || (isModern(p) ? "2018–2025" : "");
      const positions = (p.positions || [p.position]).join(" / ");
      const row = document.createElement("div");
      row.className = "pick-row";
      row.innerHTML = `
        <div class="pr-left">
          <div class="pr-name">${flagFor(p.nation)} ${p.display_name || p.name}</div>
          <div class="pr-meta">${positions} · ${p.nation} · ${years}</div>
        </div>
        <div class="pr-rating">${p.rating}</div>
      `;
      el.appendChild(row);
    });
  }

  // ---------- Team rating / chemistry ----------
  // A player capped by the same nation across several World Cups (very
  // common for a genuine international) used to add a separate squad-tier
  // bonus PER overlapping tournament year, so a real elite core (e.g. 5
  // Springboks who shared both the 2019 and 2023 squads) could stack an
  // 80-point chemistry bonus — enough to blow through the rating ceiling
  // on its own, regardless of the actual picks. CHEMISTRY_CAP is the fix:
  // chemistry can meaningfully swing a team, it can no longer swamp it.
  const CHEMISTRY_CAP = 12;

  // Chemistry is worth more when it's stacking real elite nations than when
  // it's stacking weaker ones — 3 Fiji picks (Elo ~2046) shouldn't buy the
  // same swing as 3 New Zealand picks (Elo ~2432). Factor is a straight
  // linear scale of that nation's real current Elo between CHEM_ELO_FLOOR
  // (weakest tracked tier) and CHEM_ELO_CEIL (South Africa, the strongest),
  // clamped to [CHEM_FACTOR_MIN, CHEM_FACTOR_MAX]. Untracked nations (no
  // real Elo data) fall back to a low-mid value rather than 0 or full credit.
  const CHEM_ELO_FLOOR = 1400;
  const CHEM_ELO_CEIL = 2550;
  const CHEM_FACTOR_MIN = 0.35;
  const CHEM_FACTOR_MAX = 1.25;
  const CHEM_ELO_FALLBACK = 1450;

  function chemistryStrengthFactor(nation) {
    const elo = NATION_ELO[nation] ?? CHEM_ELO_FALLBACK;
    const t = clamp((elo - CHEM_ELO_FLOOR) / (CHEM_ELO_CEIL - CHEM_ELO_FLOOR), 0, 1);
    return CHEM_FACTOR_MIN + t * (CHEM_FACTOR_MAX - CHEM_FACTOR_MIN);
  }

  function chemistryBonus(filledSlots) {
    const nationCounts = {};
    const squadCounts = {};
    filledSlots.forEach((s) => {
      const p = s.player;
      nationCounts[p.nation] = (nationCounts[p.nation] || 0) + 1;
      (p.world_cups || []).forEach((y) => {
        const key = `${p.nation}|${y}`;
        squadCounts[key] = (squadCounts[key] || 0) + 1;
      });
    });
    const nationTier = { 1: 0, 2: 1, 3: 2, 4: 4, 5: 6, 6: 8 };
    const squadTier = { 1: 0, 2: 1, 3: 3, 4: 5, 5: 7 };
    let bonus = 0;
    Object.entries(nationCounts).forEach(([nation, c]) => {
      bonus += (nationTier[Math.min(c, 6)] ?? 8) * chemistryStrengthFactor(nation);
    });
    Object.entries(squadCounts).forEach(([key, c]) => {
      const nation = key.split("|")[0];
      bonus += (squadTier[Math.min(c, 5)] ?? 9) * chemistryStrengthFactor(nation);
    });
    return Math.min(bonus, CHEMISTRY_CAP);
  }

  // Individual ratings run ~59-98 (mean 73, bell-curved — see data/build_squads_final.py).
  // Calibrated against two real reference points: a typical unoptimized
  // team (~73.5 avg, ~0 chemistry) should sit mid-table with the weaker
  // real nations (~1850 Elo, between Wales and Georgia); a fully optimized
  // best-possible team (rating ceiling, near-max chemistry) should be able
  // to edge out even South Africa (2543 Elo), the strongest team in the
  // campaign ladder.
  const TEAM_RATING_CEIL = 98; // matches the individual player ceiling
  const ELO_REF_RATING = 73.5;
  const ELO_REF_VALUE = 1850;
  const ELO_PER_RATING_POINT = 29;

  function computeTeam() {
    const filled = slots.filter((s) => s.player);
    const n = FORMATION.length;
    const avg = filled.reduce((sum, s) => sum + s.player.rating, 0) / filled.length;
    const bonus = filled.length === n ? chemistryBonus(filled) : chemistryBonus(filled) * (filled.length / n);
    const teamRating = Math.min(TEAM_RATING_CEIL, Math.round(avg + bonus));
    const teamElo = Math.round(ELO_REF_VALUE + (teamRating - ELO_REF_RATING) * ELO_PER_RATING_POINT);
    return { teamRating, teamElo, chemBonus: Math.round(bonus) };
  }

  // ---------- Match simulation (mirrors ELOR/functions.py Probability()) ----------
  function winProbability(eloA, eloB) {
    return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function randNormal(mean, std) {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return mean + z * std;
  }

  function simulateMatch(myElo, oppElo) {
    const MAX_MARGIN = 55; // real test-match blowouts rarely exceed this
    // The winner is drawn directly from winProbability() — the same number
    // shown on screen — so a displayed 33% really does win ~33% of the time.
    // (Previously the outcome came from an independent margin-based model
    // that didn't line up with the displayed logistic probability: a
    // displayed 33% actually won only ~21% of simulated matches.) The Elo
    // gap still drives how believable the final score margin looks, it just
    // no longer also decides who wins.
    const won = Math.random() < winProbability(myElo, oppElo);
    const expectedMarginMag = clamp(Math.abs(myElo - oppElo) / 14, 1, MAX_MARGIN);
    const marginMag = clamp(Math.round(expectedMarginMag + Math.abs(randNormal(0, 10))), 1, MAX_MARGIN);
    const loserBase = 6 + Math.floor(Math.random() * 19);
    let myScore, oppScore;
    if (won) {
      oppScore = loserBase;
      myScore = oppScore + marginMag;
    } else {
      myScore = loserBase;
      oppScore = myScore + marginMag;
    }
    return { myScore, oppScore, won };
  }

  // ---------- Campaign series builders ----------
  // Regular Competition: every one of the 24 real nations that qualified
  // for the 2027 World Cup, in order (weakest real Elo first) — a full
  // season, no elimination. Perfect is 24-0.
  function buildRegularSeries() {
    const teams = Object.values(RWC2027.pools).flat().slice();
    teams.sort((a, b) => a.elo - b.elo);
    return teams.map((o, i) => ({ ...o, roundLabel: `Match ${i + 1} of ${teams.length}` }));
  }

  // Gauntlet: the 10 highest real Elo (nation, year) team-seasons ever
  // recorded in the historical dataset (1987-2023) — the actual toughest
  // teams that have ever existed (1999 New Zealand, 2023 Ireland, etc.),
  // not just today's top 10 nations. Played weakest-of-the-ten first; no
  // elimination — you play all 10 regardless of result.
  function buildGauntletSeries() {
    const entries = [];
    Object.entries(HISTORICAL_ELO).forEach(([year, byNation]) => {
      Object.entries(byNation).forEach(([nation, elo]) => {
        entries.push({ nation, year, elo });
      });
    });
    entries.sort((a, b) => b.elo - a.elo);
    const top10 = entries.slice(0, 10).sort((a, b) => a.elo - b.elo);
    return top10.map((o, i) => ({ ...o, roundLabel: `Gauntlet ${i + 1} of 10 · ${o.year}` }));
  }

  // ---------- Campaign screen ----------
  function startCampaign(mode) {
    const { teamElo, teamRating } = computeTeam();
    campaign = { mode, title: "", round: 0, wins: 0, losses: 0, log: [], series: [], teamElo, teamRating };

    if (mode === "regular") {
      campaign.title = "Regular Competition";
      campaign.series = buildRegularSeries();
      // A full season isn't a knockout with per-round suspense — simulate
      // the whole thing at once and jump straight to the final record.
      campaign.series.forEach((opp) => {
        const result = simulateMatch(teamElo, opp.elo);
        campaign.log.push({ nation: opp.nation, ...result });
        if (result.won) campaign.wins += 1; else campaign.losses += 1;
      });
      campaign.round = campaign.series.length - 1;
      endCampaign(campaign.losses === 0);
      return;
    }

    if (mode === "gauntlet") {
      campaign.title = "Gauntlet";
      campaign.series = buildGauntletSeries();
      // All 10 toughest team-seasons ever recorded, back to back — no
      // elimination on a loss, you play the whole gauntlet either way.
      campaign.series.forEach((opp) => {
        const result = simulateMatch(teamElo, opp.elo);
        campaign.log.push({ nation: opp.nation, year: opp.year, ...result, roundLabel: opp.roundLabel });
        if (result.won) campaign.wins += 1; else campaign.losses += 1;
      });
      campaign.round = campaign.series.length - 1;
      endCampaign(campaign.losses === 0);
      return;
    }

    if (mode === "worldcup") {
      campaign.title = "Rugby World Cup 2027";
      simulateRealWorldCup2027();
      return;
    }

    campaign.title = `${historyYear} Rugby World Cup`;
    simulateRealHistoryYear();
  }

  // ---------- Rugby World Cup 2027: a real run through the real draw ----------
  // Your XV drops into one of the 6 real pools (replacing one of its 4 real
  // teams) and plays a real pool campaign: not just its own 3 games, but the
  // other 3 real teams' games against each other too, and all 5 OTHER real
  // pools fully simulated as well — so who tops each pool, and therefore who
  // you actually meet in the bracket, comes out of the same round-robin
  // process a real World Cup uses, not "the 4 toughest remaining teams."
  //
  // Standings use the standard World Cup bonus-point system: win 4, draw 2,
  // loss 0, plus a bonus point for scoring 28+ (our proxy for 4+ tries,
  // since the match sim only produces a final score) and a losing bonus for
  // losing by 7 or fewer. Ties broken by points difference, then points for.
  //
  // The top 2 of each pool (12 teams) go straight to the Round of 16; the
  // other 4 R16 slots go to the best 4 third-placed teams across all 6
  // pools. The Round of 16 pairing rule below (A1-C3, B1-D3, C1-A3, D1-B3,
  // E1-D2, F1-B2, A2/C2 vs E2/F2) is World Rugby's own confirmed format —
  // see "The new Men's Rugby World Cup draw format explained,"
  // world.rugby, Dec 2025. World Rugby also publishes a permutation table
  // for the case where a "wrong" pool's third qualifies instead of the one
  // a slot was designed for; that table wasn't retrievable, so this fills
  // any open "vs 3rd" slot with whichever qualifying third is left over —
  // sound (no same-pool clash is possible either way, since each slot's
  // designated third is always from a DIFFERENT pool than its opponent),
  // just not guaranteed to match World Rugby's exact assignment in that
  // specific edge case. The Quarterfinal/Semifinal/Final bracket tree isn't
  // publicly detailed yet either (only venues/dates are confirmed), so
  // R16 winners are paired in a standard seeded tree — provisional, best
  // available until World Rugby publishes the actual fixture schedule.
  function bonusPointStandings(teams) {
    // teams: [{nation, elo, isYou}]. Plays every pair once, returns a
    // sorted standings table plus the raw match list.
    const table = teams.map((t) => ({ nation: t.nation, elo: t.elo, isYou: !!t.isYou, pts: 0, pf: 0, pa: 0 }));
    const byNation = new Map(table.map((row) => [row.nation, row]));
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        const a = teams[i], b = teams[j];
        const result = simulateMatch(a.elo, b.elo);
        const rowA = byNation.get(a.nation), rowB = byNation.get(b.nation);
        rowA.pf += result.myScore; rowA.pa += result.oppScore;
        rowB.pf += result.oppScore; rowB.pa += result.myScore;
        if (result.won) rowA.pts += 4; else rowB.pts += 4;
        if (Math.abs(result.myScore - result.oppScore) <= 7) (result.won ? rowB : rowA).pts += 1;
        if (result.myScore >= 28) rowA.pts += 1;
        if (result.oppScore >= 28) rowB.pts += 1;

        if (a.isYou || b.isYou) {
          const you = a.isYou ? a : b;
          const oppRow = a.isYou ? rowB : rowA;
          const won = a.isYou ? result.won : !result.won;
          const myScore = a.isYou ? result.myScore : result.oppScore;
          const oppScore = a.isYou ? result.oppScore : result.myScore;
          campaign.log.push({ nation: oppRow.nation, myScore, oppScore, won });
          if (won) campaign.wins += 1; else campaign.losses += 1;
        }
      }
    }
    table.sort((x, y) => y.pts - x.pts || (y.pf - y.pa) - (x.pf - x.pa) || y.pf - x.pf);
    return table;
  }

  // Resolves a single bracket match. If your XV is a participant, this is a
  // real logged match (uses your real teamElo); otherwise it's a background
  // sim purely to find out who you'll face next.
  function resolveBracketMatch(a, b, roundLabel) {
    const result = simulateMatch(a.elo, b.elo);
    const winner = result.won ? a : b; // always correct, independent of who's "you"
    if (a.isYou || b.isYou) {
      const oppRow = a.isYou ? b : a;
      const won = a.isYou ? result.won : !result.won;
      const myScore = a.isYou ? result.myScore : result.oppScore;
      const oppScore = a.isYou ? result.oppScore : result.myScore;
      campaign.log.push({ nation: oppRow.nation, myScore, oppScore, won, roundLabel });
      if (won) campaign.wins += 1; else campaign.losses += 1;
      return { winner, wonIfYou: won };
    }
    return { winner, wonIfYou: null };
  }

  function simulateRealWorldCup2027() {
    const poolNames = Object.keys(RWC2027.pools);
    const myPool = poolNames[Math.floor(Math.random() * poolNames.length)];

    const standingsByPool = {};
    poolNames.forEach((poolName) => {
      const realTeams = RWC2027.pools[poolName];
      let teams;
      if (poolName === myPool) {
        // Your XV takes one of the pool's 4 real slots — same as any real
        // team in a 4-team pool, you play the other 3.
        const bumped = Math.floor(Math.random() * realTeams.length);
        teams = realTeams.map((t, i) => (i === bumped ? { nation: "Your XV", elo: campaign.teamElo, isYou: true } : t));
      } else {
        teams = realTeams;
      }
      standingsByPool[poolName] = bonusPointStandings(teams);
    });

    // campaign.log now has your 3 pool matches (in round-robin order, not
    // necessarily fixture order — the 2027 fixture schedule isn't public).
    campaign.log.forEach((entry, i) => { entry.roundLabel = `Pool ${myPool} Match ${i + 1}`; });

    const myStandings = standingsByPool[myPool];
    const myRow = myStandings.find((r) => r.isYou);
    const myPosition = myStandings.indexOf(myRow) + 1; // 1-4

    const thirds = poolNames.map((p) => ({ pool: p, ...standingsByPool[p][2] }));
    thirds.sort((x, y) => y.pts - x.pts || (y.pf - y.pa) - (x.pf - x.pa) || y.pf - x.pf);
    const qualifyingThirdPools = new Set(thirds.slice(0, 4).map((t) => t.pool));

    const advanced = myPosition <= 2 || (myPosition === 3 && qualifyingThirdPools.has(myPool));
    if (!advanced) {
      return endCampaign(false, "pool");
    }

    // Build the 16 real bracket participants as {nation, elo, isYou}.
    const seed = (poolName, place) => {
      const row = standingsByPool[poolName][place - 1];
      return { nation: row.isYou ? "Your XV" : row.nation, elo: row.elo, isYou: !!row.isYou };
    };
    const qualifyingThirds = thirds.slice(0, 4); // [{pool, nation, elo, isYou, pts, pf, pa}, ...]
    const usedThirdPools = new Set();
    const thirdFor = (wantPool) => {
      const exact = qualifyingThirds.find((t) => t.pool === wantPool && !usedThirdPools.has(t.pool));
      const pick = exact || qualifyingThirds.find((t) => !usedThirdPools.has(t.pool));
      usedThirdPools.add(pick.pool);
      return { nation: pick.isYou ? "Your XV" : pick.nation, elo: pick.elo, isYou: !!pick.isYou };
    };

    const r16Matches = {
      R16_A: [seed("A", 1), thirdFor("C")],
      R16_B: [seed("B", 1), thirdFor("D")],
      R16_C: [seed("C", 1), thirdFor("A")],
      R16_D: [seed("D", 1), thirdFor("B")],
      R16_E: [seed("E", 1), seed("D", 2)],
      R16_F: [seed("F", 1), seed("B", 2)],
      R16_G: [seed("A", 2), seed("E", 2)],
      R16_H: [seed("C", 2), seed("F", 2)],
    };

    const r16Winners = {};
    for (const key of Object.keys(r16Matches)) {
      const [a, b] = r16Matches[key];
      const { winner, wonIfYou } = resolveBracketMatch(a, b, "Round of 16");
      r16Winners[key] = winner;
      if (wonIfYou === false) return endCampaign(false);
    }

    const qfPairs = [["R16_A", "R16_B"], ["R16_C", "R16_D"], ["R16_E", "R16_F"], ["R16_G", "R16_H"]];
    const qfWinners = [];
    for (const [k1, k2] of qfPairs) {
      const { winner, wonIfYou } = resolveBracketMatch(r16Winners[k1], r16Winners[k2], "Quarterfinal");
      qfWinners.push(winner);
      if (wonIfYou === false) return endCampaign(false);
    }

    const sfPairs = [[qfWinners[0], qfWinners[1]], [qfWinners[2], qfWinners[3]]];
    const sfWinners = [];
    for (const [a, b] of sfPairs) {
      const { winner, wonIfYou } = resolveBracketMatch(a, b, "Semifinal");
      sfWinners.push(winner);
      if (wonIfYou === false) return endCampaign(false);
    }

    const { wonIfYou } = resolveBracketMatch(sfWinners[0], sfWinners[1], "Final");
    if (wonIfYou === false) return endCampaign(false);
    return endCampaign(true);
  }

  // ---------- History Mode: a real run through a real past World Cup ----------
  // Same idea as Rugby World Cup 2027, pointed at history instead of the
  // future: your XV replaces one real team in a real pool from that year and
  // plays a real pool campaign (your matches + the other real teams' matches
  // against each other), using each nation's real Elo as it stood right
  // before THAT tournament (data/historical_elo.json).
  //
  // The difference from 2027: everything past the pool stage already really
  // happened, so it isn't re-simulated. Once your finishing position in the
  // pool is known, we look up whichever REAL team finished in that exact
  // position historically and trace THEIR real tournament path (their real
  // QF/SF/Final opponents, straight from data/rwc_history.json) — you're
  // stepping into that slot's real draw, whether or not it's the specific
  // team you replaced. Only your own matches at each stage are simulated.
  //
  // Standard format for every year here is top-2-advance, no wildcard
  // thirds. 1999 is the one exception: it used 5 pools of 4 with pool
  // winners going straight through and runners-up needing to win an
  // extra play-off round (not modeled here) to reach the real quarterfinal
  // — approximated as "only the pool winner is guaranteed to advance."
  function simulateRealHistoryYear() {
    const t = RWC_HISTORY[historyYear];
    const eloMap = HISTORICAL_ELO[historyYear] || {};
    const eloOf = (nation) => eloMap[nation] ?? 1350; // untracked nation (e.g. Ivory Coast)

    const poolNames = t.pools.map((p) => p.pool);
    const myPoolLabel = poolNames[Math.floor(Math.random() * poolNames.length)];
    const myPool = t.pools.find((p) => p.pool === myPoolLabel);
    const bumped = Math.floor(Math.random() * myPool.teams.length);

    const teams = myPool.teams.map((nation, i) =>
      i === bumped
        ? { nation: "Your XV", elo: campaign.teamElo, isYou: true }
        : { nation, elo: eloOf(nation) }
    );
    const standings = bonusPointStandings(teams);
    campaign.log.forEach((entry, i) => { entry.roundLabel = `Pool ${myPoolLabel} Match ${i + 1}`; });

    const myRow = standings.find((r) => r.isYou);
    const myPosition = standings.indexOf(myRow) + 1;

    const guaranteedAdvance = historyYear === "1999" || historyYear === 1999 ? myPosition === 1 : myPosition <= 2;
    if (!guaranteedAdvance) {
      return endCampaign(false, "pool");
    }

    // Whoever really finished in this exact pool position historically —
    // could be the team you replaced, could be a different real team if
    // your XV's results shuffled the table — is who you inherit the bracket
    // SLOT from for the next match only. The bracket's tree structure past
    // that is fixed by history and doesn't care about your hypothetical
    // results, so after each round `tracking` moves to whoever REALLY won
    // that real match — if your slot's real occupant really won, keep
    // tracing them; if they really lost (very possible — you can easily
    // beat a team your slot's real occupant lost to), the bracket really
    // continued with the OTHER side, so trace THEM forward instead. Your
    // own simulated win/loss only decides whether your run continues, never
    // who occupies the next slot.
    let tracking = myPool.teams[myPosition - 1];

    const stages = [
      ["Quarterfinal", t.quarterfinals],
      ["Semifinal", t.semifinals],
      ["Final", [t.final]],
    ];
    for (const [roundLabel, matches] of stages) {
      const m = matches.find((x) => x.winner === tracking || x.loser === tracking);
      if (!m) {
        // No real match at this stage for the slot you're now tracking
        // (only possible for 1999's unmodeled play-off round) — nothing
        // further to trace, so the run is credited as complete as far as
        // it actually got to play.
        return endCampaign(true);
      }
      const opponentNation = m.winner === tracking ? m.loser : m.winner;
      const { wonIfYou } = resolveBracketMatch(
        { nation: "Your XV", elo: campaign.teamElo, isYou: true },
        { nation: opponentNation, elo: eloOf(opponentNation), isYou: false },
        roundLabel
      );
      if (wonIfYou === false) return endCampaign(false);
      tracking = m.winner; // the real bracket continues with whoever really won
      if (roundLabel === "Final") return endCampaign(true);
    }
  }

  function endCampaign(reachedTheEnd, reason) {
    showScreen("end");
    const title = $("end-title");
    const subtitle = $("end-subtitle");
    if (reachedTheEnd) {
      if (campaign.mode === "history") {
        title.textContent = "YOU WOULD HAVE WON IT";
        title.style.color = "var(--win)";
        subtitle.textContent = campaign.losses === 0
          ? `Your XV won the ${historyYear} Rugby World Cup ${campaign.wins}-0, unbeaten.`
          : `Your XV won the ${historyYear} Rugby World Cup, finishing ${campaign.wins}-${campaign.losses} — a group-stage loss didn't stop the run.`;
      } else if (campaign.mode === "worldcup") {
        title.textContent = "WORLD CHAMPIONS";
        title.style.color = "var(--win)";
        subtitle.textContent = campaign.losses === 0
          ? `Your XV won the Rugby World Cup ${campaign.wins}-0, unbeaten.`
          : `Your XV won the Rugby World Cup, finishing ${campaign.wins}-${campaign.losses} — a pool-stage loss didn't stop the run.`;
      } else if (campaign.mode === "gauntlet") {
        title.textContent = "GAUNTLET CLEARED";
        title.style.color = "var(--win)";
        subtitle.textContent = `Your XV beat all 10 of the highest Elo team-seasons ever recorded, ${campaign.wins}-0.`;
      } else {
        title.textContent = "UNDEFEATED";
        title.style.color = "var(--win)";
        subtitle.textContent = `Your XV went ${campaign.wins}-0 through every real 2027 World Cup qualifier.`;
      }
    } else if (reason === "pool") {
      title.textContent = "DIDN'T ADVANCE";
      title.style.color = "var(--loss)";
      subtitle.textContent = `Your XV finished pool play ${campaign.wins}-${campaign.losses} and missed the knockout stage.`;
    } else if (campaign.mode === "regular") {
      const good = campaign.wins >= campaign.losses;
      title.textContent = "CAMPAIGN COMPLETE";
      title.style.color = good ? "var(--win)" : "var(--loss)";
      subtitle.textContent = `Your XV finished the regular competition ${campaign.wins}-${campaign.losses}.`;
    } else if (campaign.mode === "gauntlet") {
      title.textContent = "GAUNTLET COMPLETE";
      title.style.color = "var(--loss)";
      subtitle.textContent = `Your XV played all 10 of the highest Elo team-seasons ever recorded, finishing ${campaign.wins}-${campaign.losses}.`;
    } else {
      title.textContent = "RUN OVER";
      title.style.color = "var(--loss)";
      const lastRound = campaign.log.length ? campaign.log[campaign.log.length - 1].roundLabel : "";
      subtitle.textContent = `Your unbeaten run ended at ${lastRound}, finishing ${campaign.wins}-${campaign.losses}.`;
    }
    renderNarrativeLog($("end-log"), campaign.log);
  }

  function appendResultRow(container, entry) {
    const row = document.createElement("div");
    row.className = "result-row " + (entry.won ? "win" : "loss");
    const oppLabel = entry.year
      ? `${entry.year} ${flagFor(entry.nation)} ${entry.nation}`
      : `${flagFor(entry.nation)} ${entry.nation}`;
    row.innerHTML = `
      <span class="rr-tag">${entry.won ? "Win" : "Loss"}</span>
      <span>Your XV vs ${oppLabel}</span>
      <span>${entry.myScore}–${entry.oppScore}</span>
    `;
    container.appendChild(row);
  }

  function appendNarrative(container, text) {
    const div = document.createElement("div");
    div.className = "log-narrative";
    div.textContent = text;
    container.appendChild(div);
  }

  // World Cup / History Mode results read as a story — the pool draw
  // announced up front, then each knockout opponent named before the
  // result that follows it — rather than a flat list of scores with no
  // sense of what tournament shape produced them. Regular Competition and
  // Gauntlet have no pool/bracket structure, so they stay a flat list.
  function renderNarrativeLog(container, log) {
    container.innerHTML = "";
    const isBracketMode = log.length > 0 && /^Pool /.test(log[0].roundLabel || "");
    if (!isBracketMode) {
      log.forEach((entry) => appendResultRow(container, entry));
      return;
    }

    const poolEntries = log.filter((e) => /^Pool /.test(e.roundLabel));
    const knockoutEntries = log.filter((e) => !/^Pool /.test(e.roundLabel));

    if (poolEntries.length) {
      const poolLetter = poolEntries[0].roundLabel.match(/^Pool (\S+)/)[1];
      const oppNames = poolEntries.map((e) => `${flagFor(e.nation)} ${e.nation}`).join(", ");
      appendNarrative(container, `You were drawn into Pool ${poolLetter}, with ${oppNames}.`);
      poolEntries.forEach((entry) => appendResultRow(container, entry));
    }

    knockoutEntries.forEach((entry) => {
      appendNarrative(container, `${entry.roundLabel}: ${flagFor(entry.nation)} ${entry.nation}`);
      appendResultRow(container, entry);
    });
  }

  function shareText() {
    const lines = campaign.log.map((e) => (e.won ? "🟢" : "🔴"));
    const record = `${campaign.wins}-${campaign.log.length - campaign.wins}`;
    return `Undefeated XV: ${record}\n${lines.join("")}\nBuild your own XV.`;
  }

  // ---------- World Cup mode: year picker (1987-2027) ----------
  // Reached from the completed draft screen's "World Cup" button — the
  // squad is already built, so picking a year starts the campaign directly
  // rather than resetting anything.
  function renderHistoryYearList() {
    const list = $("history-year-list");
    list.innerHTML = "";
    const years = [...Object.keys(RWC_HISTORY).sort((a, b) => a - b), "2027"];
    years.forEach((year) => {
      const isFuture = year === "2027";
      const row = document.createElement("div");
      row.className = "pick-row";
      const meta = isFuture
        ? "The real draw — hasn't been played yet"
        : `Won by ${flagFor(RWC_HISTORY[year].champion)} ${RWC_HISTORY[year].champion}`;
      row.innerHTML = `
        <div class="pr-left">
          <div class="pr-name">${year} Rugby World Cup</div>
          <div class="pr-meta">${meta}</div>
        </div>
        <div class="pr-rating">›</div>
      `;
      row.addEventListener("click", () => {
        if (isFuture) {
          startCampaign("worldcup");
        } else {
          historyYear = year;
          startCampaign("history");
        }
      });
      list.appendChild(row);
    });
  }

  // ---------- Reset ----------
  function resetDraft() {
    slots = FORMATION.map((f) => ({ ...f, player: null }));
    currentSpinEra = null;
    dateChangeUsed = false;
    teamChangeUsed = false;
    renderSlots();
    renderPickPane();
  }

  // ---------- Wiring ----------
  function wireEvents() {
    $("toggle-stats").addEventListener("change", (e) => {
      $("toggle-stats-label").textContent = e.target.checked ? "See the stats" : "No stats";
    });
    $("btn-start").addEventListener("click", () => {
      blindMode = !$("toggle-stats").checked;
      historyYear = null;
      resetDraft();
      showScreen("draft");
    });
    $("btn-history-back").addEventListener("click", () => showScreen("draft"));
    $("btn-how").addEventListener("click", () => showScreen("how"));
    $("btn-how-back").addEventListener("click", () => showScreen("home"));
    $("btn-ratings").addEventListener("click", () => {
      showScreen("ratings");
      renderRatingsList("");
    });
    $("btn-ratings-back").addEventListener("click", () => showScreen("home"));
    $("ratings-search").addEventListener("input", (e) => renderRatingsList(e.target.value));
    $("btn-spin-all").addEventListener("click", spinAll);
    $("btn-spin-date").addEventListener("click", spinChangeDate);
    $("btn-spin-team").addEventListener("click", spinChangeTeam);
    $("btn-mode-regular").addEventListener("click", () => startCampaign("regular"));
    $("btn-mode-gauntlet").addEventListener("click", () => startCampaign("gauntlet"));
    $("btn-mode-worldcup").addEventListener("click", () => {
      renderHistoryYearList();
      showScreen("historyYear");
    });
    $("btn-restart").addEventListener("click", () => showScreen("home"));
    $("btn-copy").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(shareText());
        $("btn-copy").textContent = "Copied!";
        setTimeout(() => ($("btn-copy").textContent = "Copy result"), 1500);
      } catch (e) {
        alert(shareText());
      }
    });
  }

  // ---------- Init ----------
  loadData()
    .then(() => {
      wireEvents();
      renderSlots();
      showScreen("home");
    })
    .catch((err) => {
      document.body.innerHTML = `<p style="color:#c74b3f;padding:20px;">Couldn't load player data: ${err.message}. If you opened this file directly, run a local server (see README) instead of double-clicking index.html.</p>`;
    });
})();
