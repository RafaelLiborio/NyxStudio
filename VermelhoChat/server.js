const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const http = require('node:http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 100_000 });
const PORT = Number(process.env.PORT) || 3000;
const DATA_FILE = path.join(__dirname, 'brasa-data.json');
const sessions = new Map();
const online = new Map();

function loadData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { users: [], guilds: [], channels: [], messages: [], reactions: [], dms: [], dmMessages: [], invites: [] }; }
}
let db = loadData();
for (const key of ['users','guilds','channels','messages','reactions','dms','dmMessages','invites']) db[key] ||= [];
function save() {
  const temp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(db, null, 2));
  fs.renameSync(temp, DATA_FILE);
}
function id() { return crypto.randomUUID(); }
function token() { return crypto.randomBytes(18).toString('base64url'); }
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (err, key) => err ? reject(err) : resolve(`${salt}:${key.toString('hex')}`)));
}
async function passwordMatches(password, stored) {
  const [salt, expected] = (stored || '').split(':');
  if (!salt || !expected) return false;
  const actual = await hashPassword(password, salt);
  const a = Buffer.from(actual.split(':')[1], 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function publicUser(user) { return { id: user.id, username: user.username, displayName: user.displayName, avatar: user.avatar || '' }; }
function cookie(req, name) { return (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${name}=`))?.slice(name.length + 1); }
function auth(req, res, next) {
  const session = sessions.get(cookie(req, 'brasa_session'));
  const user = session && db.users.find(x => x.id === session.userId);
  if (!user) return res.status(401).json({ error: 'Entre na sua conta para continuar.' });
  req.user = user; next();
}
function member(guildId, userId) { return db.guilds.find(g => g.id === guildId)?.members.find(m => m.userId === userId); }
function canManage(guildId, userId) { const m = member(guildId, userId); return m && ['owner','admin'].includes(m.role); }
function emitPresence(userId, state) {
  if (state === 'online') online.set(userId, (online.get(userId) || 0) + 1);
  else { const n = (online.get(userId) || 1) - 1; if (n <= 0) online.delete(userId); else online.set(userId, n); }
  io.emit('presence', { userId, state: online.has(userId) ? 'online' : 'offline' });
}
function replyError(res, error, status = 400) { return res.status(status).json({ error }); }
function cleanText(value, max = 2000) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/app.js', (_req, res) => res.sendFile(path.join(__dirname, 'app.js')));
app.get('/style.css', (_req, res) => res.sendFile(path.join(__dirname, 'style.css')));
app.get('/voice.css', (_req, res) => res.sendFile(path.join(__dirname, 'voice.css')));
app.get('/api/session', auth, (req, res) => res.json({ user: publicUser(req.user) }));

app.post('/api/register', async (req, res) => {
  const username = cleanText(req.body.username, 24).toLowerCase().replace(/[^a-z0-9_.-]/g, '');
  const displayName = cleanText(req.body.displayName, 32) || username;
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (username.length < 3 || password.length < 8) return replyError(res, 'Use um nome com pelo menos 3 caracteres e senha com pelo menos 8.');
  if (db.users.some(u => u.username === username)) return replyError(res, 'Esse nome de usuário já está em uso.', 409);
  const user = { id: id(), username, displayName, passwordHash: await hashPassword(password), createdAt: Date.now() };
  db.users.push(user); save();
  const sid = token(); sessions.set(sid, { userId: user.id }); res.cookie('brasa_session', sid, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 30 * 86400000 });
  res.json({ user: publicUser(user) });
});
app.post('/api/login', async (req, res) => {
  const username = cleanText(req.body.username, 24).toLowerCase();
  const user = db.users.find(u => u.username === username);
  if (!user || !await passwordMatches(String(req.body.password || ''), user.passwordHash)) return replyError(res, 'Usuário ou senha incorretos.', 401);
  const sid = token(); sessions.set(sid, { userId: user.id }); res.cookie('brasa_session', sid, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 30 * 86400000 });
  res.json({ user: publicUser(user) });
});
app.post('/api/logout', (req, res) => { sessions.delete(cookie(req, 'brasa_session')); res.clearCookie('brasa_session'); res.json({ ok: true }); });

app.get('/api/guilds', auth, (req, res) => res.json(db.guilds.filter(g => member(g.id, req.user.id)).map(g => ({ id:g.id,name:g.name,icon:g.icon,role:member(g.id,req.user.id).role,channels:db.channels.filter(c=>c.guildId===g.id) }))));
app.post('/api/guilds', auth, (req, res) => {
  const name = cleanText(req.body.name, 48); if (name.length < 2) return replyError(res, 'O nome do servidor precisa ter ao menos 2 caracteres.');
  const guild = { id:id(), name, icon:name.slice(0,1).toUpperCase(), ownerId:req.user.id, members:[{ userId:req.user.id, role:'owner', joinedAt:Date.now() }] };
  db.guilds.push(guild); const channel={id:id(),guildId:guild.id,name:'geral',type:'text',topic:'Conversa da comunidade.'}; db.channels.push(channel); save();
  res.json({ id:guild.id,name:guild.name,icon:guild.icon,role:'owner',channels:[channel] });
});
app.get('/api/guilds/:id/members', auth, (req,res)=>{
  const g=db.guilds.find(x=>x.id===req.params.id); if(!g||!member(g.id,req.user.id))return replyError(res,'Servidor não encontrado.',404);
  res.json(g.members.map(m=>({...publicUser(db.users.find(u=>u.id===m.userId)),role:m.role,state:online.has(m.userId)?'online':'offline'})).filter(u=>u.id));
});
app.post('/api/guilds/:id/channels', auth, (req,res)=>{
  if(!canManage(req.params.id,req.user.id))return replyError(res,'Somente administradores podem criar canais.',403);
  const name=cleanText(req.body.name,32).toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9_-]/g,''); if(name.length<2)return replyError(res,'Nome de canal inválido.');
  const type=req.body.type==='voice'?'voice':'text'; const channel={id:id(),guildId:req.params.id,name,type,topic:cleanText(req.body.topic,120)};db.channels.push(channel);save();res.json(channel);
});
app.post('/api/guilds/:id/invites', auth, (req,res)=>{
  if(!member(req.params.id,req.user.id))return replyError(res,'Você não faz parte deste servidor.',403);
  const invite={code:token().slice(0,10),guildId:req.params.id,createdBy:req.user.id,expiresAt:Date.now()+7*86400000};db.invites.push(invite);save();res.json({code:invite.code});
});
app.post('/api/invites/:code/join', auth, (req,res)=>{
  const invite=db.invites.find(x=>x.code===req.params.code&&x.expiresAt>Date.now());const guild=invite&&db.guilds.find(g=>g.id===invite.guildId);if(!guild)return replyError(res,'Convite inválido ou expirado.',404);
  if(!member(guild.id,req.user.id))guild.members.push({userId:req.user.id,role:'member',joinedAt:Date.now()});save();res.json({id:guild.id,name:guild.name,icon:guild.icon,role:member(guild.id,req.user.id).role,channels:db.channels.filter(c=>c.guildId===guild.id)});
});

app.get('/api/channels/:id/messages', auth, (req,res)=>{
  const channel=db.channels.find(c=>c.id===req.params.id);if(!channel||!member(channel.guildId,req.user.id))return replyError(res,'Canal não encontrado.',404);
  const messages=db.messages.filter(m=>m.channelId===channel.id).slice(-100).map(m=>({...m,user:publicUser(db.users.find(u=>u.id===m.userId)),reactions:db.reactions.filter(r=>r.messageId===m.id)}));res.json(messages);
});
app.post('/api/channels/:id/messages', auth, (req,res)=>{
  const channel=db.channels.find(c=>c.id===req.params.id);if(!channel||channel.type!=='text'||!member(channel.guildId,req.user.id))return replyError(res,'Canal não encontrado.',404);
  const text=cleanText(req.body.text);if(!text)return replyError(res,'A mensagem está vazia.');const message={id:id(),channelId:channel.id,userId:req.user.id,text,createdAt:Date.now(),editedAt:null};db.messages.push(message);save();const result={...message,user:publicUser(req.user),reactions:[]};io.to(`channel:${channel.id}`).emit('message:new',result);res.json(result);
});
app.patch('/api/messages/:id', auth, (req,res)=>{
  const m=db.messages.find(x=>x.id===req.params.id);if(!m||m.userId!==req.user.id)return replyError(res,'Mensagem não encontrada ou sem permissão.',404);const text=cleanText(req.body.text);if(!text)return replyError(res,'A mensagem está vazia.');m.text=text;m.editedAt=Date.now();save();io.to(`channel:${m.channelId}`).emit('message:edit',{id:m.id,text:m.text,editedAt:m.editedAt});res.json(m);
});
app.delete('/api/messages/:id', auth, (req,res)=>{
  const m=db.messages.find(x=>x.id===req.params.id);if(!m)return replyError(res,'Mensagem não encontrada.',404);const c=db.channels.find(x=>x.id===m.channelId);if(m.userId!==req.user.id&&!canManage(c?.guildId,req.user.id))return replyError(res,'Sem permissão para excluir.',403);db.messages=db.messages.filter(x=>x.id!==m.id);db.reactions=db.reactions.filter(x=>x.messageId!==m.id);save();io.to(`channel:${m.channelId}`).emit('message:delete',{id:m.id});res.json({ok:true});
});
app.post('/api/messages/:id/reactions', auth, (req,res)=>{
  const m=db.messages.find(x=>x.id===req.params.id);const c=m&&db.channels.find(x=>x.id===m.channelId);if(!m||!member(c?.guildId,req.user.id))return replyError(res,'Mensagem não encontrada.',404);const emoji=cleanText(req.body.emoji,8);if(!emoji)return replyError(res,'Emoji inválido.');let r=db.reactions.find(x=>x.messageId===m.id&&x.userId===req.user.id&&x.emoji===emoji);if(r)db.reactions=db.reactions.filter(x=>x!==r);else db.reactions.push({messageId:m.id,userId:req.user.id,emoji});save();const all=db.reactions.filter(x=>x.messageId===m.id);io.to(`channel:${m.channelId}`).emit('message:reactions',{id:m.id,reactions:all});res.json(all);
});

app.get('/api/users/search',auth,(req,res)=>{const q=cleanText(req.query.q,24).toLowerCase();res.json(q?db.users.filter(u=>u.id!==req.user.id&&u.username.includes(q)).slice(0,10).map(publicUser):[])});
app.get('/api/dms',auth,(req,res)=>res.json(db.dms.filter(d=>d.userIds.includes(req.user.id)).map(d=>({id:d.id,users:d.userIds.filter(id=>id!==req.user.id).map(id=>publicUser(db.users.find(u=>u.id===id))).filter(Boolean)}))));
app.post('/api/dms',auth,(req,res)=>{const other=db.users.find(u=>u.id===req.body.userId);if(!other||other.id===req.user.id)return replyError(res,'Usuário não encontrado.',404);let dm=db.dms.find(d=>d.userIds.includes(req.user.id)&&d.userIds.includes(other.id)&&d.userIds.length===2);if(!dm){dm={id:id(),userIds:[req.user.id,other.id]};db.dms.push(dm);save()}res.json({id:dm.id,users:[publicUser(other)]})});
app.get('/api/dms/:id/messages',auth,(req,res)=>{const dm=db.dms.find(d=>d.id===req.params.id&&d.userIds.includes(req.user.id));if(!dm)return replyError(res,'Conversa não encontrada.',404);res.json(db.dmMessages.filter(m=>m.dmId===dm.id).slice(-100).map(m=>({...m,user:publicUser(db.users.find(u=>u.id===m.userId))})))});
app.post('/api/dms/:id/messages',auth,(req,res)=>{const dm=db.dms.find(d=>d.id===req.params.id&&d.userIds.includes(req.user.id));if(!dm)return replyError(res,'Conversa não encontrada.',404);const text=cleanText(req.body.text);if(!text)return replyError(res,'A mensagem está vazia.');const m={id:id(),dmId:dm.id,userId:req.user.id,text,createdAt:Date.now()};db.dmMessages.push(m);save();const result={...m,user:publicUser(req.user)};io.to(`dm:${dm.id}`).emit('dm:new',result);res.json(result)});

const parseSocketSession = socket => { const sid=(socket.handshake.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('brasa_session='))?.slice('brasa_session='.length);return sid&&sessions.get(sid); };
io.use((socket,next)=>{const s=parseSocketSession(socket);const user=s&&db.users.find(u=>u.id===s.userId);if(!user)return next(new Error('Faça login para conectar.'));socket.user=user;next()});
io.on('connection',socket=>{
  const user=socket.user;let voiceRoom=null;socket.join(`user:${user.id}`);emitPresence(user.id,'online');
  socket.on('subscribe:channel',channelId=>{const c=db.channels.find(x=>x.id===channelId);if(c&&member(c.guildId,user.id))socket.join(`channel:${c.id}`)});
  socket.on('subscribe:dm',dmId=>{const d=db.dms.find(x=>x.id===dmId&&x.userIds.includes(user.id));if(d)socket.join(`dm:${d.id}`)});
  socket.on('typing',({channelId,dmId}={})=>{if(channelId){const c=db.channels.find(x=>x.id===channelId);if(c&&member(c.guildId,user.id))socket.to(`channel:${c.id}`).emit('typing',{user:publicUser(user),channelId})}else if(dmId){const d=db.dms.find(x=>x.id===dmId&&x.userIds.includes(user.id));if(d)socket.to(`dm:${d.id}`).emit('typing',{user:publicUser(user),dmId})}});
  socket.on('voice-join',({room,name}={})=>{if(voiceRoom)leaveVoice();if(typeof room!=='string'||!/^brasa-[a-z0-9-]{1,50}$/.test(room))return;const channel=db.channels.find(c=>c.id===room.slice(6)&&c.type==='voice');if(!channel||!member(channel.guildId,user.id))return;const members=io.sockets.adapter.rooms.get(room);if(members&&members.size>=8){socket.emit('voice-error',{message:'A sala está cheia.'});return}const peers=[...(members||[])].map(peerId=>({id:peerId,name:io.sockets.sockets.get(peerId)?.user?.displayName||'Participante'}));voiceRoom=room;socket.join(room);socket.emit('voice-peers',peers);socket.to(room).emit('voice-peer-joined',{id:socket.id,name:cleanText(name,32)||user.displayName})});
  const leaveVoice=()=>{if(!voiceRoom)return;const room=voiceRoom;voiceRoom=null;socket.leave(room);socket.to(room).emit('voice-peer-left',{id:socket.id})};
  socket.on('voice-leave',leaveVoice);
  socket.on('voice-signal',({to,data}={})=>{if(voiceRoom&&typeof to==='string'&&data&&io.sockets.adapter.rooms.get(voiceRoom)?.has(to))io.to(to).emit('voice-signal',{from:socket.id,data})});
  socket.on('disconnecting',()=>{if(voiceRoom)socket.to(voiceRoom).emit('voice-peer-left',{id:socket.id})});
  socket.on('disconnect',()=>emitPresence(user.id,'offline'));
});

server.listen(PORT,'0.0.0.0',()=>console.log(`Brasa disponível em http://localhost:${PORT}`));
