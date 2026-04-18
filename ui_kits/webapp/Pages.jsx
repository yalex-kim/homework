/* global React */
const { useState: useT } = React;

function PageHeader({ eyebrow, title, subtitle, action }) {
  return (
    <header className="page-header">
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <div className="page-title-row">
        <h1 className="page-title">{title}</h1>
        {action}
      </div>
      {subtitle && <p className="page-sub">{subtitle}</p>}
    </header>
  );
}

function TodayPage({ onNav }) {
  const date = new Date();
  const day = ['일','월','화','수','목','금','토'][date.getDay()];
  const fmt = `${date.getFullYear()}년 ${date.getMonth()+1}월 ${date.getDate()}일 · ${day}요일`;
  return (
    <div className="page">
      <PageHeader eyebrow="TODAY" title="조용한 저녁이에요" subtitle={fmt} />
      <div className="today-grid">
        <div className="card">
          <div className="card-head"><Icon name="check-square" size={16}/><span>오늘의 할 일</span></div>
          <div className="todo-mini">
            <div className="todo-row"><div className="chk on">✓</div><span className="done">우유 사오기</span><span className="tag-w">아내</span></div>
            <div className="todo-row"><div className="chk"/><span>주말 여행지 검색</span><span className="tag-w">아내</span></div>
            <div className="todo-row"><div className="chk"/><span>4월 포트폴리오 리밸런싱</span><span className="tag-s">나</span></div>
          </div>
          <button className="card-link" onClick={() => onNav('todo')}>할 일 전체 보기 →</button>
        </div>

        <div className="card">
          <div className="card-head"><Icon name="chart-line-up" size={16}/><span>오늘의 시장</span></div>
          <div className="stock-mini">
            <div className="srow"><span className="sym">AAPL</span><span className="pr">$184.32</span><span className="chg up">+1.24%</span></div>
            <div className="srow"><span className="sym">NVDA</span><span className="pr">$912.45</span><span className="chg up">+2.80%</span></div>
            <div className="srow"><span className="sym">005930</span><span className="pr">₩72,400</span><span className="chg down">−0.55%</span></div>
          </div>
          <button className="card-link" onClick={() => onNav('stocks')}>포트폴리오 →</button>
        </div>

        <div className="card wide">
          <div className="card-head"><Icon name="notebook" size={16}/><span>어제의 생각</span></div>
          <p className="journal-preview">
            아이가 일찍 잠들었다. 서재에 혼자 앉아 있으니 창밖의 바람 소리가 유난히 크게 들렸다.
            작년 봄 교토의 골목길을 떠올렸다. 그때 우리는 조금 더 젊었지...
          </p>
          <button className="card-link" onClick={() => onNav('journal')}>이어 쓰기 →</button>
        </div>
      </div>
    </div>
  );
}

