'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Task } from '../lib/supabase'

const CATEGORIES = [
  { id: 'work',     label: 'Работа',   color: '#6366f1', bg: '#ede9fe' },
  { id: 'study',    label: 'Учёба',    color: '#0ea5e9', bg: '#e0f2fe' },
  { id: 'personal', label: 'Личное',   color: '#10b981', bg: '#d1fae5' },
  { id: 'health',   label: 'Здоровье', color: '#f59e0b', bg: '#fef3c7' },
]
const CAT_MAP = Object.fromEntries(CATEGORIES.map(c => [c.id, c]))

function today() { return new Date().toISOString().slice(0, 10) }
function daysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate() }
function firstWeekday(y: number, m: number) { return (new Date(y, m, 1).getDay() + 6) % 7 }
function formatDate(iso: string) { const [y,m,d] = iso.split('-'); return `${d}.${m}.${y}` }
function monthLabel(y: number, m: number) {
  return new Date(y, m, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
}
function isPast(iso: string) { return iso < today() }

export default function TaskPlanner() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState(today())
  const [calYear, setCalYear] = useState(new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(new Date().getMonth())
  const [view, setView] = useState<'calendar'|'search'|'stats'>('calendar')
  const [filterCat, setFilterCat] = useState<string|null>(null)
  const [searchQ, setSearchQ] = useState('')
  const [deleteModal, setDeleteModal] = useState<string|null>(null)
  const [editingId, setEditingId] = useState<string|null>(null)
  const [editText, setEditText] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newCat, setNewCat] = useState('personal')
  const [newDate, setNewDate] = useState(today())

  useEffect(() => {
    supabase.from('tasks').select('*').order('created_at')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setTasks(data || [])
        setLoading(false)
      })
  }, [])

  const addTask = useCallback(async () => {
    if (!newTitle.trim()) return
    const { data, error } = await supabase.from('tasks').insert({
      title: newTitle.trim(), due_date: newDate,
      category: newCat, is_completed: false,
    }).select().single()
    if (error) { setError(error.message); return }
    setTasks(prev => [...prev, data])
    setNewTitle(''); setAddOpen(false)
  }, [newTitle, newDate, newCat])

  const toggleTask = useCallback(async (id: string) => {
    const task = tasks.find(t => t.id === id)
    if (!task) return
    const newVal = !task.is_completed
    setTasks(prev => prev.map(t => t.id === id ? {...t, is_completed: newVal} : t))
    const { error } = await supabase.from('tasks').update({ is_completed: newVal }).eq('id', id)
    if (error) {
      setTasks(prev => prev.map(t => t.id === id ? task : t))
      setError(error.message)
    }
  }, [tasks])

  const deleteTask = useCallback(async (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id))
    setDeleteModal(null)
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (error) setError(error.message)
  }, [])

  const saveEdit = useCallback(async (id: string) => {
    if (!editText.trim()) return
    const old = tasks.find(t => t.id === id)
    setTasks(prev => prev.map(t => t.id === id ? {...t, title: editText.trim()} : t))
    setEditingId(null)
    const { error } = await supabase.from('tasks').update({ title: editText.trim() }).eq('id', id)
    if (error) {
      setTasks(prev => prev.map(t => t.id === id ? (old || t) : t))
      setError(error.message)
    }
  }, [editText, tasks])

  const tasksByDate = useMemo(() => {
    const m: Record<string, Task[]> = {}
    tasks.forEach(t => { (m[t.due_date] = m[t.due_date] || []).push(t) })
    return m
  }, [tasks])

  const todayTasks = useMemo(() => {
    let arr = tasksByDate[selectedDate] || []
    if (filterCat) arr = arr.filter(t => t.category === filterCat)
    return arr
  }, [tasksByDate, selectedDate, filterCat])

  const searchResults = useMemo(() => {
    if (!searchQ.trim()) return []
    const q = searchQ.toLowerCase()
    let arr = tasks.filter(t => t.title.toLowerCase().includes(q))
    if (filterCat) arr = arr.filter(t => t.category === filterCat)
    const groups: Record<string, Task[]> = {}
    arr.forEach(t => { (groups[t.due_date] = groups[t.due_date] || []).push(t) })
    return Object.entries(groups).sort(([a],[b]) => a.localeCompare(b))
  }, [tasks, searchQ, filterCat])

  const stats = useMemo(() => {
    const now = new Date(); const y = now.getFullYear(); const m = now.getMonth()
    const monthTasks = tasks.filter(t => { const d = new Date(t.due_date); return d.getFullYear()===y && d.getMonth()===m })
    return {
      completed: tasks.filter(t => t.is_completed).length,
      total: tasks.length,
      monthDone: monthTasks.filter(t => t.is_completed).length,
      monthTotal: monthTasks.length,
      overdue: tasks.filter(t => !t.is_completed && isPast(t.due_date)).length,
      catStats: CATEGORIES.map(cat => ({
        ...cat,
        total: tasks.filter(t => t.category===cat.id).length,
        done: tasks.filter(t => t.category===cat.id && t.is_completed).length,
      }))
    }
  }, [tasks])

  const calDays = useMemo(() => {
    const days = daysInMonth(calYear, calMonth)
    const offset = firstWeekday(calYear, calMonth)
    const cells: (string|null)[] = []
    for (let i=0; i<offset; i++) cells.push(null)
    for (let d=1; d<=days; d++) cells.push(String(d).padStart(2,'0'))
    return cells
  }, [calYear, calMonth])

  const prevMonth = () => { if (calMonth===0){setCalMonth(11);setCalYear(y=>y-1)}else setCalMonth(m=>m-1) }
  const nextMonth = () => { if (calMonth===11){setCalMonth(0);setCalYear(y=>y+1)}else setCalMonth(m=>m+1) }
  const selectDay = (d: string) => {
    const iso = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${d}`
    setSelectedDate(iso); setNewDate(iso); setView('calendar')
  }

  if (loading) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:16}}>
      <div style={{fontSize:'1.5rem',fontWeight:600}}>TaskPlanner</div>
      <div style={{color:'#888'}}>Загрузка из облака...</div>
    </div>
  )

  return (
    <div style={{maxWidth:1100,margin:'0 auto',padding:'0 16px 40px',minHeight:'100vh'}}>
      {error && (
        <div style={{position:'fixed',bottom:20,right:20,background:'#fef2f2',border:'1px solid #fca5a5',color:'#dc2626',padding:'10px 16px',borderRadius:10,fontSize:14,zIndex:200,display:'flex',gap:10,alignItems:'center'}}>
          ⚠️ {error}
          <button onClick={()=>setError(null)} style={{background:'none',border:'none',cursor:'pointer',color:'#dc2626',fontWeight:700}}>✕</button>
        </div>
      )}

      {/* Header */}
      <div style={{padding:'28px 0 20px',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
        <h1 style={{fontSize:'clamp(1.6rem,4vw,2.2rem)',fontWeight:700,letterSpacing:'-.02em'}}>TaskPlanner</h1>
        <div style={{display:'flex',gap:6}}>
          {(['calendar','search','stats'] as const).map(v => (
            <button key={v} onClick={()=>setView(v)}
              style={{padding:'7px 14px',borderRadius:99,border:'1.5px solid',borderColor:view===v?'#2d2620':'#2e2b27',background:view===v?'#2d2620':'white',color:view===v?'white':'#9e9890',fontWeight:500,fontSize:13,cursor:'pointer'}}>
              {v==='calendar'?'Календарь':v==='search'?'Поиск':'Статистика'}
            </button>
          ))}
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr',gap:16,alignItems:'start'}}}>
        {/* Left: Calendar */}
        <div>
          <div style={{background:'#1e1c19',border:'1px solid #2e2b27',borderRadius:14,overflow:'hidden',boxShadow:'0 2px 8px rgba(0,0,0,.4)'}}>
            <div style={{padding:'18px 20px 14px',borderBottom:'1px solid #2e2b27',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span style={{fontWeight:600,fontSize:'1.05rem'}}>Календарь</span>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <button onClick={prevMonth} style={{width:30,height:30,borderRadius:8,border:'1px solid #2e2b27',background:'transparent',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>‹</button>
                <span style={{fontSize:13,fontWeight:500,minWidth:130,textAlign:'center',textTransform:'capitalize'}}>{monthLabel(calYear,calMonth)}</span>
                <button onClick={nextMonth} style={{width:30,height:30,borderRadius:8,border:'1px solid #2e2b27',background:'transparent',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>›</button>
              </div>
            </div>
            <div style={{padding:'16px 20px'}}>
              <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',marginBottom:4}}>
                {['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(w=>(
                  <div key={w} style={{textAlign:'center',fontSize:11,fontWeight:600,color:'#5a5550',letterSpacing:'.06em',padding:'4px 0'}}>{w}</div>
                ))}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2}}>
                {calDays.map((d,i) => {
                  if (!d) return <div key={`e${i}`}/>
                  const iso = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${d}`
                  const isTod = iso===today(); const isSel = iso===selectedDate
                  const hasTasks = (tasksByDate[iso]||[]).length>0
                  const hasOv = hasTasks && isPast(iso) && (tasksByDate[iso]||[]).some(t=>!t.is_completed)
                  return (
                    <div key={iso} onClick={()=>selectDay(d)}
                      style={{aspectRatio:'1',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',borderRadius:10,cursor:'pointer',fontSize:13,fontWeight:isTod?600:400,color:isSel?'white':hasOv?'#dc2626':'#9e9890',background:isSel?'#2d2620':'transparent',border:`1.5px solid ${isSel?'#2d2620':'transparent'}`,position:'relative'}}>
                      {parseInt(d)}
                      {hasTasks && <span style={{width:4,height:4,borderRadius:'50%',background:isSel?'rgba(255,255,255,.6)':'#6366f1',position:'absolute',bottom:5}}/>}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          {/* Mini stats */}
          <div style={{background:'#1e1c19',border:'1px solid #2e2b27',borderRadius:14,padding:16,marginTop:16,boxShadow:'0 2px 8px rgba(0,0,0,.4)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontSize:13,color:'#9e9890'}}>Выполнено всего</span>
              <span style={{fontSize:'1.4rem',fontWeight:700}}>{stats.completed}/{stats.total}</span>
            </div>
            <div style={{height:6,borderRadius:99,background:'#2e2b27',marginTop:8,overflow:'hidden'}}>
              <div style={{height:'100%',borderRadius:99,background:'#10b981',width:stats.total?`${Math.round(stats.completed/stats.total*100)}%`:'0%',transition:'width .5s'}}/>
            </div>
            {stats.overdue>0 && <div style={{marginTop:8,fontSize:12,color:'#dc2626'}}>⚠️ {stats.overdue} просроченных задач</div>}
          </div>
        </div>

        {/* Right */}
        <div>
          {/* Search + filters */}
          <div style={{background:'#1e1c19',border:'1px solid #2e2b27',borderRadius:14,padding:16,marginBottom:16,boxShadow:'0 2px 8px rgba(0,0,0,.4)'}}>
            <div style={{position:'relative'}}>
              <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'#5a5550',fontSize:15}}>🔍</span>
              <input value={searchQ} onChange={e=>{setSearchQ(e.target.value);if(e.target.value)setView('search')}}
                placeholder="Поиск по всем задачам..."
                style={{width:'100%',padding:'9px 12px 9px 34px',borderRadius:8,border:'1.5px solid #2e2b27',background:'#252320',fontSize:14,outline:'none',fontFamily:'inherit'}}/>
            </div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:10}}>
              <button onClick={()=>setFilterCat(null)} style={{padding:'4px 11px',borderRadius:99,border:'1.5px solid',borderColor:!filterCat?'#2d2620':'#2e2b27',background:!filterCat?'#2d2620':'transparent',color:!filterCat?'white':'#9e9890',fontSize:12,fontWeight:500,cursor:'pointer'}}>Все</button>
              {CATEGORIES.map(cat=>(
                <button key={cat.id} onClick={()=>setFilterCat(filterCat===cat.id?null:cat.id)}
                  style={{padding:'4px 11px',borderRadius:99,border:'1.5px solid',borderColor:filterCat===cat.id?cat.color:'#2e2b27',background:filterCat===cat.id?cat.color:'transparent',color:filterCat===cat.id?'white':'#9e9890',fontSize:12,fontWeight:500,cursor:'pointer'}}>
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Calendar view */}
          {view==='calendar' && (
            <div>
              {!addOpen ? (
                <button onClick={()=>setAddOpen(true)} style={{width:'100%',padding:'10px',borderRadius:10,border:'1.5px dashed #e5e0d8',background:'transparent',fontSize:14,color:'#9e9890',cursor:'pointer',marginBottom:12}}>
                  + Добавить задачу на {formatDate(selectedDate)}
                </button>
              ) : (
                <div style={{background:'#252320',border:'1.5px solid #2e2b27',borderRadius:14,padding:16,marginBottom:12}}>
                  <input autoFocus value={newTitle} onChange={e=>setNewTitle(e.target.value)}
                    onKeyDown={e=>e.key==='Enter'&&addTask()}
                    placeholder="Заголовок задачи..."
                    style={{width:'100%',padding:'9px 12px',borderRadius:8,border:'1.5px solid #2e2b27',background:'#1e1c19',fontSize:14,outline:'none',marginBottom:8,fontFamily:'inherit'}}/>
                  <div style={{display:'flex',gap:8,marginBottom:8}}>
                    <select value={newCat} onChange={e=>setNewCat(e.target.value)}
                      style={{flex:1,padding:'8px 12px',borderRadius:8,border:'1.5px solid #2e2b27',background:'#1e1c19',fontSize:14,fontFamily:'inherit',outline:'none'}}>
                      {CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                    <input type="date" value={newDate} onChange={e=>setNewDate(e.target.value)}
                      style={{padding:'8px 12px',borderRadius:8,border:'1.5px solid #2e2b27',background:'#1e1c19',fontSize:14,fontFamily:'inherit',outline:'none'}}/>
                  </div>
                  <div style={{display:'flex',gap:8}}>
                    <button onClick={addTask} style={{padding:'8px 18px',borderRadius:8,border:'none',background:'#2d2620',color:'white',fontSize:13,fontWeight:500,cursor:'pointer'}}>Добавить</button>
                    <button onClick={()=>{setAddOpen(false);setNewTitle('')}} style={{padding:'8px 18px',borderRadius:8,border:'1.5px solid #2e2b27',background:'transparent',fontSize:13,cursor:'pointer'}}>Отмена</button>
                  </div>
                </div>
              )}
              <div style={{background:'#1e1c19',border:'1px solid #2e2b27',borderRadius:14,overflow:'hidden',boxShadow:'0 2px 8px rgba(0,0,0,.4)'}}>
                <div style={{padding:'14px 18px',borderBottom:'1px solid #2e2b27',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontWeight:600}}>{formatDate(selectedDate)}{selectedDate===today()&&<span style={{marginLeft:8,fontSize:11,color:'#5a5550',textTransform:'uppercase',letterSpacing:'.06em'}}>сегодня</span>}</span>
                  <span style={{fontSize:12,color:'#5a5550'}}>{todayTasks.length} задач</span>
                </div>
                <div style={{padding:'14px 16px'}}>
                  {todayTasks.length===0 ? (
                    <div style={{textAlign:'center',padding:'48px 20px',color:'#5a5550'}}>
                      <div style={{fontSize:'2rem',marginBottom:12}}>📋</div>
                      <div style={{fontSize:15,color:'#9e9890',marginBottom:6}}>Задач нет</div>
                      <div style={{fontSize:13}}>На этот день задач пока нет. Добавьте первую!</div>
                    </div>
                  ) : (
                    <div style={{display:'flex',flexDirection:'column',gap:8}}>
                      {todayTasks.map(task=>(
                        <TaskItem key={task.id} task={task} editingId={editingId} editText={editText}
                          onToggle={toggleTask} onEdit={(id,t)=>{setEditingId(id);setEditText(t)}}
                          onSaveEdit={saveEdit} onCancelEdit={()=>setEditingId(null)}
                          onEditTextChange={setEditText} onDelete={setDeleteModal}/>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Search view */}
          {view==='search' && (
            <div style={{background:'#1e1c19',border:'1px solid #2e2b27',borderRadius:14,overflow:'hidden',boxShadow:'0 2px 8px rgba(0,0,0,.4)'}}>
              <div style={{padding:'14px 18px',borderBottom:'1px solid #2e2b27',display:'flex',justifyContent:'space-between'}}>
                <span style={{fontWeight:600}}>Результаты поиска</span>
                <span style={{fontSize:12,color:'#5a5550'}}>{searchResults.reduce((s,[,a])=>s+a.length,0)} задач</span>
              </div>
              <div style={{padding:'14px 16px'}}>
                {!searchQ.trim() ? (
                  <div style={{textAlign:'center',padding:'48px 20px',color:'#5a5550'}}>
                    <div style={{fontSize:'2rem',marginBottom:12}}>🔍</div>
                    <div style={{fontSize:13}}>Введите запрос для поиска</div>
                  </div>
                ) : searchResults.length===0 ? (
                  <div style={{textAlign:'center',padding:'48px 20px',color:'#5a5550'}}>
                    <div style={{fontSize:'2rem',marginBottom:12}}>😶</div>
                    <div style={{fontSize:13}}>Ничего не найдено</div>
                  </div>
                ) : (
                  <div style={{display:'flex',flexDirection:'column',gap:8}}>
                    {searchResults.map(([date,arr])=>(
                      <div key={date}>
                        <div style={{fontSize:11,fontWeight:600,color:'#5a5550',letterSpacing:'.06em',textTransform:'uppercase',marginTop:14,marginBottom:6,paddingBottom:4,borderBottom:'1px solid #2e2b27'}}>{formatDate(date)}</div>
                        {arr.map(task=>(
                          <TaskItem key={task.id} task={task} editingId={editingId} editText={editText}
                            onToggle={toggleTask} onEdit={(id,t)=>{setEditingId(id);setEditText(t)}}
                            onSaveEdit={saveEdit} onCancelEdit={()=>setEditingId(null)}
                            onEditTextChange={setEditText} onDelete={setDeleteModal}/>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Stats view */}
          {view==='stats' && (
            <div>
              <div style={{background:'#1e1c19',border:'1px solid #2e2b27',borderRadius:14,overflow:'hidden',boxShadow:'0 2px 8px rgba(0,0,0,.4)',marginBottom:16}}>
                <div style={{padding:'14px 18px',borderBottom:'1px solid #2e2b27'}}><span style={{fontWeight:600}}>Этот месяц</span></div>
                <div style={{padding:16,display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:12}}>
                  {[
                    {num:stats.monthDone,label:'Выполнено задач',color:'#10b981'},
                    {num:stats.monthTotal,label:'Всего на месяц',color:'#6366f1'},
                    {num:stats.overdue,label:'Просроченных',color:stats.overdue>0?'#dc2626':'#10b981'},
                    {num:stats.total?Math.round(stats.completed/stats.total*100):0,label:'Общий прогресс %',color:'#f59e0b'},
                  ].map(({num,label,color})=>(
                    <div key={label} style={{background:'#252320',borderRadius:10,padding:'14px 16px',border:'1px solid #2e2b27'}}>
                      <div style={{fontSize:'2rem',fontWeight:700,color,lineHeight:1}}>{num}</div>
                      <div style={{fontSize:12,color:'#5a5550',marginTop:4}}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{background:'#1e1c19',border:'1px solid #2e2b27',borderRadius:14,overflow:'hidden',boxShadow:'0 2px 8px rgba(0,0,0,.4)'}}>
                <div style={{padding:'14px 18px',borderBottom:'1px solid #2e2b27'}}><span style={{fontWeight:600}}>По категориям</span></div>
                <div style={{padding:'8px 16px'}}>
                  {stats.catStats.map(cat=>(
                    <div key={cat.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid #2e2b27'}}>
                      <span style={{fontSize:14,display:'flex',alignItems:'center',gap:8}}>
                        <span style={{width:8,height:8,borderRadius:'50%',background:cat.color,display:'inline-block'}}/>
                        {cat.label}
                      </span>
                      <span style={{fontSize:13,color:'#9e9890'}}>{cat.done}/{cat.total}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete modal */}
      {deleteModal && (
        <div onClick={()=>setDeleteModal(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.45)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,padding:16}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'#1e1c19',borderRadius:14,padding:24,maxWidth:360,width:'100%',boxShadow:'0 4px 20px rgba(0,0,0,.15)'}}>
            <div style={{fontWeight:700,fontSize:'1.1rem',marginBottom:10}}>Удалить задачу?</div>
            <div style={{fontSize:14,color:'#9e9890',marginBottom:20}}>Это действие нельзя отменить.</div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button onClick={()=>setDeleteModal(null)} style={{padding:'8px 18px',borderRadius:8,border:'1.5px solid #2e2b27',background:'transparent',fontSize:13,cursor:'pointer'}}>Отмена</button>
              <button onClick={()=>deleteTask(deleteModal)} style={{padding:'8px 18px',borderRadius:8,border:'none',background:'#fef2f2',color:'#dc2626',fontSize:13,fontWeight:500,cursor:'pointer'}}>Удалить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TaskItem({task,editingId,editText,onToggle,onEdit,onSaveEdit,onCancelEdit,onEditTextChange,onDelete}:{
  task:Task,editingId:string|null,editText:string,
  onToggle:(id:string)=>void,onEdit:(id:string,t:string)=>void,
  onSaveEdit:(id:string)=>void,onCancelEdit:()=>void,
  onEditTextChange:(t:string)=>void,onDelete:(id:string)=>void
}) {
  const cat = CAT_MAP[task.category] || CAT_MAP.personal
  const overdue = !task.is_completed && isPast(task.due_date)
  const isEditing = editingId===task.id
  return (
    <div style={{display:'flex',alignItems:'flex-start',gap:10,padding:'12px 14px',borderRadius:10,border:`1.5px solid ${overdue?'#fca5a5':'#2e2b27'}`,background:overdue?'#2d1515':'#1e1c19',opacity:task.is_completed?.6:1,marginBottom:2}}>
      <div onClick={()=>onToggle(task.id)}
        style={{width:18,height:18,minWidth:18,borderRadius:6,border:`1.8px solid ${task.is_completed?'#10b981':'#2e2b27'}`,background:task.is_completed?'#10b981':'transparent',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',marginTop:1,color:'white',fontSize:11}}>
        {task.is_completed&&'✓'}
      </div>
      <div style={{flex:1,minWidth:0}}>
        {isEditing ? (
          <input autoFocus value={editText} onChange={e=>onEditTextChange(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter')onSaveEdit(task.id);if(e.key==='Escape')onCancelEdit()}}
            style={{width:'100%',padding:'4px 8px',borderRadius:6,border:'1.5px solid #2e2b27',fontSize:14,outline:'none',fontFamily:'inherit'}}/>
        ) : (
          <div style={{fontSize:14,textDecoration:task.is_completed?'line-through':'none',color:overdue?'#dc2626':'#f0ece4',wordBreak:'break-word'}}>{task.title}</div>
        )}
        <div style={{display:'flex',alignItems:'center',gap:6,marginTop:4,flexWrap:'wrap'}}>
          <span style={{padding:'2px 8px',borderRadius:99,fontSize:11,fontWeight:500,background:cat.bg,color:cat.color}}>{cat.label}</span>
          {overdue&&<span style={{fontSize:11,color:'#dc2626'}}>⚠️ Просрочено</span>}
        </div>
      </div>
      {!isEditing && (
        <div style={{display:'flex',gap:4}}>
          <button onClick={()=>onEdit(task.id,task.title)} style={{width:28,height:28,borderRadius:7,border:'1px solid #2e2b27',background:'#252320',color:'#9e9890',cursor:'pointer',fontSize:13}}>✎</button>
          <button onClick={()=>onDelete(task.id)} style={{width:28,height:28,borderRadius:7,border:'1px solid #2e2b27',background:'#252320',color:'#9e9890',cursor:'pointer',fontSize:13}}>✕</button>
        </div>
      )}
      {isEditing && (
        <div style={{display:'flex',gap:6,alignItems:'center'}}>
          <button onClick={()=>onSaveEdit(task.id)} style={{padding:'4px 10px',borderRadius:7,border:'none',background:'#2d2620',color:'white',fontSize:12,cursor:'pointer'}}>Сохранить</button>
          <button onClick={onCancelEdit} style={{padding:'4px 8px',borderRadius:7,border:'1px solid #2e2b27',background:'transparent',fontSize:12,cursor:'pointer'}}>✕</button>
        </div>
      )}
    </div>
  )
}
