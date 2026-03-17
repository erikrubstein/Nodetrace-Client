export default function AccountPanel({
  currentUser,
  openAccountDialog,
  logoutUser,
}) {
  return (
    <div className="account-panel">
      <div className="inspector__section">
        <div className="inspector__title">User</div>
        <div className="inspector__name">{currentUser?.username || 'Unknown user'}</div>
      </div>

      <div className="inspector__section field-stack">
        <button className="ghost-button" onClick={logoutUser} type="button">
          Logout
        </button>
      </div>

      <div className="inspector__section field-stack">
        <button className="ghost-button" onClick={() => openAccountDialog('username')} type="button">
          Change Username
        </button>
        <button className="ghost-button" onClick={() => openAccountDialog('password')} type="button">
          Change Password
        </button>
        <button className="danger-button" onClick={() => openAccountDialog('delete-account')} type="button">
          Delete Account
        </button>
      </div>

      <div className="inspector__section inspector__footer">
        <div className="settings-panel__meta-row">
          <span>User ID</span>
          <strong>{currentUser?.id || 'n/a'}</strong>
        </div>
      </div>
    </div>
  )
}
