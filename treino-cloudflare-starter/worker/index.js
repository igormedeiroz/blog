const TYPES = ["ginásio","dança","corrida","caminhada","ciclismo","mobilidade","outro"];
const INTENSITIES = ["leve","moderada","intensa"];
const cors = (req, env) => {
  const origin = req.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGIN || "*").split(",").map(x=>x.trim());
  return {"Access-Control-Allow-Origin":allowed.includes("*")?"*":(allowed.includes(origin)?origin:(allowed[0]||"")),
    "Access-Control-Allow-Methods":"GET,POST,PUT,DELETE,OPTIONS","Access-Control-Allow-Headers":"Content-Type",
    "Access-Control-Max-Age":"86400","Vary":"Origin"};
};
const json = (req,env,data,status=200)=>new Response(JSON.stringify(data,null,2),{
  status,headers:{...cors(req,env),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const fail = (m)=>({error:m});
async function body(req){try{return await req.json()}catch{throw Error("JSON inválido.")}}
function validate(x){
  if(!TYPES.includes(x.activity_type)) throw Error("Modalidade inválida.");
  if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(x.session_date||"")) throw Error("Data deve estar em YYYY-MM-DD.");
  const mins=Number(x.duration_minutes);
  if(!Number.isInteger(mins)||mins<1||mins>1440) throw Error("Duração deve ser de 1 a 1440 minutos.");
  const intensity=x.intensity||"moderada";
  if(!INTENSITIES.includes(intensity)) throw Error("Intensidade inválida.");
  const distance=x.distance_km===""||x.distance_km==null?null:Number(x.distance_km);
  if(distance!==null&&(!Number.isFinite(distance)||distance<0)) throw Error("Distância inválida.");
  if(String(x.notes||"").length>2000) throw Error("Notas demasiado longas.");
  const exercises=(x.exercises||[]).map((e,i)=>{
    if(!String(e.name||"").trim()) throw Error("Todos os exercícios precisam de nome.");
    const sets=e.sets===""||e.sets==null?null:Number(e.sets);
    const weight=e.weight_kg===""||e.weight_kg==null?null:Number(e.weight_kg);
    const rir=e.effort_rir===""||e.effort_rir==null?null:Number(e.effort_rir);
    if(sets!==null&&(!Number.isInteger(sets)||sets<0||sets>100))throw Error("Séries inválidas.");
    if(weight!==null&&(!Number.isFinite(weight)||weight<0))throw Error("Carga inválida.");
    if(rir!==null&&(!Number.isInteger(rir)||rir<0||rir>10))throw Error("RIR deve estar entre 0 e 10.");
    return {name:String(e.name).trim().slice(0,160),sets,reps:String(e.reps||"").slice(0,80),weight_kg:weight,effort_rir:rir,notes:String(e.notes||"").slice(0,500),sort_order:i};
  });
  if(exercises.length>100)throw Error("Máximo de 100 exercícios por sessão.");
  return {activity_type:x.activity_type,session_date:x.session_date,start_time:x.start_time||null,end_time:x.end_time||null,
    duration_minutes:mins,intensity,distance_km:distance,notes:String(x.notes||""),exercises};
}
async function getSession(db,id){
 const s=await db.prepare("SELECT * FROM workout_sessions WHERE id=?").bind(id).first(); if(!s)return null;
 const e=await db.prepare("SELECT id,exercise_name AS name,sets,reps,weight_kg,effort_rir,notes FROM workout_exercises WHERE session_id=? ORDER BY sort_order,id").bind(id).all();
 s.exercises=e.results; return s;
}
async function addExercises(db,id,arr){
 for(const e of arr) await db.prepare("INSERT INTO workout_exercises(session_id,exercise_name,sets,reps,weight_kg,effort_rir,notes,sort_order) VALUES(?,?,?,?,?,?,?,?)")
 .bind(id,e.name,e.sets,e.reps,e.weight_kg,e.effort_rir,e.notes,e.sort_order).run();
}
export default {async fetch(req,env){
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req,env)});
 if(!env.DB)return json(req,env,fail("Binding D1 DB não configurado."),500);
 const u=new URL(req.url),p=u.pathname.replace(/\\/$/,"")||"/",db=env.DB;
 try{
  if(p==="/api/health"&&req.method==="GET")return json(req,env,{ok:true});
  if(p==="/api/sessoes"&&req.method==="GET"){
   let sql="SELECT id,session_date FROM workout_sessions WHERE 1=1",a=[];
   for(const [q,col,op] of [["from","session_date",">="],["to","session_date","<="]]){
    const v=u.searchParams.get(q);if(v&&/^\\d{4}-\\d{2}-\\d{2}$/.test(v)){sql+=` AND ${col} ${op} ?`;a.push(v);}
   }
   const type=u.searchParams.get("type");if(TYPES.includes(type)){sql+=" AND activity_type=?";a.push(type);}
   sql+=" ORDER BY session_date DESC,id DESC LIMIT ?";a.push(Math.min(500,Math.max(1,Number(u.searchParams.get("limit")||100))));
   const r=await db.prepare(sql).bind(...a).all(),sessions=[];
   for(const row of r.results)sessions.push(await getSession(db,row.id));
   return json(req,env,{count:sessions.length,sessions});
  }
  if(p==="/api/estatisticas"&&req.method==="GET"){
   const from=u.searchParams.get("from")||"0001-01-01",to=u.searchParams.get("to")||"9999-12-31";
   const totals=await db.prepare("SELECT COUNT(*) sessions,COALESCE(SUM(duration_minutes),0) minutes,COUNT(DISTINCT session_date) active_days FROM workout_sessions WHERE session_date BETWEEN ? AND ?").bind(from,to).first();
   const types=await db.prepare("SELECT activity_type,COUNT(*) sessions,SUM(duration_minutes) minutes FROM workout_sessions WHERE session_date BETWEEN ? AND ? GROUP BY activity_type ORDER BY minutes DESC").bind(from,to).all();
   return json(req,env,{from,to,totals,byType:types.results});
  }
  if(p==="/api/sessoes"&&req.method==="POST"){
   const x=validate(await body(req));
   const r=await db.prepare("INSERT INTO workout_sessions(activity_type,session_date,start_time,end_time,duration_minutes,intensity,distance_km,notes) VALUES(?,?,?,?,?,?,?,?)")
   .bind(x.activity_type,x.session_date,x.start_time,x.end_time,x.duration_minutes,x.intensity,x.distance_km,x.notes).run();
   await addExercises(db,r.meta.last_row_id,x.exercises);return json(req,env,await getSession(db,r.meta.last_row_id),201);
  }
  const m=p.match(/^\\/api\\/sessoes\\/(\\d+)$/);
  if(m){const id=Number(m[1]);
   if(req.method==="GET"){const s=await getSession(db,id);return s?json(req,env,s):json(req,env,fail("Sessão não encontrada."),404);}
   if(req.method==="PUT"){
    const x=validate(await body(req));if(!await getSession(db,id))return json(req,env,fail("Sessão não encontrada."),404);
    await db.prepare("UPDATE workout_sessions SET activity_type=?,session_date=?,start_time=?,end_time=?,duration_minutes=?,intensity=?,distance_km=?,notes=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?")
    .bind(x.activity_type,x.session_date,x.start_time,x.end_time,x.duration_minutes,x.intensity,x.distance_km,x.notes,id).run();
    await db.prepare("DELETE FROM workout_exercises WHERE session_id=?").bind(id).run();await addExercises(db,id,x.exercises);
    return json(req,env,await getSession(db,id));
   }
   if(req.method==="DELETE"){if(!await getSession(db,id))return json(req,env,fail("Sessão não encontrada."),404);
    await db.prepare("DELETE FROM workout_sessions WHERE id=?").bind(id).run();return json(req,env,{deleted:true,id});}
  }
  return json(req,env,fail("Endpoint não encontrado."),404);
 }catch(e){return json(req,env,fail(e.message||"Erro interno."),400);}
}};
