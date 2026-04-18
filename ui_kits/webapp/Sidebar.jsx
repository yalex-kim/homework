/* global React */
const { useState } = React;

function Icon({ name, size = 18 }) {
  return <i className={`ph ph-${name}`} style={{ fontSize: size, lineHeight: 1 }} />;
}

function Sidebar({ active, onNav, user, onLogout }) {
  const groups = [
    {
      label: null,
      items: [
        { id: 'today', label: '오늘', icon: 'sun' },
        { id: 'todo', label: '할 일', icon: 'check-square' },
        { id: 'journal', label: '저널', icon: 'notebook' },
      ],
    },
    {
      label: 'MY SPACES',
      items: [
        { id: 'travel', label: '가족 여행', icon: 'airplane-tilt' },
        { id: 'stocks', label: '주식', icon: 'chart-line-up' },
        { id: 'calendar', label: '캘린더', icon: 'calendar-blank' },
        { id: 'notes', label: '노트', icon: 'pencil-line' },
        { id: 'bookmarks', label: '북마크', icon: 'bookmark-simple' },
        { id: 'budget', label: '가계부', icon: 'wallet' },
      ],
    },
  ];

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">y</div>
        <div>
          <div className="brand-word">yAlex's <em>HomeWork</em></div>
          <div className="brand-tag">혼자의 책상</div>
        </div>
      </div>

      {groups.map((g, gi) => (
        <div key={gi} className="nav-group">
          {g.label && <div className="nav-label">{g.label}</div>}
          {g.items.map(item => (
            <button
              key={item.id}
              className={`nav-item ${active === item.id ? 'active' : ''}`}
              onClick={() => onNav(item.id)}
            >
              <Icon name={item.icon} size={17} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ))}

      <div className="sidebar-footer">
        <div className="user-chip">
          <div className="avatar">{user?.name?.[0] || 'y'}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="user-name">{user?.name || 'yAlex'}</div>
            <div className="user-mail">{user?.email || 'you@gmail.com'}</div>
          </div>
          <button className="icon-btn" onClick={onLogout} title="로그아웃">
            <Icon name="sign-out" size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}

window.Sidebar = Sidebar;
window.Icon = Icon;
