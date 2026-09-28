const express=require("express");
const path=require("path"), fs=require("fs"), jwt=require("jsonwebtoken"), bcrypt=require("bcryptjs");
const Database=require("better-sqlite3");
const XLSX=require("xlsx");
const app=express();
const PORT=process.env.PORT||3000;
const SECRET=process.env.JWT_SECRET||"JCR_CAMBIAR_ESTA_CLAVE";
const dbDir=path.join(__dirname,"data"); fs.mkdirSync(dbDir,{recursive:true});
const db=new Database(path.join(dbDir,"jcr.db"));
db.pragma("journal_mode=WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT,username TEXT UNIQUE,password TEXT,role TEXT,active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS plans(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT UNIQUE,mbps INTEGER,price INTEGER,active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS clients(id INTEGER PRIMARY KEY AUTOINCREMENT,document TEXT UNIQUE,name TEXT,phone TEXT,address TEXT,email TEXT,plan_id INTEGER,due_day INTEGER DEFAULT 1,status TEXT DEFAULT 'Activo',notes TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(plan_id) REFERENCES plans(id));
CREATE TABLE IF NOT EXISTS invoices(id INTEGER PRIMARY KEY AUTOINCREMENT,client_id INTEGER,period TEXT,amount INTEGER,due_date TEXT,status TEXT DEFAULT 'Pendiente',paid_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(client_id,period),FOREIGN KEY(client_id) REFERENCES clients(id));
`);
const admin=db.prepare("SELECT id FROM users WHERE username=?").get("admin");
if(!admin) db.prepare("INSERT INTO users(name,username,password,role) VALUES(?,?,?,?)").run("Administrador","admin",bcrypt.hashSync("admin123",10),"admin");
const count=db.prepare("SELECT COUNT(*) c FROM plans").get().c;
if(!count){
 const ins=db.prepare("INSERT INTO plans(name,mbps,price) VALUES(?,?,?)");
 ins.run("Plan 5 Megas Residencial",5,40000); ins.run("Plan 6 Megas Residencial",6,50000); ins.run("Plan 7 Megas Residencial",7,60000);
}
app.use(express.json({limit:"10mb"})); app.use(express.static(path.join(__dirname,"public")));
function auth(req,res,next){try{const h=req.headers.authorization||""; if(!h.startsWith("Bearer ")) return res.status(401).json({error:"No autorizado"}); req.user=jwt.verify(h.slice(7),SECRET); next()}catch(e){res.status(401).json({error:"Sesión inválida"})}}
function adminOnly(req,res,next){if(req.user.role!=="admin") return res.status(403).json({error:"Permiso insuficiente"}); next()}
app.post("/api/login",(req,res)=>{const u=db.prepare("SELECT * FROM users WHERE username=? AND active=1").get(req.body.username); if(!u||!bcrypt.compareSync(req.body.password,u.password)) return res.status(401).json({error:"Usuario o contraseña incorrectos"}); const token=jwt.sign({id:u.id,name:u.name,role:u.role},SECRET,{expiresIn:"12h"}); res.json({token,user:{id:u.id,name:u.name,role:u.role}})});
app.get("/api/me",auth,(req,res)=>res.json(req.user));
app.get("/api/dashboard",auth,(req,res)=>{
 const clients=db.prepare("SELECT COUNT(*) c FROM clients").get().c;
 const active=db.prepare("SELECT COUNT(*) c FROM clients WHERE status='Activo'").get().c;
 const pending=db.prepare("SELECT COUNT(*) c FROM invoices WHERE status='Pendiente'").get().c;
 const paid=db.prepare("SELECT COALESCE(SUM(amount),0) s FROM invoices WHERE status='Pagada' AND substr(paid_at,1,7)=substr(date('now'),1,7)").get().s;
 const cartera=db.prepare("SELECT COALESCE(SUM(amount),0) s FROM invoices WHERE status='Pendiente'").get().s;
 res.json({clients,active,pending,paid,cartera});
});
app.get("/api/plans",auth,(req,res)=>res.json(db.prepare("SELECT * FROM plans ORDER BY mbps").all()));
app.post("/api/plans",auth,adminOnly,(req,res)=>{try{const r=db.prepare("INSERT INTO plans(name,mbps,price) VALUES(?,?,?)").run(req.body.name,req.body.mbps,req.body.price);res.json({id:r.lastInsertRowid})}catch(e){res.status(400).json({error:e.message})}});
app.get("/api/clients",auth,(req,res)=>res.json(db.prepare("SELECT c.*,p.name plan_name,p.price plan_price,p.mbps FROM clients c LEFT JOIN plans p ON p.id=c.plan_id ORDER BY c.name").all()));
app.post("/api/clients",auth,(req,res)=>{try{const r=db.prepare("INSERT INTO clients(document,name,phone,address,email,plan_id,due_day,status,notes) VALUES(?,?,?,?,?,?,?,?,?)").run(req.body.document,req.body.name,req.body.phone,req.body.address||"",req.body.email||"",req.body.plan_id,req.body.due_day||1,req.body.status||"Activo",req.body.notes||"");res.json({id:r.lastInsertRowid})}catch(e){res.status(400).json({error:e.message})}});
app.put("/api/clients/:id",auth,(req,res)=>{try{db.prepare("UPDATE clients SET document=?,name=?,phone=?,address=?,email=?,plan_id=?,due_day=?,status=?,notes=? WHERE id=?").run(req.body.document,req.body.name,req.body.phone,req.body.address||"",req.body.email||"",req.body.plan_id,req.body.due_day||1,req.body.status||"Activo",req.body.notes||"",req.params.id);res.json({ok:true})}catch(e){res.status(400).json({error:e.message})}});
app.delete("/api/clients/:id",auth,adminOnly,(req,res)=>{db.prepare("DELETE FROM clients WHERE id=?").run(req.params.id);res.json({ok:true})});
app.get("/api/invoices",auth,(req,res)=>res.json(db.prepare("SELECT i.*,c.name client_name,c.phone,p.name plan_name FROM invoices i JOIN clients c ON c.id=i.client_id LEFT JOIN plans p ON p.id=c.plan_id ORDER BY i.id DESC").all()));
app.post("/api/invoices/generate",auth,(req,res)=>{const period=req.body.period||new Date().toISOString().slice(0,7), clients=db.prepare("SELECT c.*,p.price FROM clients c JOIN plans p ON p.id=c.plan_id WHERE c.status='Activo'").all(); const ins=db.prepare("INSERT OR IGNORE INTO invoices(client_id,period,amount,due_date) VALUES(?,?,?,?)"); let n=0; const tx=db.transaction(()=>clients.forEach(c=>{const day=String(c.due_day||1).padStart(2,"0"); ins.run(c.id,period,c.price,`${period}-${day}`); n++})); tx(); res.json({created:n,period})});
app.post("/api/invoices/:id/pay",auth,(req,res)=>{db.prepare("UPDATE invoices SET status='Pagada',paid_at=datetime('now') WHERE id=?").run(req.params.id);res.json({ok:true})});
app.get("/api/users",auth,adminOnly,(req,res)=>res.json(db.prepare("SELECT id,name,username,role,active FROM users ORDER BY name").all()));
app.post("/api/users",auth,adminOnly,(req,res)=>{try{const r=db.prepare("INSERT INTO users(name,username,password,role) VALUES(?,?,?,?)").run(req.body.name,req.body.username,bcrypt.hashSync(req.body.password,10),req.body.role||"operador");res.json({id:r.lastInsertRowid})}catch(e){res.status(400).json({error:e.message})}});
app.get("/api/export/clients",auth,(req,res)=>{const rows=db.prepare("SELECT c.document,c.name,c.phone,c.address,c.email,p.name plan,c.due_day,c.status,c.notes FROM clients c LEFT JOIN plans p ON p.id=c.plan_id").all(); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),"Clientes"); const buf=XLSX.write(wb,{type:"buffer",bookType:"xlsx"}); res.setHeader("Content-Disposition","attachment; filename=JCR_Clientes.xlsx"); res.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").send(buf)});
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`JCR Telecomunicaciones en http://localhost:${PORT}`));