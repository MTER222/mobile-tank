import http from 'http';
import { WebSocketServer } from 'ws';
import fs from 'fs';

const PORT = process.env.PORT || 3000;
const TICK_RATE = 20;
const MAP_SIZE = 40;

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(fs.readFileSync('./index.html'));
  } else {
    res.writeHead(404);
    res.end();
  }
});

const wss = new WebSocketServer({ server });

let nextId = 1;
const players = {};
const bullets = [];

function randPos() {
  return (Math.random() - 0.5) * MAP_SIZE;
}

wss.on('connection', ws => {
  const id = nextId++;
  players[id] = {
    id,
    x: randPos(),
    z: randPos(),
    rot: 0,
    hp: 100,
    input: { f: 0, r: 0, fire: 0 }
  };

  ws.send(JSON.stringify({ t: 'init', id }));

  ws.on('message', data => {
    try {
      const msg = JSON.parse(data);
      if (msg.t === 'input' && players[id]) {
        players[id].input = msg.i;
      }
    } catch {}
  });

  ws.on('close', () => {
    delete players[id];
  });
});

setInterval(() => {
  // update players
  for (const p of Object.values(players)) {
    p.rot += p.input.r * 0.1;
    const speed = p.input.f * 0.15;
    p.x += Math.sin(p.rot) * speed;
    p.z += Math.cos(p.rot) * speed;

    if (p.input.fire) {
      bullets.push({
        x: p.x,
        z: p.z,
        rot: p.rot,
        owner: p.id,
        life: 40
      });
      p.input.fire = 0;
    }
  }

  // update bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += Math.sin(b.rot) * 0.4;
    b.z += Math.cos(b.rot) * 0.4;
    b.life--;

    for (const p of Object.values(players)) {
      if (p.id !== b.owner && p.hp > 0) {
        const dx = p.x - b.x;
        const dz = p.z - b.z;
        if (dx * dx + dz * dz < 0.6) {
          p.hp -= 20;
          bullets.splice(i, 1);
          if (p.hp <= 0) {
            p.hp = 100;
            p.x = randPos();
            p.z = randPos();
          }
          break;
        }
      }
    }

    if (b.life <= 0) bullets.splice(i, 1);
  }

  const snapshot = {
    t: 'state',
    p: Object.values(players).map(p => ({
      id: p.id,
      x: p.x,
      z: p.z,
      r: p.rot,
      hp: p.hp
    })),
    b: bullets.map(b => ({ x: b.x, z: b.z }))
  };

  const data = JSON.stringify(snapshot);
  wss.clients.forEach(c => c.readyState === 1 && c.send(data));
}, 1000 / TICK_RATE);

server.listen(PORT, () => {
  console.log('Server running on port', PORT);
});
