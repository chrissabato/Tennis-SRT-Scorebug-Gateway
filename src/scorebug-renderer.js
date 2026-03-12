const { createCanvas } = require('canvas');

const WIDTH = 640;
const HEIGHT = 120;

const COLOR_BG = 'rgba(10, 10, 30, 0.88)';
const COLOR_GOLD = '#c8a84b';
const COLOR_WHITE = '#ffffff';
const COLOR_MUTED = '#aaaacc';

function renderScorebugs(canvas, matchData) {
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Left accent bar
  ctx.fillStyle = COLOR_GOLD;
  ctx.fillRect(0, 0, 4, HEIGHT);

  if (!matchData) {
    ctx.fillStyle = COLOR_MUTED;
    ctx.font = '14px Arial';
    ctx.fillText('No match data', 20, 65);
    return canvas.toBuffer('image/jpeg', { quality: 0.85 });
  }

  const away = matchData.away || {};
  const home = matchData.home || {};
  const scores = matchData.scores || {};
  const status = matchData.status || '';
  const court = matchData.court || '';
  const serving = matchData.serving; // 'away' | 'home' | null

  // Helper to draw a team row
  function drawTeamRow(team, rowY, isServing) {
    const midY = rowY + 23;

    // Team label
    ctx.fillStyle = COLOR_MUTED;
    ctx.font = '10px Arial';
    ctx.fillText((team.team || '').toUpperCase(), 14, rowY + 12);

    // Player name
    ctx.fillStyle = COLOR_WHITE;
    ctx.font = 'bold 14px Arial';
    ctx.fillText(team.name || team.player || '', 14, rowY + 28);

    // Serve dot
    if (isServing) {
      ctx.beginPath();
      ctx.arc(370, midY, 5, 0, Math.PI * 2);
      ctx.fillStyle = COLOR_GOLD;
      ctx.fill();
    }

    // Score columns
    ctx.fillStyle = COLOR_WHITE;
    ctx.font = '18px "Courier New", monospace';

    const side = team === away ? 'away' : 'home';
    const setScores = scores[side] || {};
    const sets = setScores.sets || [];
    const tbs = setScores.tiebreaks || [];
    const game = setScores.game !== undefined ? setScores.game : '';

    let x = 390;
    for (let s = 0; s < 3; s++) {
      const setVal = sets[s] !== undefined ? String(sets[s]) : '-';
      ctx.fillText(setVal, x, rowY + 28);

      // Tiebreak superscript
      if (tbs[s] !== undefined) {
        ctx.font = '10px Arial';
        ctx.fillStyle = COLOR_MUTED;
        ctx.fillText(String(tbs[s]), x + 16, rowY + 18);
        ctx.font = '18px "Courier New", monospace';
        ctx.fillStyle = COLOR_WHITE;
      }
      x += 52;
    }

    // Current game score
    ctx.fillStyle = COLOR_GOLD;
    ctx.font = 'bold 18px "Courier New", monospace';
    ctx.fillText(String(game), x, rowY + 28);
  }

  // Away row (y=8)
  drawTeamRow(away, 8, serving === 'away');

  // Divider
  ctx.fillStyle = 'rgba(200,168,75,0.3)';
  ctx.fillRect(14, 54, WIDTH - 28, 1);

  // Home row (y=58)
  drawTeamRow(home, 58, serving === 'home');

  // Status bar
  ctx.fillStyle = 'rgba(10,10,30,0.95)';
  ctx.fillRect(0, 108, WIDTH, 12);
  ctx.fillStyle = COLOR_MUTED;
  ctx.font = '10px Arial';
  const statusText = [status, court].filter(Boolean).join(' | ');
  ctx.fillText(statusText, WIDTH / 2 - ctx.measureText(statusText).width / 2, 118);

  return canvas.toBuffer('image/jpeg', { quality: 0.85 });
}

function createScoreBugCanvas() {
  return createCanvas(WIDTH, HEIGHT);
}

module.exports = { renderScorebugs, createScoreBugCanvas };