function TodoPage() {
  const [items, setItems] = useT([
    { id:1, text:'우유 사오기', done:true, tag:'아내' },
    { id:2, text:'주말 여행지 검색해보기', done:false, tag:'아내' },
    { id:3, text:'4월 주식 포트폴리오 리밸런싱', done:false, tag:'나' },
    { id:4, text:'가족 앨범 정리 (교토 폴더)', done:false, tag:'나' },
    { id:5, text:'어머니 생신 선물 고르기', done:false, tag:'아내' },
  ]);
  const [input, setInput] = useT('');
  const toggle = id => setItems(items.map(i => i.id===id?{...i,done:!i.done}:i));
  const add = () => {
    if(!input.trim()) return;
    setItems([...items, { id:Date.now(), text:input, done:false, tag:'나' }]);
    setInput('');
  };
  return (
    <div className="page">
      <PageHeader eyebrow="TO DO" title="할 일" subtitle="아내의 요청과 나의 일" />
      <div className="add-row">
        <input
          value={input}
          onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&add()}
          placeholder="새로운 할 일을 적어보세요..."
        />
        <button className="btn primary" onClick={add}>추가</button>
      </div>
      <div className="todo-list">
        {items.map(i => (
          <div key={i.id} className="todo-row-lg">
            <div className={`chk ${i.done?'on':''}`} onClick={()=>toggle(i.id)}>
              {i.done ? '✓' : ''}
            </div>
            <span className={i.done?'done':''}>{i.text}</span>
            <span className={i.tag==='아내'?'tag-w':'tag-s'}>{i.tag}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function JournalPage() {
  return (
    <div className="page">
      <PageHeader
        eyebrow="JOURNAL"
        title="오늘의 생각"
        subtitle="2026년 4월 18일 · 토요일 저녁"
        action={<button className="btn primary"><Icon name="plus" size={14}/> 새 글</button>}
      />
      <article className="journal-entry">
        <h2>조용한 저녁</h2>
        <div className="journal-meta">2026.04.17 · 금요일</div>
        <p>오늘은 아이가 일찍 잠들었다. 서재에 혼자 앉아 있으니 창밖의 바람 소리가 유난히 크게 들렸다.</p>
        <p>작년 봄 우리가 함께 걸었던 교토의 좁은 골목길이 떠올랐다. 비가 조금 내렸고, 벚꽃이 길에 떨어져 있었다. 그때의 공기가 다시 느껴지는 것 같았다.</p>
        <p className="serif-italic">— 기록되지 않은 하루는 흘러간다.</p>
      </article>

      <article className="journal-entry muted">
        <h2>4월의 계획</h2>
        <div className="journal-meta">2026.04.03 · 목요일</div>
        <p>이번 달에는 조금 더 일찍 자려고 한다. 책 두 권. 주말 산책. 아이와의 시간.</p>
      </article>
    </div>
  );
}

function TravelPage() {
  const trips = [
    { title:'가을의 교토', date:'2025.11 · 3박 4일', tone:'#C7996C' },
    { title:'제주도의 겨울', date:'2025.01 · 2박 3일', tone:'#8FA3A8' },
    { title:'강원도 속초', date:'2024.08 · 1박 2일', tone:'#9FAF82' },
    { title:'도쿄 골목 산책', date:'2024.05 · 4박 5일', tone:'#B08A7E' },
  ];
  return (
    <div className="page">
      <PageHeader
        eyebrow="FAMILY TRAVEL"
        title="가족 여행"
        subtitle="우리가 함께 걸었던 길들"
        action={<button className="btn primary"><Icon name="plus" size={14}/> 새 여행</button>}
      />
      <div className="travel-grid">
        {trips.map((t,i)=>(
          <div key={i} className="photo-card">
            <div className="photo-ph" style={{background:`linear-gradient(135deg, ${t.tone}aa 0%, ${t.tone} 100%)`}}>
              <Icon name="image" size={28}/>
            </div>
            <div className="photo-body">
              <h3>{t.title}</h3>
              <div className="photo-meta">{t.date}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StocksPage() {
  const holdings = [
    { sym:'AAPL', name:'Apple Inc.', qty:20, price:'$184.32', chg:+1.24, value:'$3,686' },
    { sym:'NVDA', name:'NVIDIA', qty:5, price:'$912.45', chg:+2.80, value:'$4,562' },
    { sym:'MSFT', name:'Microsoft', qty:8, price:'$418.20', chg:+0.42, value:'$3,346' },
    { sym:'005930', name:'삼성전자', qty:100, price:'₩72,400', chg:-0.55, value:'₩7,240,000' },
    { sym:'035720', name:'카카오', qty:50, price:'₩45,200', chg:+1.12, value:'₩2,260,000' },
  ];
  return (
    <div className="page">
      <PageHeader eyebrow="PORTFOLIO" title="주식" subtitle="2026년 4월 18일 기준" />
      <div className="stat-row">
        <div className="stat">
          <div className="stat-label">총 평가금액</div>
          <div className="stat-value mono">$11,594 &nbsp;<span className="small">+ ₩9,500,000</span></div>
        </div>
        <div className="stat">
          <div className="stat-label">오늘 수익률</div>
          <div className="stat-value mono" style={{color:'var(--moss-3)'}}>+ 1.18%</div>
        </div>
      </div>
      <div className="stock-table">
        <div className="sthead">
          <span>종목</span><span>수량</span><span>현재가</span><span>변동</span><span>평가금액</span>
        </div>
        {holdings.map(h=>(
          <div key={h.sym} className="strow">
            <div className="scell">
              <div className="ssym mono">{h.sym}</div>
              <div className="sname">{h.name}</div>
            </div>
            <span className="mono">{h.qty}</span>
            <span className="mono">{h.price}</span>
            <span className={`chg ${h.chg>=0?'up':'down'}`}>{h.chg>=0?'+':''}{h.chg}%</span>
            <span className="mono">{h.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyPage({ title, icon, message }) {
  return (
    <div className="page">
      <PageHeader title={title} />
      <div className="empty-state">
        <Icon name={icon} size={48} />
        <p>{message}</p>
      </div>
    </div>
  );
}

window.PageHeader = PageHeader;
window.TodayPage = TodayPage;
window.TodoPage = TodoPage;
window.JournalPage = JournalPage;
window.TravelPage = TravelPage;
window.StocksPage = StocksPage;
window.EmptyPage = EmptyPage;
