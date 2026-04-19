import logo from "../assets/logo.png";

export default function LogoLoader({ label = "Chargement...", size = 82, compact = false }) {
  return (
    <div
      className={`logo-loader ${compact ? "compact" : ""}`}
      style={{ "--loader-size": `${Number(size) || 82}px` }}
      role="status"
      aria-live="polite"
    >
      <div className="logo-loader-figure" aria-hidden="true">
        <img className="logo-loader-logo" src={logo} alt="" />
        <span className="logo-loader-ring" />
      </div>
      {label ? <div className="logo-loader-label">{label}</div> : null}
    </div>
  );
}

