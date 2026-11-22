const navigation = [
  ["⌂", "Dashboard", true],
  ["＋", "Create Invoice", false],
  ["▤", "Bulk Excel Upload", false],
  ["▧", "Invoice Register", false],
  ["♙", "Customers", false],
  ["▦", "Products", false],
  ["▥", "Reports", false],
  ["⚙", "Settings", false],
];

const metrics = [
  ["Invoices this month", "—", "Live data will appear after setup"],
  ["IRP registered", "—", "Verified registrations"],
  ["Awaiting registration", "—", "Pending submissions"],
  ["Bulk batches", "—", "Excel upload history"],
];

export default function DashboardPage() {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">GI</div>
          <div><div className="brand-name">Goods Invoice</div><div className="brand-sub">Business workspace</div></div>
        </div>
        <div>
          <div className="nav-label">WORKSPACE</div>
          <nav className="nav">
            {navigation.map(([icon, label, active]) => (
              <a key={label} href="#" className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
                <span className="nav-icon">{icon}</span>{label}
              </a>
            ))}
          </nav>
        </div>
        <div className="sidebar-note">
          <strong>Getting started</strong><br />
          Connect your business profile and Supabase project to activate invoice operations.
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="crumb">Workspace&nbsp; / &nbsp;<strong>Dashboard</strong></div>
          <div className="top-actions"><div className="workspace">Business workspace · Not connected</div><div className="avatar">GI</div></div>
        </header>
        <section className="content">
          <div className="header-row">
            <div>
              <div className="eyebrow">OVERVIEW</div>
              <h1 className="page-title">Good morning</h1>
              <p className="page-desc">Your goods sales invoicing workspace at a glance.</p>
            </div>
            <button className="primary-btn" type="button" disabled title="Available after business setup">＋ Create new invoice</button>
          </div>
          <div className="metrics">
            {metrics.map(([label, value, foot]) => (
              <div className="metric" key={label}><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-foot">{foot}</div></div>
            ))}
          </div>
          <div className="panel">
            <div className="panel-head"><div className="panel-title">Recent invoices</div><div className="panel-hint">Connect Supabase to load records</div></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>INVOICE NO.</th><th>DATE</th><th>CUSTOMER</th><th>AMOUNT</th><th>IRP STATUS</th></tr></thead>
                <tbody><tr><td colSpan={5} className="empty">No invoice records yet. Your invoice register will appear here after setup.</td></tr></tbody>
              </table>
            </div>
          </div>
          <div className="bottom-grid">
            <div className="panel">
              <div className="panel-head"><div className="panel-title">Quick actions</div><div className="panel-hint">Coming online in the next milestones</div></div>
              <div className="quick-list">
                <div className="quick-item"><div className="quick-icon">＋</div><div><div className="quick-title">Create a goods invoice</div><div className="quick-sub">Enter buyer, delivery and goods details</div></div></div>
                <div className="quick-item"><div className="quick-icon">▤</div><div><div className="quick-title">Import Excel deliveries</div><div className="quick-sub">One customer per batch, one invoice per eligible row</div></div></div>
                <div className="quick-item"><div className="quick-icon">↗</div><div><div className="quick-title">Register through IRP</div><div className="quick-sub">IRN and signed QR after successful registration</div></div></div>
              </div>
            </div>
            <div className="panel">
              <div className="panel-head"><div className="panel-title">System setup</div><span className="status pending">In progress</span></div>
              <div className="quick-list">
                <div className="quick-item"><div className="quick-icon">1</div><div><div className="quick-title">Project foundation</div><div className="quick-sub">Repository and application shell</div></div></div>
                <div className="quick-item"><div className="quick-icon">2</div><div><div className="quick-title">Supabase connection</div><div className="quick-sub">Awaiting project configuration</div></div></div>
                <div className="quick-item"><div className="quick-icon">3</div><div><div className="quick-title">Business registration</div><div className="quick-sub">Next after database setup</div></div></div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
