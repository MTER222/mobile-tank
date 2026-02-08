import http from 'http';
import fs from 'fs';
import { WebSocketServer } from 'ws';

const PORT = process.env.PORT || 3000;
const TICK = 20;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(fs.readFileSync('./index.html'));
});

const wss = new WebSocketServer({ server });

let idSeq = 1;
const players = {};
const bullets = [];

function rand() { return (Math.random() - 0.5) * 30; }

wss.on('connection', ws => {
  const id = idSeq++;
  players[id] = {
    id,
    name: 'Player',
    x: rand(),
    z: rand(),
    rot: 0,
    hp: 100,
    input: { f:0, r:0, fire:0 }
  };

  ws.send(JSON.stringify({ t:'init', id }));

  ws.on('message', d => {
    const m = JSON.parse(d);
    if (m.n) players[id].name = m.n;
    if (m.i) players[id].input = m.i;
  });

  ws.on('close', () => delete players[id]);
});

setInterval(() => {
  for (const p of Object.values(players)) {
    p.rot += p.input.r * 0.08;
    const sp = p.input.f * 0.2;
    p.x += Math.sin(p.rot) * sp;
    p.z += Math.cos(p.rot) * sp;

    if (p.input.fire) {
      bullets.push({
        x:p.x, z:p.z, r:p.rot, o:p.id, life:40
      });
      p.input.fire = 0;
    }
  }

  for (let i = bullets.length-1; i>=0; i--) {
    const b = bullets[i];
    b.x += Math.sin(b.r)*0.5;
    b.z += Math.cos(b.r)*0.5;
    b.life--;

    for (const p of Object.values(players)) {
      if (p.id!==b.o) {
        const dx=p.x-b.x, dz=p.z-b.z;
        if (dx*dx+dz*dz<0.7) {
          p.hp-=20;
          bullets.splice(i,1);
          if (p.hp<=0) {
            p.hp=100; p.x=rand(); p.z=rand();
          }
          break;
        }
      }
    }
    if (b.life<=0) bullets.splice(i,1);
  }

  const snap = {
    t:'state',
    p:Object.values(players).map(p=>({
      id:p.id,n:p.name,x:p.x,z:p.z,r:p.rot,h:p.hp
    })),
    b:bullets.map(b=>({x:b.x,z:b.z}))
  };

  const data = JSON.stringify(snap);
  wss.clients.forEach(c=>c.readyState===1&&c.send(data));
},1000/TICK);

server.listen(PORT);
